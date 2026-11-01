import type { Pt, Ring } from '../types';
import { allDefs, kitQtyFor, pieceLabel, type Project, type Result } from '../state';
import { bbox, ringPath } from './poly';

/** Full-scale (1:1) plan: SVG in centimeters and printable sheets with assembly marks. */

export const PAPERS = { A4: { label: 'A4', w: 21, h: 29.7 }, Carta: { label: 'Letter', w: 21.59, h: 27.94 } } as const;
export type PaperKey = keyof typeof PAPERS;

const MARGIN = 1; // cm margin of the plan and of the page
const OVERLAP = 1; // cm of overlap between sheets
const letter = (i: number) => String.fromCharCode(65 + i);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** Photo pixels per centimeter, or null if the calibration is not physical (cm/mm). */
export function pxPerCm(r: Pick<Result, 'ppu' | 'unit' | 'calibrated'>): number | null {
  if (!r.calibrated) return null;
  const u = r.unit.trim().toLowerCase();
  return u === 'cm' ? r.ppu : u === 'mm' ? r.ppu * 10 : null;
}

interface CmPiece { ring: Ring; label: string; tpl: number }
export interface PlanCm {
  w: number;
  h: number;
  material: Ring;
  defects: Ring[];
  pieces: CmPiece[];
  k: number;
}

export function planInCm(p: Project, r: Result): PlanCm | null {
  const k = pxPerCm(r);
  if (!k) return null;
  const b = bbox(p.contour);
  const cm = (q: Pt): Pt => [(q[0] - b.x0) / k + MARGIN, (q[1] - b.y0) / k + MARGIN];
  const pieces = r.solution.placements.map((pl) => {
    const tpl = allDefs(p, r).findIndex((d) => d.id === pl.templateId);
    return { ring: pl.polygon.map(cm), label: pieceLabel(tpl, pl.instance, kitQtyFor(r, pl.templateId)), tpl };
  });
  return { w: b.w / k + 2 * MARGIN, h: b.h / k + 2 * MARGIN, material: p.contour.map(cm), defects: p.defects.map((d) => d.map(cm)), pieces, k };
}

const PAT_SHAPES = [
  '',
  '<path d="M0,.6 L.6,0" stroke="#000" stroke-width=".05"/>',
  '<circle cx=".3" cy=".3" r=".07" fill="#000"/>',
  '<path d="M0,0 L.6,.6 M.6,0 L0,.6" stroke="#000" stroke-width=".04"/>',
  '<path d="M0,.3 H.6" stroke="#000" stroke-width=".05"/>',
  '<path d="M.3,0 V.6" stroke="#000" stroke-width=".05"/>',
];

function defsMarkup(count: number) {
  const pats = Array.from({ length: Math.max(count, 1) }, (_, i) =>
    `<pattern id="pp${i}" width=".6" height=".6" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff"/>${PAT_SHAPES[i % PAT_SHAPES.length]}</pattern>`).join('');
  return `<defs>${pats}<pattern id="pd" width=".6" height=".6" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff"/><path d="M-.1,.5 L.5,-.1 M.1,.7 L.7,.1" stroke="#c4140b" stroke-width=".09"/></pattern></defs>`;
}

function bodyMarkup(plan: PlanCm) {
  const centre = (r: Ring) => [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length];
  return [
    `<path d="${ringPath(plan.material)}" fill="none" stroke="#000" stroke-width=".06" stroke-dasharray=".4 .25"/>`,
    ...plan.defects.map((d) => `<path d="${ringPath(d)}" fill="url(#pd)" stroke="#c4140b" stroke-width=".05"/>`),
    ...plan.pieces.map((pc) => {
      const [cx, cy] = centre(pc.ring);
      return `<path d="${ringPath(pc.ring)}" fill="url(#pp${pc.tpl})" stroke="#000" stroke-width=".07" stroke-linejoin="round"/>` +
        `<text x="${n(cx)}" y="${n(cy)}" text-anchor="middle" dominant-baseline="central" font-size=".8" font-weight="700" stroke="#fff" stroke-width=".25" paint-order="stroke" font-family="Arial, sans-serif">${pc.label}</text>`;
    }),
  ].join('');
}

/** 5 cm square and 10 cm ruler to check the scale after printing. */
function scaleCheck(x: number, y: number) {
  return `<g font-family="Arial, sans-serif" font-size=".45">` +
    `<rect x="${n(x)}" y="${n(y)}" width="5" height="5" fill="none" stroke="#000" stroke-width=".05"/>` +
    `<text x="${n(x + 2.5)}" y="${n(y + 2.5)}" text-anchor="middle">5 × 5 cm</text>` +
    `<path d="M${n(x + 6)},${n(y + 5)} h10 M${n(x + 6)},${n(y + 4.6)} v.8 M${n(x + 16)},${n(y + 4.6)} v.8" stroke="#000" stroke-width=".05"/>` +
    `<text x="${n(x + 11)}" y="${n(y + 4.2)}" text-anchor="middle">10 cm</text></g>`;
}

const FOOTER_H = 6.5;

/** Single SVG in centimeters (width/height with units): it prints or opens at full scale. */
export function buildPlanSvgCm(p: Project, r: Result): { svg: string; wCm: number; hCm: number } {
  const plan = planInCm(p, r);
  if (!plan) throw new Error('The full-scale plan needs a calibration in cm or mm.');
  const W = Math.max(plan.w, 17.5), H = plan.h + FOOTER_H;
  const m = r.solution.metrics;
  const legend = allDefs(p, r).map((d, i) => `<text x="${MARGIN}" y="${n(plan.h + 0.6 + i * 0.6)}" font-size=".45">${letter(i)} — ${esc(d.name)}: ${m.placed[d.id] ?? 0}/${m.requested[d.id] ?? d.qty} (${n(d.w)}×${n(d.h)} ${esc(r.unit)})</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}cm" height="${n(H)}cm" viewBox="0 0 ${n(W)} ${n(H)}" font-family="Arial, sans-serif">
<title>CutSense — 1:1 scale plan</title>
${defsMarkup(allDefs(p, r).length)}
<rect width="${n(W)}" height="${n(H)}" fill="#fff"/>
${bodyMarkup(plan)}
<g>${legend}</g>
${scaleCheck(MARGIN, plan.h + 0.6 + allDefs(p, r).length * 0.6)}
<text x="${MARGIN}" y="${n(H - 0.4)}" font-size=".4" fill="#444">REFERENCE PLAN at 1:1 scale (1 unit = 1 cm). Check the 5 cm square when printing. Not a certified instruction for machinery.</text>
</svg>`;
  return { svg, wCm: W, hCm: H };
}

export interface TileLayout { orientation: 'portrait' | 'landscape'; pw: number; ph: number; cols: number; rows: number; stepX: number; stepY: number }

/** Splits the plan into overlapping sheets; picks the orientation that uses fewer sheets. */
export function layoutTiles(planW: number, planH: number, paper: PaperKey): TileLayout {
  const P = PAPERS[paper];
  const opt = (orientation: 'portrait' | 'landscape'): TileLayout => {
    const [pageW, pageH] = orientation === 'portrait' ? [P.w, P.h] : [P.h, P.w];
    const pw = pageW - 2 * MARGIN, ph = pageH - 2 * MARGIN;
    const count = (len: number, size: number) => (len <= size ? 1 : Math.ceil((len - OVERLAP) / (size - OVERLAP)));
    return { orientation, pw, ph, cols: count(planW, pw), rows: count(planH, ph), stepX: pw - OVERLAP, stepY: ph - OVERLAP };
  };
  const a = opt('portrait'), b = opt('landscape');
  return b.cols * b.rows < a.cols * a.rows ? b : a;
}

/** Print-ready HTML document: instructions, 1:1 plan sheets and a template for each piece. */
export function buildPrintHtml(p: Project, r: Result, paper: PaperKey): string {
  const plan = planInCm(p, r);
  if (!plan) throw new Error('The full-scale plan needs a calibration in cm or mm.');
  const P = PAPERS[paper];
  const L = layoutTiles(plan.w, plan.h, paper);
  const [pageW, pageH] = L.orientation === 'portrait' ? [P.w, P.h] : [P.h, P.w];
  const defs = defsMarkup(allDefs(p, r).length);
  const body = bodyMarkup(plan);
  const total = L.cols * L.rows;
  const m = r.solution.metrics;

  const tiles: string[] = [];
  for (let row = 0; row < L.rows; row++) {
    for (let col = 0; col < L.cols; col++) {
      const x0 = col * L.stepX, y0 = row * L.stepY;
      const marks = ([[x0, y0, 1, 1], [x0 + L.pw, y0, -1, 1], [x0, y0 + L.ph, 1, -1], [x0 + L.pw, y0 + L.ph, -1, -1]] as const)
        .map(([x, y, sx, sy]) => `<path d="M${n(x)},${n(y)} h${sx} M${n(x)},${n(y)} v${sy}" stroke="#000" stroke-width=".05"/>`).join('');
      tiles.push(`<section class="page"><svg width="${n(L.pw)}cm" height="${n(L.ph)}cm" viewBox="${n(x0)} ${n(y0)} ${n(L.pw)} ${n(L.ph)}" style="position:absolute;left:${MARGIN}cm;top:${MARGIN}cm;overflow:hidden">${defs}${body}${marks}</svg>
<div class="tag">Sheet ${row * L.cols + col + 1} of ${total} · row ${row + 1}/${L.rows}, column ${col + 1}/${L.cols} · ${L.cols > 1 || L.rows > 1 ? `${OVERLAP} cm overlap: line up the drawing in the overlap zone` : 'full plan'}</div></section>`);
    }
  }

  const tplBlocks = allDefs(p, r).map((d, i) => {
    const t = r.problem.templates[i];
    const placed = m.placed[d.id] ?? 0;
    if (!t || !placed) return '';
    const b = bbox(t.shape);
    const w = b.w / plan.k, h = b.h / plan.k;
    const ring = t.shape.map(([x, y]) => [(x - b.x0) / plan.k + 0.2, (y - b.y0) / plan.k + 0.2] as Pt);
    const fits = Math.min(w, h) + 0.4 <= Math.min(L.pw, L.ph) && Math.max(w, h) + 0.4 <= Math.max(L.pw, L.ph);
    return `<div class="tpl"><svg width="${n(w + 0.4)}cm" height="${n(h + 0.4)}cm" viewBox="0 0 ${n(w + 0.4)} ${n(h + 0.4)}">${defs}<path d="${ringPath(ring)}" fill="url(#pp${i})" stroke="#000" stroke-width=".07" stroke-linejoin="round"/></svg>
<p><b>${letter(i)} · ${esc(d.name)}</b> — cut ${placed} · ${n(w)} × ${n(h)} cm · allowed rotations: ${d.rotations.join('°, ')}°${fits ? '' : ' · <b>does not fit on one sheet: use the full plan</b>'}</p></div>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CutSense — 1:1 print</title>
<style>
@page { size: ${pageW}cm ${pageH}cm; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: Arial, sans-serif; color: #000 }
.page { width: ${pageW}cm; height: ${pageH}cm; position: relative; overflow: hidden; page-break-after: always; break-after: page }
.tag { position: absolute; left: ${MARGIN}cm; bottom: .35cm; font-size: 8pt; color: #333 }
.intro { padding: ${MARGIN}cm; font-size: 10.5pt; line-height: 1.45 }
.intro h1 { font-size: 20pt; margin: 0 0 .3cm }
.intro ol { padding-left: .6cm }
.warn { border: 1px solid #000; padding: .3cm; margin: .4cm 0 }
.tpls { padding: ${MARGIN}cm; font-size: 9pt }
.tpl { break-inside: avoid; margin-bottom: .8cm }
.tpl p { margin: .1cm 0 0 }
@media screen { body { background: #ddd } .page { background: #fff; margin: 12px auto; box-shadow: 0 0 6px #0005 } .intro, .tpls { background: #fff; max-width: ${pageW}cm; margin: 12px auto } }
</style></head><body>
<section class="page intro">
  <h1>CutSense · 1:1 scale plan</h1>
  <p>Material of ${Math.round((plan.w - 2 * MARGIN) * 10) / 10} × ${Math.round((plan.h - 2 * MARGIN) * 10) / 10} cm · ${m.placedCount} of ${m.requestedCount} pieces placed · ${total} ${P.label} sheet${total > 1 ? 's' : ''} (${L.orientation}) + a template per piece.</p>
  <div class="warn"><b>Print at 100%.</b> Turn off "Fit to page" in the print dialog. Measure the square below: it must be 5 × 5 cm and the ruler 10 cm.</div>
  <svg width="17cm" height="5.6cm" viewBox="0 0 17 5.6">${scaleCheck(0.2, 0.2)}</svg>
  <ol>
    <li>Print the plan sheets and join them by lining up the drawing in the ${OVERLAP} cm overlap strip; the corner marks show the usable area of each sheet.</li>
    <li>Lay the plan over the material and mark the pieces, or cut out the templates on the last pages and use them as patterns.</li>
    <li>The dotted outline is the edge of the digitized material; the red hatching marks zones that must not be cut.</li>
  </ol>
  <p style="font-size:9pt;color:#333">Reference plan: accuracy depends on the calibration and on the photo being nearly top-down. Not a certified instruction for machinery. Best solution found by the search (${esc(r.solution.optimizerVersion)}, seed ${r.solution.seed}); not a proven optimum.</p>
</section>
${tiles.join('\n')}
<section class="tpls"><h2 style="margin-top:0">Templates per piece (1:1)</h2>${tplBlocks || '<p>No pieces placed.</p>'}</section>
<script>addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });</script>
</body></html>`;
}
