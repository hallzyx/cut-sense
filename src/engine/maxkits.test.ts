import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../lib/examples';
import { KITS } from '../lib/kits';
import type { Placement, Problem, Ring, Template } from '../types';
import { expandKits, maximizeKits, maximizeKitsAsync } from './maxkits';
import { buildShape, makeTemplate } from './templates';
import { rect } from './testFixtures';
import { verifySolution } from './verify';

const frozen = () => 0;

/** Comprueba que cada kit k posee exactamente las instancias [k·qty, (k+1)·qty) de cada plantilla. */
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
  it('chapa rectangular con capacidad conocida: 4 kits (2×20x20 + 1×10x10)', () => {
    // 101×41 en vez de 100×40: el optimizador reserva un margen ínfimo entre piezas (OPT_MARGIN_REL)
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

  it('cartera de cuero (14 px/cm, spacing 2.8 px, mancha) sobre el ejemplo de cuero', () => {
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
    console.log(`[kits] cartera en cuero: ${r.kits} carteras completas en ${ms.toFixed(0)} ms; intentos ${JSON.stringify(r.attempts)}`);
    expect(r.kits).toBeGreaterThanOrEqual(1);
    expect(verifySolution(expandKits(p, r.kits), r.solution.placements).violations).toEqual([]);
    expectCompleteKits(p, r.kits, r.solution.placements);
    expect(ms).toBeLessThan(8000 * 1.25 + 500);
  }, 30000);

  it('kits === 0 si ni un kit cabe: devuelve el plan parcial de un kit', () => {
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

  it('determinista con reloj inyectado', () => {
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
    console.log(`[kits] determinismo: ${a.kits} kits, intentos ${JSON.stringify(a.attempts)}`);
  }, 30000);

  it('respeta maxKits', () => {
    const p: Problem = { material: rect(0, 0, 200, 200), defects: [], spacing: 0, seed: 1, templates: [makeTemplate(0, 'rect', 10, 10, 1)] };
    expect(maximizeKits(p, { now: frozen, maxKits: 3 }).kits).toBe(3);
  });

  it('respeta el presupuesto de tiempo (reloj real, caso con intentos fallidos)', () => {
    const p: Problem = {
      material: [[0, 0], [160, 0], [170, 60], [120, 110], [60, 90], [0, 120]], defects: [rect(70, 30, 20, 20)],
      spacing: 2, seed: 5,
      templates: [makeTemplate(0, 'rect', 30, 20, 1), makeTemplate(1, 'circle', 18, 18, 1), makeTemplate(2, 'trapezoid', 25, 15, 1)],
    };
    const t0 = performance.now();
    const r = maximizeKits(p, { timeLimitMs: 2000 });
    const ms = performance.now() - t0;
    console.log(`[kits] presupuesto 2000 ms: ${r.kits} kits en ${ms.toFixed(0)} ms, ${r.attempts.length} intentos`);
    expect(ms).toBeLessThan(2000 * 1.25 + 300);
    expect(r.kits).toBeGreaterThanOrEqual(4);
    expect(verifySolution(expandKits(p, r.kits), r.solution.placements).valid).toBe(true);
    expectCompleteKits(p, r.kits, r.solution.placements);
  }, 20000);

  it('versión asíncrona: mismo resultado e informa progreso hasta 1', async () => {
    const p: Problem = { material: rect(0, 0, 101, 41), defects: [], spacing: 0, seed: 1, templates: [makeTemplate(0, 'rect', 20, 20, 2), makeTemplate(1, 'rect', 10, 10, 1)] };
    const fr: number[] = [];
    const r = await maximizeKitsAsync(p, (f) => fr.push(f), { now: frozen });
    expect(r.kits).toBe(maximizeKits(p, { now: frozen }).kits);
    expect(fr[fr.length - 1]).toBe(1);
  });
});
