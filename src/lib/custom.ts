import type { Ring } from '../types';
import { bbox, ringProblem } from './poly';

/** Maps any ring to [0,1]² and returns the original height/width ratio. */
export function normalizeRing(r: Ring): { shape: Ring; aspect: number } {
  const b = bbox(r);
  const w = b.w || 1, h = b.h || 1;
  return { shape: r.map(([x, y]) => [(x - b.x0) / w, (y - b.y0) / h]), aspect: h / w };
}

/** Message if the shape is not usable as a piece (crossings, zero area, too small). */
export function customShapeProblem(r: Ring): string | null {
  if (r.length < 3) return 'The piece needs at least 3 points.';
  const b = bbox(r);
  if (b.w <= 0 || b.h <= 0 || Math.min(b.w, b.h) / Math.max(b.w, b.h) < 0.02) return 'The shape is too thin or flat.';
  const { shape } = normalizeRing(r);
  return ringProblem(shape.map(([x, y]) => [x * 1000, y * 1000]));
}
