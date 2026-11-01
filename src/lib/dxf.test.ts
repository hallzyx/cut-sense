import { describe, expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { optimize, verifySolution } from '../engine';
import { EXAMPLES } from './examples';
import { KITS } from './kits';
import { buildDxf } from './dxf';
import { bbox } from './poly';
import { buildProblem, emptyProject, kitToDefs, problemKey, type Project, type Result } from '../state';

const ex = EXAMPLES[1];
function scenario(): { p: Project; r: Result } {
  const p: Project = {
    ...emptyProject(), image: { src: '', w: ex.w, h: ex.h, name: 'x' }, contour: ex.cachedPolygon, lastValid: ex.cachedPolygon,
    defects: [[[400, 280], [440, 280], [440, 320], [400, 320]]],
    calib: { a: [100, 565], b: [240, 565], dist: 10, unit: 'cm' }, defs: kitToDefs(KITS[1]),
  };
  const problem = buildProblem(p)!;
  const solution = optimize(problem);
  const r: Result = { solution, verify: verifySolution(problem, solution.placements), problemKey: problemKey(problem, p.calib), ppu: 14, unit: 'cm', calibrated: true, problem };
  return { p, r };
}
const parse = (s: string) => new DxfParser().parseSync(s)!;
const verts = (e: any) => e.vertices.map((v: any) => [v.x, v.y] as [number, number]);

describe('DXF export', () => {
  it('is an R12 DXF in mm that an independent reader understands', () => {
    const { p, r } = scenario();
    const txt = buildDxf(p, r);
    expect(txt).toContain('AC1009');
    expect(txt).toContain('\r\n');
    const d = parse(txt);
    const polys = d.entities.filter((e: any) => e.type === 'POLYLINE');
    expect(polys.length).toBe(r.solution.placements.length);
    expect(polys.every((e: any) => e.layer === 'CUT' && e.shape === true)).toBe(true);
  });

  it('measurements are in mm, with origin at bottom-left and Y pointing up', () => {
    const { p, r } = scenario();
    const d = parse(buildDxf(p, r, { reference: true }));
    const mat = d.entities.find((e: any) => e.layer === 'MATERIAL') as any;
    const xs = verts(mat).map((v: number[]) => v[0]), ys = verts(mat).map((v: number[]) => v[1]);
    const b = bbox(p.contour);
    expect(Math.min(...xs)).toBeCloseTo(0, 2);
    expect(Math.min(...ys)).toBeCloseTo(0, 2);
    expect(Math.max(...xs)).toBeCloseTo((b.w / 14) * 10, 1);
    expect(Math.max(...ys)).toBeCloseTo((b.h / 14) * 10, 1);
    // the first piece (Outer 18.5 × 9.5 cm) keeps its real dimensions
    const cut = d.entities.filter((e: any) => e.layer === 'CUT') as any[];
    const ext = verts(cut[0]);
    const w = Math.max(...ext.map((v: number[]) => v[0])) - Math.min(...ext.map((v: number[]) => v[0]));
    const h = Math.max(...ext.map((v: number[]) => v[1])) - Math.min(...ext.map((v: number[]) => v[1]));
    expect([w, h].sort((a, b2) => a - b2).map((v) => Math.round(v))).toEqual([95, 185]);
  });

  it('by default it only exports the CUT layer; the reference is optional', () => {
    const { p, r } = scenario();
    expect(new Set(parse(buildDxf(p, r)).entities.map((e: any) => e.layer))).toEqual(new Set(['CUT']));
    const withRef = parse(buildDxf(p, r, { reference: true }));
    expect(new Set(withRef.entities.map((e: any) => e.layer))).toEqual(new Set(['CUT', 'MATERIAL', 'DEFECTS']));
  });

  it('refuses to export without a physical calibration', () => {
    const { p, r } = scenario();
    expect(() => buildDxf(p, { ...r, calibrated: false, unit: 'u' })).toThrow(/calibration/);
  });
});
