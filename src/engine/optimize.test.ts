import { describe, expect, it } from 'vitest';
import type { Problem } from '../types';
import { centroid, intersection, multiArea } from './geometry';
import { optimize, optimizeAsync, OPTIMIZER_VERSION, repairPlacements } from './optimize';
import { makeTemplate } from './templates';
import { concaveMaterial, concaveProblem, rect } from './testFixtures';
import { verifySolution } from './verify';

/** Reloj congelado: el límite de tiempo nunca corta ⇒ resultado puramente determinista. */
const frozen = () => 0;

describe('optimize', () => {
  for (const n of [6, 8, 10] as const) {
    it(`retazo cóncavo con ${n} piezas + 1 defecto produce plan válido`, () => {
      const p = concaveProblem(n);
      const sol = optimize(p);
      const v = verifySolution(p, sol.placements);
      expect(v.violations).toEqual([]);
      expect(sol.placements.length).toBeGreaterThan(0);
      expect(sol.optimizerVersion).toBe(OPTIMIZER_VERSION);
      expect(sol.seed).toBe(42);
      expect(sol.metrics.placedCount).toBe(sol.placements.length);
    });
  }

  it('12 piezas: válido y en < 5 s', () => {
    const p = concaveProblem(12);
    const t0 = performance.now();
    const sol = optimize(p);
    const ms = performance.now() - t0;
    console.log(`[perf] 12 piezas: ${sol.placements.length}/12 colocadas en ${ms.toFixed(0)} ms (elapsedMs=${sol.elapsedMs.toFixed(0)}), utilización ${sol.metrics.usableUtilization.toFixed(1)}%`);
    expect(verifySolution(p, sol.placements).valid).toBe(true);
    expect(ms).toBeLessThan(5000);
    expect(sol.placements.length).toBeGreaterThanOrEqual(8);
  });

  it('un segundo defecto que invade piezas fuerza reposicionar y sigue siendo válido', () => {
    const p1 = concaveProblem(8);
    const s1 = optimize(p1, { now: frozen });
    expect(s1.placements.length).toBeGreaterThan(0);
    const [cx, cy] = centroid(s1.placements[0].polygon);
    const newDefect = rect(cx - 8, cy - 8, 16, 16);
    const p2: Problem = { ...p1, defects: [...p1.defects, newDefect] };
    expect(verifySolution(p2, s1.placements).valid).toBe(false); // el plan viejo ya no vale
    const s2 = optimize(p2, { now: frozen });
    expect(verifySolution(p2, s2.placements).violations).toEqual([]);
    for (const pl of s2.placements) expect(multiArea(intersection(pl.polygon, newDefect))).toBe(0);
    expect(s2.placements.length).toBeGreaterThan(0);
  });

  it('determinista: mismo input + seed ⇒ misma salida', () => {
    const p = concaveProblem(10, { seed: 7 });
    const a = optimize(p, { now: frozen });
    const b = optimize(p, { now: frozen });
    expect(b.placements).toEqual(a.placements);
    expect(b.metrics).toEqual(a.metrics);
  });

  it('determinista con reloj real cuando el presupuesto no corta', () => {
    const p = concaveProblem(6, { seed: 3 });
    expect(optimize(p).placements).toEqual(optimize(p).placements);
  });

  it('pieza gigante ⇒ pendiente, el resto se coloca', () => {
    const p: Problem = {
      ...concaveProblem(6),
      templates: [...concaveProblem(6).templates, makeTemplate(4, 'rect', 600, 500, 1, 'Gigante')],
    };
    const sol = optimize(p, { now: frozen, maxIterations: 8 });
    expect(verifySolution(p, sol.placements).valid).toBe(true);
    expect(sol.metrics.pending.t4).toBe(1);
    expect(sol.placements.some((x) => x.templateId === 't4')).toBe(false);
    expect(sol.placements.length).toBeGreaterThan(0);
  });

  it('spacing imposible ⇒ ningún plan inválido (vacío)', () => {
    const p = concaveProblem(6, { spacing: 500 });
    const sol = optimize(p);
    expect(sol.placements).toEqual([]);
    expect(verifySolution(p, sol.placements).valid).toBe(true);
    expect(sol.metrics.pending).toEqual(sol.metrics.requested);
  });

  it('spacing grande pero posible ⇒ solo se colocan piezas válidas', () => {
    const p = concaveProblem(10, { spacing: 40 });
    const sol = optimize(p, { now: frozen, maxIterations: 10 });
    expect(verifySolution(p, sol.placements).violations).toEqual([]);
  });

  it('defectos que cubren todo el material ⇒ placements: []', () => {
    const p = concaveProblem(8, { defects: [rect(-50, -50, 300, 400), rect(200, -50, 300, 400)] });
    const sol = optimize(p);
    expect(sol.placements).toEqual([]);
    expect(sol.metrics.usableArea).toBeCloseTo(0, 3);
  });

  it('material degenerado ⇒ placements: []', () => {
    const p = concaveProblem(6, { material: [[0, 0], [10, 0], [20, 0]] });
    expect(optimize(p).placements).toEqual([]);
  });

  it('respeta el reloj inyectable (presupuesto agotado tras la primera pasada)', () => {
    let t = 0;
    const clock = () => (t += 1000);
    const p = concaveProblem(10, { timeLimitMs: 1500 });
    const sol = optimize(p, { now: clock });
    expect(verifySolution(p, sol.placements).valid).toBe(true);
  });

  it('spacing 0 en rectángulo: llena una rejilla casi exacta', () => {
    // holgura de 0.5 por eje: el optimizador reserva un margen ínfimo (OPT_MARGIN_REL) entre piezas
    const p: Problem = {
      material: rect(0, 0, 100.5, 60.5), defects: [], spacing: 0, seed: 1,
      templates: [makeTemplate(0, 'rect', 25, 20, 12)],
    };
    const sol = optimize(p, { now: frozen });
    expect(verifySolution(p, sol.placements).valid).toBe(true);
    expect(sol.placements.length).toBe(12);
  });

  it('optimizeAsync devuelve un plan válido e informa progreso', async () => {
    const p = concaveProblem(8);
    const fractions: number[] = [];
    const sol = await optimizeAsync(p, (f) => { fractions.push(f); });
    expect(verifySolution(p, sol.placements).valid).toBe(true);
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions[fractions.length - 1]).toBe(1);
    expect(fractions.every((f, i) => f >= 0 && f <= 1 && (i === 0 || f >= fractions[i - 1]))).toBe(true);
  });

  it('el material de los fixtures es el cóncavo', () => {
    expect(concaveProblem(6).material).toBe(concaveMaterial);
  });

  it('repairPlacements elimina las piezas infractoras', () => {
    const p: Problem = { material: rect(0, 0, 100, 100), defects: [rect(80, 80, 10, 10)], spacing: 1, templates: [makeTemplate(0, 'rect', 20, 10, 3)] };
    const ps = [
      { templateId: 't0', instance: 0, rotation: 0, polygon: rect(10, 10, 20, 10) },
      { templateId: 't0', instance: 1, rotation: 0, polygon: rect(15, 12, 20, 10) }, // solapa con 0
      { templateId: 't0', instance: 2, rotation: 0, polygon: rect(75, 75, 20, 10) }, // invade defecto
    ];
    const fixed = repairPlacements(p, ps);
    expect(fixed).toEqual([ps[0]]);
    expect(verifySolution(p, fixed).valid).toBe(true);
  });
});
