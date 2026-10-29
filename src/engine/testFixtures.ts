/** Fixtures compartidos por los tests del motor (no forman parte de la API pública). */
import type { Problem, Ring, Template } from '../types';
import { makeTemplate } from './templates';

export function rect(x: number, y: number, w: number, h: number): Ring {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** Retazo cóncavo irregular (~415×310) con una muesca interior. */
export const concaveMaterial: Ring = [
  [0, 0], [400, 0], [410, 120], [380, 300], [230, 310], [220, 170],
  [170, 160], [150, 300], [10, 290], [-5, 140],
];

export function concaveTemplates(total: 6 | 8 | 10 | 12): Template[] {
  const q: Record<number, [number, number, number, number]> = {
    6: [2, 2, 1, 1], 8: [3, 2, 2, 1], 10: [4, 2, 2, 2], 12: [5, 3, 2, 2],
  };
  const [a, b, c, d] = q[total];
  return [
    makeTemplate(0, 'rect', 60, 40, a),
    makeTemplate(1, 'circle', 45, 45, b),
    makeTemplate(2, 'trapezoid', 70, 45, c),
    makeTemplate(3, 'irregular', 60, 55, d),
  ];
}

export function concaveProblem(total: 6 | 8 | 10 | 12, extra: Partial<Problem> = {}): Problem {
  return {
    material: concaveMaterial,
    defects: [rect(100, 90, 40, 35)],
    templates: concaveTemplates(total),
    spacing: 3,
    seed: 42,
    ...extra,
  };
}
