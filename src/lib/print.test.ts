import { describe, expect, it } from 'vitest';
import { optimize, verifySolution } from '../engine';
import { EXAMPLES } from './examples';
import { KITS } from './kits';
import { buildPlanSvgCm, buildPrintHtml, layoutTiles, planInCm, pxPerCm } from './print';
import { bbox } from './poly';
import { buildProblem, emptyProject, kitToDefs, problemKey, type Project, type Result } from '../state';

const ex = EXAMPLES[1];
function scenario(unit = 'cm', dist = 10): { p: Project; r: Result } {
  const p: Project = {
    ...emptyProject(), image: { src: '', w: ex.w, h: ex.h, name: 'x' }, contour: ex.cachedPolygon, lastValid: ex.cachedPolygon,
    calib: { a: [100, 565], b: [240, 565], dist, unit }, defs: kitToDefs(KITS[1]),
  };
  const problem = buildProblem(p)!;
  const solution = optimize(problem);
  const ppu = 140 / dist;
  const r: Result = { solution, verify: verifySolution(problem, solution.placements), problemKey: problemKey(problem, p.calib), ppu, unit, calibrated: true, problem };
  return { p, r };
}

describe('exportación a escala real', () => {
  it('convierte la calibración a px por cm (cm y mm) y rechaza lo no físico', () => {
    expect(pxPerCm({ ppu: 14, unit: 'cm', calibrated: true })).toBe(14);
    expect(pxPerCm({ ppu: 1.4, unit: 'mm', calibrated: true })).toBeCloseTo(14);
    expect(pxPerCm({ ppu: 8, unit: 'u', calibrated: false })).toBeNull();
    expect(pxPerCm({ ppu: 8, unit: 'in', calibrated: true })).toBeNull();
  });

  it('el SVG 1:1 mide en cm lo que mide el material + márgenes', () => {
    const { p, r } = scenario();
    const b = bbox(p.contour);
    const plan = planInCm(p, r)!;
    expect(plan.w).toBeCloseTo(b.w / 14 + 2);
    expect(plan.h).toBeCloseTo(b.h / 14 + 2);
    const { svg, wCm, hCm } = buildPlanSvgCm(p, r);
    expect(svg).toContain(`width="${Math.round(wCm * 1000) / 1000}cm"`);
    expect(hCm).toBeGreaterThan(plan.h);
    expect(svg).toContain('5 × 5 cm');
    expect(svg).toContain('PLANO REFERENCIAL');
    // cada pieza colocada aparece con su etiqueta
    expect((svg.match(/stroke-linejoin="round"/g) ?? []).length).toBe(r.solution.placements.length);
  });

  it('con mm obtiene las mismas medidas físicas', () => {
    const cm = planInCm(...Object.values(scenario('cm', 10)) as [Project, Result])!;
    const mm = planInCm(...Object.values(scenario('mm', 100)) as [Project, Result])!;
    expect(mm.w).toBeCloseTo(cm.w);
  });

  it('reparte en hojas con solape y elige la orientación con menos hojas', () => {
    const a = layoutTiles(15, 25, 'A4');
    expect([a.cols, a.rows, a.orientation]).toEqual([1, 1, 'portrait']);
    const b = layoutTiles(45, 33, 'A4');
    expect(b.cols * b.rows).toBeGreaterThanOrEqual(4);
    const wide = layoutTiles(26, 15, 'A4');
    expect(wide.orientation).toBe('landscape');
    expect(wide.cols * wide.rows).toBe(1);
  });

  it('genera el HTML imprimible con hojas, escala y plantillas', () => {
    const { p, r } = scenario();
    const html = buildPrintHtml(p, r, 'A4');
    expect(html).toContain('Imprime al 100 %');
    expect(html).toContain('Hoja 1 de');
    expect(html).toContain('Plantillas por pieza');
    expect(html).toContain('Exterior');
  });

  it('se niega a exportar sin calibración física', () => {
    const { p, r } = scenario();
    const bad = { ...r, calibrated: false, unit: 'u' };
    expect(() => buildPlanSvgCm(p, bad)).toThrow(/calibración/);
    expect(() => buildPrintHtml(p, bad, 'A4')).toThrow(/calibración/);
  });
});
