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

describe('full-scale export', () => {
  it('converts the calibration to px per cm (cm and mm) and rejects non-physical units', () => {
    expect(pxPerCm({ ppu: 14, unit: 'cm', calibrated: true })).toBe(14);
    expect(pxPerCm({ ppu: 1.4, unit: 'mm', calibrated: true })).toBeCloseTo(14);
    expect(pxPerCm({ ppu: 8, unit: 'u', calibrated: false })).toBeNull();
    expect(pxPerCm({ ppu: 8, unit: 'in', calibrated: true })).toBeNull();
  });

  it('the 1:1 SVG measures the material plus margins in cm', () => {
    const { p, r } = scenario();
    const b = bbox(p.contour);
    const plan = planInCm(p, r)!;
    expect(plan.w).toBeCloseTo(b.w / 14 + 2);
    expect(plan.h).toBeCloseTo(b.h / 14 + 2);
    const { svg, wCm, hCm } = buildPlanSvgCm(p, r);
    expect(svg).toContain(`width="${Math.round(wCm * 1000) / 1000}cm"`);
    expect(hCm).toBeGreaterThan(plan.h);
    expect(svg).toContain('5 × 5 cm');
    expect(svg).toContain('REFERENCE PLAN');
    // each placed piece appears with its label
    expect((svg.match(/stroke-linejoin="round"/g) ?? []).length).toBe(r.solution.placements.length);
  });

  it('with mm it yields the same physical measurements', () => {
    const cm = planInCm(...Object.values(scenario('cm', 10)) as [Project, Result])!;
    const mm = planInCm(...Object.values(scenario('mm', 100)) as [Project, Result])!;
    expect(mm.w).toBeCloseTo(cm.w);
  });

  it('splits into overlapping sheets and picks the orientation with fewer sheets', () => {
    const a = layoutTiles(15, 25, 'A4');
    expect([a.cols, a.rows, a.orientation]).toEqual([1, 1, 'portrait']);
    const b = layoutTiles(45, 33, 'A4');
    expect(b.cols * b.rows).toBeGreaterThanOrEqual(4);
    const wide = layoutTiles(26, 15, 'A4');
    expect(wide.orientation).toBe('landscape');
    expect(wide.cols * wide.rows).toBe(1);
  });

  it('generates the printable HTML with sheets, scale and templates', () => {
    const { p, r } = scenario();
    const html = buildPrintHtml(p, r, 'A4');
    expect(html).toContain('Print at 100%');
    expect(html).toContain('Sheet 1 of');
    expect(html).toContain('Templates per piece');
    expect(html).toContain('Outer');
  });

  it('refuses to export without a physical calibration', () => {
    const { p, r } = scenario();
    const bad = { ...r, calibrated: false, unit: 'u' };
    expect(() => buildPlanSvgCm(p, bad)).toThrow(/calibration/);
    expect(() => buildPrintHtml(p, bad, 'A4')).toThrow(/calibration/);
  });
});
