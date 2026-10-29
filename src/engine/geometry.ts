/**
 * Utilidades geométricas puras (sin DOM). Corren en Node y navegador.
 *
 * Convenciones:
 * - `Ring` es un anillo abierto (no repite el primer punto). Las salidas de polygon-clipping
 *   sí repiten el primer punto; las funciones de área/distancia toleran ambos formatos.
 * - El área con signo es positiva cuando el anillo es antihorario en ejes matemáticos (y hacia arriba).
 *   En coordenadas de imagen (y hacia abajo) eso se ve horario; solo importa la consistencia.
 * - Rotación en grados: x' = cx + dx·cos − dy·sin, y' = cy + dx·sin + dy·cos.
 */
import * as pcNs from 'polygon-clipping';
import type { Pt, Ring } from '../types';

/** Polígono con agujeros: [exterior, ...agujeros]. */
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export interface BBox { minX: number; minY: number; maxX: number; maxY: number }

/** Tolerancia de longitud relativa a la escala del problema (lado mayor del bbox del material). */
export const LEN_EPS_REL = 1e-9;
/** Tolerancia de área relativa a escala² (absorbe el redondeo de polygon-clipping en contactos). */
export const AREA_EPS_REL = 1e-8;
/** Tolerancia relativa para comparar la forma colocada con la de la plantilla. */
export const SHAPE_EPS_REL = 1e-6;

interface ClipLib {
  union(geom: MultiPolygon | Polygon, ...geoms: (MultiPolygon | Polygon)[]): MultiPolygon;
  intersection(geom: MultiPolygon | Polygon, ...geoms: (MultiPolygon | Polygon)[]): MultiPolygon;
  difference(geom: MultiPolygon | Polygon, ...geoms: (MultiPolygon | Polygon)[]): MultiPolygon;
}
// polygon-clipping solo exporta `default` en tiempo de ejecución (ESM y CJS); los tipos declaran nombres.
const pc: ClipLib = ((pcNs as unknown as { default?: ClipLib }).default ?? (pcNs as unknown as ClipLib));

// ---------------------------------------------------------------- básicos

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

/** Escala característica (lado mayor del bbox, mínimo 1) para tolerancias relativas. */
export function scaleOf(ring: Ring): number {
  if (ring.length === 0) return 1;
  const b = bbox(ring);
  const s = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  return Number.isFinite(s) && s > 1 ? s : 1;
}

export function translateRing(ring: Ring, dx: number, dy: number): Ring {
  return ring.map(([x, y]) => [x + dx, y + dy] as Pt);
}

/** Rota `deg` grados alrededor de `center` (por defecto, el centro del bbox). */
export function rotateRing(ring: Ring, deg: number, center?: Pt): Ring {
  const [cx, cy] = center ?? bboxCenter(bbox(ring));
  const a = (deg * Math.PI) / 180;
  // valores exactos para múltiplos de 90° (evita ruido 6e-17)
  const q = ((deg % 360) + 360) % 360;
  const cos = q === 0 ? 1 : q === 90 ? 0 : q === 180 ? -1 : q === 270 ? 0 : Math.cos(a);
  const sin = q === 0 ? 0 : q === 90 ? 1 : q === 180 ? 0 : q === 270 ? -1 : Math.sin(a);
  return ring.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as Pt;
  });
}

/** Rota alrededor del centro del bbox y traslada para que la esquina mínima del bbox quede en (x, y). */
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

/** Quita puntos consecutivos repetidos (y el cierre explícito si existe). */
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

/** Devuelve el anillo con orientación de área positiva (ccw=true) o negativa. */
export function normalizeOrientation(ring: Ring, ccw = true): Ring {
  const a = signedArea(ring);
  return (a >= 0) === ccw ? ring.slice() : ring.slice().reverse();
}

// ---------------------------------------------------------------- segmentos y puntos

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

/** Cuadrado de la distancia mínima entre los segmentos AB y CD (0 si se cruzan o tocan). */
export function segSegDist2(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number {
  const o1 = orient(ax, ay, bx, by, cx, cy), o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay), o4 = orient(cx, cy, dx, dy, bx, by);
  // cruce propio; los contactos/colinealidades quedan cubiertos por las distancias punto-segmento (= 0)
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return 0;
  return Math.min(
    pointSegDist2(ax, ay, cx, cy, dx, dy), pointSegDist2(bx, by, cx, cy, dx, dy),
    pointSegDist2(cx, cy, ax, ay, bx, by), pointSegDist2(dx, dy, ax, ay, bx, by),
  );
}

export function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  return Math.sqrt(segSegDist2(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]));
}

/** Punto en anillo (regla par-impar). Puntos exactamente en el borde: resultado indefinido. */
export function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distancia mínima entre los contornos (bordes) de dos anillos. */
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

/** Distancia mínima entre dos polígonos simples (0 si se tocan, se solapan o uno contiene al otro). */
export function polygonDistance(a: Ring, b: Ring): number {
  const d = boundaryDistance(a, b);
  if (d === 0) return 0;
  if (pointInRing(a[0][0], a[0][1], b) || pointInRing(b[0][0], b[0][1], a)) return 0;
  return d;
}

/** ¿Es un polígono simple (sin autointersecciones ni espigas) con área no nula? */
export function isSimple(ring: Ring, eps = 0): boolean {
  const n = ring.length;
  if (n < 3) return false;
  for (const [x, y] of ring) if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const eps2 = eps * eps;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], c = ring[(i + 2) % n];
    if (a[0] === b[0] && a[1] === b[1]) return false; // vértice repetido
    // espiga: aristas adyacentes colineales que retroceden
    const cr = orient(a[0], a[1], b[0], b[1], c[0], c[1]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(cr) <= eps2 && dot < 0) return false;
  }
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adyacentes por el cierre
      const c = ring[j], d = ring[(j + 1) % n];
      if (segSegDist2(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]) <= eps2) return false;
    }
  }
  return Math.abs(signedArea(ring)) > 0;
}

/** Simplificación Douglas-Peucker de un anillo cerrado. Siempre devuelve >= 3 puntos si la entrada los tiene. */
export function simplifyDP(ring: Ring, tolerance: number): Ring {
  const pts = dedupeRing(ring);
  const n = pts.length;
  if (n <= 3 || tolerance <= 0) return pts;
  // ancla: punto 0 y el más lejano a él
  let far = 0, farD = -1;
  for (let i = 1; i < n; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[far] = 1;
  const tol2 = tolerance * tolerance;
  const stack: [number, number][] = [[0, far], [far, n]]; // índice n ≡ 0
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
    // garantiza un triángulo: añade el punto más alejado de la cuerda
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

// ---------------------------------------------------------------- booleanas (polygon-clipping)

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

/** Todos los anillos (exteriores y agujeros) de un multipolígono. */
export function multiRings(mp: MultiPolygon): Ring[] {
  return mp.flatMap((p) => p.map((r) => dedupeRing(r)));
}

// ---------------------------------------------------------------- offset / buffer

/** Polígono regular que circunscribe un círculo de radio r (aproximación conservadora). */
export function circlePolygon(cx: number, cy: number, r: number, segments = 12): Ring {
  const R = r / Math.cos(Math.PI / segments);
  const out: Ring = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return out;
}

/** Franja de anchura 2r alrededor del contorno (unión de rectángulos por arista + discos por vértice). */
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
 * Buffer con uniones redondeadas (suma de Minkowski con un disco poligonal circunscrito).
 * d > 0 infla, d < 0 encoge. Robusto para polígonos cóncavos; el resultado puede tener varias partes.
 * La aproximación es conservadora: infla un poco más / encoge un poco más que el disco exacto.
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
 * Offset rápido por inglete (miter) de un anillo simple. d > 0 hacia fuera.
 * Las esquinas cuyo inglete supere `miterLimit·|d|` se recortan (bisel aproximado).
 * Adecuado para offsets pequeños frente al tamaño de las aristas; no elimina bucles
 * si el offset es mayor que los rasgos cóncavos (para eso, usar `bufferRing`).
 */
export function offsetRingMiter(ring: Ring, d: number, miterLimit = 4): Ring {
  const pts = normalizeOrientation(dedupeRing(ring), true);
  const n = pts.length;
  if (n < 3 || d === 0) return pts;
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    // normales exteriores (área positiva ⇒ exterior a la derecha de la dirección de avance)
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
