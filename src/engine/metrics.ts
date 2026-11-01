/**
 * Metrics ALWAYS recomputed from the geometry (never from optimizer counters).
 *
 * Denominators:
 * - totalArea      = area(material)
 * - excludedArea   = area(union(defects) ∩ material)            (no double counting; anything outside does not count)
 * - usableArea     = totalArea − excludedArea
 * - occupiedArea   = area(union(pieces) ∩ (material − defects)) (overlapping or out-of-bounds pieces are not over-counted)
 * - usableUtilization   = 100 · occupiedArea / usableArea   (0 if usableArea = 0)
 * - materialUtilization = 100 · occupiedArea / totalArea    (0 if totalArea = 0)
 * Counts: `placed` counts distinct, valid instances (known templateId, 0 <= instance < qty).
 */
import type { Metrics, Placement, Problem } from '../types';
import { type MultiPolygon, dedupeRing, difference, intersection, multiArea, ringArea, union } from './geometry';

function tryArea(f: () => MultiPolygon, fallback: number): number {
  try { return multiArea(f()); } catch { return fallback; }
}

export function computeMetrics(problem: Problem, placements: Placement[]): Metrics {
  const material = dedupeRing(problem.material);
  const defects = problem.defects.map((d) => dedupeRing(d)).filter((d) => d.length >= 3);
  const totalArea = material.length >= 3 ? tryArea(() => union(material), ringArea(material)) : 0;

  let excludedArea = 0;
  if (defects.length && totalArea > 0) {
    excludedArea = tryArea(() => intersection(material, union(...defects)), 0);
  }
  excludedArea = Math.min(excludedArea, totalArea);
  const usableArea = Math.max(0, totalArea - excludedArea);

  const polys = placements.map((p) => dedupeRing(p.polygon)).filter((r) => r.length >= 3);
  let occupiedArea = 0;
  if (polys.length && usableArea > 0) {
    occupiedArea = tryArea(() => {
      const usable = defects.length ? difference(material, ...defects) : union(material);
      return intersection(union(...polys), usable);
    }, polys.reduce((s, r) => s + ringArea(r), 0));
  }
  occupiedArea = Math.min(occupiedArea, usableArea);

  const requested: Record<string, number> = {};
  const placed: Record<string, number> = {};
  const pending: Record<string, number> = {};
  const qtyOf = new Map<string, number>();
  for (const t of problem.templates) {
    const q = Math.max(0, Math.floor(t.qty));
    requested[t.id] = q;
    placed[t.id] = 0;
    qtyOf.set(t.id, q);
  }
  const seen = new Set<string>();
  for (const p of placements) {
    const q = qtyOf.get(p.templateId);
    if (q === undefined || !Number.isInteger(p.instance) || p.instance < 0 || p.instance >= q) continue;
    const key = `${p.templateId}#${p.instance}`;
    if (seen.has(key)) continue;
    seen.add(key);
    placed[p.templateId]++;
  }
  let placedCount = 0, requestedCount = 0;
  for (const id of Object.keys(requested)) {
    pending[id] = Math.max(0, requested[id] - placed[id]);
    placedCount += placed[id];
    requestedCount += requested[id];
  }

  return {
    totalArea,
    excludedArea,
    usableArea,
    occupiedArea,
    usableUtilization: usableArea > 0 ? (100 * occupiedArea) / usableArea : 0,
    materialUtilization: totalArea > 0 ? (100 * occupiedArea) / totalArea : 0,
    requested,
    placed,
    pending,
    placedCount,
    requestedCount,
  };
}
