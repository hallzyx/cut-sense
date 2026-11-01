# Development guide

## Setup

Requirements: **Node.js 22.9 or newer** (the API scripts use `--env-file-if-exists`) and npm.

```bash
npm install
cp .env.example .env     # optional: Meta Model API credentials, see api.md
npm run dev              # web on http://localhost:5173 + API on http://localhost:8787
```

Without credentials the app runs fully, minus SAM segmentation, defect detection, Hilo and the AI part of the 3D preview; each of those says clearly that it did not run and offers its non-AI alternative.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite and the API together (`concurrently`), both reloading on change |
| `npm run dev:web` | Vite only (port 5173, proxies `/api` to 8787) |
| `npm run dev:api` | API only, `tsx watch` |
| `npm run build` | `tsc --noEmit` over `src`, `server` and `vite.config.ts`, then `vite build` into `dist/` |
| `npm run preview` | Serve `dist/` with Vite |
| `npm start` | API without watch mode |
| `npm test` | `vitest run` (Node environment) over `src/**/*.test.ts` and `server/**/*.test.ts` |

Useful one-offs:

```bash
npx tsc --noEmit -p .                     # type-check only
npx vitest run src/engine                 # one folder
npx vitest run src/engine/verify.test.ts  # one file
npx vitest                                # watch mode
```

## Repository map

See the [project layout in the README](../README.md#project-layout) and the module table in [architecture.md](architecture.md#modules). In short: `src/engine` is pure geometry, `src/lib` holds features and formats, `src/components` is the React UI (with all workspace state in `workspace/useWorkspace.ts`), `server/` is the API.

## Testing approach

Tests run in Node with vitest; there is no browser test runner. Code that needs the DOM (canvas, `Image`, `DOMParser`) is kept in thin functions so the logic around it can be tested.

| Area | Files | What is covered |
|---|---|---|
| Geometry and engine | `src/engine/*.test.ts` | geometry primitives; every verifier violation code; metrics without double counting; optimizer validity and seeded determinism; real kits (cardholder, wallet); complete-set search; leftover fragments; a stress case |
| Formats | `src/lib/dxf.test.ts`, `print.test.ts`, `projectFile.test.ts` | DXF structure (parsed back with `dxf-parser`), 1:1 tiling and scale, project round-trip, validation and re-verification of tampered plans |
| Features | `src/lib/*.test.ts` | mask tracing, custom shapes, extra products on the leftover, shortfall diagnosis, workspace UI rules, Markdown subset, agent schema |
| 3D preview | `src/lib/assembly/assembly.test.ts` | scene validation, macros, kinematics, sanity checks, every product fixture |
| Server | `server/*.test.ts` | Hilo and assembly routes with a mocked `fetch`: validation, retries, error codes, limits |

Rules of thumb:

- **Engine tests must not depend on machine speed.** Inject a frozen clock (`{ now: () => 0 }`) whenever a test asserts an exact result, so the time budget never cuts the search. A test that uses the real clock should assert bounds, not exact values.
- **Assert validity, not only counts.** Any test that produces a plan should also check `verifySolution(problem, placements).valid`.
- **Server tests never call the network.** Pass `fetchImpl` in the config (see `server/agent.test.ts` and `server/assembly.test.ts`).
- **Assert user-facing copy in English**, matching the UI.

## Determinism rules

The engine's promise is "same input + same seed = same plan". To keep it:

- No `Math.random()` anywhere in `src/engine` (or code that feeds it). Use the seeded `mulberry32(seed)` from `optimize.ts`, and derive sub-seeds deterministically (as `maxkits.ts` does).
- No wall-clock time in decisions other than the time budget, and always through the injectable `now()`.
- Iterate in stable orders: arrays, not `Set`/`Map` iteration over values whose insertion order depends on timing. Sort with explicit tie-breakers (e.g. by area, then by template index).
- Every plan the engine returns must pass `verifySolution`. New placement code should go through `repairPlacements` or an equivalent check, never around it.
- Bump `OPTIMIZER_VERSION` in `optimize.ts` whenever a change can alter the plan for a given input and seed. The version is shown on results and stored in project files.
- Metrics come from geometry (`computeMetrics`), never from optimizer counters.

## How to add a kit

Kits live in `src/lib/kits.ts`. Sizes are in **centimetres**; kits require a photo calibrated in cm.

```ts
{
  id: 'tarjetero',                 // stable id: used by examples, test ids and the UI
  name: 'Leather cardholder',
  blurb: '5 pieces · body, 3 pockets and flap',
  kind: 'kit',                     // 'kit' = counts only when complete · 'piece' = single piece, as many as fit
  pieces: [
    { name: 'Body', kind: 'rrect', w: 9.5, h: 6.5, qty: 1 },
    { name: 'Flap', kind: 'trapezoid', w: 6, h: 3, qty: 1, rotations: [0, 180] },
  ],
}
```

- `kind` per piece is one of `rect`, `rrect`, `circle`, `trapezoid`, `irregular` (shapes in `src/engine/templates.ts`). Rotations default to `[0, 180]`; allow 90° and 270° only when the material has no grain direction for that piece.
- Keep at most 6 piece types.
- Kits appear in **Prepare → Pieces** and, for leftover reuse, in **Make another product from the leftover**.
- Add a test that a reasonable material fits at least one complete set and that the plan verifies (see `src/engine/tarjetero.test.ts` and `cartera.test.ts`).
- Existing kit ids (`tarjetero`, `cartera`, `llavero`, `posavasos`, `marcapaginas`) are identifiers, not copy: do not rename them.

## How to add a 3D archetype

An archetype is a deterministic macro that expands a product's pieces into a scene (see [3d-preview.md](3d-preview.md)).

1. **Name it** in `MACROS` in `src/lib/assembly/dsl.ts`. The JSON Schema sent to the model is generated from these lists, so the model can use it at once. Add new roles to `ROLES` if needed.
2. **Implement it** in `src/lib/assembly/macros.ts` as a function of the macro context (take pieces by role with `take`/`takeLargest`, create nodes with `root`, `add`, `stackBottom`, hinges, seams and hardware) and register it in `MACRO_FNS`. Every size must come from the pieces.
3. **Recognise it.** Add the product-name pattern to `FAMILIES` in `src/lib/assembly/fallback.ts` (Spanish **and** English keywords, accents removed) and, if needed, piece-name patterns to the role rules in `macros.ts`.
4. **Teach the model.** Describe the macro and its roles in `DSL_GUIDE` in `server/assembly.ts`. Add a worked example to `EXAMPLES` if the archetype is hard to infer.
5. **Check it.** If the archetype has its own failure modes (like garments), add measurements to `src/lib/assembly/sanity.ts` with a weight that reflects how bad they look.
6. **Test it.** Add a product to `PRODUCT_FIXTURES` in `src/lib/assembly/fixtures.ts` and a case in `assembly.test.ts` that the macro places every instance and passes the sanity checks.
7. **Look at it** in the lab (below), in both themes, with and without AI.

## The dev lab

`npm run dev`, then open **http://localhost:5173/assembly-lab.html**. The lab renders the 3D preview for every product fixture without going through the whole app. It is served by the dev server only and is not part of `npm run build`.

| Query | Effect |
|---|---|
| `?product=billetera` | start on a fixture (keys from `PRODUCT_FIXTURES`) |
| `&ai=0` | rules-based scene only, no model calls (no quota spent) |
| `&theme=dark` | dark theme |

In the browser console, `window.__asm` exposes the preview's dev API and `window.__lab.setScene(json)` renders a recorded scene; `window.__lab.setProduct(key)` switches fixtures.

## Conventions

- **Language.** Code, comments, docs, UI copy and commit messages are in English. User-visible copy follows the product voice: warm, plain, workshop-like, honest about limits. Functional keyword lists that recognise product or piece names keep their Spanish keywords and add English ones, since people may write either.
- **Numbers.** Format with English conventions (`12.4 cm`, `1,023 cm²`); never hand-build comma decimals. The calibration inputs also accept a comma as the decimal separator, for people used to it.
- **Commits.** [Conventional Commits](https://www.conventionalcommits.org/) with a scope when useful: `feat(engine): …`, `fix(export): …`, `docs: …`, `test(engine): …`, `refactor(workspace): …`, `style(ui): …`. Imperative mood, lower case, no trailing period. One logical change per commit.
- **TypeScript.** `strict` mode, ES2022, ES modules. Prefer small pure functions and explicit types at module boundaries (`src/types.ts`, `src/state.ts`). The engine must stay free of DOM APIs.
- **Style.** 2-space indentation, single quotes, semicolons, trailing commas in multi-line literals. Keep functions short and lines readable; there is no formatter or linter configured, so match the surrounding code.
- **Identifiers are stable.** Kit ids, `data-testid` values, CSS classes, enum values and JSON keys are part of the contract with tests, saved projects and the model schemas. Change them only with a migration.
- **AI boundaries.** Anything that comes from a model is data: give it a closed schema, validate it with explicit ranges, retry at most once with the error, and fall back to a deterministic path. Never let model output reach the DOM as HTML.
- **Accessibility.** Colour is never the only signal (pieces carry colour + pattern + letter); every control is keyboard reachable; respect `prefers-reduced-motion`; new canvas overlays use the tri-stroke described in [design/DESIGN.md](../design/DESIGN.md#7-canvas-overlay-spec-svg-stage).
- **Secrets.** Never commit `.env`; credentials are read only by `server/`.

## Design resources

The brand book, tokens, components and the living style guide are in `design/`; see [design-system.md](design-system.md). The workspace UX redesign and its prototype are in `design/ux/`.
