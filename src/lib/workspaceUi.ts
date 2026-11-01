import type { Problem, Ring } from '../types';
import { KITS } from './kits';
import { pxPerCm } from './print';
import { fmt, type Calib, type Result, type TemplateDef } from '../state';

/**
 * Reglas de presentación del espacio de trabajo (UX-REDESIGN.md §4): qué resumen muestra cada
 * paso de la lista, qué bloquea la acción principal y qué se puede exportar. Sin DOM: se prueba en node.
 */

export type CheckState = 'done' | 'todo' | 'attention';
export type CheckId = 'scale' | 'zones' | 'pieces';

export const plural = (n: number, one: string, many: string) => `${fmt(n, 0)} ${n === 1 ? one : many}`;

const isCm = (c: Calib | null | undefined) => !!c && c.unit.trim().toLowerCase() === 'cm';
export const calibratedInCm = isCm;

/** ① Escala: calibrada (sólido) o relativa (punteado, ≈). `needsCm`: un producto o diseño IA pidió cm. */
export function scaleItem(calib: Calib | null, needsCm: boolean): { state: CheckState; label: string; relative: boolean } {
  if (calib) {
    const attn = needsCm && !isCm(calib);
    return { state: attn ? 'attention' : 'done', label: `Calibrado · ${calib.unit}`, relative: false };
  }
  return { state: needsCm ? 'attention' : 'todo', label: 'Sin calibrar', relative: true };
}

/** ② Zonas excluidas: hecho si hay zonas o el usuario confirmó que no tiene defectos. */
export function zonesItem(count: number, confirmedNone: boolean, anyOutside: boolean): { state: CheckState; label: string } {
  const label = count ? plural(count, 'zona', 'zonas') : confirmedNone ? 'Sin defectos' : 'Sin revisar';
  if (anyOutside) return { state: 'attention', label };
  if (count > 0 || confirmedNone) return { state: 'done', label };
  return { state: 'attention', label };
}

/** El kit de catálogo que coincide exactamente con el pedido (nombres, formas, medidas, cantidades). */
export function matchKit(defs: TemplateDef[]) {
  return KITS.find((k) => k.pieces.length === defs.length && k.pieces.every((x, i) => {
    const d = defs[i];
    return d.name === x.name && d.kind === x.kind && d.w === x.w && d.h === x.h && d.qty === x.qty;
  }));
}

/** ③ Piezas: «Tarjetero · 5 por juego», «4 piezas», «Ninguna aún». */
export function piecesItem(defs: TemplateDef[], fill: 'fixed' | 'maxKits'): { state: CheckState; label: string } {
  const total = defs.reduce((s, d) => s + d.qty, 0);
  if (!defs.length || total === 0) return { state: 'todo', label: defs.length ? 'Cantidades en 0' : 'Ninguna aún' };
  const kit = matchKit(defs);
  if (fill === 'maxKits') return { state: 'done', label: `${kit ? kit.name.replace(/ de cuero$/, '') : plural(defs.length, 'tipo', 'tipos')} · ${fmt(total, 0)} por juego` };
  return { state: 'done', label: plural(total, 'pieza', 'piezas') };
}

/** Ítem abierto por defecto: el primero sin terminar; si todo está listo, Piezas (lo que más se edita). */
export function defaultOpenItem(states: Record<CheckId, CheckState>): CheckId {
  return (['scale', 'zones', 'pieces'] as CheckId[]).find((id) => states[id] !== 'done') ?? 'pieces';
}

/** Por qué no se puede optimizar (o null). Mismo orden de reglas que optimize(). */
export function optimizeBlockReason(o: { contourErr: string | null; usableArea: number | null; defs: TemplateDef[] }): string | null {
  if (o.contourErr) return 'Corrige el contorno en el paso 1.';
  if (!o.defs.length || o.defs.every((d) => d.qty === 0)) return 'Añade al menos una pieza para optimizar.';
  if (o.usableArea !== null && o.usableArea <= 0) return 'Las zonas excluidas cubren todo el material.';
  return null;
}

export interface ExportState {
  /** SVG/PNG: plan verificado, vigente y con piezas. */
  exportable: boolean;
  /** 1:1, SVG en cm y DXF: además, escala física (cm o mm). */
  physical: boolean;
  /** Motivo visible cuando Exportar está deshabilitado. */
  reason: string | null;
  /** Motivo del grupo 1:1 deshabilitado. */
  physicalReason: string | null;
}

export function exportState(result: Result | null, stale: boolean): ExportState {
  const exportable = !!result && !stale && result.verify.valid && result.solution.placements.length > 0;
  const physical = exportable && !!result && pxPerCm(result) !== null;
  const reason = exportable ? null
    : !result ? 'Optimiza para obtener un plano.'
      : stale ? 'Reoptimiza para exportar un plano vigente.'
        : !result.verify.valid ? 'El plan no pasó la verificación: no se exporta.'
          : 'No hay piezas colocadas que exportar.';
  return { exportable, physical, reason, physicalReason: physical || !exportable ? null : 'Calibra la foto en cm o mm (paso 2) para exportar a escala real.' };
}

export interface Hero { value: string; unit: string; label: string; warn: string | null }

/** Lo que el usuario vino a buscar, en una cifra (UX-REDESIGN.md §4.3, F8). */
export function heroFor(result: Result, extraPieces: number, names: Record<string, string>): Hero {
  const m = result.solution.metrics;
  if (result.kits) {
    const n = result.kits.n;
    if (n === 0) return { value: '0', unit: 'juegos', label: 'completos', warn: 'Ni un juego completo cabe. Se muestra el mejor plan parcial de un juego.' };
    const own = m.placedCount - extraPieces;
    return {
      value: fmt(n, 0), unit: n === 1 ? 'juego' : 'juegos',
      label: `${n === 1 ? 'completo' : 'completos'} · ${plural(own, 'pieza', 'piezas')}, ${own === 1 ? 'verificada' : 'todas verificadas'}${extraPieces ? ` · ${plural(extraPieces, 'pieza', 'piezas')} de otros productos` : ''}`,
      warn: null,
    };
  }
  const missing = Object.entries(m.pending).filter(([, q]) => q > 0);
  const warn = missing.length
    ? `Verificado, pero incompleto: faltan ${missing.map(([id, q]) => `${fmt(q, 0)} × ${names[id] ?? id}`).join(', ')}. Prueba permitir giro de 90° o bajar la separación.`
    : null;
  return { value: `${fmt(m.placedCount, 0)} de ${fmt(m.requestedCount, 0)}`, unit: '', label: 'piezas colocadas', warn };
}

/** Qué cambió desde que se optimizó, en una frase para el aviso de plan desactualizado. */
export function staleWhat(prevResult: Pick<Result, 'problem' | 'kits' | 'extras'>, now: Problem | null, nowKits: boolean, calibChanged: boolean): string {
  if (!now) return 'El contorno ya no es válido.';
  const prev = prevResult.problem;
  const parts: string[] = [];
  if (now.defects.length > prev.defects.length) parts.push(now.defects.length - prev.defects.length === 1 ? 'Marcaste una zona nueva' : 'Marcaste zonas nuevas');
  else if (now.defects.length < prev.defects.length) parts.push('Quitaste una zona excluida');
  else if (JSON.stringify(now.defects) !== JSON.stringify(prev.defects)) parts.push('Moviste una zona excluida');
  if (JSON.stringify(now.material) !== JSON.stringify(prev.material)) parts.push('Editaste el contorno');
  if (calibChanged) parts.push('Cambiaste la escala');
  // Con «juegos completos» el problema guardado multiplica las cantidades; los productos añadidos van al final.
  const own = prev.templates.length - (prevResult.extras ?? []).reduce((s, e) => s + e.defs.length, 0);
  const sig = (t: Problem['templates'][number], qty: number) => JSON.stringify([t.id, t.name, t.kind, t.w, t.h, t.rotations, t.shape, qty]);
  const before = prev.templates.slice(0, own).map((t) => sig(t, prevResult.kits?.perKit[t.id] ?? t.qty));
  const after = now.templates.map((t) => sig(t, t.qty));
  if (!calibChanged && before.join() !== after.join()) parts.push('Cambiaste las piezas');
  if (now.spacing !== prev.spacing && !calibChanged) parts.push('Cambiaste la separación');
  if (!!prevResult.kits !== nowKits) parts.push('Cambiaste el modo de llenado');
  if (!parts.length) return 'Cambiaste los datos.';
  return `${parts.join(' · ')}.`;
}

/** Una zona que no toca el material no tiene efecto (ni sus vértices dentro ni contiene vértices del material). */
export function zoneOutside(zone: Ring, contour: Ring, inRing: (p: Ring[number], r: Ring) => boolean): boolean {
  return !zone.some((v) => inRing(v, contour)) && !contour.some((v) => inRing(v, zone));
}

/** Preferencias de exportación guardadas (try/catch: el almacenamiento puede no existir). */
export interface ExportPrefs { withPhoto: boolean; paper: 'A4' | 'Carta'; dxfRef: boolean }
export const DEFAULT_EXPORT_PREFS: ExportPrefs = { withPhoto: true, paper: 'A4', dxfRef: false };
export function parseExportPrefs(raw: string | null | undefined): ExportPrefs {
  try {
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== 'object') return { ...DEFAULT_EXPORT_PREFS };
    return {
      withPhoto: typeof o.withPhoto === 'boolean' ? o.withPhoto : DEFAULT_EXPORT_PREFS.withPhoto,
      paper: o.paper === 'Carta' ? 'Carta' : 'A4',
      dxfRef: typeof o.dxfRef === 'boolean' ? o.dxfRef : DEFAULT_EXPORT_PREFS.dxfRef,
    };
  } catch { return { ...DEFAULT_EXPORT_PREFS }; }
}
