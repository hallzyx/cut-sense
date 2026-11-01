import { describe, expect, it } from 'vitest';
import { KITS } from '../lib/kits';
import { kitToDefs, toTemplate } from '../state';
import type { Problem } from '../types';
import {
  tarjeteroDefects, tarjeteroMaterial, tarjeteroRemainderHoles, tarjeteroRemainderMaterial,
} from './fixtureTarjetero';
import { expandKits, maximizeKits } from './maxkits';
import { optimize } from './optimize';
import { verifySolution } from './verify';

const kit = KITS.find((k) => k.id === 'tarjetero')!;
const templates = kitToDefs(kit).map((d) => toTemplate(d, 14));
const base: Problem = { material: tarjeteroMaterial, defects: tarjeteroDefects, templates, spacing: 2.8, seed: 1, timeLimitMs: 4000 };
const frozen = () => 0;

describe('regression: cardholder on a real offcut with a stain (spacing 2.8 px)', () => {
  it('3 kits (15 pieces) fit in the whole material', () => {
    const p = expandKits(base, 3);
    const t0 = performance.now();
    const sol = optimize(p);
    console.log(`[tarjetero] optimize 3 kits: ${sol.placements.length}/15 in ${(performance.now() - t0).toFixed(0)} ms`);
    expect(verifySolution(p, sol.placements).violations).toEqual([]);
    expect(sol.placements.length).toBe(15);
  }, 20000);

  it('maximizeKits(base).kits >= 2 with the real clock (3 on a rested machine)', () => {
    const t0 = performance.now();
    const r = maximizeKits(base);
    const ms = performance.now() - t0;
    console.log(`[tarjetero] maximizeKits: ${r.kits} kits in ${ms.toFixed(0)} ms; attempts ${JSON.stringify(r.attempts)}`);
    // With the real clock the number depends on the machine speed (a rested machine gets 3);
    // the guarantee of 3 kits with no time limit comes from the deterministic test below.
    expect(r.kits).toBeGreaterThanOrEqual(2);
    expect(verifySolution(expandKits(base, r.kits), r.solution.placements).violations).toEqual([]);
    expect(ms).toBeLessThan(8000 * 1.25 + 500);
  }, 30000);

  it('deterministic maximizeKits with a frozen clock (maxKits 3) ⇒ 3 kits', () => {
    const a = maximizeKits(base, { now: frozen, maxKits: 3 });
    const b = maximizeKits(base, { now: frozen, maxKits: 3 });
    expect(a.kits).toBe(3);
    expect(b.solution.placements).toEqual(a.solution.placements);
  }, 30000);

  it('leftover with 11 holes: valid plan with 4 of 5 pieces (verified maximum)', () => {
    // An exhaustive backtracking search over 4 px and 2.5 px grids (all the rotations
    // allowed, spacing 2.8 px) found no arrangement with all 5 pieces of the kit in this
    // leftover: the free bottom strip only admits 3 pieces 133 px wide plus the tab.
    const p2: Problem = { ...base, material: tarjeteroRemainderMaterial, defects: tarjeteroRemainderHoles };
    const t0 = performance.now();
    const sol = optimize(p2);
    console.log(`[tarjetero] leftover: ${sol.placements.length}/5 in ${(performance.now() - t0).toFixed(0)} ms`);
    expect(verifySolution(p2, sol.placements).violations).toEqual([]);
    expect(sol.placements.length).toBe(4);
  }, 20000);
});
