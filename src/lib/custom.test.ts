import { describe, expect, it } from 'vitest';
import { customShapeProblem, normalizeRing } from './custom';
import { buildShape } from '../engine/templates';
import type { Ring } from '../types';

const L: Ring = [[10, 10], [60, 10], [60, 40], [110, 40], [110, 90], [10, 90]];

describe('custom pieces', () => {
  it('normalizes to [0,1]² and keeps the proportion', () => {
    const { shape, aspect } = normalizeRing(L);
    expect(aspect).toBeCloseTo(0.8);
    expect(Math.min(...shape.map((p) => p[0]))).toBe(0);
    expect(Math.max(...shape.map((p) => p[1]))).toBe(1);
  });
  it('buildShape scales the custom shape to w×h', () => {
    const { shape } = normalizeRing(L);
    const s = buildShape('custom', 20, 16, shape);
    expect(Math.max(...s.map((p) => p[0]))).toBeCloseTo(20);
    expect(Math.max(...s.map((p) => p[1]))).toBeCloseTo(16);
  });
  it('accepts simple shapes and rejects crossings and degenerate ones', () => {
    expect(customShapeProblem(L)).toBeNull();
    expect(customShapeProblem([[0, 0], [10, 0], [10, 10], [4, -5]])).toMatch(/crosses/);
    expect(customShapeProblem([[0, 0], [10, 0]])).toMatch(/3 points/);
    expect(customShapeProblem([[0, 0], [100, 0], [50, 0.5]])).toMatch(/thin/);
  });
});
