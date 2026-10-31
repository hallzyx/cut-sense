# CutSense brand book

> **Pattern paper by day, cutting mat by night.**
> AI proposes in chalk, your hand corrects in thread, the verifier stamps the seal.

Files in this folder:

| File | What it is |
|---|---|
| `logo-mark.svg`, `logo-wordmark.svg` | Full-colour logo (for light surfaces) |
| `logo-mark-mono.svg`, `logo-wordmark-mono.svg` | One colour, `currentColor` |
| `logo-mark-reverse.svg`, `logo-wordmark-reverse.svg` | For dark surfaces (paper offcut, light thread) |
| `tokens.css` | All design tokens (`--cs-*`), light + dark, Google Fonts import |
| `components.css` | Framework-agnostic components (`.cs-*`) + signature keyframes |
| `preview.html` | Living style guide: open in a browser, toggle Claro/Oscuro (`?theme=dark` also works) |
| `screenshots/` | Full-page captures at 390 px and 1280 px in both themes, plus close-ups |

---

## 1. Concept

### The name: *sentido de corte*
In Spanish, **sentido** means both *sense* (perception, judgement) and *direction*. A master cutter has *sentido de corte*: they read the hide, dodge the scar, follow the grain and know where each piece fits before the knife moves. CutSense puts that sense on screen, and makes it checkable.

The story in one line: **the scrap becomes meaningful.** Every offcut on the bench is either waste or material for the next cardholder; the difference is knowing where to cut.

- Tagline (ES): **Dale sentido a cada retazo.** *(Give every scrap a purpose.)*
- Product promise (ES): **De una foto a un plan de corte en el que puedes confiar.** *(From a photo to a cutting plan you can trust.)*

### Personality: *el maestro del taller* (the workshop master)
Patient, precise, warm, honest. Speaks like someone standing next to you at the bench, not like a SaaS dashboard. Says "I don't know" when it does not know. Never sells an optimum it cannot prove.

| Is | Is not |
|---|---|
| Practical, plain-spoken | Corporate, buzzwordy |
| Craft-literate (retazo, molde, merma, piquete) | Jargon-heavy (polygon offset, NFP) in the UI |
| Honest about limits | Hype ("¡perfecto!", "ahorra 32 %") |
| Calm under failure | Alarmist or blaming |

### Visual direction: four workshop materials
| Material | Role | Token |
|---|---|---|
| **Pattern paper** (kraft, gridded) | Light background, cards | `--cs-paper-100` `#F4EFE6` |
| **Self-healing cutting mat** (deep green with grid) | Brand primary; dark-mode background | `--cs-mat-600` `#1E5A43`, `--cs-mat-900` `#0F1A15` |
| **Tailor's chalk** (blue) | Everything the AI *proposes* | `--cs-chalk-700` `#2A4FB8` |
| **Waxed thread** (vermilion) | Everything the *human hand* does | `--cs-thread-500` `#D9481C` |

Signature details: a 4:1 cutting-mat grid behind hero and canvas areas (`.cs-grid-paper`); a **saddle-stitch** dashed line inset 6 px in featured cards (`.cs-card--stitched`); a pattern-maker's **V-notch** (`.cs-card--notched`); a **toothed rosette seal** for verified plans; ruler ticks on meters. Radii are small (3–14 px): things are *cut*, not poured. Pills are reserved for status only.

---

## 2. Logo

**Mark ("the bite and the piece").** An irregular C-shaped offcut (mat green) with a square bite taken out of it; the freshly cut piece (thread vermilion) floats in the bite, rotated −10° as if lifted off the table. It reads as C for CutSense, as *nesting* (a piece fitted into material), and as *cutting* (a piece removed). At 16 px it reduces to "green C + orange square", which is still unique in a tab bar.

**Wordmark.** Custom monoline lettering (stroke 5.6 on a 56-unit cap box, round caps), hand-built as SVG paths so it never depends on a font. The only flourish: the crossbar of the **t** is a single vermilion **stitch**, linking the word to the piece in the mark.

| Variant | Use |
|---|---|
| Colour (`logo-*.svg`) | Paper, white or very light photos |
| Reverse (`logo-*-reverse.svg`) | Mat green/black, dark photos. Offcut `#ECE6D8`, piece/stitch `#FF7A4D` |
| Mono (`logo-*-mono.svg`) | Single-ink printing, embossing, stamping on leather, the export file footer. Uses `currentColor`; the piece becomes an outline |

**Clear space:** `x` = the width of the bite (≈ 0.3 × mark height) on all sides. **Minimum size:** mark 16 px (favicon); wordmark 96 px wide (below that, use the mark alone).
**Don't:** recolour the piece in anything but thread/paper/currentColor, rotate the whole logo, add a drop shadow, set "CutSense" in a font instead of the drawn wordmark, put the colour version on mid-tone photos (use reverse or mono on a solid chip).

---

## 3. Colour

All ratios below were computed with the WCAG 2.x relative-luminance formula (script run during design, not estimated). AA requires 4.5:1 for body text, 3:1 for large text and UI component boundaries.

### Light theme (`:root`)
| Pair | Ratio | Use |
|---|---|---|
| `--cs-text` `#1B1F1C` on `--cs-bg` `#F4EFE6` | **14.56** | Body text |
| `--cs-text` on `--cs-surface` `#FBF8F2` | **15.73** | Card text |
| `--cs-text` on `--cs-surface-sunk` `#EBE4D6` | **13.18** | Wells |
| `--cs-text-muted` `#5A615B` on bg / surface / sunk | **5.56 / 6.01 / 5.04** | Captions |
| `--cs-on-primary` `#F4EFE6` on `--cs-primary` `#1E5A43` | **7.06** | Primary button |
| `#FBF8F2` on `--cs-primary-hover` `#17483A` | **9.79** | Primary hover |
| `--cs-primary` on surface (as text/link) | **7.62** | |
| `--cs-accent-text` `#B23A12` on bg / surface | **5.23 / 5.65** | Thread-coloured text |
| `--cs-focus` `#2A4FB8` on bg | **6.30** | Focus ring (≥3:1 needed) |
| `--cs-line-strong` `#8C8273` on bg / surface | **3.30 / 3.57** | Input/chip borders (≥3:1) |
| Danger button `#FFFFFF` on `#B3261E` | **6.54** | |
| Thread `#D9481C` | 3.75 on paper | **Decorative / large only** (logo, stitches, underline). Never body text. |

Status pills (fg on tint), light: AI `#2A4FB8/#E1E7F7` **5.84** · human `#B23A12/#FBE3D6` **4.86** · computed `#3A3F3C/#E6E2DA` **8.31** · verified `#1E5A43/#DCEADF` **6.49** · stale `#7A4E00/#F6E7C4` **5.88** · danger `#A1221B/#F8DEDA` **5.96**. Stale fg as plain text on surface: **6.79**.

### Dark theme (`[data-theme="dark"]` and `prefers-color-scheme: dark`)
| Pair | Ratio |
|---|---|
| `--cs-text` `#ECE6D8` on bg `#0F1A15` / surface `#16241D` | **14.32 / 12.94** |
| `--cs-text-muted` `#A8B0A6` on bg / surface | **8.00 / 7.23** |
| `--cs-on-primary` `#0F1A15` on `--cs-primary` `#5BD69A` | **9.78** (hover `#7BE3B0`: 11.41) |
| Thread `#FF7A4D` on bg / surface | **6.91 / 6.24** |
| Focus `#8FB0FF` on bg | **8.33** |
| `--cs-line-strong` `#5E7A6B` on bg / surface | **3.79 / 3.43** |
| On-danger `#0F1A15` on `#FF8A80` | **7.80** |

Dark pills: AI `#AFC4FF/#1B2747` **8.52** · human `#FFA27F/#3D2116` **7.51** · computed `#D7D2C6/#2A302C` **8.94** · verified `#9BE8C0/#173A2A` **8.77** · stale `#F5C76A/#3A2C10` **8.57** · danger `#FFADA6/#3D1A18` **8.67**.

### Provenance language (the core of the system)
Each origin has a **line style + a word + a colour**. Remove the colour and the line and word still tell you who did what.

| State | Line on canvas | Pill (ES) | Colour |
|---|---|---|---|
| AI proposed | dashed 8/5 | *Propuesta IA* | chalk blue |
| Human corrected | solid + vertex handles | *Corregido por ti* | thread vermilion |
| Deterministic computed | thin solid hairline | *Calculado · semilla 4127* | graphite |
| Verified | thick solid + toothed seal | *Verificado* | mat green |
| Stale | round-dotted 1/7 | *Desactualizado* | amber |
| Failed | broken line + ✕ | *Falló* / *IA no disponible* | brick red |

---

## 4. Typography

```css
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

| Role | Family | Notes |
|---|---|---|
| Display / headings | **Bricolage Grotesque** 700–800, `opsz` 96 for hero | Warm, slightly ink-trapped grotesque; feels hand-set, not corporate |
| UI / body | **Instrument Sans** 400–700 | Compact and legible at 14 px in the dense side panel |
| Measurements, seeds, coordinates, eyebrows | **JetBrains Mono** 400–600, slashed zero | Every number + unit is `.cs-measure` (tabular, no wrap) |

Scale (`--cs-text-*`): 11 · 12 · 14 · 16 · 18 · 22 · 26→36 (fluid) · 36→64 (fluid hero). Inputs are always 16 px (prevents iOS zoom). Line height 1.5 body, 1.05 display. Spanish decimals use a comma: `12,4 cm`.

---

## 5. Layout and grid (mobile first)

- Spacing base 4 px (`--cs-space-1…24`). Gutter 16 px under 768 px, 24 px above. Container 1200 px.
- Touch target ≥ 44 px (`--cs-tap`); small buttons 36 px only inside dense panels with spacing ≥ 8 px.
- **Mobile (≥ 390 px):** single column. Top bar = mark + compact stepper (only the current step label is visible; others are visually hidden but read by screen readers). Canvas full width under the bar; the control panel becomes a **bottom sheet** (`radius 18px 18px 0 0`, grab handle) scrolling below the canvas, primary action last and full width.
- **Tablet (768–999 px):** still one column, canvas max-height 60 vh, panel below.
- **Desktop (≥ 1000 px):** two columns `minmax(0,1fr) 380px` (`--cs-panel-width`); panel sticky with internal scroll; stepper in the header row with dashed cut-line connectors.

---

## 6. Screen-by-screen spec

### Landing
Grid-paper hero. Eyebrow *SENTIDO DE CORTE* (mono, dashed lead line). H1 **«Dale sentido a cada retazo.»** with a chalk underline under *retazo*. Lead: *«Fotografía tu retazo. La IA propone el contorno, tú lo corriges, y la geometría verifica cada plan antes de mostrártelo.»* Primary CTA **«Subir foto del retazo»** (camera icon), secondary **«Probar con un ejemplo»**. Below: the four provenance pills as the "how it works" in one glance, then a ruler. Right (desktop) / below (mobile): a real verified plan on a dark photo, rotated 1.2°, with the seal overlapping its corner. Then: example cards, honest FAQ, footer note *«Los planos exportados son referenciales.»*
Caption under CTAs: *«JPG, PNG o WebP · hasta 10 MB · foto desde arriba, fondo que contraste.»*

### Step 1 · Digitalizar
- **Processing:** pill *IA analizando* (with live dot), chalk-blue scan band sweeping the photo, indeterminate chalk progress. Copy: *«Leyendo el borde del material…»* / *«SAM 3.1 suele tardar unos segundos. Tu foto no se guarda.»* + *Cancelar*.
- **Proposal:** dashed chalk outline with 16 % blue tint; detected holes dashed blue. Sheet: pill *Propuesta IA · SAM 3.1*, vertex count (mono), **«¿Este es el borde de tu material?»**, *«La IA propone; tú tienes la última palabra. Encontramos 1 agujero y lo marcaremos como zona excluida.»* Actions: **Aceptar contorno** (primary), *Ajustar a mano*, *Descartar*.
- **Editing:** outline turns thread-solid with white handles; the dragged/selected handle is vermilion and larger. Pill switches to *IA + corregido por ti*.
- **AI failed (recoverable):** danger alert *«La IA no pudo leer el borde esta vez»* / *«El servicio no respondió a tiempo. Tu foto sigue aquí.»* Actions: *Reintentar*, *Segmentar por contraste*, *Trazar a mano*. The photo stays visible with tag *Foto · sin contorno*.
- **Invalid outline:** the crossing segments are drawn thick red, the offending vertex gets a red ✕ badge; alert *«El contorno se cruza consigo mismo»* / *«Mueve el vértice marcado o vuelve al último contorno válido. Optimizar queda bloqueado mientras tanto.»* Action *Volver al último válido*. Stepper step 2 shows locked (dashed box).

### Step 2 · Preparar
Sections separated by hairlines: **Escala** (unit badge: solid `Calibrado · cm` or dashed `≈ Sin calibrar · u relativas`; calibration draws a ruler line with end ticks and a dark label `8,56 cm`; hint *«Una tarjeta bancaria mide 8,56 cm de largo.»*), **Zonas excluidas** (count badge; *Dibujar zona*, *+ Círculo*; nudge when empty: *«¿Tu retazo tiene agujeros, marcas o costuras? Márcalos para que ninguna pieza caiga encima.»*), **Piezas** (kit selector cards; piece rows = swatch with pattern+letter, name, mono size, qty stepper; empty state *«Aún no hay piezas»*), live area metrics, primary **Optimizar distribución**. Choosing a kit while uncalibrated shows a warn alert: *«Este kit usa medidas reales en cm. Calibra primero la foto.»*

### Step 3 · Resultado
- **Optimizing:** pill *Calculando · semilla 4127*, striped determinate progress, *«Acomodando piezas… 62 %»*, *Cancelar*. Pieces already placed appear; the next candidate slot is a white dashed box.
- **Verified:** seal + big number **78 %** *«del área útil · 11 de 11 piezas»*, ruler meter, metrics (digitised − excluded = usable, occupied), caption *«Mejor distribución encontrada por la búsqueda (v0.4 · semilla 4127). No es un óptimo demostrado.»* Export: **Exportar SVG** / PNG, *Incluir fotografía*, note *«Plano de referencia: revisa las medidas antes de cortar.»*
- **Partial:** verified seal still shown (what's placed is valid) + warn alert *«Verificado, pero incompleto: 9 de 11 piezas»* / *«Faltan 2 × Lengüeta. Prueba permitir giro de 90° o bajar la separación.»* A **pending tray** under the canvas holds dashed amber outlines of the unplaced pieces.
- **No valid solution:** canvas shows material and exclusions only; dashed empty state *«Ninguna pieza entra sin tocar una zona excluida»* / *«Las piezas son más grandes que el área libre o la separación es muy alta. Revisa medidas, quita una zona o usa otro retazo.»* Actions *Revisar piezas*, *Ver zonas*. Never show 0 % as a score.
- **Verification failed (engine bug path):** danger alert *«Este plan no pasó la verificación»* listing up to 4 violations; nothing is exportable.
- **Stale:** pieces go grayscale at 45 %, material outline becomes amber dotted, tag *Desactualizado · reoptimiza*, stepper step 3 shows the amber "!" state, export disabled. Alert *«Cambiaste algo después de optimizar»* / *«Este plan ya no corresponde a tus datos y no se puede exportar.»* Primary **Reoptimizar**.
- **What changed:** after re-optimising, panel alert with thread bar: *Qué cambió* → *Nueva zona excluida: 6,2 cm²* · *2 piezas se movieron (C1, F1)* · *Área útil: 593,6 → 587,4 cm²* + caption *«El área útil cambió, así que no comparamos porcentajes como "mejora".»*

---

## 7. Canvas overlay spec (SVG stage)

Overlays sit on arbitrary user photos, so they are **theme-independent** and every line is a **tri-stroke**: light halo (`rgba(255,255,255,.78)`, core + 5 px) → dark casing (`#0B0F0D`, core + 2.5 px) → colour core. One of the two outer rings always contrasts with the photo. Core colours vs casing: AI `#4D7CFF` 5.18 · human `#FF5A1F` 6.19 · verified `#5BD69A` 10.59 · defect `#FF3B30` 5.44 · stale `#F2B544` 10.54 · white 19.29. Stroke widths are in **screen pixels** (divide by the CTM scale, as `Stage.tsx` already does with `k()`).

| Element | Spec |
|---|---|
| AI proposal | core 2.5 px `--cs-ov-ai`, dash 9/6, fill same at 16 % |
| Human outline | core 2.5 px `--cs-ov-human`, solid |
| Verified material outline | core 3 px `--cs-ov-verified`, solid |
| Handles | r 6 px, white fill, 2 px casing; selected/dragging r 8 px `--cs-ov-human`; focus = 3 px thread stroke |
| Exclusion zone | barrier-tape hatch (`#FF3B30` / white, 5 px bands at −45°) + tri-stroke dashed 6/4 red. Deliberately unlike every piece pattern |
| Pieces | 1.6 px casing + 4.5 px white halo; fill = colour + pattern; label = mono 15 px bold `#0B0F0D` with 4 px white paint-order stroke (`A1`, `B3`…) |
| Labels/tags on canvas | `--cs-ov-label-bg` (82 % ink) chip, white 12–17 px text; provenance tags use the solid provenance colour (all ≥ 5.9:1 with their text) |
| Calibration | white-cased ink line with perpendicular end ticks, value chip at mid-point |
| Stale | pieces `grayscale(1)` + 45 % opacity; outline amber dotted |
| Changed | moved piece: marching-ant outline (white dash on 5 px ink) + dotted white **ghost** of the previous position |

Piece fills (each always paired with a pattern **and** a letter, so colour is never the only carrier):

| | Colour | Pattern | Ink on fill |
|---|---|---|---|
| A | saffron `#F5B800` | plain | 10.79 |
| B | sky `#4FC3F7` | diagonal lines | 9.63 |
| C | rose `#F2609E` | dots | 6.38 |
| D | teal `#1FB5A0` | cross-hatch | 7.51 |
| E | violet `#A07CFF` | horizontal lines | 6.27 |
| F | lime `#B5E61D` | vertical lines | 13.14 |

SVG `<pattern>` definitions are in `preview.html` (`#cs-pat-a…f`, `#cs-pat-defect`); CSS swatches for legends are `.cs-swatch--a…f`, `.cs-swatch--defect`.

---

## 8. Motion

Principles: **motion explains provenance**, it never decorates. Fast for controls (80–220 ms, `--cs-ease-out`), weighted for the three signature moments, and every one has a static reduced-motion equivalent.

1. **The snap** (`.cs-anim-snap`): the chalk outline draws around the material (`stroke-dashoffset`, 640 ms), overshoots 3.5 % and settles (`--cs-ease-snap`, 420 ms); then handles pop in 30 ms apart. Reduced motion: outline appears dashed instantly.
2. **The settle + seal** (`.cs-anim-settle`, `.cs-seal--animate`): pieces drop from −18 px with a small random tilt, 70 ms stagger (`--i`), 900 ms; when the verifier returns, the seal stamps in (scale 1.8 → 1, rotate −24° → −10°). Reduced motion: final state, no stagger.
3. **What changed** (`.cs-anim-changed`, `.cs-ov-changed`): moved pieces pulse once with a white glow (2.4 s) while marching ants run; afterwards a static dashed outline and the ghost stay until dismissed or the next edit. Reduced motion: no pulse, no marching; the static outline and ghost still show the change.

Live regions: announce *«Contorno propuesto por la IA»*, *«Plan verificado: 11 de 11 piezas»*, *«2 piezas se movieron»* in `aria-live="polite"`.

---

## 9. Accessibility checklist

- [x] All text pairs ≥ 4.5:1, UI boundaries ≥ 3:1 (tables above); thread `#D9481C` used only decoratively.
- [x] Colour never alone: provenance = line style + word; pieces = colour + pattern + letter; defects = hatch unlike any piece; stale = grayscale + dotted + text; units = solid vs dashed badge + "≈".
- [x] Focus visible everywhere (`--cs-focus-ring`, chalk blue, 6.3:1 / 8.3:1). Canvas handles are focusable `role="button"` with arrow-key nudging (already in `Stage.tsx`) and a thread focus stroke.
- [x] Touch targets ≥ 44 px; inputs 16 px.
- [x] Compact stepper hides labels visually only (still in the accessibility tree); `aria-current="step"`.
- [x] `prefers-reduced-motion` handled in tokens (durations → 0) and components (static fallbacks).
- [x] Both themes follow `prefers-color-scheme` unless `data-theme` is set.
- [ ] To verify in the app: canvas `<title>` per zone/piece, keyboard path to add a defect without a pointer, screen-reader text for metrics table.

---

## 10. Migration notes (src/styles.css → new system)

1. Add `@import './design/tokens.css'` (or copy it) **and** `components.css` before `styles.css`; add `class="cs-root"` to `<body>`.
2. Replace the Google Fonts link (Titillium Web + Inter) with the import at the top of `tokens.css`.
3. Map old variables, then delete them:

| Old | New |
|---|---|
| `--primary #00f0a0` | `--cs-primary` (buttons), `--cs-ov-verified` (canvas) |
| `--primary-dark #00a86b` | `--cs-primary-hover` / `--cs-verified-fg` |
| `--ink #000` | `--cs-text` |
| `--on-dark #fff` | `--cs-on-primary` / `--cs-text-inverse` |
| `--canvas #fff` | `--cs-surface` (cards), `--cs-bg` (page) |
| `--mint #ecffe0` | `--cs-verified-tint` (alerts), `.cs-grid-paper` (bands) |
| `--muted`, `--hair`, `--soft` | `--cs-text-muted`, `--cs-line`, `--cs-surface-sunk` |
| `--danger`, `--warn` | `--cs-danger-fg` / `--cs-danger-solid`, `--cs-stale-fg` |
| `--display`, `--ui` | `--cs-font-display`, `--cs-font-ui` (+ `--cs-font-mono` for numbers) |

4. Map classes:

| Old class | New |
|---|---|
| `.display`, `.h2`, `.h4`, `.h5`, `.lead`, `.eyebrow`, `.caption` | `.cs-display`, `.cs-h2`, `.cs-h3`, `.cs-h4`, `.cs-lead`, `.cs-eyebrow`, `.cs-caption` |
| `.hl` | `.cs-chalk-underline` |
| `.logo`, `.logo-mark` | inline `logo-wordmark.svg` paths (letters `currentColor`) / `logo-mark.svg` |
| `.btn.primary`, `.btn.dark` | `.cs-btn.cs-btn--primary` |
| `.btn.green` (stale re-optimise) | `.cs-btn--primary` (the urgency is carried by the stale alert, not a new colour) |
| `.btn.ghost` | `.cs-btn--secondary` (bordered) or `.cs-btn--ghost` (borderless) |
| `.btn.sm`, `.btn.xs` | `.cs-btn--sm` |
| `.link`, `.link.danger` | `.cs-link`, `.cs-link--danger` |
| `.band.mint`, `.hero` | `.cs-grid-paper` section |
| `.band.black`, `.ticker` | remove ticker (noise); quote band → `.cs-card--stitched` or inverse surface |
| `.feature-card` (40 px asymmetric corners) | `.cs-card` / `.cs-card--stitched` |
| `.score-ring` | `.cs-seal` + `.cs-stat` (result); step numbers → plain `.cs-h4` with mono index |
| `.chip`, `.chip.dark` | `.cs-badge`, `.cs-badge--ink`; canvas hints → `.cs-stage__tag` |
| `.alert.error/.warn/.ok/.info` | `.cs-alert--danger/--warn/--success/--info` (`--ai` for proposals) |
| flash message (`alert ok` + Cerrar) | `.cs-toast` |
| `.stepper`, `.step`, `.step.on` | `.cs-stepper` + `.cs-step--done/--current/--locked/--attention` (`--compact` on mobile) |
| `.work-grid`, `.panel`, `.stage-card` | same grid using `--cs-panel-width`; `.cs-card` panel; `.cs-stage` + `.cs-stage__bar` |
| `.stage`, `.handle` | `.cs-stage svg`, `.cs-ov-handle` (+ `--selected`) |
| `.legend`, `.legend i.hatch`, `.dot`, `.tpl-head i` | `.cs-legend`, `.cs-swatch--a…f`, `.cs-swatch--defect` |
| `.field`, `.input-wrap`, `.mini`, `select`, `.name` | `.cs-field` + `.cs-label`, `.cs-number` + `.cs-number__unit`, `.cs-input`, `.cs-select` |
| `input[aria-invalid]`, `.field .err` | built into `.cs-input[aria-invalid]`, `.cs-error` |
| `.check`, `.rots` | `.cs-check`; rotations → `.cs-chip-group` of `.cs-chip[aria-pressed]` |
| `.tpl` | `.cs-piece` (+ `--pending`) with `.cs-qty` |
| `.dlist li.on` | `.cs-piece`-style rows; selected = `aria-pressed` + thread border |
| `.metrics`, `.tbl` | `.cs-metrics` (+ `__total` for usable area) |
| `.bar`, `.bar i` | `.cs-progress` + `.cs-progress__bar` (or `.cs-meter` for utilisation) |
| `.sect`, `.panel-foot`, `.alt-box`, `.export` | `.cs-section` |
| `.faq` | keep structure; button text `.cs-h4`, answer `.cs-body-sm` |

5. `Stage.tsx`: replace hard-coded colours (`#00f0a0`, `#00a86b`, `#ff3b30`, `#c4140b`, `#000`) with the overlay tokens; draw outlines as tri-strokes; use the six patterns from `preview.html` (order A–F) instead of `PATTERN_SHAPES`; proposal = chalk dashed, edited contour = thread solid, result outline = verified green; stale group gets grayscale + 45 % opacity; add `.cs-anim-settle` with `--i` to placement groups and `.cs-ov-changed` + ghost for moved pieces (`diffResults` already knows which moved).
6. `templates.ts` `PALETTE`: replace with `--cs-piece-a…f` values in that order.

---

## 11. Described but not mocked
- The FAQ and example-card sections of the landing page (only specified here).
- The verification-failed (violations list) alert: copy specified, uses `.cs-alert--danger`.
- The calibration two-point interaction states (first point placed, second point placed) beyond the finished ruler.
- The SVG/PNG export file's own layout (title block with mono logo, unit status and reference-plan warning).
- Animations are shown as end states in screenshots; motion is specified as CSS keyframes, not recorded.
