# 3D assembly preview

After the design agent proposes the flat pieces for a product, CutSense can show how those pieces become the object: a wallet folding shut, pockets landing on a cardholder, the walls of a box standing up. The preview is built from the real piece sizes, so what you see is a consequence of what you are about to cut. It is labelled **Vista previa aproximada** and is never a technical drawing.

- Component: `src/components/AssemblyPreview.tsx` (styles in `AssemblyPreview.css`)
- Scene language, validator, macros, kinematics, checks: `src/lib/assembly/`
- three.js renderer, loaded on demand: `src/viewer3d/`
- Server routes: `server/assembly.ts` (`POST /api/assembly`, `POST /api/assembly/critique`)
- Dev lab: `assembly-lab.html` (dev server only)

## How it works

1. **Rules first.** A deterministic scene is built at once from the product name and the piece names (an archetype macro such as `bifold_wallet` or `tote`). The person sees a preview immediately, and it remains if the model is unavailable.
2. **The model describes the assembly.** Muse Spark receives the product, the pieces and the design assumptions and returns a *scene*: structured data in a strict JSON Schema. It never returns code. The scene chooses placement, folds, layering, seams and hardware; every size comes from the pieces.
3. **The model checks its own work.** The app renders the assembled object from four angles (pieces painted in the cutting-plan colours) and sends the image, the scene and an automatic geometry report back. The model answers `ok` or a corrected scene. Up to two rounds; a correction is only accepted if it is not geometrically worse, and the loop stops early when a correction changes nothing. The panel shows *Revisando con IA…* meanwhile.
4. **Armar.** A slider (and a *Ver cómo se arma* button) animates from the pieces lying flat, as cut, to the assembled object: stacked pieces travel onto their parent, then hinges and folds close and pouches fill out.

## The scene language

A scene is a flat list of nodes with parent ids (the strict schema forbids recursion), plus a material, a camera suggestion and an optional macro.

| Field | Meaning |
|---|---|
| `type` | `panel` (a piece), `strap` (a handle drawn as an arc whose length is the piece length), `hardware` (`snap`, `stud`, `ring`, `zipper`, `rivet`, `buckle`) |
| `piece`, `instance` | Which cut piece this is. Each instance may be used once; unknown names are rejected. |
| `parent`, `joint` | `root` lies on the table; `stack` lies on a face (`side`) of the parent, with `layer` order and automatic stacking of overlapping siblings; `hinge` attaches by its bottom edge to a parent edge (`hinge_edge`) and turns by `hinge_angle_deg` (90 = wall, 180 = flap folded over) |
| `anchor_x/y`, `self_x/y` | Fractions of the parent and of the piece itself: which point of the piece sits on which point of the parent |
| `folds` | Up to three folds of the piece itself: axis, position, angle (180 = shut, 350 = tube), which side moves, bend radius (automatic radius fits whatever is stacked inside) |
| `bulge_mm`, `stitch` | Cushioning for pouches; which edges carry visible stitches |

Every piece has a local frame: x along its width, y along its height (+y is the top edge as drawn), z through its thickness. Macros (`bifold_wallet`, `cardholder`, `card_slot_stack`, `zip_pouch`, `flap_pouch`, `flat_sleeve`, `envelope_flap`, `tube_sleeve`, `box_with_lid`, `tote`, `keychain_loop`, `coaster_stack`, `generic_stack`) expand deterministically into these nodes from the real pieces, using roles assigned by the model or guessed from the piece names. The critique always sees the expanded nodes, so it can edit them.

## Guardrails

- **No code from the model.** Output is data in a closed schema (Meta's strict subset: closed objects, every key required, no `oneOf`/`allOf`, depth ≤ 10). The renderer only interprets known fields.
- **Validation.** Numbers are clamped to safe ranges (angles, anchors, offsets, thickness 0.5–5 mm, ≤ 3 folds), at most 60 nodes, unknown pieces and repeated instances are dropped, a single root is enforced and cycles are broken. A structurally invalid answer, or one that leaves most pieces unplaced, gets one retry with the error; after that the server answers `ASSEMBLY_BAD_OUTPUT` and the rules-based preview stays.
- **Inputs.** Product name ≤ 120 characters; pieces re-validated with the agent's limits (≤ 6 types, 0.3–120 cm, quantity ≤ 50); critique images must be PNG, JPEG or WebP data URLs of ≤ 1.2 MB; the geometry report is passed as data, flattened to one line.
- **Service limits.** 12 requests per minute per IP by default (`rateLimit` hook), 90 s timeout, the API key stays on the server.
- **Deterministic checks.** Before and during the critique the app samples every piece in the assembled pose and reports pieces that pass through each other, overhang or float, handles too short to reach, over-rolled folds and pieces left unplaced. These checks decide whether a model correction is accepted.

## Accessibility and honesty

- The canvas has a text label, keyboard orbit (arrow keys, `+`/`−`, `Home`), on-screen camera buttons and a keyboard-operable *Armar* slider with spoken values. With reduced motion the preview opens assembled and nothing animates on its own.
- *Descripción del modelo* gives a text alternative generated from the scene (what sits on what, which edges are joined, approximate assembled size).
- The caption states the simplifications: uniform thickness, ideal folds, symbolic stitches and hardware, and lists any piece the scene could not place. Assumptions the model made about the assembly are listed below it.
- *Por pieza* paints each piece in its cutting-plan colour, so a piece in the 3D view can be matched to the plan.

## Known limits

- Folds are ideal cylindrical bends of a uniform sheet; leather compression, stretch and the material taken up by a fold are not modelled.
- Stitches and hardware are drawn as symbols at plausible positions; seam allowances are not represented.
- Gussets that wrap around corners, sewn-in linings and fabric drape are approximated by flat panels and hinges; soft bags look boxier than in real life.
- Pieces are rigid outside their folds. Shapes come from the five piece kinds the agent uses (rectangle, rounded rectangle, ellipse, trapezoid, L-shape).
- The critique judges a rendered image; it can miss problems hidden from the four views and may ask for things the scene language cannot express.

## Integration

```tsx
import { AssemblyPreview } from './AssemblyPreview';

<AssemblyPreview productName={proposal.name} pieces={proposal.pieces} assumptions={proposal.assumptions} />
```

The component imports its own CSS and expects the brand stylesheet (`src/styles.css`) that the app already loads. `ai={false}` shows the rules-based preview only. The server routes are registered from `server/index.ts` with the same key and base URL as the design agent; no extra configuration is needed.

## Screenshots

`docs/3d-preview/` holds one sheet per product family from the lab (flat pieces, mid-assembly, assembled, second angle), rendered after the model and critique loop: `billetera`, `tarjetero`, `monedero`, `gafas`, `celular`, `tote`, `llavero`, `posavasos`, `neceser`, `caja`, plus `billetera-dark` for the dark theme.
