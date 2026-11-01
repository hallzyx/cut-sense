import { describe, expect, it } from 'vitest';
import type { Ring } from '../types';
import { KITS } from './kits';
import { pointInRing } from './poly';
import {
  DEFAULT_EXPORT_PREFS, defaultOpenItem, exportState, heroFor, matchKit, optimizeBlockReason, parseExportPrefs, piecesItem, scaleItem, staleWhat, zoneOutside, zonesItem,
} from './workspaceUi';
import { kitToDefs, type Result, type TemplateDef } from '../state';

const cm = { a: [0, 0] as [number, number], b: [140, 0] as [number, number], dist: 10, unit: 'cm' };
const def = (o: Partial<TemplateDef> = {}): TemplateDef => ({ id: 't0', name: 'A', color: '#000', kind: 'rect', w: 10, h: 5, qty: 1, rotations: [0], ...o });
const sq = (x: number, y: number, s: number): Ring => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

function result(o: { valid?: boolean; placements?: number; unit?: string; calibrated?: boolean; kits?: Result['kits']; placed?: number; requested?: number; pending?: Record<string, number> } = {}): Result {
  const placements = Array.from({ length: o.placements ?? 3 }, (_, i) => ({ templateId: 't0', instance: i, rotation: 0, polygon: sq(i * 10, 0, 5) }));
  return {
    solution: {
      placements, elapsedMs: 10, optimizerVersion: 'cs-nest-1.0', seed: 1,
      metrics: { totalArea: 100, excludedArea: 0, usableArea: 100, occupiedArea: 50, usableUtilization: 50, materialUtilization: 50, requested: { t0: o.requested ?? 3 }, placed: { t0: o.placed ?? 3 }, pending: o.pending ?? { t0: 0 }, placedCount: o.placed ?? 3, requestedCount: o.requested ?? 3 },
    },
    verify: { valid: o.valid ?? true, violations: [] },
    problemKey: 'k', kits: o.kits, ppu: 14, unit: o.unit ?? 'cm', calibrated: o.calibrated ?? true,
    problem: { material: sq(0, 0, 100), defects: [], templates: [], spacing: 0 },
  };
}

describe('step 2 checklist (summaries and state)', () => {
  it('① Scale: calibrated = done; not calibrated = to do; a product that asked for cm = attention', () => {
    expect(scaleItem(cm, false)).toEqual({ state: 'done', label: 'Calibrated · cm', relative: false });
    expect(scaleItem(null, false)).toMatchObject({ state: 'todo', label: 'Not calibrated', relative: true });
    expect(scaleItem(null, true).state).toBe('attention');
    expect(scaleItem({ ...cm, unit: 'in' }, true).state).toBe('attention');
    expect(scaleItem(cm, true).state).toBe('done');
  });

  it('② Zones: done with zones or confirmed defect-free; attention if not reviewed or zones lie outside', () => {
    expect(zonesItem(1, false, false)).toEqual({ state: 'done', label: '1 zone' });
    expect(zonesItem(3, false, false).label).toBe('3 zones');
    expect(zonesItem(0, false, false)).toEqual({ state: 'attention', label: 'Not reviewed' });
    expect(zonesItem(0, true, false)).toEqual({ state: 'done', label: 'No defects' });
    expect(zonesItem(2, false, true).state).toBe('attention');
  });

  it('③ Pieces: product name and pieces per set, or the total in exact quantity', () => {
    const tarjetero = kitToDefs(KITS.find((k) => k.id === 'tarjetero')!);
    expect(piecesItem(tarjetero, 'maxKits')).toEqual({ state: 'done', label: 'Cardholder · 5 per set' });
    expect(piecesItem([def({ qty: 2 }), def({ id: 't1', qty: 2 })], 'fixed')).toEqual({ state: 'done', label: '4 pieces' });
    expect(piecesItem([def(), def({ id: 't1' })], 'maxKits').label).toBe('2 types · 2 per set');
    expect(piecesItem([], 'fixed')).toEqual({ state: 'todo', label: 'None yet' });
    expect(piecesItem([def({ qty: 0 })], 'fixed').state).toBe('todo');
  });

  it('the order stops being “the kit” as soon as a size is edited', () => {
    const defs = kitToDefs(KITS.find((k) => k.id === 'cartera')!);
    expect(matchKit(defs)?.id).toBe('cartera');
    expect(matchKit(defs.map((d, i) => (i === 0 ? { ...d, w: d.w + 1 } : d)))).toBeUndefined();
  });

  it('opens the first unfinished item; if everything is ready, Pieces', () => {
    expect(defaultOpenItem({ scale: 'todo', zones: 'done', pieces: 'todo' })).toBe('scale');
    expect(defaultOpenItem({ scale: 'done', zones: 'attention', pieces: 'todo' })).toBe('zones');
    expect(defaultOpenItem({ scale: 'done', zones: 'done', pieces: 'done' })).toBe('pieces');
  });

  it('a zone that does not touch the material has no effect', () => {
    const mat = sq(0, 0, 100);
    expect(zoneOutside(sq(200, 200, 10), mat, pointInRing)).toBe(true);
    expect(zoneOutside(sq(10, 10, 10), mat, pointInRing)).toBe(false);
    expect(zoneOutside(sq(-50, -50, 300), mat, pointInRing)).toBe(false); // covers the whole material
  });
});

describe('main action and export', () => {
  it('Optimize is blocked by an invalid outline, an empty order or no usable area, with the reason', () => {
    expect(optimizeBlockReason({ contourErr: 'x', usableArea: 10, defs: [def()] })).toBe('Fix the outline in step 1.');
    expect(optimizeBlockReason({ contourErr: null, usableArea: 10, defs: [] })).toBe('Add at least one piece to optimize.');
    expect(optimizeBlockReason({ contourErr: null, usableArea: 10, defs: [def({ qty: 0 })] })).toBe('Add at least one piece to optimize.');
    expect(optimizeBlockReason({ contourErr: null, usableArea: 0, defs: [def()] })).toBe('The excluded zones cover the whole material.');
    expect(optimizeBlockReason({ contourErr: null, usableArea: 10, defs: [def()] })).toBeNull();
  });

  it('only a verified, up-to-date plan with pieces is exported; 1:1 also needs cm or mm', () => {
    expect(exportState(null, false)).toMatchObject({ exportable: false, physical: false });
    expect(exportState(result(), true)).toMatchObject({ exportable: false, physical: false, reason: 'Re-optimize to export an up-to-date plan.' });
    expect(exportState(result({ valid: false }), false).exportable).toBe(false);
    expect(exportState(result({ placements: 0 }), false).exportable).toBe(false);
    expect(exportState(result(), false)).toEqual({ exportable: true, physical: true, reason: null, physicalReason: null });
    expect(exportState(result({ unit: 'mm' }), false).physical).toBe(true);
    const rel = exportState(result({ unit: 'u', calibrated: false }), false);
    expect(rel).toMatchObject({ exportable: true, physical: false });
    expect(rel.physicalReason).toMatch(/Calibrate the photo in cm or mm/);
    expect(exportState(result({ unit: 'in' }), false).physical).toBe(false);
  });

  it('export preferences: defaults for missing or corrupt data', () => {
    expect(parseExportPrefs(null)).toEqual(DEFAULT_EXPORT_PREFS);
    expect(parseExportPrefs('{no json')).toEqual(DEFAULT_EXPORT_PREFS);
    expect(parseExportPrefs('{"withPhoto":false,"paper":"Carta","dxfRef":true}')).toEqual({ withPhoto: false, paper: 'Carta', dxfRef: true });
    expect(parseExportPrefs('{"paper":"A0","withPhoto":"yes"}')).toEqual(DEFAULT_EXPORT_PREFS);
  });
});

describe('result hero', () => {
  it('complete sets, with pieces from other products counted apart', () => {
    const h = heroFor(result({ kits: { n: 3, perKit: { t0: 5 } }, placed: 17 }), 2, {});
    expect(h).toMatchObject({ value: '3', unit: 'sets', warn: null });
    expect(h.label).toBe('complete · 15 pieces, all verified · 2 pieces from other products');
  });
  it('not even one set: says so and explains the partial plan', () => {
    expect(heroFor(result({ kits: { n: 0, perKit: { t0: 5 } } }), 0, {}).warn).toMatch(/Not even one complete set fits/);
  });
  it('exact quantity: complete, or partial with what is missing', () => {
    expect(heroFor(result({ placed: 11, requested: 11 }), 0, {})).toMatchObject({ value: '11 of 11', label: 'pieces placed', warn: null });
    const p = heroFor(result({ placed: 9, requested: 11, pending: { t0: 2 } }), 0, { t0: 'Tab' });
    expect(p.value).toBe('9 of 11');
    expect(p.warn).toBe('Verified, but incomplete: missing 2 × Tab. Try allowing 90° rotation or reducing the spacing.');
  });
});

describe('what changed (out-of-date plan)', () => {
  const base = result();
  const t = { id: 't0', name: 'A', color: '#000', kind: 'rect' as const, w: 10, h: 5, qty: 2, rotations: [0], shape: sq(0, 0, 5) };
  base.problem = { material: sq(0, 0, 100), defects: [], templates: [t], spacing: 1 };
  it('names the change in one sentence', () => {
    expect(staleWhat(base, { ...base.problem, defects: [sq(1, 1, 2)] }, false, false)).toBe('You marked a new zone.');
    expect(staleWhat(base, { ...base.problem, spacing: 3 }, false, false)).toBe('You changed the spacing.');
    expect(staleWhat(base, { ...base.problem, templates: [{ ...t, qty: 3 }] }, false, false)).toBe('You changed the pieces.');
    expect(staleWhat(base, null, false, false)).toBe('The outline is no longer valid.');
    expect(staleWhat(base, base.problem, true, false)).toBe('You changed the fill mode.');
  });
  it('with complete sets it compares quantities per set, not the multiplied ones', () => {
    const kits = { ...base, kits: { n: 3, perKit: { t0: 2 } }, problem: { ...base.problem, templates: [{ ...t, qty: 6 }] } };
    expect(staleWhat(kits, { ...base.problem, defects: [sq(1, 1, 2)] }, true, false)).toBe('You marked a new zone.');
  });
});
