import { describe, expect, it } from 'vitest';
import { shortfallMessage } from './shortfall';

describe('diagnóstico para Hilo', () => {
  const base = {
    product: 'mi pedido', unit: 'cm', materialW: 69.4, materialH: 45, usableArea: 2388.9, spacing: 0.2, placed: 1, requested: 3,
    calibration: { dist: 10, unit: 'cm' },
    pieces: [
      { name: 'Tira principal', kind: 'rect' as const, w: 80, h: 3, qty: 1, rotations: [0, 90] },
      { name: 'Presilla', kind: 'rrect' as const, w: 5, h: 2, qty: 2, rotations: [0] },
    ],
  };

  it('resume piezas, material, calibración y lo que cupo', () => {
    const t = shortfallMessage(base);
    expect(t).toContain('solo se colocaron 1 de 3');
    expect(t).toContain('Tira principal: rectángulo, 80 × 3 cm');
    expect(t).toContain('caja de 69,4 × 45 cm');
    expect(t).toContain('referencia de 10 cm');
    expect(t).toContain('La pieza más grande es «Tira principal»');
    expect(t).toMatch(/sé sincero/);
  });

  it('cabe en el límite de mensaje del chat (1500) incluso con muchas piezas', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...base.pieces[0], name: 'P'.repeat(80) + i }));
    expect(shortfallMessage({ ...base, pieces: many, product: 'x'.repeat(500) }).length).toBeLessThan(1500);
  });

  it('avisa si la foto no tiene calibración', () => {
    expect(shortfallMessage({ ...base, calibration: null })).toContain('no tiene calibración física');
  });
});
