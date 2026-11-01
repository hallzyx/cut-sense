# CutSense

**From a photo to a cutting plan you can trust.**

CutSense turns a photo of an irregular flat offcut — leather, felt, foam, cardboard — into a digital cutting plan. Snap or upload a picture, let AI outline the material, mark the defects, pick the pieces you need, and get a layout that is checked geometrically before you ever see it.

> Exported plans are **reference drawings**. CutSense does not provide industrial dimensional accuracy, a proven global optimum, or measured cost savings.

## How it works

1. **Digitize** — SAM 3.1 proposes a mask of your material. Accept it, reject it, or edit the outline point by point. Holes found in the mask are suggested as exclusion zones.
2. **Prepare** — Calibrate the scale with a known length, mark areas that must not be cut, and define your pieces. Start from a ready-made product kit (leather cardholder, bifold wallet) with real measurements in cm. Need a shape that is not in the list? Draw it on the canvas or import it from an SVG; curves become polygons and the piece scales to the size you set.
3. **Optimize** — A deterministic nesting engine places the pieces. An independent verifier validates every plan before it is shown as valid.
   - **Maximize complete sets:** treat the order as one set (for example one wallet) and let CutSense find how many complete sets fit in the offcut.
   - **AI defect detection:** ask SAM for short phrases such as "scar, stain, hole"; proposed zones are applied only after you accept them.
4. **Iterate and export** — Add a defect or change the order and re-optimize. The result view tells you what changed. Export the verified plan as SVG or PNG. With a physical calibration you can also print the plan at 1:1 across A4/Letter sheets with per-piece templates, or export a DXF (R12, millimetres, pieces on a `CUT` layer) for cutting machines.

### Using up the whole offcut

After a plan you can also **try another product with what is left**: pick a complete kit or a loose piece (keychains, coasters, bookmarks) and CutSense fits as many as it can around the pieces already placed. The combined plan is verified as a whole, and each added product can be removed.

After a plan, **Leftover** shows what is left of the material (minus pieces and defects). Plan the next batch on a leftover fragment, or upload a photo of the real leftover after cutting: SAM digitizes the new irregular shape and your order is kept.

## What does what

| Step | Responsible | Where you see it |
|---|---|---|
| Initial material mask | **SAM 3.1** via the Meta Model API | Step 1: dashed "proposal" outline, source labelled *AI — SAM 3.1* |
| Mask → polygon | Deterministic code (`src/lib/mask.ts`: largest component, Moore tracing, Douglas–Peucker) | Editable vertices |
| Corrections | You | Source labelled *+ human correction* |
| Placement | Deterministic heuristic (`src/engine/optimize.ts`) | Step 3 |
| Validity | Independent verifier (`src/engine/verify.ts`) | "Valid and verified plan" |

Geometry has the final word: the model proposes the shape, the verifier decides whether a plan is valid.

## Getting started

```bash
npm install
cp .env.example .env   # add your SAM credentials
npm run dev            # web on :5173, API on :8787
npm test               # engine, verifier and mask tests
npm run build
```

### Configuration

The segmentation proxy (`server/index.ts`) keeps credentials on the server; they never reach the browser.

| Variable | Description |
|---|---|
| `SAM_API_URL` | Meta Model API base URL (`https://api.meta.ai/v1`) |
| `SAM_API_KEY` | API key (Bearer) |
| `SAM_MODEL` | Optional model id (default `sam-3.1`) |
| `PORT` | API port (default `8787`) |

Without credentials the app still works. It states clearly that **AI segmentation did not run** and offers labelled alternatives: a stored example mask, local contrast segmentation, or manual tracing.

SAM 3.1 segments by short noun phrase, so the Digitize step asks what material to segment (for example "brown shape"). Results depend on the phrase.

## Honest by design

- Results are the **best solution found** by a heuristic search, not a proven optimum.
- Without calibration, measurements are relative units (1 u = 1 % of image width), never centimetres. Product kits require a calibration in cm.
- Two-point calibration assumes a near top-down photo; strong perspective makes the scale unreliable.
- Your photo is sent to the inference service through our server for segmentation. Projects are ephemeral and nothing is stored.
- Defects are marked by you or suggested from mask holes; stains that the model treats as material must be drawn manually.
- Exported SVG/PNG files carry a reference-plan warning and the calibration status.

## Reproducibility

Every result includes the seed and optimizer version, and "Download problem + solution (JSON)" saves the inputs and output. The same input and seed produce the same plan.

## Project layout

```
server/        Segmentation proxy for the Meta Model API
src/engine/    Geometry, verifier, metrics, optimizer (+ tests)
src/lib/       Mask → polygon, kits, export, examples
src/components Wizard UI (Home, Workspace, Stage)
src/brand/    Brand tokens used by the app
design/        Brand book, logos, tokens, components and preview (see design/DESIGN.md)
```

## Roadmap

- Natural-language order entry that turns requests into structured, confirmed constraints
- Automatic defect suggestions with user confirmation
- Saved projects and share links
- Multi-sheet nesting and cutting-machine export
