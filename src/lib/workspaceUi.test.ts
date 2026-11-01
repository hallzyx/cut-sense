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

describe('lista del paso 2 (resúmenes y estado)', () => {
  it('① Escala: calibrado = hecho; sin calibrar = pendiente; un producto que pidió cm = atención', () => {
    expect(scaleItem(cm, false)).toEqual({ state: 'done', label: 'Calibrado · cm', relative: false });
    expect(scaleItem(null, false)).toMatchObject({ state: 'todo', label: 'Sin calibrar', relative: true });
    expect(scaleItem(null, true).state).toBe('attention');
    expect(scaleItem({ ...cm, unit: 'in' }, true).state).toBe('attention');
    expect(scaleItem(cm, true).state).toBe('done');
  });

  it('② Zonas: hecho con zonas o confirmado sin defectos; atención si no se revisó o hay zonas fuera', () => {
    expect(zonesItem(1, false, false)).toEqual({ state: 'done', label: '1 zona' });
    expect(zonesItem(3, false, false).label).toBe('3 zonas');
    expect(zonesItem(0, false, false)).toEqual({ state: 'attention', label: 'Sin revisar' });
    expect(zonesItem(0, true, false)).toEqual({ state: 'done', label: 'Sin defectos' });
    expect(zonesItem(2, false, true).state).toBe('attention');
  });

  it('③ Piezas: nombre del producto y piezas por juego, o el total en cantidad exacta', () => {
    const tarjetero = kitToDefs(KITS.find((k) => k.id === 'tarjetero')!);
    expect(piecesItem(tarjetero, 'maxKits')).toEqual({ state: 'done', label: 'Tarjetero · 5 por juego' });
    expect(piecesItem([def({ qty: 2 }), def({ id: 't1', qty: 2 })], 'fixed')).toEqual({ state: 'done', label: '4 piezas' });
    expect(piecesItem([def(), def({ id: 't1' })], 'maxKits').label).toBe('2 tipos · 2 por juego');
    expect(piecesItem([], 'fixed')).toEqual({ state: 'todo', label: 'Ninguna aún' });
    expect(piecesItem([def({ qty: 0 })], 'fixed').state).toBe('todo');
  });

  it('el pedido deja de ser «el kit» en cuanto se edita una medida', () => {
    const defs = kitToDefs(KITS.find((k) => k.id === 'cartera')!);
    expect(matchKit(defs)?.id).toBe('cartera');
    expect(matchKit(defs.map((d, i) => (i === 0 ? { ...d, w: d.w + 1 } : d)))).toBeUndefined();
  });

  it('abre el primer ítem sin terminar; si todo está listo, Piezas', () => {
    expect(defaultOpenItem({ scale: 'todo', zones: 'done', pieces: 'todo' })).toBe('scale');
    expect(defaultOpenItem({ scale: 'done', zones: 'attention', pieces: 'todo' })).toBe('zones');
    expect(defaultOpenItem({ scale: 'done', zones: 'done', pieces: 'done' })).toBe('pieces');
  });

  it('una zona sin contacto con el material no tiene efecto', () => {
    const mat = sq(0, 0, 100);
    expect(zoneOutside(sq(200, 200, 10), mat, pointInRing)).toBe(true);
    expect(zoneOutside(sq(10, 10, 10), mat, pointInRing)).toBe(false);
    expect(zoneOutside(sq(-50, -50, 300), mat, pointInRing)).toBe(false); // cubre el material entero
  });
});

describe('acción principal y exportación', () => {
  it('Optimizar se bloquea con contorno inválido, pedido vacío o sin área útil, con el motivo', () => {
    expect(optimizeBlockReason({ contourErr: 'x', usableArea: 10, defs: [def()] })).toBe('Corrige el contorno en el paso 1.');
    expect(optimizeBlockReason({ contourErr: null, usableArea: 10, defs: [] })).toBe('Añade al menos una pieza para optimizar.');
    expect(optimizeBlockReason({ contourErr: null, usableArea: 10, defs: [def({ qty: 0 })] })).toBe('Añade al menos una pieza para optimizar.');
    expect(optimizeBlockReason({ contourErr: null, usableArea: 0, defs: [def()] })).toBe('Las zonas excluidas cubren todo el material.');
    expect(optimizeBlockReason({ contourErr: null, usableArea: 10, defs: [def()] })).toBeNull();
  });

  it('solo se exporta un plan verificado, vigente y con piezas; 1:1 además exige cm o mm', () => {
    expect(exportState(null, false)).toMatchObject({ exportable: false, physical: false });
    expect(exportState(result(), true)).toMatchObject({ exportable: false, physical: false, reason: 'Reoptimiza para exportar un plano vigente.' });
    expect(exportState(result({ valid: false }), false).exportable).toBe(false);
    expect(exportState(result({ placements: 0 }), false).exportable).toBe(false);
    expect(exportState(result(), false)).toEqual({ exportable: true, physical: true, reason: null, physicalReason: null });
    expect(exportState(result({ unit: 'mm' }), false).physical).toBe(true);
    const rel = exportState(result({ unit: 'u', calibrated: false }), false);
    expect(rel).toMatchObject({ exportable: true, physical: false });
    expect(rel.physicalReason).toMatch(/Calibra la foto en cm o mm/);
    expect(exportState(result({ unit: 'in' }), false).physical).toBe(false);
  });

  it('preferencias de exportación: valores por defecto ante datos ausentes o dañados', () => {
    expect(parseExportPrefs(null)).toEqual(DEFAULT_EXPORT_PREFS);
    expect(parseExportPrefs('{no json')).toEqual(DEFAULT_EXPORT_PREFS);
    expect(parseExportPrefs('{"withPhoto":false,"paper":"Carta","dxfRef":true}')).toEqual({ withPhoto: false, paper: 'Carta', dxfRef: true });
    expect(parseExportPrefs('{"paper":"A0","withPhoto":"sí"}')).toEqual(DEFAULT_EXPORT_PREFS);
  });
});

describe('héroe del resultado', () => {
  it('juegos completos, con piezas de otros productos aparte', () => {
    const h = heroFor(result({ kits: { n: 3, perKit: { t0: 5 } }, placed: 17 }), 2, {});
    expect(h).toMatchObject({ value: '3', unit: 'juegos', warn: null });
    expect(h.label).toBe('completos · 15 piezas, todas verificadas · 2 piezas de otros productos');
  });
  it('ni un juego: lo dice y explica el plan parcial', () => {
    expect(heroFor(result({ kits: { n: 0, perKit: { t0: 5 } } }), 0, {}).warn).toMatch(/Ni un juego completo cabe/);
  });
  it('cantidad exacta: completo o parcial con lo que falta', () => {
    expect(heroFor(result({ placed: 11, requested: 11 }), 0, {})).toMatchObject({ value: '11 de 11', label: 'piezas colocadas', warn: null });
    const p = heroFor(result({ placed: 9, requested: 11, pending: { t0: 2 } }), 0, { t0: 'Lengüeta' });
    expect(p.value).toBe('9 de 11');
    expect(p.warn).toBe('Verificado, pero incompleto: faltan 2 × Lengüeta. Prueba permitir giro de 90° o bajar la separación.');
  });
});

describe('qué cambió (plan desactualizado)', () => {
  const base = result();
  const t = { id: 't0', name: 'A', color: '#000', kind: 'rect' as const, w: 10, h: 5, qty: 2, rotations: [0], shape: sq(0, 0, 5) };
  base.problem = { material: sq(0, 0, 100), defects: [], templates: [t], spacing: 1 };
  it('nombra el cambio en una frase', () => {
    expect(staleWhat(base, { ...base.problem, defects: [sq(1, 1, 2)] }, false, false)).toBe('Marcaste una zona nueva.');
    expect(staleWhat(base, { ...base.problem, spacing: 3 }, false, false)).toBe('Cambiaste la separación.');
    expect(staleWhat(base, { ...base.problem, templates: [{ ...t, qty: 3 }] }, false, false)).toBe('Cambiaste las piezas.');
    expect(staleWhat(base, null, false, false)).toBe('El contorno ya no es válido.');
    expect(staleWhat(base, base.problem, true, false)).toBe('Cambiaste el modo de llenado.');
  });
  it('con juegos completos compara cantidades por juego, no las multiplicadas', () => {
    const kits = { ...base, kits: { n: 3, perKit: { t0: 2 } }, problem: { ...base.problem, templates: [{ ...t, qty: 6 }] } };
    expect(staleWhat(kits, { ...base.problem, defects: [sq(1, 1, 2)] }, true, false)).toBe('Marcaste una zona nueva.');
  });
});
