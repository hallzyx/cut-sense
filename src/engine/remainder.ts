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
import { dedupeRing, difference, multiArea, normalizeOrientation, ringArea, union } from './geometry';

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

/** Turns a fragment into reusable material: the outer ring is the material and the holes are defects. */
export function fragmentAsMaterial(f: Fragment): { material: Ring; defects: Ring[] } {
  return { material: f.outer.map(([x, y]) => [x, y]), defects: f.holes.map((h) => h.map(([x, y]) => [x, y])) };
}
