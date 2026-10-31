import type { Ring } from '../types';
import { bbox, ringProblem } from './poly';

/** Lleva un anillo cualquiera a [0,1]² y devuelve la proporción alto/ancho original. */
export function normalizeRing(r: Ring): { shape: Ring; aspect: number } {
  const b = bbox(r);
  const w = b.w || 1, h = b.h || 1;
  return { shape: r.map(([x, y]) => [(x - b.x0) / w, (y - b.y0) / h]), aspect: h / w };
}

/** Mensaje si la forma no sirve como pieza (cruces, área nula, demasiado pequeña). */
export function customShapeProblem(r: Ring): string | null {
  if (r.length < 3) return 'La pieza necesita al menos 3 puntos.';
  const b = bbox(r);
  if (b.w <= 0 || b.h <= 0 || Math.min(b.w, b.h) / Math.max(b.w, b.h) < 0.02) return 'La forma es demasiado delgada o plana.';
  const { shape } = normalizeRing(r);
  return ringProblem(shape.map(([x, y]) => [x * 1000, y * 1000]));
}
