import { computeMetrics, maximizeKitsAsync, verifySolution } from '../engine';
import type { Problem } from '../types';
import { allDefs, kitToDefs, toTemplate, type ExtraProduct, type Project, type Result } from '../state';
import type { Kit } from './kits';

/**
 * Planifica un producto más sobre el material que sobró: las piezas ya colocadas quedan fijas
 * (se tratan como obstáculos con la misma separación) y se busca cuántos juegos completos
 * (o cuántas piezas sueltas) del producto nuevo caben. El plan combinado se verifica entero.
 */
export async function addProduct(
  p: Project, r: Result, kit: Kit, onProgress?: (f: number) => void, target?: number,
): Promise<{ result: Result; added: number; requested: number | null }> {
  if (!r.calibrated || r.unit.trim().toLowerCase() !== 'cm') throw new Error(`«${kit.name}» usa medidas en cm: la foto debe estar calibrada en cm.`);
  const base = r.problem;
  const nextIndex = Math.max(0, ...(r.extras ?? []).map((e) => Number(e.id.replace(/\D/g, '')))) + 1;
  const prefix = `x${nextIndex}_`;
  const defs = kitToDefs(kit, prefix, allDefs(p, r).length);
  const templates = defs.map((d) => toTemplate(d, r.ppu));
  const sub: Problem = {
    material: base.material,
    defects: [...base.defects, ...r.solution.placements.map((pl) => pl.polygon)],
    templates, spacing: base.spacing, seed: base.seed ?? 1, timeLimitMs: base.timeLimitMs,
  };
  // Con cantidad pedida se busca hasta ese número (o lo máximo posible si no entra); sin ella, tantos como quepan.
  const requested = target && target > 0 ? Math.floor(target) : null;
  const mk = await maximizeKitsAsync(sub, onProgress, { maxKits: requested ?? (kit.kind === 'piece' ? 40 : 12) });
  if (mk.kits === 0) return { result: r, added: 0, requested };

  const n = mk.kits;
  const problem: Problem = { ...base, templates: [...base.templates, ...templates.map((t) => ({ ...t, qty: t.qty * n }))] };
  const placements = [...r.solution.placements, ...mk.solution.placements];
  const verify = verifySolution(problem, placements);
  const extra: ExtraProduct = { id: prefix, name: kit.name, kind: kit.kind ?? 'kit', defs, kits: { n, perKit: mk.perKit } };
  return {
    added: n, requested,
    result: { ...r, problem, verify, solution: { ...r.solution, placements, metrics: computeMetrics(problem, placements) }, extras: [...(r.extras ?? []), extra] },
  };
}

/** Quita un producto añadido del plan combinado (no recalcula nada: solo lo filtra). */
export function removeProduct(r: Result, extraId: string): Result {
  const extra = r.extras?.find((e) => e.id === extraId);
  if (!extra) return r;
  const ids = new Set(extra.defs.map((d) => d.id));
  const problem: Problem = { ...r.problem, templates: r.problem.templates.filter((t) => !ids.has(t.id)) };
  const placements = r.solution.placements.filter((pl) => !ids.has(pl.templateId));
  return {
    ...r, problem, verify: verifySolution(problem, placements),
    solution: { ...r.solution, placements, metrics: computeMetrics(problem, placements) },
    extras: (r.extras ?? []).filter((e) => e.id !== extraId),
  };
}
