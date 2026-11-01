/**
 * Material sobrante tras un plan: material − unión(defectos) − unión(piezas), con polygon-clipping.
 *
 * - NO se aplica buffer por la separación (spacing): el sobrante es la geometría literal que queda;
 *   si se reutiliza como material, el optimizador volverá a imponer la separación al borde.
 * - Cada polígono del MultiPolygon resultante es un `Fragment`: anillo exterior + agujeros, sin punto
 *   de cierre. Orientación: exterior con área con signo POSITIVA (convención `normalizeOrientation(r, true)`
 *   de geometry.ts) y agujeros con área NEGATIVA.
 * - Se descartan fragmentos con área < minAreaFraction · área(material) (0.005 por defecto);
 *   se devuelven ordenados por área descendente.
 */
import type { Placement, Problem, Ring } from '../types';
import { dedupeRing, difference, multiArea, normalizeOrientation, ringArea, union } from './geometry';

export interface Fragment { outer: Ring; holes: Ring[]; area: number }

export interface RemainderResult {
  fragments: Fragment[];
  /** Suma de las áreas de los fragmentos conservados. */
  area: number;
  /** Área del material (unión de su contorno). */
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

/** Convierte un fragmento en material reutilizable: el exterior es el material y los agujeros, defectos. */
export function fragmentAsMaterial(f: Fragment): { material: Ring; defects: Ring[] } {
  return { material: f.outer.map(([x, y]) => [x, y]), defects: f.holes.map((h) => h.map(([x, y]) => [x, y])) };
}
