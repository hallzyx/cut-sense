/**
 * Leftover material after a plan: material − union(defects) − union(pieces), using polygon-clipping.
 *
 * - No buffer is applied for the spacing: the leftover is the literal geometry that remains;
 *   if it is reused as material, the optimizer will impose the spacing at the edge again.
 * - Each polygon of the resulting MultiPolygon is a `Fragment`: outer ring + holes, with no closing
 *   point. Orientation: outer ring with POSITIVE signed area (the `normalizeOrientation(r, true)`
 *   convention from geometry.ts) and holes with NEGATIVE area.
 * - Fragments with area < minAreaFraction · area(material) (0.005 by default) are dropped;
 *   the rest are returned sorted by descending area.
 */
import type { Placement, Problem, Ring } from '../types';
import { bbox, dedupeRing, difference, multiArea, normalizeOrientation, pointInRing, ringArea, scaleOf, union } from './geometry';

export interface Fragment { outer: Ring; holes: Ring[]; area: number }

export interface RemainderResult {
  fragments: Fragment[];
  /** Sum of the areas of the kept fragments. */
  area: number;
  /** Material area (union of its outline). */
  materialArea: number;
}

export const DEFAULT_MIN_AREA_FRACTION = 0.005;

export function computeRemainder(
  problem: Problem,
  placements: Placement[],
  options: { minAreaFraction?: number } = {},
): RemainderResult {
  const material = dedupeRing(problem.material);
  if (material.length < 3) return { fragments: [], area: 0, materialArea: 0 };
  let materialArea: number;
  try { materialArea = multiArea(union(material)); } catch { materialArea = ringArea(material); }

  const cutters: Ring[] = [
    ...problem.defects.map((d) => dedupeRing(d)),
    ...placements.map((p) => dedupeRing(p.polygon)),
  ].filter((r) => r.length >= 3);

  const mp = difference(material, ...cutters);
  const minArea = Math.max(0, options.minAreaFraction ?? DEFAULT_MIN_AREA_FRACTION) * materialArea;

  const fragments: Fragment[] = [];
  for (const poly of mp) {
    if (!poly.length) continue;
    const outer = normalizeOrientation(dedupeRing(poly[0]), true);
    if (outer.length < 3) continue;
    const holes = poly.slice(1).map((h) => normalizeOrientation(dedupeRing(h), false)).filter((h) => h.length >= 3);
    const area = Math.max(0, ringArea(outer) - holes.reduce((s, h) => s + ringArea(h), 0));
    if (area < minArea || area <= 0) continue;
    fragments.push({ outer, holes, area });
  }
  fragments.sort((a, b) => b.area - a.area);
  return { fragments, area: fragments.reduce((s, f) => s + f.area, 0), materialArea };
}

// ---------------------------------------------------------------- raster proxy (optimizer tie-break)

/**
 * Cheap proxy of "how good is the leftover", used by the optimizer to break ties between plans that
 * place the same pieces. The exact `computeRemainder` is not suitable for that: it is slow
 * (polygon clipping) and, with spacing > 0, the gaps between pieces join the whole leftover into a single
 * fragment, so every plan looks alike. Instead, on a raster of cells S/LEFTOVER_RASTER_DIV:
 * blocked = cell center outside the material, in a defect or in a piece; the blocked set is grown
 * by a probe radius r = max(spacing, S/LEFTOVER_PROBE_DIV) (square, separable), and the free cells that remain
 * are split into 4-connected components. `largest` = area of the biggest component (the region a disc of
 * radius ~r can sweep: narrow gaps and slivers do not count as contiguous), `fragments` = components with
 * area ≥ DEFAULT_MIN_AREA_FRACTION · material area. Cost: O(cells) ≈ 66k cells, under a millisecond.
 */
export interface LeftoverScore { largest: number; fragments: number }

export const LEFTOVER_RASTER_DIV = 256;
export const LEFTOVER_PROBE_DIV = 64;

/** Probe radius for a material of scale `S` and the problem spacing. */
export function leftoverProbeRadius(S: number, spacing: number): number {
  return Math.max(Math.max(0, spacing || 0), S / LEFTOVER_PROBE_DIV);
}

/** Scores a raster (1 = blocked) of `nx`×`ny` cells of side `cell`; see `LeftoverScore`. */
export function scoreFreeRaster(blocked: Uint8Array, nx: number, ny: number, cell: number, radius: number, minArea: number): LeftoverScore {
  const k = Math.max(1, Math.ceil(radius / cell));
  const n = nx * ny;
  // grow the blocked set by k cells (out of the raster counts as blocked): rows, then columns
  const h = new Uint8Array(n), g = new Uint8Array(n);
  const pre = new Int32Array(Math.max(nx, ny) + 1);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) pre[i + 1] = pre[i] + blocked[j * nx + i];
    for (let i = 0; i < nx; i++) h[j * nx + i] = i - k < 0 || i + k >= nx || pre[i + k + 1] - pre[i - k] > 0 ? 1 : 0;
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) pre[j + 1] = pre[j] + h[j * nx + i];
    for (let j = 0; j < ny; j++) g[j * nx + i] = j - k < 0 || j + k >= ny || pre[j + k + 1] - pre[j - k] > 0 ? 1 : 0;
  }
  // 4-connected components of the free cells (g is reused as the "visited" mark)
  const stack = new Int32Array(n);
  const ca = cell * cell;
  let largest = 0, fragments = 0;
  for (let s = 0; s < n; s++) {
    if (g[s]) continue;
    let top = 0, size = 0;
    stack[top++] = s;
    g[s] = 1;
    while (top > 0) {
      const c = stack[--top];
      size++;
      const i = c % nx;
      if (i > 0 && !g[c - 1]) { g[c - 1] = 1; stack[top++] = c - 1; }
      if (i < nx - 1 && !g[c + 1]) { g[c + 1] = 1; stack[top++] = c + 1; }
      if (c >= nx && !g[c - nx]) { g[c - nx] = 1; stack[top++] = c - nx; }
      if (c + nx < n && !g[c + nx]) { g[c + nx] = 1; stack[top++] = c + nx; }
    }
    const area = size * ca;
    if (area > largest) largest = area;
    if (area >= minArea) fragments++;
  }
  return { largest, fragments };
}

/** > 0 if `a` is a better leftover than `b`: larger biggest fragment (beyond half a cell), then fewer fragments. */
export function compareLeftover(a: LeftoverScore, b: LeftoverScore, cellArea: number): number {
  if (Math.abs(a.largest - b.largest) > cellArea / 2) return a.largest - b.largest;
  return b.fragments - a.fragments;
}

/**
 * Standalone version of the proxy for a finished plan (the optimizer reuses its own occupancy raster instead).
 * Returns the score and the cell area (comparison tolerance).
 */
export function leftoverScore(problem: Problem, placements: Placement[]): LeftoverScore & { cellArea: number } {
  const material = dedupeRing(problem.material);
  if (material.length < 3) return { largest: 0, fragments: 0, cellArea: 1 };
  const S = scaleOf(material), mb = bbox(material), cell = S / LEFTOVER_RASTER_DIV;
  const nx = Math.ceil((mb.maxX - mb.minX) / cell) + 1, ny = Math.ceil((mb.maxY - mb.minY) / cell) + 1;
  const blocked = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const cy = mb.minY + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) if (!pointInRing(mb.minX + (i + 0.5) * cell, cy, material)) blocked[j * nx + i] = 1;
  }
  const cutters = [...problem.defects, ...placements.map((p) => p.polygon)].map((r) => dedupeRing(r)).filter((r) => r.length >= 3);
  for (const r of cutters) {
    const b = bbox(r);
    const i0 = Math.max(0, Math.floor((b.minX - mb.minX) / cell - 0.5)), i1 = Math.min(nx - 1, Math.ceil((b.maxX - mb.minX) / cell));
    const j0 = Math.max(0, Math.floor((b.minY - mb.minY) / cell - 0.5)), j1 = Math.min(ny - 1, Math.ceil((b.maxY - mb.minY) / cell));
    for (let j = j0; j <= j1; j++) {
      const cy = mb.minY + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) if (pointInRing(mb.minX + (i + 0.5) * cell, cy, r)) blocked[j * nx + i] = 1;
    }
  }
  const minArea = DEFAULT_MIN_AREA_FRACTION * ringArea(material);
  const s = scoreFreeRaster(blocked, nx, ny, cell, leftoverProbeRadius(S, problem.spacing), minArea);
  return { ...s, cellArea: cell * cell };
}

/** Turns a fragment into reusable material: the outer ring is the material and the holes are defects. */
export function fragmentAsMaterial(f: Fragment): { material: Ring; defects: Ring[] } {
  return { material: f.outer.map(([x, y]) => [x, y]), defects: f.holes.map((h) => h.map(([x, y]) => [x, y])) };
}
