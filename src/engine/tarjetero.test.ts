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

describe('regresión: tarjetero en retal real con mancha (spacing 2.8 px)', () => {
  it('3 kits (15 piezas) caben en el material completo', () => {
    const p = expandKits(base, 3);
    const t0 = performance.now();
    const sol = optimize(p);
    console.log(`[tarjetero] optimize 3 kits: ${sol.placements.length}/15 en ${(performance.now() - t0).toFixed(0)} ms`);
    expect(verifySolution(p, sol.placements).violations).toEqual([]);
    expect(sol.placements.length).toBe(15);
  }, 20000);

  it('maximizeKits(base).kits >= 3 (reloj real, presupuesto por defecto)', () => {
    const t0 = performance.now();
    const r = maximizeKits(base);
    const ms = performance.now() - t0;
    console.log(`[tarjetero] maximizeKits: ${r.kits} kits en ${ms.toFixed(0)} ms; intentos ${JSON.stringify(r.attempts)}`);
    expect(r.kits).toBeGreaterThanOrEqual(3);
    expect(verifySolution(expandKits(base, r.kits), r.solution.placements).violations).toEqual([]);
    expect(ms).toBeLessThan(8000 * 1.25 + 500);
  }, 30000);

  it('maximizeKits determinista con reloj congelado (maxKits 3) ⇒ 3 kits', () => {
    const a = maximizeKits(base, { now: frozen, maxKits: 3 });
    const b = maximizeKits(base, { now: frozen, maxKits: 3 });
    expect(a.kits).toBe(3);
    expect(b.solution.placements).toEqual(a.solution.placements);
  }, 30000);

  it('sobrante con 11 agujeros: plan válido con 4 de 5 piezas (máximo comprobado)', () => {
    // Una búsqueda exhaustiva con backtracking sobre rejillas de 4 px y 2.5 px (todas las rotaciones
    // permitidas, separación 2.8 px) no encontró ninguna disposición con las 5 piezas del kit en este
    // sobrante: la franja inferior libre solo admite 3 piezas de 133 px de ancho más la pestaña.
    const p2: Problem = { ...base, material: tarjeteroRemainderMaterial, defects: tarjeteroRemainderHoles };
    const t0 = performance.now();
    const sol = optimize(p2);
    console.log(`[tarjetero] sobrante: ${sol.placements.length}/5 en ${(performance.now() - t0).toFixed(0)} ms`);
    expect(verifySolution(p2, sol.placements).violations).toEqual([]);
    expect(sol.placements.length).toBe(4);
  }, 20000);
});
