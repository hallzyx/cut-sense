# Exports and file formats

Everything CutSense writes is generated in the browser from the **current, verified** plan. Exports live in the **Export** menu of the Result step; the project file lives in the header's **Project** menu.

## When you can export

| Condition | SVG / PNG | 1:1 print, SVG in cm, DXF |
|---|---|---|
| No plan yet | disabled ("Optimize to get a plan.") | disabled |
| Plan out of date (you changed something after optimizing) | disabled ("Re-optimize to export an up-to-date plan.") | disabled |
| Plan failed verification, or no pieces placed | disabled | disabled |
| Current, verified plan | available | only with a calibration in **cm or mm** |

Your export preferences (include photo, paper size, DXF reference layers) are remembered in the browser.

Every export is a **reference drawing**: accuracy depends on the calibration and on the photo being taken from nearly straight above. CutSense does not model kerf, speed or power; your machine and your judgement do.

## SVG (plan image)

`cutsense-plan.svg`: a single SVG in **image-pixel coordinates**, the same size as the photo plus a legend band below it:

- the photo (or a light grey background when *Include photo* is off);
- the material outline, the excluded zones with a red barrier-tape hatch, and every placed piece filled with its colour and pattern and labelled with its letter and copy number (`A1`, or `A1·2` for copy 1 of set 2 when there are several sets);
- a legend per piece type: name, placed / requested, size and unit;
- the calibration status (pixels per unit and the reference used, or a note that units are relative, 1 u = 1 % of the image width);
- the metrics line (placed / requested, occupied / usable %, occupied / total %, number of excluded zones);
- the optimizer version and seed, a reminder that the plan was verified geometrically, and that it is the best solution found, not a proven optimum.

## PNG

`cutsense-plan.png`: the same SVG rasterized in the browser at 2× resolution.

## 1:1 printing

Opens a print-ready page in a new window (allow pop-ups for the site) and starts the print dialog once it loads. Requires a calibration in cm or mm.

- **Cover page:** material size, pieces placed, number of sheets and orientation, a boxed warning to **print at 100 %** (turn off "Fit to page"), a **5 × 5 cm square and a 10 cm ruler** to check the scale on paper, assembly instructions, and the reference-plan note with optimizer version and seed.
- **Plan sheets:** the plan at real scale, tiled over **A4** (21 × 29.7 cm) or **Letter** (21.59 × 27.94 cm) with 1 cm page margins and **1 cm overlap** between sheets. The orientation (portrait or landscape) that needs fewer sheets is chosen automatically. Corner marks show the useful area of each sheet, and each sheet is tagged with its number, row and column.
- **Per-piece templates:** each placed piece type at 1:1, with its letter, name, how many to cut, size and allowed rotations, ready to cut out and use as a pattern. A template larger than one sheet is flagged ("use the full plan").

## SVG in centimetres

`cutsense-plan-1to1.svg`: one SVG whose `width` and `height` are in `cm` and whose user unit is 1 cm, so it opens and prints at real scale in any vector editor. It includes a 1 cm margin, the material outline (dashed), hatched zones, patterned and labelled pieces, the legend, the 5 × 5 cm square and 10 cm ruler, and a reference-plan footer. The sheet is at least 17.5 cm wide so the legend fits.

## DXF

`cutsense-pieces.dxf`: a DXF in the most widely accepted dialect for laser cutters, plotters and CNC software:

| Property | Value |
|---|---|
| Version | R12 (`$ACADVER = AC1009`), ASCII, CRLF line endings |
| Units | millimetres (`$INSUNITS = 4`, `$MEASUREMENT = 1`) |
| Geometry | closed `POLYLINE` entities with `VERTEX` / `SEQEND`, coordinates with 3 decimals, z = 0 |
| Origin | bottom-left corner of the material's bounding box, Y axis up |
| Line type | `CONTINUOUS` |

| Layer | Colour (ACI) | Content | Included |
|---|---|---|---|
| `CUT` | 1 (red) | outline of every placed piece: what the machine should cut | always |
| `MATERIAL` | 5 (blue) | material outline, for reference | only with *DXF: edge and zones as reference* |
| `DEFECTS` | 6 (magenta) | excluded zones, for reference | same switch |

Reference layers are off by default because some machines cut every layer they receive. Requires a calibration in cm or mm.

## Project file (`.json`)

**Save project** (Project menu, or Ctrl/Cmd+S) writes one JSON file, `cutsense-project.json`; **Open a saved project** on the home screen restores it.

```jsonc
{
  "app": "cutsense",
  "version": 1,
  "savedAt": "2026-11-01T10:00:00.000Z",
  "step": 3,                       // 1 Digitize · 2 Prepare · 3 Result
  "project": {                     // the Project state, see architecture.md
    "image": { "src": "data:image/jpeg;base64,...", "w": 1600, "h": 1200, "name": "offcut.jpg" },
    "contour": [[x, y], ...], "lastValid": [[x, y], ...],
    "source": "sam", "edited": true, "samInfo": "sam-3.1 · 2310 ms · ...",
    "defects": [[[x, y], ...]],
    "calib": { "a": [x, y], "b": [x, y], "dist": 8.56, "unit": "cm" },
    "defs": [{ "id": "t0", "name": "Body", "color": "#F5B800", "kind": "rrect", "w": 9.5, "h": 6.5, "qty": 1, "rotations": [0, 180] }],
    "spacing": 0.2,
    "fill": "maxKits"
  },
  "plan": {                        // null when there is no plan
    "placements": [{ "templateId": "t0", "instance": 0, "rotation": 0, "polygon": [[x, y], ...] }],
    "seed": 1, "optimizerVersion": "cs-nest-1.0", "elapsedMs": 2140,
    "kits": { "n": 3, "perKit": { "t0": 1 } },
    "extras": []
  }
}
```

Geometry is in image pixels; piece sizes and spacing are in display units (relative `u` or the calibrated unit).

### Validation on open

Nothing in the file is trusted:

- At most 40 MB; must be JSON with `app: "cutsense"` and `version: 1`.
- The photo must be an embedded data URL (PNG, JPEG, WebP or SVG), 1–20,000 px per side.
- Rings: finite numbers, 3–5,000 points; at most 50 excluded zones.
- Pieces: at most 12 in the order and 6 per extra product; `id` ≤ 40 and `name` ≤ 80 characters; `kind` from the known list; `w`, `h` > 0; `qty` 0–1000; rotations a non-empty subset of 0/90/180/270; colours as `#RRGGBB`; custom shapes as rings.
- Calibration distance > 0; spacing ≥ 0; fill mode `fixed` or `maxKits`; at most 2,000 placements and 12 extra products.

Then the problem is rebuilt from the project (with the saved number of sets and the extra products) and **the saved plan is verified again** with the independent verifier. If it no longer passes, the plan is dropped, the project opens on the Prepare step, and a notice asks you to optimize again. Metrics are always recomputed from the geometry; a project without an outline opens on Digitize.

The file contains your photo: treat it as private.

## Problem + solution (`.json`)

From the result details, **Download problem + solution (JSON)** saves the exact engine input and output, pretty-printed, as `cutsense-problem.json`:

```json
{ "problem": { "material": [...], "defects": [...], "templates": [...], "spacing": 12.3, "seed": 1, "timeLimitMs": 4000 },
  "solution": { "placements": [...], "metrics": {...}, "elapsedMs": 2140, "optimizerVersion": "cs-nest-1.0", "seed": 1 },
  "verify": { "valid": true, "violations": [] } }
```

Coordinates are image pixels. For a complete-set plan, `problem` is the expanded problem (quantities multiplied by the number of sets) that was verified. Use it to reproduce a run (`optimize(problem)` gives the same plan for the same seed, within the time-budget caveat in [engine.md](engine.md#7-time-budget-and-determinism)), to file a bug, or to check a plan independently with `verifySolution(problem, solution.placements)`.
