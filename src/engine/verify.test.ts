import { describe, expect, it } from 'vitest';
import type { Placement, Problem, Template } from '../types';
import { placeShape } from './geometry';
import { rect } from './testFixtures';
import { verifySolution } from './verify';

const T: Template = {
  id: 'r', name: 'R', color: '#000', kind: 'rect', w: 20, h: 10, qty: 2, rotations: [0, 180], shape: rect(0, 0, 20, 10),
};

function problem(spacing = 2, defects = [rect(40, 40, 20, 20)]): Problem {
  return { material: rect(0, 0, 100, 100), defects, templates: [T], spacing };
}

function at(x: number, y: number, instance = 0, rotation = 0, templateId = 'r'): Placement {
  return { templateId, instance, rotation, polygon: placeShape(T.shape, rotation, x, y) };
}

function codes(p: Problem, ps: Placement[]): string[] {
  return verifySolution(p, ps).violations.map((v) => v.code);
}

describe('verifySolution — valid cases', () => {
  it('accepts a well-placed piece', () => {
    expect(verifySolution(problem(), [at(10, 10)])).toEqual({ valid: true, violations: [] });
  });
  it('accepts two pieces separated by exactly the spacing', () => {
    expect(verifySolution(problem(), [at(10, 10, 0), at(32, 10, 1)]).valid).toBe(true);
  });
  it('accepts a piece touching the edge with spacing 0', () => {
    expect(verifySolution(problem(0), [at(0, 0)]).valid).toBe(true);
  });
  it('accepts pieces that touch with spacing 0', () => {
    expect(verifySolution(problem(0), [at(10, 10, 0), at(30, 10, 1)]).valid).toBe(true);
  });
  it('accepts an allowed 180 rotation and a polygon with a shifted starting index', () => {
    const poly = placeShape(T.shape, 180, 10, 70);
    const shifted = [...poly.slice(2), ...poly.slice(0, 2)];
    expect(verifySolution(problem(), [{ templateId: 'r', instance: 0, rotation: 180, polygon: shifted }]).valid).toBe(true);
  });
  it('accepts an empty plan', () => {
    expect(verifySolution(problem(), []).valid).toBe(true);
  });
  it('accepts a piece at exact spacing from a defect', () => {
    expect(verifySolution(problem(), [at(40, 62)]).valid).toBe(true);
  });
});

describe('verifySolution — rejects invalid plans', () => {
  it('outside the edge', () => {
    expect(codes(problem(), [at(90, 10)])).toContain('OUT_OF_BOUNDS');
    expect(codes(problem(), [at(-5, 10)])).toContain('OUT_OF_BOUNDS');
  });
  it('inside but too close to the edge', () => {
    expect(codes(problem(), [at(1, 10)])).toEqual(['SPACING']);
  });
  it('defect invaded', () => {
    expect(codes(problem(), [at(45, 45)])).toContain('DEFECT_INVADED');
  });
  it('piece that completely contains a defect', () => {
    const p = problem(0, [rect(14, 12, 2, 2)]);
    expect(codes(p, [at(10, 10)])).toContain('DEFECT_INVADED');
  });
  it('insufficient spacing to a defect', () => {
    expect(codes(problem(), [at(40, 61)])).toEqual(['SPACING']);
  });
  it('overlap between pieces', () => {
    expect(codes(problem(), [at(10, 10, 0), at(15, 12, 1)])).toContain('OVERLAP');
  });
  it('piece inside another (no edge crossings)', () => {
    const big: Template = { ...T, id: 'b', w: 50, h: 50, shape: rect(0, 0, 50, 50) };
    const p: Problem = { ...problem(0, []), templates: [T, big] };
    const ps: Placement[] = [
      { templateId: 'b', instance: 0, rotation: 0, polygon: rect(5, 5, 50, 50) },
      at(10, 10),
    ];
    expect(codes(p, ps)).toContain('OVERLAP');
  });
  it('insufficient spacing between pieces', () => {
    expect(codes(problem(), [at(10, 10, 0), at(31, 10, 1)])).toEqual(['SPACING']);
  });
  it('rotation not allowed', () => {
    const ps: Placement[] = [{ templateId: 'r', instance: 0, rotation: 90, polygon: placeShape(T.shape, 90, 10, 10) }];
    expect(codes(problem(), ps)).toContain('BAD_ROTATION');
  });
  it('quantity exceeded (instance >= qty) and duplicate instances', () => {
    expect(codes(problem(), [at(10, 10, 2)])).toContain('QTY_EXCEEDED');
    expect(codes(problem(), [at(10, 10, 0), at(10, 70, 0)])).toEqual(['QTY_EXCEEDED']);
  });
  it('unknown template', () => {
    expect(codes(problem(), [at(10, 10, 0, 0, 'nope')])).toContain('UNKNOWN_TEMPLATE');
  });
  it('shape that does not match the template', () => {
    const ps: Placement[] = [{ templateId: 'r', instance: 0, rotation: 0, polygon: rect(10, 10, 25, 10) }];
    expect(codes(problem(), ps)).toEqual(['SHAPE_MISMATCH']);
  });
  it('degenerate or self-intersecting polygon', () => {
    const bow: Placement = { templateId: 'r', instance: 0, rotation: 0, polygon: [[10, 10], [30, 20], [30, 10], [10, 20]] };
    const line: Placement = { templateId: 'r', instance: 1, rotation: 0, polygon: [[10, 10], [20, 10], [30, 10]] };
    expect(codes(problem(), [bow])).toContain('DEGENERATE');
    expect(codes(problem(), [line])).toContain('DEGENERATE');
  });
  it('reports the indices of the pieces involved', () => {
    const v = verifySolution(problem(), [at(10, 10, 0), at(15, 12, 1)]);
    expect(v.violations[0]).toMatchObject({ code: 'OVERLAP', placementIndex: 1, otherIndex: 0 });
  });
});
