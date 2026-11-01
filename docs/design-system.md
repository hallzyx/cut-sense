# Design system

CutSense's visual identity and UI rules live in [`design/`](../design/). The full brand book is **[design/DESIGN.md](../design/DESIGN.md)**: concept, logo, colour (with measured contrast ratios), typography, layout, screen-by-screen states, the canvas overlay spec, motion and the accessibility checklist.

## In one paragraph

*Pattern paper by day, cutting mat by night.* Four workshop materials carry the system: kraft pattern paper (light background), the green self-healing cutting mat (primary colour, dark background), blue tailor's chalk (everything the AI proposes) and vermilion waxed thread (everything your hand does). Each origin on the canvas is told by a **line style + a word + a colour**, so provenance survives without colour: AI proposal (dashed), your correction (solid with handles), computed, verified (with a toothed seal), out of date (dotted) and failed.

## Files

| File | Purpose |
|---|---|
| [`design/tokens.css`](../design/tokens.css) | All design tokens (`--cs-*`) for light and dark themes, plus the Google Fonts import (Bricolage Grotesque, Instrument Sans, JetBrains Mono) |
| [`design/components.css`](../design/components.css) | Framework-agnostic components (`.cs-*`) and the signature keyframes |
| [`design/preview.html`](../design/preview.html) | Living style guide; open it in a browser, toggle the theme (or add `?theme=dark`) |
| `design/logo-*.svg` | Mark and wordmark in colour, reverse (dark surfaces) and mono (`currentColor`) |
| [`design/screenshots/`](../design/screenshots/) | Style guide captures at 390 px and 1280 px, both themes |
| [`design/ux/UX-REDESIGN.md`](../design/ux/UX-REDESIGN.md) | The workspace redesign: step rail, checklist, menus, sheets |
| [`design/ux/prototype.html`](../design/ux/prototype.html), [`design/ux/ux.css`](../design/ux/ux.css) | Static prototype of the redesigned workspace and its styles |

The app uses its own copies of the tokens and components in `src/brand/` (`tokens.css`, `components.css`), loaded by `src/styles.css`; the redesign's workspace styles are in `src/ux.css`. When you change a token, update both `design/` and `src/brand/`.

## Key tokens

| Token | Value | Use |
|---|---|---|
| `--cs-bg` | `#F4EFE6` light · `#0F1A15` dark | page background |
| `--cs-primary` | `#1E5A43` light · `#5BD69A` dark | primary actions, verified state |
| `--cs-chalk-700` | `#2A4FB8` | tailor's-chalk blue: AI proposals, focus ring |
| `--cs-thread-500` | `#D9481C` | waxed-thread vermilion: the human hand (decorative and large sizes only) |
| `--cs-piece-a…f` | `#F5B800`, `#4FC3F7`, `#F2609E`, `#1FB5A0`, `#A07CFF`, `#B5E61D` | piece fills, always paired with a pattern and a letter |

Canvas overlays are theme-independent and drawn as tri-strokes (white halo, dark casing, colour core) so they read on any photo. Details in [DESIGN.md §7](../design/DESIGN.md#7-canvas-overlay-spec-svg-stage).
