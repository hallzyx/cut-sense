import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../lib/examples';
import { KITS } from '../lib/kits';
import type { Problem, Ring, Template } from '../types';
import { carteraRegressionProblem } from './fixtureCartera';
import { optimize } from './optimize';
import { buildShape } from './templates';
import { verifySolution } from './verify';

describe('regression: bifold wallet (Outer was left pending)', () => {
  it('places 7/7 with the original rotations [0,180] and the plan is valid', () => {
    const p = carteraRegressionProblem;
    expect(p.templates.find((t) => t.id === 't0')!.rotations).toEqual([0, 180]);
    const sol = optimize(p);
    expect(verifySolution(p, sol.placements).violations).toEqual([]);
    expect(sol.placements.length).toBe(7);
    expect(sol.metrics.pending).toEqual({ t0: 0, t1: 0, t2: 0, t3: 0 });
  });

  it('the Outer piece alone fits in the material', () => {
    const p: Problem = { ...carteraRegressionProblem, templates: [carteraRegressionProblem.templates[0]] };
    expect(optimize(p).placements.length).toBe(1);
  });
});

describe('wallet kit on the leather example (14 px/cm)', () => {
  const PPU = 14;
  const leather = EXAMPLES.find((e) => e.id === 'cuero')!;
  const kit = KITS.find((k) => k.id === 'cartera')!;
  const templates: Template[] = kit.pieces.map((k, i) => ({
    id: `t${i}`, name: k.name, color: '#000', kind: k.kind, w: k.w * PPU, h: k.h * PPU, qty: k.qty,
    rotations: k.rotations ?? [0, 180], shape: buildShape(k.kind, k.w * PPU, k.h * PPU),
  }));
  // stain drawn in the example: ellipse (420, 300) rx 48 ry 30, approximated with 32 sides
  const stain: Ring = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    return [420 + 48 * Math.cos(a), 300 + 30 * Math.sin(a)];
  });

  for (const spacing of [0, 2.8]) {
    for (const withStain of [false, true]) {
      it(`spacing ${spacing}px, ${withStain ? 'with' : 'without'} mancha ⇒ 7/7 válido`, () => {
        const p: Problem = { material: leather.cachedPolygon, defects: withStain ? [stain] : [], templates, spacing, seed: 1 };
        const sol = optimize(p);
        expect(verifySolution(p, sol.placements).violations).toEqual([]);
        expect(sol.placements.length).toBe(7);
      });
    }
  }
});
