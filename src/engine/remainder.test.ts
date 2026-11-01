import { describe, expect, it } from 'vitest';
import type { Placement, Problem } from '../types';
import { signedArea } from './geometry';
import { computeMetrics } from './metrics';
import { computeRemainder, fragmentAsMaterial } from './remainder';
import { makeTemplate } from './templates';
import { rect } from './testFixtures';

const T = makeTemplate(0, 'rect', 10, 10, 10);
const prob = (defects = [rect(5, 5, 10, 10)]): Problem => ({ material: rect(0, 0, 100, 100), defects, templates: [T], spacing: 0 });
const pl = (r: ReturnType<typeof rect>, instance = 0): Placement => ({ templateId: 't0', instance, rotation: 0, polygon: r });

describe('computeRemainder', () => {
  it('conserva el área: material = defectos∩material + piezas + sobrante', () => {
    const p = prob();
    const ps = [pl(rect(30, 30, 20, 10)), pl(rect(60, 60, 15, 25), 1)];
    const r = computeRemainder(p, ps, { minAreaFraction: 0 });
    const m = computeMetrics(p, ps);
    expect(r.materialArea).toBeCloseTo(10000, 6);
    expect(m.excludedArea + m.occupiedArea + r.area).toBeCloseTo(r.materialArea, 6);
  });

  it('una pieza en el centro deja 1 fragmento con 1 agujero', () => {
    const r = computeRemainder(prob([]), [pl(rect(40, 40, 20, 20))]);
    expect(r.fragments).toHaveLength(1);
    expect(r.fragments[0].holes).toHaveLength(1);
    expect(r.fragments[0].area).toBeCloseTo(9600, 6);
    expect(signedArea(r.fragments[0].outer)).toBeGreaterThan(0);
    expect(signedArea(r.fragments[0].holes[0])).toBeLessThan(0);
  });

  it('una franja vertical de piezas parte el material en 2 fragmentos disjuntos', () => {
    const ps = [pl(rect(45, 0, 10, 50)), pl(rect(45, 50, 10, 50), 1)];
    const r = computeRemainder(prob([]), ps);
    expect(r.fragments).toHaveLength(2);
    expect(r.fragments[0].area).toBeCloseTo(4500, 6);
    expect(r.fragments[1].area).toBeCloseTo(4500, 6);
    expect(r.fragments.every((f) => f.holes.length === 0)).toBe(true);
  });

  it('sin piezas: material menos defectos', () => {
    const r = computeRemainder(prob(), []);
    expect(r.fragments).toHaveLength(1);
    expect(r.area).toBeCloseTo(9900, 6);
    expect(r.fragments[0].holes).toHaveLength(1);
  });

  it('ordena por área y descarta astillas < minAreaFraction', () => {
    const ps = [pl(rect(0, 0, 99.9, 60)), pl(rect(0, 60, 99.9, 40), 1)];
    expect(computeRemainder(prob([]), ps).fragments).toHaveLength(0); // franja de 0.1×100 = 0.1 % < 0.5 %
    const ps2 = [pl(rect(30, 0, 10, 100))];
    const r2 = computeRemainder(prob([]), ps2);
    expect(r2.fragments.map((f) => Math.round(f.area))).toEqual([6000, 3000]);
  });

  it('fragmentAsMaterial: exterior → material, agujeros → defectos', () => {
    const f = computeRemainder(prob([]), [pl(rect(40, 40, 20, 20))]).fragments[0];
    const m = fragmentAsMaterial(f);
    expect(m.material).toEqual(f.outer);
    expect(m.defects).toEqual(f.holes);
    expect(computeMetrics({ ...prob([]), ...m }, []).usableArea).toBeCloseTo(9600, 6);
  });
});
