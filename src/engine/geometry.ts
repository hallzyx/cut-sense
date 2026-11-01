/**
 * Pure geometry utilities (no DOM). They run in Node and in the browser.
 *
 * Conventions:
 * - `Ring` is an open ring (it does not repeat the first point). polygon-clipping outputs
 *   do repeat the first point; the area/distance functions tolerate both formats.
 * - Signed area is positive when the ring is counter-clockwise in mathematical axes (y up).
 *   In image coordinates (y down) that looks clockwise; only consistency matters.
 * - Rotation in degrees: x' = cx + dx·cos − dy·sin, y' = cy + dx·sin + dy·cos.
 */
import * as pcNs from 'polygon-clipping';
import type { Pt, Ring } from '../types';

/** Polygon with holes: [outer, ...holes]. */
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export interface BBox { minX: number; minY: number; maxX: number; maxY: number }

/** Length tolerance relative to the problem scale (longest side of the material bbox). */
export const LEN_EPS_REL = 1e-9;
/** Area tolerance relative to scale² (absorbs polygon-clipping rounding at contacts). */
export const AREA_EPS_REL = 1e-8;
/** Relative tolerance for comparing the placed shape with the template shape. */
export const SHAPE_EPS_REL = 1e-6;

interface ClipLib {
  union(geom: MultiPolygon | Polygon, ...geoms: (MultiPolygon | Polygon)[]): MultiPolygon;
  intersection(geom: MultiPolygon | Polygon, ...geoms: (MultiPolygon | Polygon)[]): MultiPolygon;
  difference(geom: MultiPolygon | Polygon, ...geoms: (MultiPolygon | Polygon)[]): MultiPolygon;
}
// polygon-clipping only exports `default` at runtime (ESM and CJS); the types declare names.
const pc: ClipLib = ((pcNs as unknown as { default?: ClipLib }).default ?? (pcNs as unknown as ClipLib));

// ---------------------------------------------------------------- basics

export function signedArea(ring: Ring): number {
  let s = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function ringArea(ring: Ring): number {
  return Math.abs(signedArea(ring));
}

export function bbox(rings: Ring | Ring[]): BBox {
  const list: Ring[] = rings.length > 0 && Array.isArray((rings as Ring[])[0][0]) ? (rings as Ring[]) : [rings as Ring];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of list) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxCenter(b: BBox): Pt {
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}

/** Characteristic scale (longest bbox side, minimum 1) for relative tolerances. */
export function scaleOf(ring: Ring): number {
  if (ring.length === 0) return 1;
  const b = bbox(ring);
  const s = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return Number.isFinite(s) && s > 1 ? s : 1;
}

export function translateRing(ring: Ring, dx: number, dy: number): Ring {
  return ring.map(([x, y]) => [x + dx, y + dy] as Pt);
}

/** Rotates `deg` degrees around `center` (by default, the bbox center). */
export function rotateRing(ring: Ring, deg: number, center?: Pt): Ring {
  const [cx, cy] = center ?? bboxCenter(bbox(ring));
  const a = (deg * Math.PI) / 180;
  // exact values for multiples of 90° (avoids 6e-17 noise)
  const q = ((deg % 360) + 360) % 360;
  const cos = q === 0 ? 1 : q === 90 ? 0 : q === 180 ? -1 : q === 270 ? 0 : Math.cos(a);
  const sin = q === 0 ? 0 : q === 90 ? 1 : q === 180 ? 0 : q === 270 ? -1 : Math.sin(a);
  return ring.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as Pt;
  });
}

/** Rotates around the bbox center and translates so the bbox minimum corner lands on (x, y). */
export function placeShape(shape: Ring, deg: number, x = 0, y = 0): Ring {
  const r = rotateRing(shape, deg);
  const b = bbox(r);
  return translateRing(r, x - b.minX, y - b.minY);
}

export function centroid(ring: Ring): Pt {
  const a = signedArea(ring);
  const n = ring.length;
  if (Math.abs(a) < 1e-300 || n === 0) {
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return n ? [sx / n, sy / n] : [0, 0];
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Removes consecutive repeated points (and the explicit closing point if present). */
export function dedupeRing(ring: Ring, eps = 0): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) out.push([p[0], p[1]]);
  }
  while (out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    if (Math.abs(f[0] - l[0]) <= eps && Math.abs(f[1] - l[1]) <= eps) out.pop(); else break;
  }
  return out;
}

/** Returns the ring with positive-area orientation (ccw=true) or negative. */
export function normalizeOrientation(ring: Ring, ccw = true): Ring {
  const a = signedArea(ring);
  return (a >= 0) === ccw ? ring.slice() : ring.slice().reverse();
}

// ---------------------------------------------------------------- segments and points

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

export function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + t * vx - px, dy = ay + t * vy - py;
  return dx * dx + dy * dy;
}

/** Squared minimum distance between segments AB and CD (0 if they cross or touch). */
export function segSegDist2(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number {
  const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
  // proper crossing; contacts/collinearities are covered by the point-segment distances (= 0)
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return 0;
  return Math.min(
    pointSegDist2(ax, ay, cx, cy, dx, dy), pointSegDist2(bx, by, cx, cy, dx, dy),
    pointSegDist2(cx, cy, ax, ay, bx, by), pointSegDist2(dx, dy, ax, ay, bx, by),
  );
}

export function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  return Math.sqrt(segSegDist2(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]));
}

/** Point in ring (even-odd rule). Points exactly on the edge: undefined result. */
export function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Minimum distance between the outlines (edges) of two rings. */
export function boundaryDistance(a: Ring, b: Ring): number {
  let best = Infinity;
  const na = a.length, nb = b.length;
  for (let i = 0; i < na; i++) {
    const p = a[i], q = a[(i + 1) % na];
    for (let j = 0; j < nb; j++) {
      const r = b[j], s = b[(j + 1) % nb];
      const d = segSegDist2(p[0], p[1], q[0], q[1], r[0], r[1], s[0], s[1]);
      if (d < best) { best = d; if (best === 0) return 0; }
    }
  }
  return Math.sqrt(best);
}

/** Minimum distance between two simple polygons (0 if they touch, overlap or one contains the other). */
export function polygonDistance(a: Ring, b: Ring): number {
  const d = boundaryDistance(a, b);
  if (d === 0) return 0;
  if (pointInRing(a[0][0], a[0][1], b) || pointInRing(b[0][0], b[0][1], a)) return 0;
  return d;
}

/** Is it a simple polygon (no self-intersections or spikes) with non-zero area? */
export function isSimple(ring: Ring, eps = 0): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (const [x, y] of ring) if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const eps2 = eps * eps;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], c = ring[(i + 2) % n];
    if (a[0] === b[0] && a[1] === b[1]) return false; // repeated vertex
    // spike: adjacent collinear edges that double back
    const cr = orient(a[0], a[1], b[0], b[1], c[0], c[1]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(cr) <= eps2 && dot < 0) return false;
  }
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      const c = ring[j], d = ring[(j + 1) % n];
      if (segSegDist2(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]) <= eps2) return false;
    }
  }
  return Math.abs(signedArea(ring)) > 0;
}

/** Douglas-Peucker simplification of a closed ring. Always returns >= 3 points if the input has them. */
export function simplifyDP(ring: Ring, tolerance: number): Ring {
  const pts = dedupeRing(ring);
  const n = pts.length;
  if (n <= 3 || tolerance <= 0) return pts;
  // anchor: point 0 and the point farthest from it
  let far = 0, farD = -1;
  for (let i = 1; i < n; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[far] = 1;
  const tol2 = tolerance * tolerance;
  const stack: [number, number][] = [[0, far], [far, n]]; // index n ≡ 0
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const A = pts[s % n], B = pts[e % n];
    let idx = -1, md = -1;
    for (let i = s + 1; i < e; i++) {
      const d = pointSegDist2(pts[i][0], pts[i][1], A[0], A[1], B[0], B[1]);
      if (d > md) { md = d; idx = i; }
    }
    if (idx >= 0 && md > tol2) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  let out = pts.filter((_, i) => keep[i]);
  if (out.length < 3) {
    // guarantee a triangle: add the point farthest from the chord
    let idx = -1, md = -1;
    for (let i = 0; i < n; i++) {
      if (keep[i]) continue;
      const d = pointSegDist2(pts[i][0], pts[i][1], pts[0][0], pts[0][1], pts[far][0], pts[far][1]);
      if (d > md) { md = d; idx = i; }
    }
    if (idx >= 0) keep[idx] = 1;
    out = pts.filter((_, i) => keep[i]);
  }
  return out;
}

// ---------------------------------------------------------------- booleans (polygon-clipping)

export function toPolygon(ring: Ring): Polygon {
  return [ring.map(([x, y]) => [x, y] as Pt)];
}

export function multiArea(mp: MultiPolygon): number {
  let a = 0;
  for (const poly of mp) {
    poly.forEach((r, i) => { a += i === 0 ? ringArea(r) : -ringArea(r); });
  }
  return Math.max(0, a);
}

export function union(...geoms: (Ring | MultiPolygon)[]): MultiPolygon {
  const gs = geoms.map(asGeom).filter((g) => g.length > 0);
  if (gs.length === 0) return [];
  return pc.union(gs[0], ...gs.slice(1));
}

export function intersection(a: Ring | MultiPolygon, ...others: (Ring | MultiPolygon)[]): MultiPolygon {
  const ga = asGeom(a);
  const gs = others.map(asGeom);
  if (ga.length === 0 || gs.some((g) => g.length === 0)) return [];
  return pc.intersection(ga, ...gs);
}

export function difference(a: Ring | MultiPolygon, ...others: (Ring | MultiPolygon)[]): MultiPolygon {
  const ga = asGeom(a);
  if (ga.length === 0) return [];
  const gs = others.map(asGeom).filter((g) => g.length > 0);
  if (gs.length === 0) return pc.union(ga);
  return pc.difference(ga, ...gs);
}

function isRing(g: Ring | MultiPolygon): g is Ring {
  return g.length > 0 && typeof (g as Ring)[0][0] === 'number';
}

function asGeom(g: Ring | MultiPolygon): MultiPolygon {
  if (g.length === 0) return [];
  return isRing(g) ? (g.length >= 3 ? [toPolygon(g)] : []) : g;
}

/** All rings (outer rings and holes) of a multipolygon. */
export function multiRings(mp: MultiPolygon): Ring[] {
  return mp.flatMap((p) => p.map((r) => dedupeRing(r)));
}

// ---------------------------------------------------------------- offset / buffer

/** Regular polygon circumscribing a circle of radius r (conservative approximation). */
export function circlePolygon(cx: number, cy: number, r: number, segments = 12): Ring {
  const R = r / Math.cos(Math.PI / segments);
  const out: Ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return out;
}

/** Strip of width 2r around the outline (union of per-edge rectangles + per-vertex discs). */
function boundaryStrip(ring: Ring, r: number, segments: number): Polygon[] {
  const out: Polygon[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    out.push([circlePolygon(p[0], p[1], r, segments)]);
    if (len === 0) continue;
    const nx = (-dy / len) * r, ny = (dx / len) * r;
    out.push([[[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]]]);
  }
  return out;
}

/**
 * Buffer with rounded joins (Minkowski sum with a circumscribed polygonal disc).
 * d > 0 inflates, d < 0 shrinks. Robust for concave polygons; the result may have several parts.
 * The approximation is conservative: it inflates slightly more / shrinks slightly more than the exact disc.
 */
export function bufferRing(ring: Ring, d: number, segments = 12): MultiPolygon {
  const base = dedupeRing(ring);
  if (base.length < 3) return [];
  if (d === 0) return pc.union([base]);
  const strip = boundaryStrip(base, Math.abs(d), segments);
  if (d > 0) return pc.union([base], ...strip);
  return pc.difference([base], ...strip);
}

/**
 * Fast miter offset of a simple ring. d > 0 outwards.
 * Corners whose miter exceeds `miterLimit·|d|` are trimmed (approximate bevel).
 * Suitable for small offsets relative to the edge size; it does not remove loops
 * if the offset is larger than the concave features (use `bufferRing` for that).
 */
export function offsetRingMiter(ring: Ring, d: number, miterLimit = 4): Ring {
  const pts = normalizeOrientation(dedupeRing(ring), true);
  const n = pts.length;
  if (n < 3 || d === 0) return pts;
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    // outward normals (positive area ⇒ exterior on the right of the travel direction)
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    const n1: Pt = [(b[1] - a[1]) / l1, -(b[0] - a[0]) / l1];
    const n2: Pt = [(c[1] - b[1]) / l2, -(c[0] - b[0]) / l2];
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-12) { out.push([b[0] + n1[0] * d, b[1] + n1[1] * d]); continue; }
    mx /= ml; my /= ml;
    const cosHalf = mx * n1[0] + my * n1[1];
    let k = d / Math.max(cosHalf, 1e-12);
    if (Math.abs(k) > miterLimit * Math.abs(d)) k = Math.sign(k) * miterLimit * Math.abs(d);
    out.push([b[0] + mx * k, b[1] + my * k]);
  }
  return out;
}
