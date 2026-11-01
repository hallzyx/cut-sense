import { describe, expect, it } from 'vitest';
import { optimize, verifySolution } from '../engine';
import { EXAMPLES } from './examples';
import { KITS } from './kits';
import { addProduct } from './products';
import { parseProjectFile, serializeProject } from './projectFile';
import { buildProblem, emptyProject, kitToDefs, problemKey, type Project, type Result } from '../state';

const ex = EXAMPLES[1];
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function scenario(): { p: Project; r: Result } {
  const p: Project = {
    ...emptyProject(), image: { src: PNG, w: ex.w, h: ex.h, name: 'cuero.png' }, contour: ex.cachedPolygon, lastValid: ex.cachedPolygon,
    source: 'sam', defects: [[[400, 280], [440, 280], [440, 320], [400, 320]]],
    calib: { a: [100, 565], b: [240, 565], dist: 10, unit: 'cm' }, defs: kitToDefs(KITS[0]).map((d) => ({ ...d, qty: 1 })), spacing: 0.2, fill: 'fixed',
  };
  const problem = buildProblem(p)!;
  const solution = optimize(problem);
  const r: Result = { solution, verify: verifySolution(problem, solution.placements), problemKey: problemKey(problem, p.calib) + p.fill, ppu: 14, unit: 'cm', calibrated: true, problem };
  return { p, r };
}
const tamper = (txt: string, f: (o: any) => void) => { const o = JSON.parse(txt); f(o); return JSON.stringify(o); };

describe('archivo de proyecto', () => {
  it('guarda y abre: el proyecto vuelve igual y el plan se reverifica', () => {
    const { p, r } = scenario();
    const loaded = parseProjectFile(serializeProject(p, r, 3));
    expect(loaded.project).toEqual(p);
    expect(loaded.step).toBe(3);
    expect(loaded.notice).toBeNull();
    expect(loaded.result!.verify.valid).toBe(true);
    expect(loaded.result!.solution.placements).toEqual(r.solution.placements);
    expect(loaded.result!.solution.metrics.placedCount).toBe(r.solution.metrics.placedCount);
    expect(loaded.result!.problemKey).toBe(r.problemKey);
  });

  it('sin plan abre en el paso guardado, y sin contorno vuelve al paso 1', () => {
    const { p } = scenario();
    expect(parseProjectFile(serializeProject(p, null, 2))).toMatchObject({ step: 2, result: null });
    const empty = { ...p, contour: [], lastValid: [] };
    expect(parseProjectFile(serializeProject(empty, null, 3)).step).toBe(1);
  });

  it('no confía en el plan guardado: uno alterado se descarta con aviso', () => {
    const { p, r } = scenario();
    const bad = tamper(serializeProject(p, r, 3), (o) => { o.plan.placements[0].polygon = o.plan.placements[0].polygon.map(([x, y]: number[]) => [x + 5000, y]); });
    const loaded = parseProjectFile(bad);
    expect(loaded.result).toBeNull();
    expect(loaded.step).toBe(2);
    expect(loaded.notice).toMatch(/verificación/);
  });

  it('rechaza archivos que no son proyectos o están mal formados', () => {
    const { p, r } = scenario();
    const ok = serializeProject(p, r, 3);
    expect(() => parseProjectFile('no es json')).toThrow(/no válido/);
    expect(() => parseProjectFile('{"app":"otra"}')).toThrow(/no es un proyecto/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.version = 99; }))).toThrow(/versión/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.image.src = 'javascript:alert(1)'; }))).toThrow(/imagen/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.image.src = 'https://ejemplo.com/x.png'; }))).toThrow(/imagen/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.contour[0] = [null, 1]; }))).toThrow(/contorno/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.defs[0].qty = -3; }))).toThrow(/qty/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.defs[0].w = 0; }))).toThrow(/dimensiones/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.defs[0].kind = 'otra'; }))).toThrow(/kind/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.defs[0].color = 'url(x)'; }))).toThrow(/color/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.fill = 'x'; }))).toThrow(/llenado/);
    expect(() => parseProjectFile(tamper(ok, (o) => { o.project.calib = { a: [0, 0], b: [1, 1], dist: -2, unit: 'cm' }; }))).toThrow(/calibración/);
  });

  it('conserva los productos añadidos con el sobrante', async () => {
    const { p, r } = scenario();
    const out = await addProduct(p, r, KITS.find((k) => k.id === 'llavero')!);
    expect(out.added).toBeGreaterThan(0);
    const loaded = parseProjectFile(serializeProject(p, out.result, 3));
    expect(loaded.result!.extras).toHaveLength(1);
    expect(loaded.result!.verify.valid).toBe(true);
    expect(loaded.result!.solution.placements.length).toBe(out.result.solution.placements.length);
  }, 60000);
});
