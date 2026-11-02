import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../lib/examples';
import { KITS } from '../lib/kits';
import { kitToDefs, toTemplate } from '../state';
import type { Problem } from '../types';
import { bbox } from './geometry';
import { tarjeteroDefects, tarjeteroMaterial, tarjeteroRemainderHoles, tarjeteroRemainderMaterial } from './fixtureTarjetero';
import { optimize } from './optimize';
import { compareLeftover, leftoverScore } from './remainder';
import { makeTemplate } from './templates';
import { concaveProblem, rect } from './testFixtures';
import { verifySolution } from './verify';

const frozen = () => 0;

/**
 * Strip 100×30 cut by a defect at x = 80..85: one 12×28 piece fits at the left end (default gravity)
 * or in the right pocket. Both plans place 1 piece with the same area; the pocket keeps the 80-wide
 * side whole, the left end leaves only 68.
 */
const strip: Problem = {
  material: rect(0, 0, 100, 30), defects: [rect(80, -5, 5, 40)], spacing: 0, seed: 1,
  templates: [makeTemplate(0, 'rect', 12, 28, 1)],
};

describe('leftover tie-break', () => {
  it('between two plans with the same pieces, keeps the one with the larger contiguous leftover', () => {
    const plain = optimize(strip, { now: frozen, leftoverPasses: 0 });
    const sol = optimize(strip, { now: frozen });
    expect(plain.placements).toHaveLength(1);
    expect(sol.placements).toHaveLength(1);
    expect(sol.metrics.occupiedArea).toBeCloseTo(plain.metrics.occupiedArea, 6);
    expect(verifySolution(strip, sol.placements).violations).toEqual([]);
    expect(bbox(plain.placements[0].polygon).maxX).toBeLessThan(80); // default gravity: left end
    expect(bbox(sol.placements[0].polygon).minX).toBeGreaterThan(85); // tie-break: right pocket
    const a = leftoverScore(strip, sol.placements), b = leftoverScore(strip, plain.placements);
    expect(compareLeftover(a, b, a.cellArea)).toBeGreaterThan(0);
  });

  it('deterministic: same problem + seed ⇒ same plan (complete and partial plans)', () => {
    const partial: Problem = {
      material: rect(0, 0, 100.5, 60.5), defects: [rect(40, 20, 8, 8)], spacing: 1, seed: 9,
      templates: [makeTemplate(0, 'rect', 25, 20, 14), makeTemplate(1, 'circle', 14, 14, 4)],
    };
    for (const p of [strip, partial, concaveProblem(12, { seed: 3 })]) {
      const a = optimize(p, { now: frozen, maxIterations: 40 });
      const b = optimize(p, { now: frozen, maxIterations: 40 });
      expect(b.placements).toEqual(a.placements);
      expect(verifySolution(p, a.placements).valid).toBe(true);
    }
  });

  // Pieces and occupied area measured with cs-nest-1.0 (no leftover tie-break), frozen clock.
  const PPU = 14;
  const cardholder = kitToDefs(KITS.find((k) => k.id === 'tarjetero')!).map((d) => toTemplate(d, PPU));
  const keychain = kitToDefs(KITS.find((k) => k.id === 'llavero')!).map((d) => toTemplate(d, PPU));
  const tar: Problem = { material: tarjeteroMaterial, defects: tarjeteroDefects, templates: cardholder, spacing: 2.8, seed: 1 };
  const before: [string, Problem, number, number][] = [
    ['concave 8', concaveProblem(8), 8, 18016.4],
    ['concave 12', concaveProblem(12), 12, 27020.5],
    ['cardholder ×1 on the offcut', tar, 5, 42440.3],
    ['cardholder on the 11-hole leftover', { ...tar, material: tarjeteroRemainderMaterial, defects: tarjeteroRemainderHoles }, 4, 34132.1],
    ['keychains ×80 on leather (as many as fit)', { material: EXAMPLES[1].cachedPolygon, defects: [], spacing: 2.8, seed: 1, templates: keychain.map((t) => ({ ...t, qty: 80 })) }, 36, 147043.6],
  ];
  for (const [name, p, count, area] of before) {
    it(`never fewer pieces (nor less area) than before: ${name}`, () => {
      const sol = optimize(p, { now: frozen });
      expect(verifySolution(p, sol.placements).violations).toEqual([]);
      expect(sol.placements.length).toBeGreaterThanOrEqual(count);
      expect(sol.metrics.occupiedArea).toBeGreaterThanOrEqual(area - 0.1);
    }, 30000);
  }
});
