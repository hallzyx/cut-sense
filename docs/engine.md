# Geometry engine

`src/engine/` is the deterministic core of CutSense: nesting, the complete-set search, the independent verifier, metrics and the leftover. It has no DOM dependencies and runs the same in Node (tests) and in the browser. Its public API is `src/engine/index.ts`.

All coordinates are **image pixels**. The UI converts display units (relative `u`, or calibrated cm/mm) to pixels before calling the engine (see [architecture.md](architecture.md#units)).

## The problem

```ts
interface Problem {
  material: Ring;          // outer outline of the material (simple polygon, no holes)
  defects: Ring[];         // excluded zones; may overlap each other or extend past the material
  templates: Template[];   // piece types: shape, size, qty, allowed rotations
  spacing: number;         // minimum gap between pieces, piece–defect and piece–edge (>= 0)
  seed?: number;           // default 1
  timeLimitMs?: number;    // default 4000
}
```

A `Template.shape` is already sized, with its bounding box anchored at (0, 0). Shapes come from `templates.ts`: `rect`, `rrect` (corner radius 14 % of the short side, 5 segments per corner), `circle` (ellipse as a 24-gon), `trapezoid` (top edge 60 % of the width), `irregular` (an L silhouette) and `custom` (a normalized ring scaled to w × h). Allowed rotations are multiples of 90°.

A `Solution` holds `placements` (template id, instance index, rotation, final polygon), `metrics`, `elapsedMs`, `optimizerVersion` and `seed`.

## Nesting heuristic `cs-nest-1.0`

`optimize.ts`. Objective: **place as many pieces as possible; break ties by the larger occupied area.**

### 1. Pieces and orientations

Each template is expanded into instances (`qty` copies, at most 400 in total). Each allowed rotation gives an *orientation*: the shape rotated about its bounding-box centre and re-anchored at (0, 0). An orientation whose bounding box cannot fit inside the material's bounding box (minus the spacing on both sides) is dropped, and so is any instance whose area exceeds the usable area (material minus defects).

For each orientation the engine precomputes a **probe** (a point strictly inside the shape, for fast rejection) and up to 16 **deep points** (interior samples more than 1.5 raster cells from the boundary).

### 2. Candidate positions

For a piece of size *w × h*, candidate positions for its minimum corner are the union of:

- an **adaptive grid** with step `min(S/8, max(S/60, min(w, h)/2))`, where *S* is the long side of the material's bounding box;
- **anchors**: every vertex of the material and of the defects, and the bounding-box edges of every piece already placed, each offset by the spacing (`a + d` and `a − d − size`), so pieces can sit flush against an edge, a zone or a neighbour.

Values are sorted and de-duplicated with a small quantum. If the coarse grid finds no position for the first orientation, the step is halved repeatedly down to `S/100`: large pieces in irregular convex material often have feasible regions smaller than the initial step.

### 3. Gravity, scan and compaction

A *gravity* is a primary axis (x or y) plus a direction on each axis; there are 8. Candidates are scanned in gravity order (rows along the primary axis, then along the secondary one). The first position that fits is **compacted**: the piece slides toward the gravity, on both axes, with a step that halves on every failure (down to 1/128 of the initial step, two rounds). Among a piece's orientations, the one with the best score (position along the primary axis, then the secondary one) wins; once an orientation has a score, the scan for the next orientations stops as soon as it can no longer beat it.

### 4. Fit test

`fits(orientation, x, y)` accepts a position only if all of these hold, cheapest first:

1. The bounding box is inside the material's bounding box shrunk by the spacing.
2. No deep point falls on a blocked cell of the **occupancy raster** (cells of `S/256`; a cell is blocked when its centre is outside the material, inside a defect, or inside a placed piece). Because deep points are well inside the piece, a blocked cell under one means a blocked point inside the piece: this test only ever rejects invalid positions.
3. The probe is inside the material and not inside any placed piece or defect.
4. For each placed piece and defect whose box is near: no pair of edges is closer than the spacing (segment-to-segment distance), and neither shape contains the other.
5. A vertex of the piece is inside the material, and no edge of the material outline is closer than the spacing (material edges are indexed in a uniform spatial grid).

The spacing used here is the requested spacing plus a tiny margin (`1e-7 · S`), so the optimizer never lands exactly on the verifier's tolerance.

### 5. Passes, orderings and mutations

A *pass* places the pieces greedily in a given order, each with its own gravity. If a template fails once in a pass, its remaining instances are skipped: the candidate set does not depend on gravity, and more placed pieces can only remove space.

The search runs up to **150 passes** (`DEFAULT_MAX_ITERATIONS`), driven by a seeded `mulberry32` PRNG:

- **Passes 1–4:** pieces sorted by area (largest first), one uniform gravity per pass.
- **Later passes** alternate between:
  - **mutation** of the current genome (order + per-piece gravity), with probability 1/2: often moving a piece that did not fit earlier in the order (which tends to unblock the plan), plus a few swaps and gravity changes;
  - **random restart**: area order with multiplicative noise, optional random swaps, and either one random gravity for all pieces or one per piece.

The current genome follows a hill climb that **accepts ties** (a pass that places at least as many pieces replaces it), so the search can walk across plateaus.

A pass's plan is *considered* only if it beats the best plan so far (more pieces, or the same count and more area). It is then run through `repairPlacements`: the independent verifier is called, and any offending piece is dropped (for a pair, the later one) until the plan is valid. Only if the repaired plan still beats the best does it become the new best. **The optimizer never returns a plan the verifier rejects.**

### 6. Repair pass

When pieces are still missing and time remains, a final pass tries to insert each pending piece into the best plan with a finer grid (down to `S/200`). If a pending piece does not fit, it tries a **swap**: remove a smaller placed piece, place the pending one, then re-place the removed one; the swap is kept only if both fit. The result goes through the same verification as every other candidate.

### 7. Time budget and determinism

- The same problem and seed always produce the same sequence of passes, so the same plan, **as long as the time budget does not cut the search short**.
- The search stops after `maxIterations` passes, when everything is placed, or when `timeLimitMs` runs out (default 4000 ms; the first pass may use up to 2× the budget so there is always a result, and the repair pass up to 1.25×). The time limit is a safeguard: on a much slower machine fewer passes may run, and the plan can differ.
- For fully deterministic runs (tests, benchmarks), inject a clock with `options.now` that does not advance.
- `optimizeSteps` is a generator that yields regularly. `optimize` runs it synchronously; `optimizeAsync` yields to the event loop about every 50 ms so the UI stays responsive, and reports progress as `max(passes done / maxIterations, elapsed / timeLimit)`.

## Maximizing complete sets

`maxkits.ts`. Given a problem whose templates form **one** set (`qty` = pieces per set), find the largest *N* such that all pieces of *N* sets are placed validly.

- **Attempt.** For a candidate *N*, every `qty` is multiplied by *N* and the optimizer runs. The attempt succeeds only if every instance is placed (and, like every optimizer plan, it passed the verifier). Set *k* owns instances `[k·qty, (k+1)·qty)` of each template; instances of one template are interchangeable, so this assignment is always valid.
- **Upper bound.** `min(maxKits, ⌊usable area / set area⌋, ⌊400 / pieces per set⌋)`. Set 1 is always tried, so a partial plan for one set is available even when nothing fits.
- **Search** (the heuristic is not monotonic in *N*):
  1. exponential growth 1, 2, 4, … until the first failure or the bound;
  2. binary search between the last success and the first failure;
  3. a check of best + 1 and best + 2 (re-tried with a derived seed if already attempted);
  4. **augmentation**: with the plan for the best *N* fixed (its pieces become obstacles with the same spacing), try to place one more set in the free space; accept only if all its pieces fit and the combined plan passes `verifySolution` for *N* + 1 sets; repeat until it fails.
- **Budget.** `timeLimitMs` (default 8000 ms) is shared among the estimated remaining attempts; each attempt gets 80 % of its share because the optimizer's repair pass may overrun its own limit by 25 %. The same determinism caveat applies: identical with a frozen clock, possibly different on a much slower machine.
- **Result.** `kits` (the best *N*, or 0), `perKit`, the plan with metrics for the expanded problem, and the list of attempts.

The app uses this search in the **Complete sets** mode of the order (up to 12 sets) and for **Make another product from the leftover** (up to 12 sets of a kit, up to 40 single pieces, or exactly the quantity you ask for).

## Verifier

`verify.ts`. `verifySolution(problem, placements)` is independent of the optimizer: it shares no placement code with it. Where the optimizer uses point-in-polygon tests and edge distances, the verifier measures **areas of boolean operations** (polygon-clipping) and **exact segment-to-segment distances**.

### Checks

| Code | Check |
|---|---|
| `UNKNOWN_TEMPLATE` | The placement references a template that does not exist. |
| `QTY_EXCEEDED` | The instance index is outside `0..qty−1`, or the same instance appears twice. |
| `BAD_ROTATION` | The rotation is not one of the template's allowed rotations (modulo 360, 1e-9° tolerance). |
| `DEGENERATE` | Fewer than 3 points, non-finite coordinates, (near) zero area, or a self-intersecting polygon. |
| `SHAPE_MISMATCH` | The polygon is not the template's shape rotated by the stated angle and translated (vertex by vertex, any starting vertex). |
| `OUT_OF_BOUNDS` | Area of `piece − material` is above tolerance. |
| `DEFECT_INVADED` | Area of `piece ∩ union(defects)` is above tolerance (the union avoids double counting). |
| `OVERLAP` | Area of `piece A ∩ piece B` is above tolerance. |
| `SPACING` | Distance from a piece to the material edge, to a defect, or to another piece is below the spacing. |

If the clipping library throws, the area is treated as infinite, so a failure is always reported as a violation, never silently accepted.

### Tolerances

With *S* = the long side of the material's bounding box (at least 1):

- lengths: `lenEps = 1e-9 · S`; spacing is valid when `distance ≥ spacing − lenEps`;
- areas: `areaEps = 1e-8 · S²`; overlap, invasion or overflow counts when the area exceeds it;
- shape: each vertex within `1e-6 · max(w, h, 1)` of the expected vertex.

### What it guarantees

For the polygons in the plan: every piece is the right shape, in an allowed rotation, inside the material outline, outside every excluded zone, not overlapping any other piece, and at least the spacing away from edges, zones and other pieces; no piece instance is used twice or beyond the requested quantity.

### What it does not guarantee

- **That the inputs match reality.** The material outline, the zones and the calibration are taken as given. A wrong outline or a skewed photo produces a valid plan for the wrong material.
- **Curves.** Circles and rounded corners are polygons. Vertices lie on the true curve, so the true curve bulges slightly past the polygon edges (about 0.9 % of the radius for a 24-gon circle). Use a small spacing if that matters.
- **Cutting physics.** Kerf, blade or laser width, material stretch and grain are not modelled.
- **Optimality.** A valid plan can still leave room for more pieces.

## Metrics

`metrics.ts` always recomputes metrics from geometry, never from optimizer counters:

| Metric | Definition |
|---|---|
| `totalArea` | area of the material |
| `excludedArea` | area of `union(defects) ∩ material` (no double counting; parts outside the material do not count) |
| `usableArea` | `totalArea − excludedArea` |
| `occupiedArea` | area of `union(pieces) ∩ (material − defects)` |
| `usableUtilization` | `100 · occupied / usable` (0 if usable is 0) |
| `materialUtilization` | `100 · occupied / total` |
| `requested`, `placed`, `pending` | per template; `placed` counts distinct, valid instances only |

## Leftover

`remainder.ts`. `computeRemainder(problem, placements)` returns `material − union(defects) − union(pieces)` as fragments, each an outer ring (positive orientation) plus holes (negative orientation).

- **No spacing buffer** is applied: the leftover is the literal geometry that remains. If you reuse a fragment as material, the optimizer applies the spacing to its edges again.
- Fragments smaller than 0.5 % of the material area are dropped; the rest are sorted by area, largest first.
- `fragmentAsMaterial(fragment)` turns a fragment into a new problem input: the outer ring becomes the material and its holes become excluded zones.

## Using the engine directly

```ts
import { optimize, verifySolution, maximizeKits } from './src/engine';

const solution = optimize(problem);                     // always passes verifySolution
const check = verifySolution(problem, solution.placements);
const sets = maximizeKits(oneSetProblem, { maxKits: 12 });
```

Tests in `src/engine/*.test.ts` cover geometry, the verifier (each violation code), metrics, determinism, real kits (cardholder, wallet), the complete-set search, the leftover and a stress case.
