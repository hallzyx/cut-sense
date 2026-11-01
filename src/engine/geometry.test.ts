import { describe, expect, it } from 'vitest';
import {
  bbox, bufferRing, centroid, isSimple, multiArea, normalizeOrientation, offsetRingMiter, placeShape,
  polygonDistance, ringArea, rotateRing, signedArea, simplifyDP, union,
} from './geometry';
import { rect } from './testFixtures';

describe('geometry', () => {
  it('signed area, orientation and centroid', () => {
    const r = rect(0, 0, 10, 4);
    expect(signedArea(r)).toBe(40);
    expect(signedArea(r.slice().reverse())).toBe(-40);
    expect(signedArea(normalizeOrientation(r.slice().reverse()))).toBe(40);
    expect(centroid(r)).toEqual([5, 2]);
  });

  it('rotation around the bbox center and placement', () => {
    const r = rotateRing(rect(0, 0, 10, 4), 90);
    expect(bbox(r)).toEqual({ minX: 3, minY: -3, maxX: 7, maxY: 7 });
    expect(bbox(placeShape(rect(0, 0, 10, 4), 90, 5, 5))).toEqual({ minX: 5, minY: 5, maxX: 9, maxY: 15 });
  });

  it('simple vs self-intersecting polygon', () => {
    expect(isSimple(rect(0, 0, 1, 1))).toBe(true);
    expect(isSimple([[0, 0], [2, 2], [2, 0], [0, 2]])).toBe(false);
    expect(isSimple([[0, 0], [1, 0], [2, 0]])).toBe(false);
  });

  it('Douglas-Peucker preserves the shape', () => {
    const noisy = [[0, 0], [5, 0.01], [10, 0], [10, 10], [5, 10.02], [0, 10]] as [number, number][];
    expect(simplifyDP(noisy, 0.1)).toHaveLength(4);
  });

  it('distance between polygons', () => {
    expect(polygonDistance(rect(0, 0, 1, 1), rect(3, 0, 1, 1))).toBeCloseTo(2, 12);
    expect(polygonDistance(rect(0, 0, 10, 10), rect(2, 2, 1, 1))).toBe(0);
  });

  it('union without double counting', () => {
    expect(multiArea(union(rect(0, 0, 2, 2), rect(1, 1, 2, 2)))).toBeCloseTo(7, 9);
  });

  it('rounded buffer and miter offset', () => {
    const grown = multiArea(bufferRing(rect(0, 0, 10, 10), 1, 16));
    expect(grown).toBeGreaterThan(100 + 40 + Math.PI - 1e-9);
    expect(grown).toBeLessThan(100 + 40 + 4 + 1e-9);
    expect(multiArea(bufferRing(rect(0, 0, 10, 10), -1))).toBeCloseTo(64, 6);
    expect(ringArea(offsetRingMiter(rect(0, 0, 10, 10), 1))).toBeCloseTo(144, 9);
    expect(ringArea(offsetRingMiter(rect(0, 0, 10, 10), -1))).toBeCloseTo(64, 9);
  });
});
