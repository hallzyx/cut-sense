import { describe, expect, it } from 'vitest';
import { shortfallMessage } from './shortfall';

describe('diagnosis for Hilo', () => {
  const base = {
    product: 'my order', unit: 'cm', materialW: 69.4, materialH: 45, usableArea: 2388.9, spacing: 0.2, placed: 1, requested: 3,
    calibration: { dist: 10, unit: 'cm' },
    pieces: [
      { name: 'Main strip', kind: 'rect' as const, w: 80, h: 3, qty: 1, rotations: [0, 90] },
      { name: 'Loop', kind: 'rrect' as const, w: 5, h: 2, qty: 2, rotations: [0] },
    ],
  };

  it('summarizes pieces, material, calibration and what fit', () => {
    const t = shortfallMessage(base);
    expect(t).toContain('only 1 of 3');
    expect(t).toContain('Main strip: rectangle, 80 × 3 cm');
    expect(t).toContain('box of 69.4 × 45 cm');
    expect(t).toContain('reference of 10 cm');
    expect(t).toContain('The largest piece is "Main strip"');
    expect(t).toMatch(/be honest/);
  });

  it('fits the chat message limit (1500) even with many pieces', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...base.pieces[0], name: 'P'.repeat(80) + i }));
    expect(shortfallMessage({ ...base, pieces: many, product: 'x'.repeat(500) }).length).toBeLessThan(1500);
  });

  it('warns if the photo has no calibration', () => {
    expect(shortfallMessage({ ...base, calibration: null })).toContain('no physical calibration');
  });
});
