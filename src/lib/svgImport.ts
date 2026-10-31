import type { Pt, Ring } from '../types';
import { absArea, bbox, simplifyRing } from './poly';

const NS = 'http://www.w3.org/2000/svg';
const SELECTOR = 'path,polygon,polyline,rect,circle,ellipse';
const MAX_VERTICES = 120;

export interface SvgPiece {
  ring: Ring;
  /** Formas encontradas en el archivo (se usa la de mayor área). */
  found: number;
  /** Ancho real de la forma en mm, según width/viewBox del SVG (1 px = 1/96 pulgada si no declara unidades). */
  widthMm: number;
}

function sample(el: SVGGeometryElement): Ring {
  const tag = el.tagName.toLowerCase();
  if (tag === 'polygon' || tag === 'polyline') {
    const pts = (el as unknown as SVGPolygonElement).points;
    return Array.from({ length: pts.numberOfItems }, (_, i) => [pts.getItem(i).x, pts.getItem(i).y] as Pt);
  }
  if (tag === 'rect') {
    const g = el as unknown as SVGRectElement;
    const [rx, ry, w, h] = [g.x.baseVal.value, g.y.baseVal.value, g.width.baseVal.value, g.height.baseVal.value];
    return [[rx, ry], [rx + w, ry], [rx + w, ry + h], [rx, ry + h]];
  }
  const len = el.getTotalLength();
  if (!(len > 0)) return [];
  const n = Math.min(800, Math.max(64, Math.round(len / 1.5)));
  return Array.from({ length: n }, (_, i) => {
    const p = el.getPointAtLength((i / n) * len);
    return [p.x, p.y] as Pt;
  });
}

/** Un `<path>` con varios subtrazados se divide: se usa el de mayor área (los huecos se ignoran). */
function subpaths(d: string): string[] {
  return d.split(/(?=[Mm])/).map((s) => s.trim()).filter(Boolean);
}

function cleanup(r: Ring): Ring {
  const out: Ring = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
  const b = bbox(out);
  let eps = Math.hypot(b.w, b.h) * 0.002;
  let s = simplifyRing(out, eps);
  while (s.length > MAX_VERTICES) { eps *= 1.5; s = simplifyRing(out, eps); }
  return s;
}

const MM: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };

/** Milímetros por unidad de usuario del SVG, a partir de width y viewBox del elemento raíz. */
function mmPerUserUnit(svg: Element): number {
  const m = /^\s*([\d.]+)\s*([a-z%]*)\s*$/i.exec(svg.getAttribute('width') ?? '');
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const unit = m ? m[2].toLowerCase() : '';
  if (m && unit !== '%' && unit in MM && vb.length === 4 && vb[2] > 0) return (Number(m[1]) * MM[unit]) / vb[2];
  return MM.px;
}

/** Extrae el contorno exterior de la forma más grande de un SVG (solo navegador). */
export function ringFromSvg(text: string): SvgPiece {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('El archivo no es un SVG válido.');
  const host = document.createElementNS(NS, 'svg');
  host.setAttribute('style', 'position:absolute;left:-9999px;top:0;width:0;height:0;visibility:hidden');
  document.body.appendChild(host);
  try {
    const cands: Ring[] = [];
    doc.querySelectorAll(SELECTOR).forEach((src) => {
      if (src.closest('defs,clipPath,mask,symbol,pattern,marker')) return;
      const ds = src.tagName.toLowerCase() === 'path' ? subpaths(src.getAttribute('d') ?? '') : [null];
      for (const d of ds) {
        const el = document.importNode(src, false) as SVGGeometryElement;
        if (d !== null) el.setAttribute('d', d);
        el.removeAttribute('transform');
        host.appendChild(el);
        try {
          const r = cleanup(sample(el));
          if (r.length >= 3 && absArea(r) > 0) cands.push(r);
        } catch { /* elemento no medible */ }
        host.removeChild(el);
      }
    });
    if (!cands.length) throw new Error('No encontré ninguna forma cerrada (path, polygon, rect, circle o ellipse) en el SVG.');
    const ring = cands.reduce((a, b) => (absArea(b) > absArea(a) ? b : a));
    return { ring, found: cands.length, widthMm: bbox(ring).w * mmPerUserUnit(doc.documentElement) };
  } finally {
    document.body.removeChild(host);
  }
}
