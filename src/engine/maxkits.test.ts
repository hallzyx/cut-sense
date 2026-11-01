import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../lib/examples';
import { KITS } from '../lib/kits';
import type { Placement, Problem, Ring, Template } from '../types';
import { expandKits, maximizeKits, maximizeKitsAsync } from './maxkits';
import { buildShape, makeTemplate } from './templates';
import { rect } from './testFixtures';
import { verifySolution } from './verify';

const frozen = () => 0;

/** Checks that each kit k owns exactly the instances [k·qty, (k+1)·qty) of each template. */
function expectCompleteKits(problem: Problem, kits: number, placements: Placement[]) {
  for (const t of problem.templates) {
    const inst = placements.filter((p) => p.templateId === t.id).map((p) => p.instance).sort((a, b) => a - b);
    expect(inst).toEqual(Array.from({ length: t.qty * kits }, (_, i) => i));
    for (let k = 0; k < kits; k++) {
      expect(inst.filter((i) => i >= k * t.qty && i < (k + 1) * t.qty)).toHaveLength(t.qty);
    }
  }
}

describe('maximizeKits', () => {
  it('rectangular sheet with known capacity: 4 kits (2×20x20 + 1×10x10)', () => {
    // 101×41 instead of 100×40: the optimizer reserves a tiny margin between pieces (OPT_MARGIN_REL)
    const p: Problem = {
      material: rect(0, 0, 101, 41), defects: [], spacing: 0, seed: 1,
      templates: [makeTemplate(0, 'rect', 20, 20, 2), makeTemplate(1, 'rect', 10, 10, 1)],
    };
    const r = maximizeKits(p, { now: frozen });
    expect(r.kits).toBeGreaterThanOrEqual(4);
    expect(r.perKit).toEqual({ t0: 2, t1: 1 });
    const expanded = expandKits(p, r.kits);
    expect(verifySolution(expanded, r.solution.placements).violations).toEqual([]);
    expectCompleteKits(p, r.kits, r.solution.placements);
    expect(r.solution.metrics.requestedCount).toBe(3 * r.kits);
    expect(r.solution.metrics.placedCount).toBe(3 * r.kits);
    expect(r.attempts.length).toBeGreaterThan(0);
  });

  it('leather wallet (14 px/cm, spacing 2.8 px, stain) on the leather example', () => {
    const PPU = 14;
    const kit = KITS.find((k) => k.id === 'cartera')!;
    const templates: Template[] = kit.pieces.map((k, i) => ({
      id: `t${i}`, name: k.name, color: '#000', kind: k.kind, w: k.w * PPU, h: k.h * PPU, qty: k.qty,
      rotations: k.rotations ?? [0, 180], shape: buildShape(k.kind, k.w * PPU, k.h * PPU),
    }));
    const stain: Ring = Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return [420 + 48 * Math.cos(a), 300 + 30 * Math.sin(a)];
    });
    const p: Problem = { material: EXAMPLES[1].cachedPolygon, defects: [stain], templates, spacing: 2.8, seed: 1 };
    const t0 = performance.now();
    const r = maximizeKits(p);
    const ms = performance.now() - t0;
    console.log(`[kits] leather wallet: ${r.kits} complete wallets in ${ms.toFixed(0)} ms; attempts ${JSON.stringify(r.attempts)}`);
    expect(r.kits).toBeGreaterThanOrEqual(1);
    expect(verifySolution(expandKits(p, r.kits), r.solution.placements).violations).toEqual([]);
    expectCompleteKits(p, r.kits, r.solution.placements);
    expect(ms).toBeLessThan(8000 * 1.25 + 500);
  }, 30000);

  it('kits === 0 if not even one kit fits: returns the partial plan for one kit', () => {
    const p: Problem = {
      material: rect(0, 0, 100, 100), defects: [], spacing: 0, seed: 1,
      templates: [makeTemplate(0, 'rect', 20, 20, 2), makeTemplate(1, 'rect', 150, 20, 1)],
    };
    const r = maximizeKits(p, { now: frozen });
    expect(r.kits).toBe(0);
    expect(r.solution.placements.length).toBe(2);
    expect(r.solution.metrics.requested).toEqual({ t0: 2, t1: 1 });
    expect(r.solution.metrics.pending).toEqual({ t0: 0, t1: 1 });
    expect(verifySolution(p, r.solution.placements).valid).toBe(true);
  });

  it('deterministic with an injected clock', () => {
    const p: Problem = {
      material: [[0, 0], [160, 0], [170, 60], [120, 110], [60, 90], [0, 120]], defects: [rect(70, 30, 20, 20)],
      spacing: 2, seed: 5,
      templates: [makeTemplate(0, 'rect', 30, 20, 1), makeTemplate(1, 'circle', 18, 18, 1), makeTemplate(2, 'trapezoid', 25, 15, 1)],
    };
    const a = maximizeKits(p, { now: frozen, maxKits: 5 });
    const b = maximizeKits(p, { now: frozen, maxKits: 5 });
    expect(b.kits).toBe(a.kits);
    expect(b.attempts).toEqual(a.attempts);
    expect(b.solution.placements).toEqual(a.solution.placements);
    expect(a.kits).toBeGreaterThan(1);
    expect(verifySolution(expandKits(p, a.kits), a.solution.placements).valid).toBe(true);
    console.log(`[kits] determinism: ${a.kits} kits, attempts ${JSON.stringify(a.attempts)}`);
  }, 30000);

  it('respects maxKits', () => {
    const p: Problem = { material: rect(0, 0, 200, 200), defects: [], spacing: 0, seed: 1, templates: [makeTemplate(0, 'rect', 10, 10, 1)] };
    expect(maximizeKits(p, { now: frozen, maxKits: 3 }).kits).toBe(3);
  });

  it('respects the time budget (real clock, case with failed attempts)', () => {
    const p: Problem = {
      material: [[0, 0], [160, 0], [170, 60], [120, 110], [60, 90], [0, 120]], defects: [rect(70, 30, 20, 20)],
      spacing: 2, seed: 5,
      templates: [makeTemplate(0, 'rect', 30, 20, 1), makeTemplate(1, 'circle', 18, 18, 1), makeTemplate(2, 'trapezoid', 25, 15, 1)],
    };
    const t0 = performance.now();
    const r = maximizeKits(p, { timeLimitMs: 2000 });
    const ms = performance.now() - t0;
    console.log(`[kits] 2000 ms budget: ${r.kits} kits in ${ms.toFixed(0)} ms, ${r.attempts.length} attempts`);
    expect(ms).toBeLessThan(2000 * 1.25 + 300);
    expect(r.kits).toBeGreaterThanOrEqual(4);
    expect(verifySolution(expandKits(p, r.kits), r.solution.placements).valid).toBe(true);
    expectCompleteKits(p, r.kits, r.solution.placements);
  }, 20000);

  it('async version: same result and reports progress up to 1', async () => {
    const p: Problem = { material: rect(0, 0, 101, 41), defects: [], spacing: 0, seed: 1, templates: [makeTemplate(0, 'rect', 20, 20, 2), makeTemplate(1, 'rect', 10, 10, 1)] };
    const fr: number[] = [];
    const r = await maximizeKitsAsync(p, (f) => fr.push(f), { now: frozen });
    expect(r.kits).toBe(maximizeKits(p, { now: frozen }).kits);
    expect(fr[fr.length - 1]).toBe(1);
  });
});
