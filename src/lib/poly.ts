import type { Pt, Ring } from '../types';

export const signedArea = (r: Ring) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};
export const absArea = (r: Ring) => Math.abs(signedArea(r));

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Devuelve un mensaje si el anillo no es válido (<3 puntos, área nula o autointersección). */
export function ringProblem(r: Ring): string | null {
  if (r.length < 3) return 'Necesita al menos 3 puntos.';
  if (absArea(r) < 1) return 'La región está vacía o es degenerada.';
  const n = r.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segCross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return 'El contorno se cruza a sí mismo.';
    }
  }
  return null;
}

export function pointInRing(p: Pt, r: Ring) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

/** Arista más cercana a p: índice i (i → i+1), distancia y parámetro t. */
export function nearestEdge(p: Pt, r: Ring) {
  let best = { i: 0, d: Infinity, t: 0 };
  for (let i = 0; i < r.length; i++) {
    const { d, t } = distToSeg(p, r[i], r[(i + 1) % r.length]);
    if (d < best.d) best = { i, d, t };
  }
  return best;
}

function dp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let md = -1, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const { d } = distToSeg(pts[i], a, b);
    if (d > md) { md = d; mi = i; }
  }
  if (md <= eps) return [a, b];
  return [...dp(pts.slice(0, mi + 1), eps).slice(0, -1), ...dp(pts.slice(mi), eps)];
}

/** Douglas-Peucker sobre anillo cerrado. */
export function simplifyRing(r: Ring, eps: number): Ring {
  if (r.length < 4) return r;
  let far = 0, fd = -1;
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const h1 = dp(r.slice(0, far + 1), eps);
  const h2 = dp([...r.slice(far), r[0]], eps);
  return [...h1.slice(0, -1), ...h2.slice(0, -1)];
}

export function bbox(r: Ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export const ringPath = (r: Ring) =>
  r.length ? 'M' + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z' : '';

export function circleRing(cx: number, cy: number, rad: number, n = 20): Ring {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as Pt;
  });
}
