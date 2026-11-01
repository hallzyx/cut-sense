import { describe, expect, it } from 'vitest';
import { maximizeKits, verifySolution } from '../engine';
import { EXAMPLES } from './examples';
import { KITS } from './kits';
import { addProduct, removeProduct } from './products';
import { allDefs, buildProblem, emptyProject, kitQtyFor, kitToDefs, problemKey, type Project, type Result } from '../state';

const ex = EXAMPLES[1];
const kit = (id: string) => KITS.find((k) => k.id === id)!;

function baseResult(): { p: Project; r: Result } {
  const p: Project = {
    ...emptyProject(), image: { src: '', w: ex.w, h: ex.h, name: 'x' }, contour: ex.cachedPolygon, lastValid: ex.cachedPolygon,
    calib: { a: [100, 565], b: [240, 565], dist: 10, unit: 'cm' }, defs: kitToDefs(kit('tarjetero')), spacing: 0.2, fill: 'maxKits',
  };
  const problem = buildProblem(p)!;
  const mk = maximizeKits(problem);
  const n = Math.max(mk.kits, 1);
  const expanded = { ...problem, templates: problem.templates.map((t) => ({ ...t, qty: t.qty * n })) };
  const r: Result = { solution: mk.solution, verify: verifySolution(expanded, mk.solution.placements), problemKey: problemKey(problem, p.calib), kits: { n: mk.kits, perKit: mk.perKit }, ppu: 14, unit: 'cm', calibrated: true, problem: expanded };
  return { p, r };
}

describe('otro producto con el sobrante', () => {
  it('añade piezas sueltas sobre lo que sobra y el plan combinado es válido', async () => {
    const { p, r } = baseResult();
    expect(r.kits!.n).toBeGreaterThanOrEqual(2);
    const before = r.solution.placements.length;
    const out = await addProduct(p, r, kit('llavero'));
    expect(out.added).toBeGreaterThan(0);
    const res = out.result;
    expect(res.verify.valid).toBe(true);
    expect(res.solution.placements.length).toBe(before + out.added);
    expect(res.extras).toHaveLength(1);
    expect(allDefs(p, res)).toHaveLength(p.defs.length + 1);
    // las plantillas nuevas están en el problema y en las métricas
    const id = res.extras![0].defs[0].id;
    expect(res.solution.metrics.placed[id]).toBe(out.added);
    expect(res.problem.templates.map((t) => t.id)).toContain(id);
    // el plan anterior no se movió
    expect(res.solution.placements.slice(0, before)).toEqual(r.solution.placements);
  }, 60000);

  it('respeta la cantidad pedida y hace lo máximo si no caben todas', async () => {
    const { p, r } = baseResult();
    const two = await addProduct(p, r, kit('llavero'), undefined, 2);
    expect(two.added).toBe(2);
    expect(two.requested).toBe(2);
    expect(two.result.verify.valid).toBe(true);
    const many = await addProduct(p, r, kit('llavero'), undefined, 500);
    expect(many.requested).toBe(500);
    expect(many.added).toBeGreaterThan(2);
    expect(many.added).toBeLessThan(500);
    expect(many.result.verify.valid).toBe(true);
    expect((await addProduct(p, r, kit('llavero'))).requested).toBeNull();
  }, 120000);

  it('permite encadenar otro producto y quitarlo sin tocar el resto', async () => {
    const { p, r } = baseResult();
    const a = await addProduct(p, r, kit('llavero'));
    const b = await addProduct(p, a.result, kit('posavasos'));
    expect(b.result.extras!.map((e) => e.name)).toEqual(['Llaveros', ...(b.added ? ['Posavasos'] : [])]);
    expect(b.result.verify.valid).toBe(true);
    const back = removeProduct(a.result, a.result.extras![0].id);
    expect(back.solution.placements).toEqual(r.solution.placements);
    expect(back.verify.valid).toBe(true);
    expect(back.extras).toEqual([]);
  }, 90000);

  it('un kit completo que no cabe deja el plan igual', async () => {
    const { p, r } = baseResult();
    const out = await addProduct(p, r, kit('cartera'));
    if (out.added === 0) expect(out.result).toBe(r);
    else expect(out.result.verify.valid).toBe(true);
  }, 60000);

  it('rechaza fotos sin calibración en cm', async () => {
    const { p, r } = baseResult();
    await expect(addProduct(p, { ...r, unit: 'u', calibrated: false }, kit('llavero'))).rejects.toThrow(/cm/);
  });

  it('kitQtyFor solo devuelve piezas por juego para kits con varios juegos', async () => {
    const { p, r } = baseResult();
    const t0 = p.defs[0].id;
    expect(kitQtyFor(r, t0)).toBe(r.kits!.perKit[t0]);
    const out = await addProduct(p, r, kit('llavero'));
    expect(kitQtyFor(out.result, out.result.extras![0].defs[0].id)).toBeUndefined();
  }, 60000);
});
