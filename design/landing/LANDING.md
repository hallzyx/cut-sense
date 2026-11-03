# CutSense landing: "The life of an offcut"

Files in this folder:

| File | What it is |
|---|---|
| `LANDING.md` | This spec: concept, sections, final copy, classes, motion, accessibility, screenshot crops |
| `landing.css` | New `.lp-*` classes only, built on `--cs-*` tokens (light + dark) |
| `landing.html` | Static mockup (`?theme=dark|light`, `?error=1` shows the alert slot, `?static=1` disables the loop animation). Captures of the live page are `../screenshots/hero-*.png` |

The mockup imports `../tokens.css`, `../components.css` and `landing.css`. Screenshot slots use the old UX prototype frames as stand-ins (the dark ones are still in Spanish); replace them with the crops listed in section 6.

---

## 1. Concept

**The page follows one offcut through its lives.** The hero shows its first plan being verified (pieces settle, the seal stamps in). *How it works* is one pass at the bench. Then the page reaches the **cutting mat**: a full-bleed band of mat green (dark in both themes) where the same offcut has a first, second and third life, each drawn smaller at the same scale. Trust, Hilo, exports and examples follow as the tools that make that loop safe and practical.

Three devices carry the idea, all from the existing brand:

1. **Provenance as structure.** Every step and every card is labelled with who did the work: chalk pill = AI proposes, thread pill = you, graphite pill = the engine computes, green pill and seal = verified. The step dots on the cut line take the same colour.
2. **The bench ticket** (`.lp-ticket`, new). A punched paper tag with a V-notch, a hang hole and a saddle stitch, in mono type. It labels the hero plan ("Example plan · 10 of 10 pieces placed · cs-nest-1.1 · seed 4127") and each generation of the loop ("1st life · Bifold wallet × 1"). It is the landing's recurring, ownable label.
3. **The cutting mat band** (`.lp-mat`, new). The only section that changes surface. "Pattern paper by day, cutting mat by night" becomes "the leftover lives on the mat."

Signature moments: (a) hero plan with the verified seal stamping in; (b) the leftover loop playing once as it scrolls into view: gen 1 pieces settle, the largest free fragment is traced in green, then gen 2, then gen 3.

---

## 2. Page structure

| # | Section | id | Surface |
|---|---|---|---|
| – | Top bar (sticky) | – | `--cs-bg` 90 % + blur |
| 1 | Hero | `#top` | `.cs-grid-paper` |
| 2 | 01 How it works | `#how` | plain bg |
| 3 | 02 The leftover loop (signature) | `#leftover` | `.lp-mat .cs-grid-paper` (cutting mat) |
| 4 | 03 Why you can trust the plan | `#trust` | plain bg |
| 5 | 04 Hilo + 3D assembly preview | `#hilo` | `.cs-grid-paper` |
| 6 | 05 Exports | `#exports` | plain bg |
| 7 | 06 Examples | `#examples` | `.cs-grid-paper` |
| 8 | 07 Good to know | `#faq` | plain bg |
| 9 | Footer | – | plain bg |

Grid-paper and plain sections alternate so the rhythm is visible without extra dividers. Section padding: 64 px (mobile), 96 px (≥ 1000 px). Container: `.cs-container` (1200 px, gutter 16/24). Section header: `.lp-head` = `.cs-eyebrow` with `.lp-num` index + `.cs-h2` + `.cs-lead`.

Breakpoints: single column below 1000 px (720 px switches 3-card rows and the examples to multi-column, 640 px switches export tiles to 2 columns); two-column layouts from 1000 px.

---

## 3. Section spec and final copy

All copy below is final. Numbers in copy use `.cs-measure` (mono, tabular, no wrap).

### 0 · Top bar
- **Layout.** 390: wordmark (28 px) left, theme toggle right. 1280: wordmark, nav anchors, `Upload a photo` (secondary, sm), theme toggle.
- **Nav (aria-label "On this page"):** How it works · Leftover · Trust · Hilo · Exports · Good to know.
- **Theme toggle:** `.cs-btn--ghost .lp-theme`, `aria-label="Dark theme"`, `aria-pressed` reflects dark. Sun / moon icon.
- Skip link first in the tab order: **Skip to content** (`.lp-skip`, visible on focus).

### 1 · Hero
- **Layout.** 390: copy, CTAs stacked full width (`.cs-btn-row--stack`), caption, link, alert slot, provenance pills, ruler; then the plan visual. 1280: two columns `1.02fr / .98fr`, visual right.
- Eyebrow: **Sense of the cut**
- H1 (`.cs-display`): **Make sense of every** *offcut* **.** (*offcut* in `.cs-chalk-underline`)
- Lead (`.cs-lead`): **Photograph a scrap of leather, felt, foam or cardboard. AI proposes the outline, you correct it, and an independent geometric check verifies every cutting plan before you see it. Then what is left becomes your next piece of material.**
- Primary (`.cs-btn--primary.cs-btn--lg`, camera icon): **Upload a photo of your offcut** → opens the hidden file input (`accept="image/jpeg,image/png,image/webp"`, aria-label *Upload a JPG, PNG or WebP photo of your offcut*).
- Secondary (`.cs-btn--secondary.cs-btn--lg`): **Try an example** → `onExample('cuero')` (Leather scrap: it is calibrated and has the bifold wallet kit, so it reaches a verified plan in the fewest steps).
- Caption (`.cs-caption`): **JPG, PNG or WebP · up to 10 MB · flat material, contrasting background, even light, overhead camera**
- Link (`.cs-link`): **Open a saved project (.json)** → hidden input `accept="application/json,.json"`, aria-label *Open a saved CutSense project (.json)*.
- **Error slot** (`.lp-hero__alert`, `role="alert"`, empty = hidden): `.cs-alert--danger` with title **We could not open that file** and the app's `error` string as body. Mock body: *That image is larger than 10 MB. Try a smaller JPG, PNG or WebP; your phone's "medium" size is plenty.*
- Provenance pills (`ul.lp-prov`, aria-label *Who does what*): **AI proposes** (ai) · **You correct** (human) · **The engine computes** (computed) · **Geometry verifies** (verified). Then `.lp-ruler`.
- **Visual** (`figure.lp-hero__visual`): `.cs-stage` with the inline SVG plan (dark leather on a table, 10 patterned pieces, a defect with barrier-tape hatch, verified tri-stroke outline), rotated 1.2°, `--cs-shadow-3`; tag **Verified**; `.cs-seal.cs-seal--animate.lp-hero__seal` overlapping the top-right corner; `figcaption.lp-ticket.lp-hero__ticket` overlapping the bottom-left: **Example plan / 10 of 10 pieces placed / cs-nest-1.1 · seed 4127**.
- SVG `<title>`: *Example of a verified plan: ten patterned pieces placed on a dark leather offcut, clear of a marked defect, inside a green verified outline.*

### 2 · 01 How it works
- H2: **From a photo to a plan you can trust.**
- Lead: **Five steps at the bench. Each one tells you who did the work: the AI proposes, you correct, the engine computes, geometry verifies, and you decide.**
- **Layout.** `ol.lp-steps`, a vertical dashed cut line joining square step dots (`.lp-step__dot`, border = provenance colour; step 4 filled green and turned −4° like the app's current step). 390: dot + pill + title + body, screenshot below full width. 1280: `5fr / 7fr`, text left, screenshot right, dot centred on the row.
- Screenshots: `figure.lp-shot` > `.lp-shot__frame` (4:3, `object-fit: cover`, `--lp-pos` to bias the crop) + `figcaption.cs-caption`. Step 4 also carries a 76 px seal on its corner.

| # | Pill | Title | Body | Caption |
|---|---|---|---|---|
| 1 | `ai` **AI proposal · SAM 3.1** | **Photograph it. AI traces the edge.** | Lay the offcut flat on a contrasting background and shoot from above. SAM 3.1 proposes the edge as a dashed line, and holes as zones to avoid. Accept it, move any point, or trace it by hand. No AI available? Outline by contrast instead. | The outline is a proposal until you accept it. |
| 2 | `human` **Corrected by you** | **Mark the flaws. Set the scale.** | Mark scars, stains and holes so no piece lands on them, or ask SAM to look for them and keep only what is right. Then calibrate with a length you know, such as a bank card (8.56 cm), to work in real centimetres. | Excluded zones carry a barrier-tape hatch, unlike any piece. |
| 3 | `computed` **Your order** | **Choose what to make.** | Pick a kit (leather cardholder, bifold wallet), single pieces (keychains, coasters, bookmarks), shapes you draw or import, or pieces designed with Hilo. In **Complete sets** mode, CutSense looks for as many complete sets as fit. Partial sets never count. | Every piece type has a colour, a pattern and a letter. |
| 4 | `verified` **Verified** | **Get a plan that has been checked.** | A deterministic engine places the pieces. Then a separate verifier checks the whole plan: no overlaps, nothing outside the material, nothing on a defect, the spacing you asked for. Only a plan that passes is shown. | Every number on this screen is measured from the final shapes. |
| 5 | `human` **You decide** | **Export it and cut.** | Save the plan as SVG or PNG, print it at 1:1 across A4 or Letter sheets, or export SVG in centimetres and DXF for a cutter. Then plan the next product on what is left. | Exports are made in your browser from the verified plan. |

Alt text (final, use with the new crops):
1. *CutSense, step 1: a leather offcut with a dashed blue outline proposed by AI, and the panel asking "Is this the edge of your material?"*
2. *CutSense, step 2: the offcut with hatched excluded zones over its flaws and a calibration line measuring 8.56 cm.*
3. *CutSense, step 2 pieces list: a leather cardholder kit with body, front pocket, card pockets and flap, each with its size in centimetres.*
4. *CutSense, step 3: a verified plan with three complete cardholder sets on the offcut, a green verified seal and the seed of the run.*
5. *CutSense export menu: SVG, PNG, print at real scale, SVG in centimetres and DXF for machines.*

### 3 · 02 The leftover loop (signature)
- Surface: `section.lp-sec.lp-mat.cs-grid-paper`. `.lp-mat` re-points the semantic tokens to the dark set locally (text paper, muted mat-100, AI/human/computed/verified dark pills, focus chalk-300), so every component inside works unchanged. Background `--lp-mat-bg`: mat-600 in light theme, mat-800 in dark theme.
- H2: **What is left is your next piece of material.**
- Lead: **A plan is not the end of an offcut. Plan another product on what is left, or photograph the real remnant after cutting, and start again. A second life for every offcut, and sometimes a third.**
- **Illustration** (`ol.lp-loop`, three `li.lp-gen` + two `li.lp-hop`, inline SVG `.lp-art`). Drawn in centimetres at one shared scale, so each generation is visibly smaller:
  - Gen 1: a 54 × 36 cm offcut with the 7 bifold-wallet pieces at real kit sizes (Outer 18.5 × 9.5, Bill pocket 17 × 8, 4 × Card pocket 8.5 × 5.5, Coin pocket 8 × 7) and one defect; leftover hatched green; the largest free fragment outlined in thick verified green. Ticket: **1st life / Bifold wallet × 1 / 7 pieces · leather offcut**.
  - Hop: **largest free fragment becomes the material**
  - Gen 2: that fragment, turned 90°, with 4 coasters (9 cm); its end fragment outlined. Ticket: **2nd life / Coasters × 4 / quantity you chose · 9 cm**.
  - Hop: **and again**
  - Gen 3: the end fragment with 4 keychains (7 × 3 cm). Ticket: **3rd life / Keychains × 4 / 7 × 3 cm each**.
  - Each panel has a 10 cm scale bar. Geometry was generated and checked (inside the material with 0.3 cm spacing, no overlaps, clear of the defect).
  - Caption: **Illustration, not a computed plan. All three stages are drawn at the same scale; green hatching is the leftover.**
  - Screen-reader description (`.lp-sr`, referenced by `aria-describedby`): *Illustration in three stages. First life: a leather offcut with the seven pieces of a bifold wallet; the largest free area on the right is outlined in green. Second life: that area, turned on its side, becomes the material for four coasters; the free area at one end is outlined. Third life: that last area becomes the material for four keychains. All three are drawn at the same scale, so each generation is visibly smaller.*
- **Layout.** 390: stacked; panel widths 100 % / 68 % / 44 % (`--w`) keep the shared scale; vertical dashed arrows between. 1280: one row `57.5fr auto 39fr auto 25.5fr`, bottoms aligned like objects on a table, horizontal arrows.
- **Three cards** (`.lp-ways`, 3 columns ≥ 720 px):
  - `.cs-card--stitched`, pill `computed` **Leftover-aware** / **It keeps the leftover in one piece.** / *When two layouts place the same pieces just as well, CutSense picks the one that leaves the largest single free fragment. Less confetti, more material.*
  - pill `human` **You choose how many** / **Make another product on what is left.** / *Pick a kit or a single piece and the quantity you want. It is planned around the pieces already placed, and the combined plan is verified again as a whole.*
  - pill `ai` **New photo** / **Photograph the real remnant.** / *After cutting, take a photo of what is really left. A new project starts from it and keeps your pieces, so the next plan follows the real edge.*

### 4 · 03 Why you can trust the plan
- **Layout.** 390: header, 120 px seal, checks card, then three fact cards stacked. 1280: `5fr / 7fr` (header + seal left, checks right), fact cards in a row of 3 below.
- H2: **AI helps you start. Geometry has the last word.**
- Lead: **AI proposes, deterministic code places and verifies, and you decide. Before a plan reaches your screen, a second, independent check measures it again.**
- Checks card (`.cs-card--stitched.cs-card--notched`), title **The verifier checks every plan for**, `ul.lp-checks` rows with a 64 × 48 glyph (`.lp-glyph__*`):
  - **No overlaps** · *No two pieces share any material.*
  - **Nothing outside the material** · *Every piece sits fully inside the outline you approved.*
  - **Nothing on a defect** · *No piece touches a zone you marked as excluded.*
  - **The spacing you asked for** · *Measured edge to edge, between pieces and to the edge of the material.*
- Fact cards (`.lp-facts`):
  - **Numbers from the geometry** · *Occupied area, usable area, pieces placed and what did not fit are recomputed from the final shapes, not copied from the search.*
  - **Reproducible** · *Every plan carries its seed and optimizer version (cs-nest-1.1). Download the problem and solution as JSON: the same input and seed give the same plan.*
  - **Honest about limits** · *The search is fast and bounded. Its plan is checked, not proven to be the optimum, and the screen says so. Change anything afterwards and the plan is marked out of date.*

### 5 · 04 Hilo + 3D assembly preview
- **Layout.** 390: header, chat mock, note, then the render. 1280: `6fr / 6fr`, render column offset 64 px down.
- Eyebrow: **Hilo, the AI pattern maker** · H2: **Not sure what to cut? Ask Hilo.**
- Lead: **Describe what you want to make, in words or with a sketch. Hilo asks one question at a time and proposes flat pieces with sizes in centimetres. Nothing is applied until you approve it, and then the pieces are placed and verified like any kit.**
- Chat mock (`.lp-chat`, `role="group"`, aria-label *Example conversation with Hilo*; its buttons are `tabindex="-1"` because they are illustrative):
  - You: *I want a small bifold wallet for cards and a few notes.*
  - Hilo: *A bifold wallet, then. How many card slots do you need?* · quick replies (`.cs-chip`): **2 slots**, **4 slots** (on), **6 slots**
  - Proposal card: pill **AI proposal · Hilo**, caption *7 pieces per set*, rows with `.cs-swatch--a…d`: Outer `18.5 × 9.5 cm ×1` · Bill pocket `17 × 8 cm ×1` · Card pocket `8.5 × 5.5 cm ×4` · Coin pocket `8 × 7 cm ×1` (the real bifold wallet kit sizes); buttons **Approve pieces** (primary sm) and **Make it bigger** (ghost sm).
- Note (`.cs-caption`): **Approving needs a photo calibrated in cm. Your messages and sketches are sent to the AI model through our server, which keeps nothing.**
- Render (`figure.lp-render`): `.lp-quad` crops one quadrant of a 2 × 2 render sheet with `--qx/--qy` (no new raster). Main = top-right quadrant of `docs/3d-preview/billetera.webp` (assembled, open), tag **Approximate assembled view**; inset = top-left quadrant (flat pieces), rotated −2°, overlapping the lower-left corner. Dark theme uses `billetera-dark.webp` (`.lp-img-light/.lp-img-dark`; the hidden lazy image is never fetched).
  - Alt: *3D preview of the bifold wallet, opened, built from the proposed piece sizes.* / *The same seven pieces laid out flat.*
  - Caption: **Each proposal comes with a 3D assembly preview, checked before it is shown. It is an approximate view (uniform thickness, ideal folds) to see how the pieces go together, not a photo of the finished piece.**

### 6 · 05 Exports
- **Layout.** 390: header, tiling illustration card, tiles (1 column; 2 from 640 px), notes. 1280: `5fr / 7fr`, illustration left, 2 × 3 tiles right.
- H2: **Ready for the bench, or the machine.**
- Lead: **Print the pieces at real size on the paper you already have, or send a DXF to a cutter. Every file is made in your browser from the verified plan.**
- Tiling illustration (inline SVG, `.lp-tile__*`): a cover page (PRINT AT 100 %, 5 × 5 cm square, 10 cm ruler) and the plan tiled over 2 × 2 sheets with shaded 1 cm overlaps, corner marks and sheet labels 1·1…2·2. `<title>`: *Illustration of a 1:1 print: a cover page with a 5 by 5 cm check square and a 10 cm ruler, then the plan tiled across four sheets that overlap by 1 cm.* Caption: **1:1 print: a cover page with a 5 × 5 cm check square, the plan tiled across sheets with 1 cm overlap and corner marks, and a template for each piece.**
- Tiles (`ul.lp-files > li.lp-file`: `.cs-badge--ink` + name + caption; `.cs-unit--calibrated` "cm" marks the ones that need calibration):
  - **SVG** · Plan image · *With or without the photo. Legend, seed and optimizer version included.*
  - **PNG** · To share · *The same plan, rendered at twice the resolution.*
  - **Print** · At 1:1 `cm` · *Across A4 or Letter sheets, with a scale check you can measure.*
  - **SVG cm** · Real scale `cm` · *One unit is one centimetre, so it opens at 1:1 in a vector editor.*
  - **DXF** · For machines `cm` · *R12, millimetres, pieces on the CUT layer. Outline and zones as optional reference layers.*
  - **JSON** (plain badge) · Project and problem · *Save the project to reopen it later, or download the exact problem and solution.*
- Note: **Marked `cm` exports need a photo calibrated in cm or mm.**
- `.cs-alert--warn`: **Reference drawings.** *Check one measurement before cutting. Accuracy depends on the calibration and a photo taken from straight above; your machine decides kerf, speed and power.*

### 7 · 06 Examples
- **Layout.** 390: two cards stacked (art 4:3 on top). 720–999: two columns. ≥ 1000: two columns, each card horizontal (art `11fr`, body `10fr`).
- H2: **No offcut at hand? Start with ours.** · Lead: **Two sample offcuts, labelled as examples. They go through the same steps as your own photo.**
- Cards (`.cs-card--notched.lp-example`), art = the same SVG drawing as `src/lib/examples.ts` (inline, no raster) with a `.cs-stage__tag` **Example**:
  - **Felt offcut** · *A concave edge, a hole and a stain, all visible. A good first run: outline, mark the flaws, then choose your pieces.* · mono caption *Saved outline · relative units until you calibrate* · button **Start with the felt offcut** → `onExample('fieltro')`. Art alt: *Example photo: a teal felt offcut with a concave edge, a round hole and a dark stain, on a light background.*
  - **Leather scrap** · *Set up for a bifold wallet, so you can go straight to a verified plan and see how many complete wallets fit.* · *Assumed scale · 14 px = 1 cm · bifold wallet kit* · **Start with the leather scrap** → `onExample('cuero')`. Art alt: *Example photo: a brown leather scrap with a dark mark near the middle, on a light background.*
- Buttons are `.cs-btn--secondary`; in React map over `EXAMPLES` and keep these two strings as per-id overrides (the current `blurb` for leather mentions the scale; the scale moved to the mono caption).

### 8 · 07 Good to know
- **Layout.** 390: header then list. 1280: `4fr / 8fr`, header sticky at `top: 96px`.
- H2: **Straight answers.** · Body: **What CutSense does, what it does not, and where your photo goes.**
- Native `<details>/<summary>` (`.lp-faq`), first one open:
  1. **Is the plan the mathematical optimum?** No, and we do not pretend it is. A bounded search finds a good layout in a few seconds, and the verifier checks that it is valid. Every plan carries its seed and optimizer version, so you can reproduce it.
  2. **Are the measurements real?** Only after you calibrate, with the material's real width or two points on a known length. Until then sizes are relative units, and both the screen and the exported files say so. A photo taken from straight above gives the most accurate scale.
  3. **What happens to my photo?** When you use the AI outline, the photo is sent through our server to the segmentation service (SAM 3.1). The CutSense server stores nothing. Projects stay in your browser and in files you choose to save. A saved project contains your photo, so treat it as private.
  4. **Do I need an account, or AI at all?** No account. Without AI you can still outline by contrast or trace by hand, mark zones yourself, use the built-in kits and try the examples. The app tells you plainly when AI did not run.
  5. **Which materials work best?** Flat sheets you cut by hand or by machine, such as leather, felt, foam and cardboard. Photograph one sheet at a time, flat, on a background that contrasts with it, in even light. Pieces turn in steps of 90°.
  6. **Does it find the flaws for me?** It can help. Ask SAM to look for short phrases such as "scar, stain, hole": it proposes zones, and nothing becomes an excluded zone until you accept it. You can always draw zones by hand.
  7. **What if I change something after optimizing?** The plan is marked out of date and cannot be exported until you optimize again, so you never cut from a layout that no longer matches your material.

### 9 · Footer
- **Layout.** 390 stacked; 1280 `5fr / 7fr`.
- Wordmark + **Make sense of every offcut.**
- Notes with icons: **Reference plans.** *Exported plans are reference drawings: check one measurement before cutting.* · **Private by design.** *No accounts and no cloud storage: projects live in your browser and in files you save. When you use the AI outline, your photo is sent to the segmentation service through our server.*
- Base row: mono caption **Optimizer cs-nest-1.1 · light and dark · keyboard accessible** · link **Back to top**.

### Claims audit
Used only allowed claims: verified plans (4 checks), numbers from geometry, reproducible (seed + `cs-nest-1.1` + problem/solution JSON), leftover-aware tie-break, another product on the leftover with a chosen quantity, complete sets, kits and single pieces, 1:1 print + DXF, Hilo with a checked, approximate 3D preview, private (with the segmentation-service caveat), light/dark, keyboard. No "optimal/perfect/zero waste", no savings percentage (the hero shows a piece count, never a utilisation %), no accuracy grade, no "any material", no real-time, no testimonials, logos or user counts. "Optimum" appears only negated, as the app itself says it.

---

## 4. Classes

**Reused** (no change): `.cs-root .cs-container .cs-grid-paper .cs-display .cs-h2 .cs-h3 .cs-h4 .cs-lead .cs-body-sm .cs-caption .cs-eyebrow .cs-mono .cs-measure .cs-chalk-underline .cs-btn(--primary/--secondary/--ghost/--sm/--lg) .cs-btn-row(--stack) .cs-link .cs-card(--stitched/--notched) .cs-card__title .cs-section__head .cs-pill(--ai/--human/--computed/--verified) .cs-badge(--ink) .cs-unit--calibrated .cs-chip(--on) .cs-chip-group .cs-swatch--a…d .cs-alert(--danger/--warn) .cs-alert__icon/__title/__body .cs-stage .cs-stage__bar .cs-stage__tag .cs-seal(--animate) .cs-anim-settle`, SVG patterns `#cs-pat-a…f`, `#cs-pat-defect`.

**New** (`landing.css`, ~23 KB unminified, mostly one-line rules):

| Class | Purpose |
|---|---|
| `.lp-skip`, `.lp-sr` | Skip link; visually hidden text |
| `.lp-img-light`, `.lp-img-dark` | Theme-matched screenshot pairs |
| `.lp-top`, `__in`, `__nav`, `__end`, `__cta`, `.lp-logo`, `.lp-theme` | Sticky top bar, wordmark, theme toggle |
| `.lp-sec`, `.lp-head`, `.lp-num`, `.lp-body`, `.lp-stack` | Section rhythm and header |
| `.lp-hero`, `__grid`, `__title`, `__ctas`, `__aux`, `__alert`, `__visual`, `__seal`, `__ticket`, `.lp-prov`, `.lp-ruler` | Hero |
| `.lp-ticket`, `__k`, `__v`, `__m`, `--flat` | The bench ticket |
| `.lp-steps`, `.lp-step(--ai/--human/--verified)`, `__dot`, `__text`, `.lp-shot`, `__frame` | How it works |
| `.lp-mat` | Cutting-mat band (local dark token set) |
| `.lp-loop`, `.lp-gen`, `__art`, `.lp-hop`, `__v`, `__h`, `.lp-loop__note`, `.lp-art`, `__material`, `__leftover`, `__piece`, `__defect`, `__label`, `__frag`, `__ruler`, `.lp-ways` | Leftover loop illustration and cards |
| `.lp-trust`, `__lead`, `.lp-checks`, `.lp-check`, `.lp-glyph__ink/__piece/__ok/__defect/__dim`, `.lp-facts` | Trust |
| `.lp-hilo`, `.lp-chat`, `.lp-msg(--you/--hilo)`, `__who`, `.lp-proposal`, `__rows`, `.lp-render`, `__stage`, `__main`, `__inset`, `.lp-quad` | Hilo + 3D |
| `.lp-exports`, `__note`, `.lp-tiling`, `.lp-tile__sheet/__overlap/__mark/__plan/__piece/__text/__bar/__check`, `.lp-files`, `.lp-file`, `__name` | Exports |
| `.lp-examples`, `.lp-example`, `__art`, `__body` | Examples |
| `.lp-faq-wrap`, `.lp-faq` | Good to know |
| `.lp-foot`, `__grid`, `__brand`, `__notes`, `__base` | Footer |
| `.lp-motion` (on `<html>`), `.is-in` (on `.lp-loop`), `@keyframes lp-draw` | Motion hooks |

Landing-local custom properties: `--lp-logo-offcut`, `--lp-logo-piece` (wordmark colours per theme, as `logo-wordmark*.svg`), `--lp-mat-bg` (mat band), `--lp-pos` (screenshot crop bias), `--w` (loop panel width on mobile), `--g` (loop generation delay), `--qx/--qy` (render quadrant).

New contrast pairs (WCAG 2.x, computed): paper `#F4EFE6` on mat-600 **7.06**; muted mat-100 `#DCEADF` on mat-600 **6.49**, on the band card `#143126` **11.27**, dark band card `#121E18` **13.78**; `.lp-num` in the band `#FFC3AB` on mat-600 **5.25**, on mat-800 **10.46**; AI pill in the band **8.52**. Everything outside the band uses the brand's audited pairs.

---

## 5. Motion

| Moment | Spec | Reduced motion |
|---|---|---|
| Hero plan | Pieces drop with `.cs-anim-settle` (`--i` 0–9, 70 ms stagger, 900 ms `--cs-ease-snap`); the seal stamps in with `.cs-seal--animate` at 80 % of the settle | Final state, seal at −10° (components.css) |
| Leftover loop | Plays once when 30 % of `.lp-loop` is visible (IntersectionObserver adds `.is-in`). Per generation `g` (0, 1, 2; hops 0.6, 1.6): panel fades up at `g × 900 ms`; its pieces settle from `g × 900 + 160 ms` with 70 ms stagger; the green fragment outline draws (`pathLength=100`, dash offset 100 → 0, 700 ms) at `g × 900 + 620 ms`. Total ≈ 3 s | `.lp-motion` is only added when motion is allowed and IO exists, so with reduced motion, no JS, or `?static=1` everything is static and visible; a `prefers-reduced-motion` block also forces final states |
| Controls | Buttons, chips, FAQ use the token durations (80–220 ms) | Durations become 0 via tokens |
| Scroll | `scroll-behavior: smooth` for anchor links, `scroll-padding-top: 72px` for the sticky bar | `auto` |

No motion runs on its own after load except these two one-shot moments. No three.js on the landing: the 3D section uses still renders.

---

## 6. Screenshots to capture from the live app (how it works)

Capture each in **light and dark**, English UI, **4:3**, exported at **1600 × 1200** (shown at up to ~690 × 518 on desktop and full width at 390). Use the bundled **Leather scrap** or a real leather photo, the same offcut for steps 1–5 so the page tells one story. Crop the browser chrome and the app header out unless stated; keep the canvas tag (top-left) visible because it carries the provenance word.

| Slot | File name | Content and crop |
|---|---|---|
| Step 1 | `how-1-outline-{light,dark}.webp` | Digitize, AI proposal state: dashed chalk outline + hole proposal on the photo, tag *AI proposal*. Crop: canvas on the left ~62 %, the panel with *Is this the edge of your material?* and **Accept outline** on the right ~38 %. |
| Step 2 | `how-2-zones-scale-{light,dark}.webp` | Prepare with one accepted excluded zone (barrier-tape hatch) and the calibration ruler line visible with its chip *8.56 cm*; panel showing **Scale** with `Calibrated · cm` and **Excluded zones** open. Same 62/38 split. |
| Step 3 | `how-3-pieces-{light,dark}.webp` | Prepare › Pieces with a kit loaded (bifold wallet or cardholder): rows with swatch + letter, name, mono size and ×qty, *Complete sets* visible. Crop biased to the panel: panel ~55 %, canvas ~45 % on the left. |
| Step 4 | `how-4-verified-{light,dark}.webp` | Result › Plan, verified: pieces on the offcut, *Verified* tag, the seal + *n sets / complete · all verified*, the metrics trio and the seed line. 62/38 split. (The landing overlays its own seal on the image corner, so keep the top-right 80 px of the crop free of key content.) |
| Step 5 | `how-5-export-{light,dark}.webp` | Result with the **Export** menu open: SVG, PNG, Include photo, Print + A4, SVG in centimetres, DXF. Crop biased right so the whole menu is inside the frame (menu ~50 %, canvas ~50 %). |

Optional for the leftover section (not required by the mockup): `leftover-tab-{light,dark}.webp`, 4:3, Result › Leftover tab with hatched leftover, *Another product with what is left* and *Reuse the offcut* rows, if the team later wants a real-app proof under the illustration.

Images go in `<img width="1600" height="1200" loading="lazy" decoding="async">` inside `.lp-shot__frame` (aspect-ratio 4 / 3, so no layout shift); the hidden theme variant is `display: none` and is never downloaded.

---

## 7. Accessibility notes

- Landmarks: `header` (top bar), `nav` "On this page", `main#main`, one `h1`, each `section` `aria-labelledby` its `h2`, `footer`. Skip link first.
- Every interactive element is a real `button`/`a`/`input`; file inputs are hidden but labelled and triggered by visible buttons. Focus ring from tokens (`--cs-focus-ring`); in the mat band the focus colour switches to chalk-300 (8.3:1 on mat).
- Theme toggle: `aria-pressed` + `aria-label="Dark theme"`. FAQ uses native `<details>` (keyboard and screen-reader support for free).
- Error slot is `role="alert"`, empty by default, filled with the app's error.
- Hero SVG has a `<title>`; the loop has a full text description (`aria-describedby`) plus a visible "Illustration" caption; decorative SVGs (`.lp-art`, glyphs, hops, icons) are `aria-hidden`. Piece letters (A–F, E, F) keep the colour + pattern + letter rule even in illustrations.
- The Hilo chat mock is a labelled group; its buttons are `tabindex="-1"` (illustrative, not part of the page's actions). In React render them as non-interactive spans if preferred.
- Colour never alone: provenance pills keep their line sample + word; the "needs calibration" marker is a ruler glyph + "cm".
- Touch targets ≥ 44 px for all real actions (`--cs-tap`); the top-bar CTA is `--sm` (36 px) and only shown ≥ 1000 px (pointer devices).
- No horizontal scroll at 390 (checked: `scrollWidth = 390`, no element past the viewport in either theme).
- Images: explicit `width`/`height` + CSS `aspect-ratio`; all below-the-fold images `loading="lazy"`; the hero is inline SVG (no request).

---

## 8. React port notes

- `Home` keeps its props (`onFile`, `onExample`, `onOpenProject`, `error`). Primary/secondary/link/inputs map one to one; *Try an example* calls `onExample('cuero')`; the examples section maps `EXAMPLES` with the copy overrides above.
- Put the hero plan, loop and tiling SVGs in small components (`HeroPlan`, `LeftoverLoop`, `PrintTiling`) as static JSX; the shared `<defs>` (patterns, filters, `#lp-hatch`, `#lp-seal-ring`) once at the top of `Home`, or reuse the app's existing pattern defs. The loop geometry was generated by a script; paste the paths as constants.
- The loop observer: `useEffect` with IntersectionObserver, add `is-in` once; add `lp-motion` to the section (not `<html>`) if you prefer to scope it.
- The theme toggle should reuse the app's existing theme state rather than the mock script.

## 9. Described but not mocked

- Real screenshots of the live app (stand-ins are the UX prototype frames; their dark variants are in Spanish).
- The React implementation and the real file-input / example / project handlers (the mockup only opens the file pickers).
- A hover/focus state gallery for the new components (they inherit the `.cs-*` states).
- The optional *Leftover tab* proof image under the loop illustration.
- Open Graph / social preview image and meta tags beyond `title` and `description`.

## 10. As built in the app

The React port is `src/components/Home.tsx`, `src/components/landing/art.tsx` (the inline illustrations) and `src/components/landing/landing.css` (loaded from `src/styles.css`). Differences from the mockup:

- **Hero ticket** reads *Illustration · 10 of 10 pieces placed · real plans carry seed + cs-nest-1.1*: the hero plan is a drawing, so it shows no seed of its own. The optimizer version comes from `OPTIMIZER_VERSION`.
- **How it works** uses real captures of the app (`public/landing/how-1…5-{light,dark}.webp`, 1200 × 900): the *Leather scrap* example with a live SAM 3.1 outline, its hole turned into an excluded zone, the bifold wallet kit, the verified result (1 complete set) and the export menu. The theme picks the matching file, so the other one is never downloaded.
- **Leftover loop** adds a real capture under the illustration (`leftover-product-*.webp`): the same example with four keychains added on the leftover.
- **Examples** reuse the images from `src/lib/examples.ts` instead of copying the SVG.
- **Hilo** reuses `docs/3d-preview/billetera(-dark).webp` through a Vite import; the chat mock's chips and buttons are non-interactive spans.
- FAQ and trust copy avoid time claims ("a bounded search", not "a few seconds").
