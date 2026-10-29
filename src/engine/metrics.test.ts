import { describe, expect, it } from 'vitest';
import type { Problem, Template } from '../types';
import { computeMetrics } from './metrics';
import { rect } from './testFixtures';

const T: Template = {
  id: 'r', name: 'R', color: '#000', kind: 'rect', w: 10, h: 10, qty: 3, rotations: [0], shape: rect(0, 0, 10, 10),
};

describe('computeMetrics', () => {
  it('defectos solapados no se cuentan dos veces; defecto fuera no cuenta', () => {
    const p: Problem = {
      material: rect(0, 0, 100, 100),
      defects: [rect(0, 0, 20, 20), rect(10, 10, 20, 20), rect(200, 200, 30, 30)],
      templates: [T], spacing: 0,
    };
    const m = computeMetrics(p, []);
    expect(m.totalArea).toBeCloseTo(10000, 6);
    expect(m.excludedArea).toBeCloseTo(700, 6); // 400 + 400 − 100
    expect(m.usableArea).toBeCloseTo(9300, 6);
    expect(m.occupiedArea).toBe(0);
    expect(m.usableUtilization).toBe(0);
  });

  it('defecto parcialmente fuera del material cuenta solo la parte interior', () => {
    const p: Problem = { material: rect(0, 0, 100, 100), defects: [rect(-10, 50, 20, 10)], templates: [T], spacing: 0 };
    expect(computeMetrics(p, []).excludedArea).toBeCloseTo(100, 6);
  });

  it('ocupación, porcentajes y conteos por plantilla', () => {
    const p: Problem = { material: rect(0, 0, 100, 100), defects: [rect(50, 50, 50, 50)], templates: [T], spacing: 0 };
    const placements = [
      { templateId: 'r', instance: 0, rotation: 0, polygon: rect(0, 0, 10, 10) },
      { templateId: 'r', instance: 1, rotation: 0, polygon: rect(20, 0, 10, 10) },
    ];
    const m = computeMetrics(p, placements);
    expect(m.excludedArea).toBeCloseTo(2500, 6);
    expect(m.usableArea).toBeCloseTo(7500, 6);
    expect(m.occupiedArea).toBeCloseTo(200, 6);
    expect(m.usableUtilization).toBeCloseTo((100 * 200) / 7500, 6);
    expect(m.materialUtilization).toBeCloseTo(2, 6);
    expect(m.requested).toEqual({ r: 3 });
    expect(m.placed).toEqual({ r: 2 });
    expect(m.pending).toEqual({ r: 1 });
    expect(m.placedCount).toBe(2);
    expect(m.requestedCount).toBe(3);
  });

  it('piezas solapadas no inflan el área ocupada', () => {
    const p: Problem = { material: rect(0, 0, 100, 100), defects: [], templates: [T], spacing: 0 };
    const placements = [
      { templateId: 'r', instance: 0, rotation: 0, polygon: rect(0, 0, 10, 10) },
      { templateId: 'r', instance: 1, rotation: 0, polygon: rect(5, 0, 10, 10) },
    ];
    expect(computeMetrics(p, placements).occupiedArea).toBeCloseTo(150, 6);
  });

  it('defectos que cubren todo ⇒ utilizable 0 sin división por cero', () => {
    const p: Problem = { material: rect(0, 0, 100, 100), defects: [rect(-5, -5, 110, 110)], templates: [T], spacing: 0 };
    const m = computeMetrics(p, []);
    expect(m.usableArea).toBeCloseTo(0, 6);
    expect(m.usableUtilization).toBe(0);
  });
});
