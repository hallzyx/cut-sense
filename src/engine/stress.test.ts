import { describe, expect, it } from 'vitest';
import type { Problem, Ring } from '../types';
import { mulberry32, optimize } from './optimize';
import { makeTemplate } from './templates';
import { concaveMaterial, rect } from './testFixtures';
import { verifySolution } from './verify';

/** Densifica el contorno cóncavo con ruido (simula un contorno de SAM con cientos de vértices). */
function noisyMaterial(perEdge: number, amp: number, seed: number): Ring {
  const rng = mulberry32(seed);
  const out: Ring = [];
  const n = concaveMaterial.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = concaveMaterial[i], [bx, by] = concaveMaterial[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (let k = 0; k < perEdge; k++) {
      const t = k / perEdge, j = k === 0 ? 0 : (rng() - 0.5) * 2 * amp;
      out.push([ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j]);
    }
  }
  return out;
}

describe('estrés: 12 piezas grandes, contorno de ~300 vértices, 3 defectos', () => {
  const problem: Problem = {
    material: noisyMaterial(30, 1.5, 9),
    defects: [rect(100, 90, 40, 35), rect(300, 200, 30, 50), rect(380, 20, 60, 30)],
    templates: [
      makeTemplate(0, 'rect', 90, 60, 4),
      makeTemplate(1, 'circle', 70, 70, 3),
      makeTemplate(2, 'trapezoid', 100, 60, 3),
      makeTemplate(3, 'irregular', 90, 80, 2),
    ],
    spacing: 4,
    seed: 2024,
  };

  it('plan válido en < 5 s y determinista', () => {
    const t0 = performance.now();
    const sol = optimize(problem);
    const ms = performance.now() - t0;
    console.log(`[perf] estrés 12 piezas / ${problem.material.length} vértices: ${sol.placements.length}/12 en ${ms.toFixed(0)} ms, utilización ${sol.metrics.usableUtilization.toFixed(1)}%`);
    expect(verifySolution(problem, sol.placements).violations).toEqual([]);
    expect(ms).toBeLessThan(5000);
    expect(sol.placements.length).toBeGreaterThan(4);
    // determinismo: con el reloj congelado (presupuesto que nunca corta) se obtiene lo mismo
    expect(optimize(problem, { now: () => 0 }).placements).toEqual(sol.placements);
  }, 20000);
});
