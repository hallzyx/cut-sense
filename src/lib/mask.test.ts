import { describe, expect, it } from 'vitest';
import { largestComponent, maskToPolygon, traceOuter } from './mask';
import { absArea, pointInRing, ringProblem } from './poly';
import type { Ring } from '../types';

const poly: Ring = [[110, 120], [300, 70], [520, 95], [700, 160], [730, 330], [650, 480], [470, 520], [380, 450], [250, 505], [120, 430], [90, 280]];
const w = 400, h = 300;
const data = new Uint8Array(w * h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = pointInRing([x * 2, y * 2], poly) ? 1 : 0;

describe('máscara → polígono', () => {
  it('traza el contorno exterior y termina', () => {
    const t = traceOuter(largestComponent({ w, h, data }));
    expect(t.length).toBeGreaterThan(100);
    expect(t.length).toBeLessThan(w * h / 10);
  });
  it('produce un polígono simple con área cercana a la real', () => {
    const r = maskToPolygon({ w, h, data }, 800, 600);
    expect(ringProblem(r.polygon)).toBeNull();
    expect(absArea(r.polygon) / absArea(poly)).toBeGreaterThan(0.95);
    expect(absArea(r.polygon) / absArea(poly)).toBeLessThan(1.05);
  });
  it('máscara vacía → sin polígono', () => {
    expect(maskToPolygon({ w: 10, h: 10, data: new Uint8Array(100) }, 10, 10).polygon).toEqual([]);
  });
});
