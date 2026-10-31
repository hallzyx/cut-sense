import type { Project, Result } from '../state';
import { fmt, calibPx } from '../state';
import { ringPath } from './poly';
import { templateLetter } from '../components/Stage';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const PAT = [
  '', '<path d="M0,8 L8,0" stroke="#000" stroke-opacity=".65" stroke-width="1.6"/>', '<circle cx="4" cy="4" r="1.5" fill="#000" fill-opacity=".65"/>',
  '<path d="M0,0 L8,8 M8,0 L0,8" stroke="#000" stroke-opacity=".65" stroke-width="1.2"/>', '<path d="M0,4 H8" stroke="#000" stroke-opacity=".65" stroke-width="1.6"/>',
  '<path d="M4,0 V8" stroke="#000" stroke-opacity=".65" stroke-width="1.6"/>',
];

/** SVG del estado validado actual. Solo debe invocarse con un resultado vigente y verificado. */
export function buildSvg(p: Project, r: Result, includePhoto: boolean): { svg: string; w: number; h: number } {
  const img = p.image!;
  const legendH = 60 + p.defs.length * 22 + 70;
  const W = img.w, H = img.h + legendH;
  const m = r.solution.metrics;
  const calibNote = r.calibrated
    ? `Calibrado: ${fmt(r.ppu, 3)} px = 1 ${r.unit} (referencia ${fmt(p.calib!.dist)} ${r.unit} = ${fmt(calibPx(p.calib!))} px)`
    : 'Sin calibración: unidades relativas (1 u = 1 % del ancho de la imagen). Medidas no físicas.';
  const defs = p.defs.map((d, i) =>
    `<pattern id="p${i}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${d.color}" fill-opacity=".92"/>${PAT[i % PAT.length]}</pattern>`).join('');
  const pieces = r.solution.placements.map((pl) => {
    const ti = p.defs.findIndex((d) => d.id === pl.templateId);
    const cx = pl.polygon.reduce((s, q) => s + q[0], 0) / pl.polygon.length;
    const cy = pl.polygon.reduce((s, q) => s + q[1], 0) / pl.polygon.length;
    return `<path d="${ringPath(pl.polygon)}" fill="url(#p${ti})" stroke="#000" stroke-width="1.5"/>` +
      `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="700" stroke="#fff" stroke-width="3" paint-order="stroke">${templateLetter(ti)}${pl.instance + 1}</text>`;
  }).join('');
  const legend = p.defs.map((d, i) => {
    const y = img.h + 70 + i * 22;
    return `<rect x="16" y="${y - 12}" width="18" height="14" fill="url(#p${i})" stroke="#000"/><text x="42" y="${y}" font-size="13">${templateLetter(i)} — ${esc(d.name)}: ${m.placed[d.id] ?? 0}/${m.requested[d.id] ?? d.qty} colocadas (${fmt(d.w)}×${fmt(d.h)} ${esc(r.unit)})</text>`;
  }).join('');
  const photo = includePhoto ? `<image href="${img.src}" width="${img.w}" height="${img.h}"/>` : `<rect width="${img.w}" height="${img.h}" fill="#f2f4f5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Instrument Sans, Arial, sans-serif">
<title>CutSense — plano referencial</title>
<defs>${defs}<pattern id="pd" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff" fill-opacity=".55"/><path d="M-1,5 L5,-1 M3,9 L9,3" stroke="#FF3B30" stroke-width="3"/></pattern></defs>
<rect width="${W}" height="${H}" fill="#fff"/>
${photo}
<path d="${ringPath(p.contour)}" fill="#5BD69A" fill-opacity=".1" stroke="#fff" stroke-opacity=".8" stroke-width="5"/><path d="${ringPath(p.contour)}" fill="none" stroke="#0B0F0D" stroke-width="3.5"/><path d="${ringPath(p.contour)}" fill="none" stroke="#5BD69A" stroke-width="2"/>
${p.defects.map((d) => `<path d="${ringPath(d)}" fill="url(#pd)" stroke="#c4140b" stroke-width="1.5" stroke-dasharray="6 3"/>`).join('')}
${pieces}
<rect y="${img.h}" width="${W}" height="${legendH}" fill="#fff"/>
<line x1="0" x2="${W}" y1="${img.h}" y2="${img.h}" stroke="#e5e7eb"/>
<text x="16" y="${img.h + 24}" font-size="15" font-weight="700">PLANO REFERENCIAL — no es una instrucción certificada para maquinaria</text>
<text x="16" y="${img.h + 44}" font-size="12" fill="#555">${esc(calibNote)}</text>
${legend}
<text x="16" y="${H - 30}" font-size="12">Colocadas ${m.placedCount}/${m.requestedCount} · Ocupada/utilizable ${fmt(m.usableUtilization)} % · Ocupada/total ${fmt(m.materialUtilization)} % · Zona excluida (hatch rojo) ${p.defects.length}</text>
<text x="16" y="${H - 12}" font-size="11" fill="#555">Mejor solución hallada por búsqueda heurística (${r.solution.optimizerVersion}, semilla ${r.solution.seed}); verificada geométricamente. No es un óptimo demostrado.</text>
</svg>`;
  return { svg, w: W, h: H };
}

export function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function svgToPng(svg: string, w: number, h: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const im = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('No se pudo renderizar el SVG.'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.drawImage(im, 0, 0, w, h);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG vacío'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
