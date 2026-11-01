# CutSense — UX redesign: one screen, one action

> Problem (user feedback): *"there are too many elements together; it is too much cognitive load."*
> Answer: keep every feature, but show only what the current decision needs. Every screen gets **one primary action**, **3–5 visible primary controls**, and everything else sits behind a **labelled** disclosure, menu, tab or dialog that **shows its current value while closed**.

Files in this folder:

| File | What it is |
|---|---|
| `UX-REDESIGN.md` | This spec: audit, IA, per-screen spec, components, traceability, plan |
| `prototype.html` | Static prototype (frames F1–F10 + gallery G1–G6). Imports `../tokens.css`, `../components.css`, `ux.css`. `?theme=dark` / `?theme=light` |
| `ux.css` | New classes (`.ux-*`) layered on the brand system. No new tokens, no new fonts |
| `screenshots/` | `<frame>-<1280|390>-<light|dark>.png` for every frame, plus `f8b-result-closed-*` (Step 3 with the export menu closed) |
| `before/` | Screenshots of the current app (input to the audit) |

Brand is unchanged: paper / mat green / thread / chalk, Bricolage Grotesque + Instrument Sans + JetBrains Mono, stitched panel, provenance language (dash = AI, solid = human, hairline = computed, seal = verified, dotted = stale).

---

## 1. Audit — why the current panel is heavy

### 1.1 Measured (current app, 1280 px wide)

| Screen | Buttons | Fields | Checkboxes | Sections | Words | Panel height |
|---|---|---|---|---|---|---|
| Step 1, outline accepted | 7 | 1 | 0 | – | ~100 | fits |
| **Step 2** (4 pieces) | **19** | **23** | **17** | 4 | **309** | **2,328 px** (3.1 screens) |
| **Step 3** (verified) | **17** | 2 | 2 | 5 | **337** | **1,963 px** (2.6 screens) |

The header adds a second filled green button (**New project**) that competes with the panel's primary on every screen.

### 1.2 Causes (from `before/` screenshots and `Workspace.tsx`)

1. **Everything is visible at once.** Step 2 renders scale, zones, AI detection, kit, AI design, fill mode, every piece card, spacing, metrics and the primary in one 2,328 px column. The primary action (*Optimize layout*) is below the fold on any laptop.
2. **No hierarchy between primary and secondary actions.** Step 3 has four filled dark/green buttons (*Re-optimize*, *Export SVG*, *Export PNG*, *Print 1:1*) plus a filled header button. Equal weight = no guidance.
3. **Rare / advanced options are always shown.** Four rotation checkboxes per piece (17 checkboxes with 4 pieces), DXF reference toggle, paper size, JSON download with seed and milliseconds, "Occupied ÷ total".
4. **Repeated tools.** `DefectTools` is rendered in Step 2 *and* Step 3; the canvas already is the place where zones are drawn. Back links duplicate the stepper. *Save project / New project* appear in every step's panel *and* (New) in the header.
5. **Three-to-five competing ways to define pieces**, presented side by side with no "pick one": kit `<select>`, *Design with AI*, *+ Add piece*, *Draw piece*, *Import SVG*.
6. **Paragraph-shaped state.** State is written as captions ("Calibrated: 140 px = 10 cm. Measurements are physical only if…", "The quantities below are the pieces of ONE set…", three captions under the 1:1 export). It must be read, not scanned.
7. **Stacked alerts.** A flash alert (often about the previous step) sits on top of the panel, pushing the step title down, followed by a status alert, followed by the score ring that repeats the same message ("Valid and verified plan. 3 sets fit…" + "3 complete sets").
8. **Canvas tools live in the panel.** Draw polygon, quick circle, revert, guide points and "Show photo" are panel buttons/checkboxes, far from where the action happens.
9. **Leftover reuse is mixed into the result.** *Leftover* (view, fragments, other product, leftover photo) is a full section between the result and the export, so the export is ~1,100 px down.
10. **Mobile multiplies it.** At 390 px Step 2 is 2,938 px tall; the canvas scrolls away while you edit the things that change it.

---

## 2. Rules of the redesign

| # | Rule | How it is enforced |
|---|---|---|
| R1 | **One primary action per screen**, always in the panel footer (sticky). | `PanelShell` has a `footer` slot; only one `.cs-btn--primary` allowed per panel (lint by review). |
| R2 | **3–5 visible primary controls** in the panel body by default. | Default states in §4 list them; target metrics in §8. |
| R3 | **Canvas tools live on the canvas** (`CanvasToolbar`), never duplicated in the panel. | Zone tools, revert, AI re-detect, photo toggle. |
| R4 | **State is a chip or a one-line summary**, not a paragraph. | `ux-status`, `ChecklistStep.summary`, `Disclosure.value`. |
| R5 | **Nothing hidden is secret**: every collapsed control shows its current value in its summary ("Options · spacing 0.2 cm", "Details · areas · pieces · JSON"). | `Disclosure` requires a `value` prop. |
| R6 | **One editor at a time** (pieces, menus, popovers). | `PieceList` holds `selectedId`; menus close each other. |
| R7 | **Transient feedback is a toast; blocking problems are inline** next to the action they block. | `ToastRegion` replaces `flash`; `err` renders in the relevant sub-step or footer. |
| R8 | **Honesty copy is never hidden behind a click**: "not a proven optimum", calibrated vs relative units, reference-plan warning, provenance pills stay visible where the claim is made. | Listed per screen in §4. |

---

## 3. New information architecture

```
Header ── CutSense · StepRail [1 Digitize — 2 Prepare — 3 Result] ················ [Project ⋯]
                                                                                    ├ Save project (.json)
                                                                                    ├ Light/dark theme
                                                                                    └ New project…
Work area ── Canvas (photo + overlays)                     │ Panel (one at a time)
             ├ top-left: provenance tag / mode hint        │  head:   eyebrow · title · status chips
             ├ CanvasToolbar (per step, bottom centre)     │  body:   the current decision only
             └ ToastRegion (bottom-left)                   │  footer: ONE primary (+ optional ghost/menu)

Step 1 Digitize      prompt  →  proposal  →  ready  (+ failure / invalid)
Step 2 Prepare       Checklist:  ① Scale   ② Excluded zones   ③ Pieces       (one open at a time)
Step 3 Result        Tabs:  Plan (hero + 3 numbers + Details)  |  Leftover (reuse)
                     Footer: Export ▾ (all formats)  ·  ⋯ (Recompute, Edit pieces)
                     Stale: footer flips to Re-optimize; Export disabled with reason
```

**Why a checklist for Step 2 and not three more wizard steps:** the three preparations are not strictly sequential (a user who loads a kit often goes back to scale; zones can be added at any time), and returning users must be able to optimise straight away. A checklist gives the guidance of sub-steps (numbered, with done/attention marks) without adding navigation or hiding the primary. Default open item = first incomplete one (§4.2).

**Why tabs in Step 3:** *Plan* answers "what did I get and how do I take it out" (hero + export). *Leftover* answers a different, later question ("what can I do with the rest"). They share the canvas but not the panel.

---

## 4. Screen-by-screen specification

Conventions: **[P]** = the primary button. "Visible controls" counts what is interactive in the panel + canvas toolbar in the default state (header excluded).

### 4.1 Step 1 · Digitize

#### F1 — before detecting (`prototype.html#f1`)
```
┌ Canvas ─────────────────────────────┐ ┌ Panel ─────────────────────────────┐
│ [Example image]                      │ │ STEP 1 OF 3                        │
│                                      │ │ Digitize                           │
│          photo                       │ │ AI finds the edge…                 │
│                                      │ │ What material to look for?         │
│                                      │ │ [ brown shape                    ] │
│                                      │ │ Short phrase in English…           │
│                                      │ ├────────────────────────────────────┤
│                                      │ │ [P ✦ Detect edge with AI         ] │
│                                      │ │ Your photo goes to SAM… [Other ways▾]│
└──────────────────────────────────────┘ └────────────────────────────────────┘
```
- Visible controls: concept field, **[P] Detect edge with AI**, *Other ways ▾* (menu). = 3.
- *Other ways* menu (shown open in F1): **Guide the AI** → *Mark guide points (n)* (toggles `mode='points'`; when n>0 a second item *Clear guide points* appears and the concept field is disabled with hint *"With guide points the phrase is not used."*). **Without Meta AI** → *Segment by contrast* (local), *Use saved mask* (only when `img.exampleId`), *Trace by hand*.
- Busy: primary shows `aria-busy` + label *"Reading the edge…"*; a chalk progress bar + *Cancel* replaces the caption (abort controller exists).
- Canvas hint in points mode: *"Click = include · Shift+click or right-click = exclude"*.
- **SAM failure (G5):** danger alert in the body: title *"AI could not read the edge this time"*, body = the existing `SAM_MSG[code]` sentence + *"Your photo is still here."*, actions *Retry* (secondary), *By contrast*, *Trace by hand* (+ *Saved mask* for examples). The primary label becomes *Retry SAM 3.1*. The alert names "SAM / Meta AI did not run" exactly as today (`SAM_NOT_CONFIGURED`).

#### F2 — AI proposal
- Head status: pill *AI proposal · SAM 3.1* (or *Local contrast · not Meta AI*, *Saved example mask*, per `SOURCE_LABEL`).
- Body: question **"Is this the edge of your material?"**, one sentence *"AI proposes; you have the last word. We found 1 hole: we will mark it as an excluded zone."* (hole sentence only if holes > 0). Disclosure *Technical details · 23 vertices* → `proposal.info` (model · latency · confidence · prompt).
- Footer: **[P] Accept outline**, ghost *Discard*. Visible controls: 3.

#### F3 — outline ready (editing)
- Canvas tag: *AI + corrected by you* (thread) / *AI proposal* / *Manual trace*. Canvas hint: *"Drag a vertex · click an edge to add · Delete removes"*.
- CanvasToolbar: *Back to last valid* (disabled when equal to `lastValid`), *Detect again* (returns to F1 keeping concept/points).
- Panel body: facts list — *Source* (pill), *Digitized area* (mono, unit), *Scale* (unit badge, always *Not calibrated* at this point). Disclosure *Technical details*.
- Footer: **[P] Continue to Prepare**.
- Toast after accepting with holes: *"1 hole became an excluded zone. Review it in Prepare."* [Close].
- **Invalid outline:** danger alert in body *"The outline crosses itself"* / *"Move the marked vertex or go back to the last valid one. Optimizing is blocked until then."* + action *Back to last valid*; primary disabled with reason line *"Fix the outline to continue."*; StepRail steps 2–3 locked.
- Visible controls: 2 tools + 1 disclosure + primary = 4.

### 4.2 Step 2 · Prepare — the checklist

Panel head: title *Prepare* (the eyebrow *STEP 2 OF 3* is shown only on mobile, where the StepRail is compact). Body: three `ChecklistStep`s. Footer: one summary line *Usable area 1,023.3 cm²* (or *≈ … u²* uncalibrated) + **[P] Optimize layout**, disabled with a reason line when blocked (*"Add at least one piece to optimize."*, *"The excluded zones cover the whole material."*, *"Fix the outline in step 1."*).

Checklist item anatomy (closed): mark (✓ done / number todo / ! attention — shape + glyph, not colour alone) · title · one-line summary · chevron. Exactly one item is open; opening one closes the others (`aria-expanded`, `aria-controls`).

| Item | Done when | Summary text (closed) | Attention (!) when |
|---|---|---|---|
| ① Scale | `p.calib` set | badge *Calibrated · cm* (solid) / *Not calibrated* (dashed, ≈) | a kit/AI design needs cm and calibration is missing |
| ② Excluded zones | zones > 0 **or** user opened it and pressed *No defects* | *1 zone*, *3 zones* / *Not reviewed* | zones = 0 and not confirmed; any zone *outside the material* |
| ③ Pieces | ≥1 piece with qty>0 | *Cardholder · 5 per set* / *4 pieces* / *None yet* | — |

**Default open item:** first not-done item in order ①→②→③; if all done, ③ (the one people edit most). Opening state is UI state only (resets when leaving Step 2).

#### ① Scale (F4)
- Uncalibrated: segmented *By width* | *With a reference*.
  - *By width*: field *Real width of the material* [___ cm] + secondary *Calibrate* (Enter submits). Hint *"Measure the widest part. No ruler? A bank card is 8.56 cm long."* The canvas draws a dashed dimension line across the outline bbox labelled *width = ? cm* so "width" is unambiguous.
  - *With a reference*: sets `mode='calib'`; canvas hint *"Mark 2 points of known length"*; fields *Distance* + *Unit* (default cm) + *Apply* (disabled until 2 points) + *Cancel*.
  - Example images only: link *Use the example's scale* (14 px = 1 cm).
  - Caption (one line, always visible while uncalibrated): *"Without calibration, measurements are relative (1 u = 1 % of the photo's width), not centimetres."*
- Calibrated: mono line *140 px = 10 cm*, caption *"Physical measurements only if the photo is taken from nearly straight above."*, link *Remove calibration*.
- Errors inline under the field: *"Enter the real width of the material in cm (greater than 0)."*, *"Mark two points and enter a real distance greater than 0."*, *"The two points are too close."*
- Visible controls (uncalibrated): segmented(2) + field + Calibrate + example link = 5.

#### ② Excluded zones (F5)
- Hint: *"No piece will land on these zones. Use the tools on the photo."*
- Zone rows: hatch swatch · *Zone 1* + origin caption (*from the mask hole* / *drawn* / *proposed by AI*) · area (mono) · delete icon button (`aria-label="Delete zone 1"`). Clicking a row selects it for editing (canvas handles), row shows *editing*. Zone outside the material: caption *"outside the material, no effect"* + ! mark on the checklist item.
- Empty: *"Does your offcut have holes, stains or seams? Mark them so no piece lands on them."* + link *No defects* (marks ② done).
- CanvasToolbar (the only place for zone tools): *Draw zone* · *Circle* · *Detect with AI* (chalk icon). While drawing, the toolbar shows *Cancel drawing* and the hint *"Click to add points · click the first one to close"*.
- *Detect with AI* opens `DetectDefectsPopover` (G1): field *What to look for? (in English)* = `scar, stain, hole`, hint *"Up to 4 phrases separated by commas. Nothing is applied until you accept it."*, secondary *Search with SAM* (busy: *Searching with SAM…*). Popover closes on success.
- AI proposals review card (chalk `cs-alert--ai`): *"AI proposes 2 zones"* / *"scar", "stain" · dotted in blue on the photo.* → *Add both* / *Discard*. None found → toast *"SAM found no defects with those phrases. Try others (e.g. "dark spot", "crack") or mark them by hand."*
- Visible controls (1 zone, no proposals): 3 toolbar tools + 1 row delete + row = 5.

#### ③ Pieces — empty (F6)
Three option cards: **Use a product** (*Cardholder, wallet, keychains… sizes in cm*) → opens the kit list (same content as G2 top group); **Design with AI** (*Describe it; you approve the pieces*) → `AgentDialog`; **Custom piece** (*Basic shape, drawn or from SVG*) → a 3-item menu (*Basic shape*, *Draw shape…* → `PieceDialog mode='draw'`, *Import SVG…* → `PieceDialog mode='svg'`).
If uncalibrated, *Use a product* and *Design with AI* show the meta *"Requires a calibration in cm"* and, when chosen, open ① Scale with a warn alert *"This product uses real measurements in cm. Calibrate the photo first and choose it again."* (same rule as `applyKit` / `agentBlocked`; AI chat still opens, as today, and keeps its conversation).

#### ③ Pieces — list (F7)
- Segmented *Complete sets* | *Exact quantity* (= `p.fill` maxKits/fixed). One-line hint: maxKits *"Quantities for one set; we find how many sets fit."* / fixed *"Exactly the requested quantities are placed."*
- `PieceList`: one row per def — letter swatch (colour + pattern + letter), name, `w × h` (mono, unit implied by the badge in ①), `×qty`. Rows are buttons with `aria-expanded`.
- `PieceEditor` (only under the selected row): *Name*, *Shape* (select; *Custom* only for custom), *Width*, *Height*, *Per set* / *Quantity* (label follows fill mode), *Allowed rotations* as four `cs-chip[aria-pressed]` (at least one stays pressed — same rule as `toggleRot`), *Remove piece* (danger-quiet), *Done* (closes editor, focus back to row). Relative units: unit suffix *u* in italic (`cs-number__unit--relative`).
- *Add piece ▾* menu (G2): **Product (sizes in cm)** → kits list (loading a kit replaces the order, as today → toast *"Kit 'Leather cardholder' loaded (5 pieces per set). Optimizing will find how many complete sets fit."*); *Design with AI…* (shows *in progress* when `agentChat.length`); *Basic shape*, *Draw shape…*, *Import SVG…*. Counter *4 of 6 types*; at 6 the add items are `aria-disabled` with *"At most 6 piece types."*
- *Options · 0.2 cm* (ghost button on the same row as *Add piece*, value in its label) → small popover with the *Minimum spacing* field. (Rotations are per piece, in the editor.)
- Visible controls (default, editor closed, 4 pieces): segmented(2) + 4 rows + Add + Options = 8 inside ③; primary in footer. Fits the desktop panel without scrolling.

### 4.3 Step 3 · Result

Panel head: eyebrow, title, tabs *Plan* | *Leftover* (`role=tablist`). CanvasToolbar: *Photo* (pressed = show photo, replaces "Show photo"), *Mark zone* (opens the zone tools inline in the toolbar: *Draw zone · Circle · Done*; any change makes the plan stale — that is the existing behaviour, now visible).

#### Optimizing
Footer primary replaced by progress: striped `cs-progress` + *"Fitting pieces… 62 %"* (`role=status`). Canvas tag *Computing · seed 4127*. Tabs disabled.

#### F8 / F8b — Plan, verified
```
 Plan | Leftover
 (seal)  3 sets
         complete · 15 pieces, all verified
 ┌──────────┬───────────┬──────────┐
 │ 63.5 %   │ 649.6 cm² │ 1,023 cm²│
 │ of usable│ occupied  │ usable   │
 └──────────┴───────────┴──────────┘
 │ Best layout found (cs-nest-1.0 · seed …). Not a proven optimum.
 › Details                                    areas · pieces · JSON
 ─────────────────────────────────────────────
 [P ⤓ Export ▴]                           [⋯]
```
- Hero value by case: maxKits n≥1 → *"3 sets"* + *"complete · 15 pieces, all verified"* (+ *"· 2 pieces from other products"* when extras); fixed & complete → *"11 of 11"* *"pieces placed"*; partial → *"9 of 11"* + warn alert *"Verified, but incomplete: 2 × Tab missing. Try allowing a 90° turn or lowering the spacing."*; maxKits n=0 → *"0 sets"* + warn alert *"Not even one complete set fits. Showing the best partial plan for one set."*
- Trio: *% of the usable area* (usableUtilization), *occupied*, *usable* — units from `result.unit`; uncalibrated shows `u²` and the trio caption *≈ relative units*.
- Honesty line (always visible): *"Best layout found ({optimizerVersion} · seed {seed}). Not a proven optimum."*
- Plate labels note (*"Each piece carries its set number ('A1·2')"*) moves to the canvas legend tooltip.
- `DetailsDisclosure` (G3): the six metric rows (unchanged labels), calibration caption (*Calibrated · cm, physical scale from manual calibration* / *No calibration: relative units (u), not physical measurements*), per-piece table (swatch · name · placed/requested · pending), link *Download problem + solution (JSON)* with *seed · ms* as caption.
- Footer: **[P] Export ▾** + `⋯` (G3: *Recompute* — *Same data and seed: same plan*; *Edit pieces* → Step 2 with ③ open).
- **ExportMenu** (F8): groups *Image* → SVG, PNG, switch *Include photo*; *Real scale 1:1* → *Print* (+ paper select A4/Letter, hint *"Print at 100 % and measure the 5 cm square"*), *SVG in centimetres*, *DXF for machines* (hint *"R12 · mm · pieces on the CUT layer"*), switch *DXF: outline and zones as reference*; note *"Reference plans: check one measurement before cutting. Your machine decides kerf, speed and power."* When not physically calibrated the 1:1 group is `aria-disabled` with *"Calibrate the photo in cm or mm (step 2) to export at real scale."* + link *Go to Scale*. Popup blocked → inline error in the menu *"The browser blocked the print window. Allow pop-ups for this site and try again."*
- Selected piece (click on canvas): small canvas popover next to the piece *"C·3 · Card pocket #3 · rotation 180° · 9.5 × 4.5 cm · Rounded"* (replaces the panel alert).
- **What changed** (G6): after a re-optimisation with a different problem, a dismissible info alert at the top of *Plan* with thread bar: changes list + *"Pieces with a different position or rotation: n"* + *"The usable area changed: we do not compare percentages as an 'improvement'."* [Got it]. Canvas keeps ghosts/marching ants.

#### F9 — Leftover tab
- Opening the tab computes and draws the leftover (`computeRemainder`), closing it hides it (replaces *Show / Hide leftover*). Canvas tag *Leftover · n fragments*; pieces drawn desaturated, leftover hatched.
- Trio: *leftover* area, *% of the material*, *fragments*. Honesty: *"Digital estimate: the real leftover will have the edges of the cut."*
- *Another product with what is left* select (optgroups *Complete sets* / *Single pieces*), hint *"The current plan stays fixed."* Added products list: *Coasters · 2 pieces added* [Remove]. Uncalibrated: select disabled + *"Calibrate the photo in cm to use products with real sizes."*
- *Reuse the offcut*: rows *Plan on fragment 1 · 373.7 cm² · back to Prepare* (up to 4 rows), *Upload a photo of the real leftover · New project · keeps your pieces* (file input + existing `confirm`).
- Footer: **[P] Compute with the leftover** (disabled until a product is chosen). Nothing fits → toast *"Not even one complete set of 'X' fits in the leftover. The previous plan did not change."*
- Tab disabled when the plan is stale or invalid (as today the section is hidden then).

#### F10 — stale
StepRail step 3 shows *!*; canvas amber dotted outline + greyed pieces + tag *Out of date · re-optimize*; warn alert *"You changed something after optimizing"* / *"{what changed, e.g. You marked a new zone}. This plan no longer matches your data and cannot be exported."*; hero faded with label *previous plan*; footer **[P] Re-optimize** + disabled *Export* with reason *"Re-optimize to export an up-to-date plan."*

#### Other result states
- **No valid solution (G4):** canvas shows material + zones only, tag *No valid solution*; panel empty state *"No piece fits without touching an excluded zone"* / *"The pieces are larger than the free area or the spacing is too high."* actions **[P] Review pieces** (→ ③) and *See zones* (→ ②). Never show 0 %.
- **Verification failed:** danger alert *"This plan did not pass verification"* + up to 4 violations; no hero, no export, primary *Re-optimize*.
- **Optimization threw:** danger alert *"Optimization failed: {message}"* in the Step 3 body, primary *Re-optimize*.

### 4.4 Project, theme, toasts
- Header `Project ⋯` menu (F3): *Save project* (caption *.json file with your photo: treat it as private*; shortcut Ctrl/Cmd+S), *Dark/light theme*, separator, *New project…* (danger text, keeps the existing `confirm`). The header's filled *New project* button is removed while a project is open (Home keeps its CTAs).
- `ToastRegion` (`aria-live="polite"`): all current `setFlash` messages, max 2 stacked, auto-dismiss 8 s, *Close* always present, paused on hover/focus. Messages that change the user's data (holes → zones, kit loaded, calibration converted sizes) stay until dismissed. Restored project notice is a toast.
- Errors (`setErr`) are not toasts: they render inline in the sub-step / menu / footer they belong to (`role="alert"`). Implementation: keep one `err` string but add `errAt: 'step1'|'scale'|'zones'|'pieces'|'optimize'|'export'|'leftover'` to place it.

---

## 5. Mobile (390 px) — first-class

Breakpoint: below 1000 px (as in `DESIGN.md`). Screens: every `*-390-*.png`.

- **Header** 56 px: logo mark only, compact StepRail (only the current label visible; others are visually hidden but announced), `⋯` project menu.
- **Canvas** is `position: sticky; top: 0`, height `min(42vh, 360px)`, full bleed. It stays visible while the sheet scrolls, so editing a piece or a zone shows its effect. The CanvasToolbar floats at its bottom with icon + short labels (*Draw*, *Circle*, *Detect*); provenance tag top-left.
- **Panel → bottom sheet**: 18 px top radius, grab handle, overlaps the canvas by 16 px, scrolls with the page. **The footer (primary) is sticky at the viewport bottom** with a top shadow and `padding-bottom: env(safe-area-inset-bottom)`.
- **Menus and popovers become sheets** (Other ways, Export, Add piece) with a 45 % ink scrim; Esc / scrim tap / ✕ closes and returns focus.
- **Vertex editing** (Step 1) and **two-point calibration**: toolbar gets *Enlarge* which turns the canvas full-screen (sheet collapsed to its footer) — described, not mocked.
- Touch: all controls ≥ 44 px except chips inside the editor (36 px, ≥ 8 px apart, as allowed by `DESIGN.md`).

---

## 6. Component inventory (React, plain CSS)

All live in `src/components/workspace/`. `Workspace.tsx` keeps **all state and handlers** (the existing hooks are the controller) and becomes layout + wiring (~250 lines). New components are presentational and receive values + callbacks.

| Component | Props sketch | Replaces (current code) |
|---|---|---|
| `WorkspaceHeader` | `{ step, canGo:(n)=>boolean, attention?:3, onGo, onSave, onNew, theme, onTheme }` | `nav.stepper` in Workspace; App header *New project* + theme button while a project is open |
| `StepRail` | `{ step, canGo, attention, onGo, compact }` | `.stepper` buttons |
| `ProjectMenu` | `{ onSave, onNew, isDark, onTheme }` | panel links *Save project*, *New project* |
| `Menu`, `MenuItem`, `MenuSwitch`, `MenuGroup` | `{ open, onClose, anchorRef, label }`, item `{ icon, label, hint?, onSelect, disabled?, reason? }` | — (new primitive; roving focus, Esc, outside click, sheet on mobile) |
| `Disclosure` | `{ summary, value, defaultOpen?, children }` (native `<details>`) | captions and secondary blocks |
| `CanvasPane` | `{ tag, hint, toolbar, toasts, legend?, children:<Stage/> }` | `.stage-card`, `.stage-bar`, `.legend` |
| `CanvasToolbar` | `{ label, tools: {id,label,short?,icon,pressed?,disabled?,ai?,onClick,popover?}[] }` | panel buttons *Draw polygon*, *+ Quick circle*, *Cancel drawing*, *Revert*, checkbox *Show photo*, *Mark guide points* |
| `ToastRegion` | `{ toasts:{id,text,sticky?}[], onDismiss }` | `flash` alert |
| `PanelShell` | `{ eyebrow, title, lead?, status?, tabs?, children, footer }` | `aside.panel` |
| `Step1Panel` | `{ phase:'prompt'|'proposal'|'ready'|'invalid', … existing handlers }` | Workspace step-1 JSX |
| `OtherWaysMenu` | `{ points, onPoints, onClearPoints, onLocal, onCached?, onTrace, busy }` | `alt-box` and points buttons |
| `PrepareChecklist` / `ChecklistStep` | `{ open, onOpen }` / `{ id, n, title, state:'done'|'todo'|'attention', summary, open, onToggle, children }` | `.sect` sections of step 2 |
| `ScaleStep` | `{ calib, unit, mode, onWidth, onStartRef, onApplyRef, onCancelRef, onExample?, onRemove, err }` | *Scale* section |
| `ZonesStep` + `ZoneList` | `{ defects, sel, outside, onSelect, onDelete, onNone, detected, onAcceptDetected, onDiscardDetected }` | `DefectTools` (both instances), AI-detect section |
| `DetectDefectsPopover` | `{ phrases, onPhrases, onSearch, busy, onClose }` | AI-detect field + button |
| `PiecesStep` | `{ defs, fill, unit, spacing, selectedId, … }` | *Pieces and order* section |
| `FillModeToggle` | `{ fill, onFill }` | *Maximize sets* checkbox + caption |
| `PieceList` / `PieceRow` / `PieceEditor` | row `{ def, letter, unit, expanded, onToggle }`; editor `{ def, unit, fill, onChange, onRemove, onDone }` | `.tpl` cards |
| `RotationChips` | `{ value:number[], onToggle }` | 4 rotation checkboxes |
| `AddPieceMenu` / `PiecesEmpty` | `{ kits, calibratedCm, agentInProgress, full, onKit, onAgent, onBasic, onDraw, onSvg }` | kit select, *Design with AI*, *+ Add*, *Draw*, *Import SVG* |
| `OptimizeFooter` | `{ usableArea, unit, disabledReason?, busy, progress, onOptimize }` | live metrics + *Optimize* + back link |
| `ResultPanel` | `{ result, stale, change, tab, onTab, … }` | step-3 JSX |
| `ResultHero` | `{ result, extraPieces, stale }` | `.score-row`, valid alert |
| `MetricTrio` | `{ items:[{value,unit,label}] }` | first metric rows |
| `HonestyNote` | `{ children }` | captions |
| `DetailsDisclosure` | `{ metrics, unit, calibrated, rows, onJson, seed, ms }` | `dl.metrics`, `table.tbl`, JSON link |
| `ExportMenu` | `{ exportable, physical, withPhoto, paper, dxfRef, onSvg, onPng, onPrint, onSvgCm, onDxf, err }` | `.export`, `.real-export` |
| `ResultMoreMenu` | `{ onRecompute, onEditPieces }` | *Re-optimize* (non-stale), *Edit order* link |
| `StaleNotice`, `ChangeNotice`, `NoSolution`, `VerifyFailed`, `OptimizingStatus` | data only | the alerts in step 3 |
| `LeftoverTab` | `{ leftover, unit, productId, kits, extras, busy, onProduct, onCalc, onDrop, onFragment, onPhoto }` | *Leftover* section |
| `PlacementPopover` | `{ placement, def, unit, anchor }` | selected-placement alert |
| `AgentDialog`, `PieceDialog` | unchanged | — |

CSS: move `.ux-*` from `design/ux/ux.css` into `src/styles.css` (or `src/brand/ux.css`). No library added; menus use absolute positioning + `useRef`/`useEffect` for outside-click and focus.

---

## 7. Traceability — every existing feature and its new home

| # | Feature (today) | New home | Frame |
|---|---|---|---|
| 1 | Step navigation + locking | `StepRail` in header (same `locked` rule; stale → *!*) | all |
| 2 | Image name / *Example image* chip | Canvas top-left tag (before outline) | F1 |
| 3 | Privacy caption (SAM via server, not stored) | One-line caption under Step 1 primary | F1 |
| 4 | Concept phrase field | Step 1 body (only field) | F1 |
| 5 | Segment with SAM / Retry / busy label | Step 1 primary | F1, G5 |
| 6 | Guide points toggle + count + clear | *Other ways* menu; canvas hint in points mode | F1 |
| 7 | Alternatives: cached mask, local contrast, manual trace | *Other ways* menu; buttons in failure alert | F1, G5 |
| 8 | SAM error messages by code | Failure alert body | G5 |
| 9 | Proposal source + info + vertex count + holes notice | Status pill; *Technical details*; hole sentence | F2 |
| 10 | Accept / Reject proposal | Footer primary / ghost *Discard* | F2 |
| 11 | Contour origin (+ human correction) | Canvas tag + *Source* fact | F3 |
| 12 | Edit instructions | Canvas hint | F3 |
| 13 | Invalid contour error + blocked caption | Body alert + disabled primary reason; StepRail lock | §4.1 |
| 14 | Digitised area | *Digitized area* fact | F3 |
| 15 | Revert to last valid | CanvasToolbar | F3 |
| 16 | Continue | Footer primary | F3 |
| 17 | Calibrated summary + cenital caveat + remove | ① Scale (calibrated view) | §4.2 |
| 18 | Relative-units note | ① caption + dashed unit badge everywhere | F4 |
| 19 | Calibrate by width (+Enter) | ① *By width* | F4 |
| 20 | Demo scale (examples) | ① link *Use the example's scale* | F4 |
| 21 | Two-point calibration (distance, unit, apply, cancel) | ① *With a reference* + canvas mode | §4.2 |
| 22 | Calibration flash (sizes converted) | Sticky toast | §4.4 |
| 23 | Zones: count, caption, empty warning | ② summary + hint + empty nudge | F5 |
| 24 | Draw polygon / quick circle / cancel | CanvasToolbar (step 2 ② and step 3 *Mark zone*) | F5, F8 |
| 25 | Zone list select (editing) / delete / outside warning | ② `ZoneList` | F5 |
| 26 | AI defect detection (phrases, detect, busy) | `DetectDefectsPopover` from toolbar | G1 |
| 27 | AI proposals add all / discard / none found | ② review card / toast | F5 |
| 28 | Kit select (+ cm requirement error) | *Use a product* / *Add piece ▾ → Product*; error opens ① | F6, G2 |
| 29 | Design with AI (+ conversation in progress) | Option card / menu item (*in progress*) → `AgentDialog` | F6, G2 |
| 30 | Maximise complete sets + caption | `FillModeToggle` + one-line hint | F7 |
| 31 | Piece colour/letter, name, remove | `PieceRow` swatch + name; editor *Remove piece* | F7 |
| 32 | Shape select (custom only if custom) | `PieceEditor` *Shape* | F7 |
| 33 | Width / height / quantity | `PieceEditor` fields; row shows `w × h ×qty` | F7 |
| 34 | Rotations (min one) | `RotationChips` in editor | F7 |
| 35 | Add piece / draw piece / import SVG (max 6) | *Add piece ▾* / *Custom piece* | F6, F7, G2 |
| 36 | Spacing | *Options · 0.2 cm* button → popover (value in label) | F7 |
| 37 | Live metrics (total / excluded / usable) | Step 2 footer line *Usable area*; excluded area per zone + total line in ②; digitized area in Step 1 facts; all three again in Step 3 *Details* | F3–F7, G3 |
| 38 | Optimize (disabled rules) + empty-order / zero-usable errors | Footer primary + reason line | F4–F7 |
| 39 | Back to contour / edit order links | StepRail; `ResultMoreMenu` *Edit pieces*; empty-state actions | F8, G3, G4 |
| 40 | Optimizing progress | Footer progress + canvas tag | §4.3 |
| 41 | Verification failed + violations | `VerifyFailed` alert | §4.3 |
| 42 | Stale warning | `StaleNotice` + StepRail *!* + canvas + primary flip | F10 |
| 43 | No valid placement | `NoSolution` empty state | G4 |
| 44 | Valid message: sets, partial, all placed, extras, label scheme | `ResultHero` value/label; label scheme in legend | F8b |
| 45 | Score ring % + not-proven-optimum caption + optimizer version | Trio first cell + `HonestyNote` | F8b |
| 46 | Six metrics | `DetailsDisclosure` | G3 |
| 47 | Calibrated vs relative caption | `DetailsDisclosure` + unit in trio (*u²*, ≈) | G3 |
| 48 | Per-piece placed / requested / pending table | `DetailsDisclosure` | G3 |
| 49 | Leftover view / metrics / estimate caption / hide | *Leftover* tab (open = shown) | F9 |
| 50 | Plan on fragment (≤4) | *Leftover* → *Reuse* rows | F9 |
| 51 | Try other product (+cm rule) / calculate / extras + remove | *Leftover* select + footer primary + extras list | F9 |
| 52 | Upload leftover photo (+confirm) | *Leftover* → *Upload a photo of the real leftover* | F9 |
| 53 | Selected placement info | `PlacementPopover` on canvas | §4.3 |
| 54 | What changed since previous run | `ChangeNotice` at top of *Plan* | G6 |
| 55 | Defect tools in step 3 | Toolbar *Mark zone* | F8 |
| 56 | Reoptimize / Optimize in step 3 | Stale: footer primary. Not stale: `⋯` *Recompute* | F10, G3 |
| 57 | Include photo + export SVG / PNG | `ExportMenu` › Image | F8 |
| 58 | Paper + print 1:1 (+ popup-blocked error) | `ExportMenu` › Real scale 1:1 | F8 |
| 59 | SVG in cm, DXF (mm), DXF reference toggle | `ExportMenu` › Real scale 1:1 | F8 |
| 60 | DXF / print captions, calibrate-to-export-1:1 caption | Item hints + disabled-group reason | F8 |
| 61 | Not-exportable reasons | Disabled *Export* + reason line | F10 |
| 62 | JSON problem + solution (seed, ms) | `DetailsDisclosure` link | G3 |
| 63 | Reference-plan warning | `ExportMenu` note (always visible in the menu) | F8 |
| 64 | Save project | `ProjectMenu` (+ Ctrl/Cmd+S) | F3 |
| 65 | New project (+confirm) | `ProjectMenu` | F3 |
| 66 | Theme toggle | `ProjectMenu` (Home keeps the icon toggle) | F3 |
| 67 | Piece legend + zone swatch (step 3) | Canvas legend strip (desktop) / *Legend* chip (mobile) | described |
| 68 | Restored-project notice | Toast | §4.4 |
| 69 | `beforeunload` guard | unchanged | — |
| 70 | AgentDialog / PieceDialog | unchanged dialogs, new entry points | F6, G2 |

Row 37 clarification: Step 2 footer shows *Usable area*; total and excluded are in ② (each zone's area + *Excluded 16.4 cm²* line at the bottom of the zone list) and in Step 3 *Details*. No figure disappears.

---

## 8. Removed or merged (and why)

| Removed / merged | Why |
|---|---|
| Header filled **New project** button (in workspace) | Competed with the panel primary on every screen; destructive action deserves a menu + confirm, not top-right prominence. → `ProjectMenu`. |
| Second `DefectTools` in Step 3 | Duplicate. Zone tools live once, on the canvas toolbar. |
| *← Back to the outline*, *← Edit order and constraints* links | Duplicate the StepRail. Contextual "go fix it" links survive where they help (empty state, `⋯` menu). |
| *Show leftover* / *Hide leftover* buttons | Merged into the *Leftover* tab: opening the tab is viewing it. |
| Valid-plan alert + score ring + headline (three statements of one fact) | Merged into `ResultHero`. |
| Flash alert at top of panel | Became toasts; the panel title is always the first thing. |
| 4 rotation checkboxes per piece (16–24 checkboxes) | Chips in the single open editor. |
| Kit `<select>` as a separate control | Merged into *Add piece* / *Use a product*. |
| Three captions under 1:1 export + reference caption + not-exportable caption | One hint per menu item + one note; reasons attached to disabled controls. |
| *Show photo* checkbox | Toolbar toggle *Photo*. |
| Step 2 live-metrics block (3 rows) | One footer line; the rest is where it is caused (zones) or reported (Details). |
| Panel paragraph *"Drag the vertices…"* | Canvas hint, where the action is. |
| *Re-optimize* as a big button when nothing changed | Deterministic engine: same input + seed = same plan. Demoted to `⋯ Recompute`; promoted to primary only when stale. |

Nothing functional is deleted (see §7).

---

## 9. Target metrics — before / after

Measured in the prototype with Playwright (panel + canvas toolbar, header excluded, default state of each screen; 1280 px). Panel content area at 1280×800 is ~700 px.

| Screen | Before: buttons / fields / checkboxes / words / height | After: buttons / fields / checkboxes / words | Fits without scroll? |
|---|---|---|---|
| Step 1 · prompt (F1) | – | 2 / 1 / 0 / 46 | yes |
| Step 1 · proposal (F2) | – | 2 / 0 / 0 / 35 (+1 disclosure) | yes |
| Step 1 · accepted (F3) | 7 / 1 / 0 / ~100 | **3 / 0 / 0 / 33** (+1 disclosure) | yes |
| Step 2 · Scale open (F4) | 19 / 23 / 17 / 309 / 2,328 px (whole step) | **8 / 1 / 0 / 52** | yes |
| Step 2 · Zones open (F5) | (same) | **10 / 0 / 0 / 57** | yes |
| Step 2 · Pieces empty (F6) | (same) | **7 / 0 / 0 / 50** | yes |
| Step 2 · Pieces list (F7, editor closed) | (same) | **12 / 0 / 0 / 59** | yes |
| Step 2 · Pieces, one piece in edit (F7) | (same) | 18 / 5 / 0 / 83 | scrolls to the editor |
| Step 3 · Plan (F8b) | 17 / 2 / 2 / 337 / 1,963 px | **6 / 0 / 0 / 33** (+1 disclosure) | yes |
| Step 3 · Leftover (F9) | (inside the above) | 8 / 1 / 0 / 80 (incl. select option text) | yes |
| Step 3 · stale (F10) | – | 6 / 0 / 0 / 40 | yes |

Counts include the step's checklist/tab headers and canvas-toolbar tools. The 12 controls of F7 are: 3 checklist headers, 2 segment buttons, 4 piece rows, *Add piece*, *Options*, plus the footer primary. Mobile (390 px) counts are identical; Step 2 sheet heights are 611–651 px (was 2,938 px).

Targets for the implementation (acceptance criteria):
- Default panel states: **≤ 12 interactive controls, ≤ 1 text field, 0 checkboxes, ≤ 80 words**, and the primary visible without scrolling at 1280×800.
- Exactly **one** `.cs-btn--primary` per screen (checked with `document.querySelectorAll('.cs-btn--primary:not([hidden])').length === 1` in an e2e test).
- Step 2 at 390 px: sheet height in default state ≤ 720 px (was 2,938 px).

---

## 10. Interaction rules

**Focus.**
- Step change: focus moves to the panel title (`tabIndex=-1`), live region announces *"Step 2 of 3: Prepare"*.
- Checklist: header buttons toggle `aria-expanded`; focus stays on the header; the body is a `region` labelled by it. Arrow Up/Down move between headers.
- Piece row: Enter/Space opens the editor; focus stays on the row, Tab enters the editor; *Done* or Esc closes and returns focus to the row. Opening another row closes the current editor (values are committed on blur, as `NumField` does today).
- Menus (`Other ways`, `Add piece`, `Export`, `⋯`, `Project`): open focuses the first enabled item; ↑/↓/Home/End move; Enter activates; Esc or outside click closes and returns focus to the trigger; Tab closes. Switch items toggle with Space and keep the menu open; action items close it.
- `DetectDefectsPopover` is a non-modal dialog: focus to the field; Esc closes; on successful search it closes and focus goes to the review card.
- Canvas toolbar: `role="toolbar"`, roving tabindex with ←/→. Drawing modes: Esc cancels (as today), toolbar shows *Cancel drawing*.
- Stale/what-changed/verify messages never steal focus; they announce politely.

**What opens what.** Toolbar *Detect with AI* → popover. *Use a product* → kit list menu. *Design with AI* → `AgentDialog` (modal, existing). *Draw shape… / Import SVG…* → `PieceDialog` (modal, existing). *Export* → `ExportMenu`. *Project ⋯* → `ProjectMenu`. *New project…* → existing `confirm`. *Upload a photo of the leftover* → file picker → existing `confirm`. *Review pieces* (no solution) → Step 2 with ③ open; *See zones* → Step 2 with ② open.

**Persistence of advanced settings.**
- Spacing, rotations, fill mode, quantities: project state (already saved in the `.json`).
- Export preferences (`withPhoto`, `paper`, `dxfRef`): `localStorage['cs-export-prefs']`, read/written in try/catch, defaults `true / 'A4' / false`.
- Open checklist item, open disclosures, selected piece, result tab: UI state, reset on step change and on a new result. Exception: *Details* remembers open/closed within the session (`sessionStorage`, try/catch).
- Disclosures auto-open when they contain an error (e.g. invalid spacing).

---

## 11. Accessibility and honesty (must hold)

- WCAG AA: all new pairs use existing tokens (contrast table in `DESIGN.md §3`). Canvas tags use the provenance solids (≥ 5.9:1 with white; stale tag uses ink on amber).
- No colour-only meaning: checklist marks use glyphs (✓ / ! / number) + shape; unit badges solid vs dashed + "≈"; pieces colour + pattern + letter; pressed chips add a check glyph; switches show *YES / NO* text; disabled actions show a reason line.
- Keyboard: every control reachable; canvas handles keep their `role="button"` + arrow nudging from `Stage.tsx`.
- Provenance language unchanged and visible at the point of claim: *AI proposal*, *AI + corrected by you*, *Computed · seed*, *Verified* seal, *Out of date*, *Failed*.
- Honesty copy that stays visible without clicks: *Not a proven optimum* (Plan), *Not calibrated · relative units* (badge on every measurement context), *Reference plans* (Export menu), *Digital estimate* (Leftover), *Your photo… is not stored* (Step 1), AI applies nothing until approved (popover hint, AI review card, AgentDialog).

---

## 12. Implementation plan (each phase leaves the app working)

1. **Extract, don't change (no visual change).** Split `Workspace.tsx` into `Step1Panel`, `PreparePanel`, `ResultPanel`, `DefectTools`, `ExportBlock`, `LeftoverSection` with props = current values/handlers. Snapshot-compare the before/ screenshots. *Exit:* identical UI, Workspace < 350 lines.
2. **Primitives.** Add `Menu`, `Disclosure`, `PanelShell`, `ToastRegion`, `CanvasToolbar`, `CanvasPane` and the `.ux-*` CSS. Swap `flash` for `ToastRegion` and add `errAt`. *Exit:* toasts work; errors appear next to their action.
3. **Header + StepRail + ProjectMenu.** Move save/new/theme into `ProjectMenu`; hide the App header *New project* while a project is open (App passes `inWorkspace`). Remove the panel-bottom links. *Exit:* one primary per screen in Step 1.
4. **Canvas toolbar.** Move revert, guide points, zone tools, *Show photo* to the toolbar; delete the second `DefectTools`. *Exit:* no zone tool remains in any panel.
5. **Step 1 states.** `prompt / proposal / ready / invalid / failure` with *Other ways* and *Technical details*.
6. **Step 2 checklist.** `PrepareChecklist` + `ScaleStep` + `ZonesStep` (+ `DetectDefectsPopover`) + `OptimizeFooter`. Pieces still rendered with the old cards inside ③ for one release if needed.
7. **Pieces.** `PieceList`/`PieceEditor`/`RotationChips`/`FillModeToggle`/`AddPieceMenu`/`PiecesEmpty`/*Options*. Remove the kit `<select>` and the three add buttons.
8. **Step 3.** `ResultHero` + `MetricTrio` + `HonestyNote` + `DetailsDisclosure` + `ExportMenu` (+ prefs persistence) + `ResultMoreMenu` + state components (stale/verify/no-solution/change/optimizing) + `PlacementPopover`.
9. **Leftover tab.** `LeftoverTab`; compute leftover on tab open.
10. **Mobile sheet.** Sticky canvas, sheet, sticky footer, menus-as-sheets, *Enlarge* canvas mode. Test at 390×844 and 768×1024.
11. **Verification.** Re-run the measurement script (controls/fields/words per screen) against the app and the e2e assertions in §9; axe-core pass; keyboard walk-through of the three steps.

## 13. Behaviours that must not regress

1. Nothing AI-proposed is applied without explicit acceptance (contour, holes→zones, detected zones, agent pieces).
2. Kits, agent approval and other-product require a **cm** calibration; the user is told why and where to fix it.
3. Applying or removing calibration converts piece sizes and spacing so their size in the photo is preserved.
4. Optimise is blocked for invalid contour, empty order, or zero usable area — with the reason shown.
5. A plan is exportable only when verified, not stale and non-empty; 1:1/DXF additionally require physical calibration.
6. Any change to contour, zones, calibration, order, spacing, fill mode makes the result stale (problemKey), greys the canvas and disables export.
7. *What changed* appears only when the problem changed between runs, and never reports a "% improvement".
8. Verification failure shows violations and never shows a score or seal.
9. No-solution never shows 0 % as a score.
10. maxKits semantics: quantities are per set; labels carry the set number; n = 0 shows the best partial set with an explicit message.
11. Leftover planning on a fragment converts its holes to zones and returns to Step 2; other-product keeps the previous plan fixed and is removable; leftover photo starts a new project keeping defs + spacing after `confirm`.
12. Contour provenance text (*SAM 3.1 live* vs *saved mask* vs *local contrast — not Meta AI* vs *manual* vs *leftover*) is never conflated.
13. SAM not configured is stated as *the inference did not run*, never as a model failure.
14. Saved projects re-verify on load; restored notice shown; `beforeunload` guard while a contour exists.
15. Max 6 piece types; at least one rotation per piece; quantities ≥ 0 integers; sizes > 0.
16. Determinism: same input + seed → same plan; seed and optimizer version remain visible (honesty line, JSON).
17. Print opens a new window and reports popup blocking.
18. AgentDialog conversation persists while closed (including when blocked by calibration).

## 14. Described but not mocked

- Optimising (progress in footer), verification-failed alert, partial result and n = 0 hero variants, invalid-outline Step 1, two-point calibration mode, calibrated *Scale* view, zone drawing mode, *Mark zone* expanded toolbar in Step 3, `PlacementPopover`, canvas legend strip / *Legend* chip, mobile *Enlarge* full-screen canvas, kit list submenu (shown as the top group of G2), disabled 1:1 group in the export menu, the uncalibrated Step 3 variant (u², ≈).
- Motion follows `DESIGN.md §8` (snap, settle + seal, what changed); sheets/menus use `--cs-dur-fast` fade/slide and respect reduced motion.

## 15. Implementation notes (deviations from this spec)

Implemented in `src/components/workspace/` + `src/ux.css`. Screenshots of the live app: `design/ux/after/<frame>-<1280|390>-<light|dark>.png` (`dev-*.png` are extra states captured during the walkthrough).

**Structure**
- `Workspace.tsx` is layout + wiring only (~85 lines). All state and handlers moved, mostly verbatim, into the `useWorkspace` hook (the "controller" of §6). SAM network/mask code moved to `src/lib/sam.ts`; the pure presentation rules (checklist summaries, default open item, optimise-blocked reason, export enablement, hero text, stale sentence, export prefs parsing) live in `src/lib/workspaceUi.ts` with unit tests.
- Components are grouped by screen instead of one file each: `Header.tsx` (StepRail, ProjectMenu), `Menu.tsx` (Popover/Menu, MenuItem, MenuSwitch…), `primitives.tsx` (Disclosure, CanvasToolbar, PanelShell, Reason, UnitBadge, Alert), `Toasts.tsx`, `CanvasPane.tsx` (tags, hints, toolbar, legend, PlacementPopover, DetectDefectsPopover), `Step1Panel.tsx` (+ OtherWaysMenu), `PreparePanel.tsx` (ChecklistStep, ScaleStep, ZonesStep), `PiecesStep.tsx` (FillModeToggle, PieceList/Editor, RotationChips, AddPieceMenu, PiecesEmpty, Options), `ResultPanel.tsx` (ResultHero, MetricTrio, DetailsDisclosure, ExportMenu, ResultMoreMenu, LeftoverTab, state alerts).
- The StepRail and the *Project* menu are rendered by the workspace into a slot of App's header (React portal), so App does not need the workspace state. App's *New project* button and theme toggle are gone while a project is open (Home keeps its toggle).
- CSS: `design/components.css` is copied to `src/brand/components.css`; the app-relevant part of `ux.css` is in `src/ux.css` (prototype chrome removed). The old `.btn` classes remain for Home and the two dialogs.
- Phases 1–11 were implemented as one pass to the final state; intermediate phases were not shipped or verified one by one.

**Behaviour choices**
- Menus/popovers are `position: fixed` in a portal (anchored by measuring the trigger), so menus opened from inside the scrolling panel body are never clipped. Below 1000 px they are bottom sheets with a scrim. Tab closes a menu and returns focus to its trigger.
- *Print* keeps the export menu open, so a blocked popup is reported inside the menu; the error is also shown under the footer.
- Sticky toasts are cleared when an optimisation starts (the preparation messages would otherwise cover the new plan). Otherwise toasts follow §4.4.
- ② *Zones* is "attention" (!) while there are no zones and the user has not pressed *No defects* — there is no numbered "todo" state for it, as in the table of §4.2.
- Zone origin captions (*from the mask hole*, *drawn*, *circle*, *proposed by AI*, *leftover hole*) are UI state only; they are not saved in the project file, so reopened projects show none.
- Choosing a product while uncalibrated opens ① with the warning and marks ① with "!" until a cm calibration exists (replaces the old inline error).
- While optimising, the Plan body shows only a status line (the previous hero is hidden) and the tabs are disabled.
- *Detect again* returns to F1 and adds a *Keep the current outline* link to go back without re-detecting.
- *Enlarge* (mobile) is a simple taller canvas (78 vh) in Step 1 editing and two-point calibration, not a full-screen mode with a collapsed sheet.
- Mobile: the sticky canvas sits above the sheet (the sheet scrolls under it) and the 16 px overlap was removed, so the canvas really stays visible while editing.
- Legend: a strip at the top right of the canvas on desktop (the label scheme is its tooltip and screen-reader text), a *Legend* disclosure chip on mobile.
- The width and distance fields also accept a decimal comma.
- Numbers use the shared `fmt` helper with English formatting (`1,045.9`), the same in the panel and in exports.

**Measured (1280×800, light, inside `.ux-panel`; buttons / fields / checkboxes / words)**

| Screen | Before | After |
|---|---|---|
| Step 1 · prompt (F1) | – | 2 / 1 / 0 / 46 |
| Step 1 · proposal (F2) | – | 2 / 0 / 0 / 27 |
| Step 1 · accepted (F3) | 7 / 1 / 0 / ~100 | 1 / 0 / 0 / 33 (+2 canvas tools, 1 disclosure) |
| Step 2 · Scale open, uncalibrated (F4) | 19 / 23 / 17 / 309 (whole step) | 8 / 1 / 0 / 68 |
| Step 2 · Zones + AI proposals (F5) | (same) | 7 / 0 / 0 / 78 (+3 canvas tools) |
| Step 2 · Pieces empty (F6) | (same) | 7 / 0 / 0 / 54 |
| Step 2 · Pieces list, editor closed (F7) | (same) | 12 / 0 / 0 / 63 |
| Step 2 · one piece in edit | (same) | 18 / 5 / 0 / 89 |
| Step 3 · Plan (F8b) | 17 / 2 / 2 / 337 | 4 / 0 / 0 / 33 (+2 canvas tools, 1 disclosure) |
| Step 3 · Leftover (F9) | (inside the above) | 5 / 1 / 0 / 85 (word count includes the select's option labels) |
| Step 3 · stale (F10) | – | 4 / 0 / 0 / 40 |

Exactly one `.cs-btn--primary` was present in every measured state. Step 2 at 390 px: sheet (head + body + footer) 513 px in the default state (was 2,938 px).
