import type { Problem, Ring } from '../types';
import { KITS } from './kits';
import { pxPerCm } from './print';
import { fmt, type Calib, type Result, type TemplateDef } from '../state';

/**
 * Workspace presentation rules (UX-REDESIGN.md §4): which summary each checklist step shows,
 * what blocks the main action and what can be exported. No DOM: tested in node.
 */

export type CheckState = 'done' | 'todo' | 'attention';
export type CheckId = 'scale' | 'zones' | 'pieces';

export const plural = (n: number, one: string, many: string) => `${fmt(n, 0)} ${n === 1 ? one : many}`;

const isCm = (c: Calib | null | undefined) => !!c && c.unit.trim().toLowerCase() === 'cm';
export const calibratedInCm = isCm;

/** ① Scale: calibrated (solid) or relative (dotted, ≈). `needsCm`: a product or AI design asked for cm. */
export function scaleItem(calib: Calib | null, needsCm: boolean): { state: CheckState; label: string; relative: boolean } {
  if (calib) {
    const attn = needsCm && !isCm(calib);
    return { state: attn ? 'attention' : 'done', label: `Calibrated · ${calib.unit}`, relative: false };
  }
  return { state: needsCm ? 'attention' : 'todo', label: 'Not calibrated', relative: true };
}

/** ② Excluded zones: done if there are zones or the user confirmed there are no defects. */
export function zonesItem(count: number, confirmedNone: boolean, anyOutside: boolean): { state: CheckState; label: string } {
  const label = count ? plural(count, 'zone', 'zones') : confirmedNone ? 'No defects' : 'Not reviewed';
  if (anyOutside) return { state: 'attention', label };
  if (count > 0 || confirmedNone) return { state: 'done', label };
  return { state: 'attention', label };
}

/** The catalog kit that exactly matches the order (names, shapes, sizes, quantities). */
export function matchKit(defs: TemplateDef[]) {
  return KITS.find((k) => k.pieces.length === defs.length && k.pieces.every((x, i) => {
    const d = defs[i];
    return d.name === x.name && d.kind === x.kind && d.w === x.w && d.h === x.h && d.qty === x.qty;
  }));
}

/** Short kit name for the summary: drops the material (“Leather cardholder” → “Cardholder”). */
const shortKitName = (name: string) => {
  const s = name.replace(/ de cuero$/i, '').replace(/^leather /i, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** ③ Pieces: “Cardholder · 5 per set”, “4 pieces”, “None yet”. */
export function piecesItem(defs: TemplateDef[], fill: 'fixed' | 'maxKits'): { state: CheckState; label: string } {
  const total = defs.reduce((s, d) => s + d.qty, 0);
  if (!defs.length || total === 0) return { state: 'todo', label: defs.length ? 'All quantities at 0' : 'None yet' };
  const kit = matchKit(defs);
  if (fill === 'maxKits') return { state: 'done', label: `${kit ? shortKitName(kit.name) : plural(defs.length, 'type', 'types')} · ${fmt(total, 0)} per set` };
  return { state: 'done', label: plural(total, 'piece', 'pieces') };
}

/** Item open by default: the first unfinished one; if everything is ready, Pieces (the most edited). */
export function defaultOpenItem(states: Record<CheckId, CheckState>): CheckId {
  return (['scale', 'zones', 'pieces'] as CheckId[]).find((id) => states[id] !== 'done') ?? 'pieces';
}

/** Why optimizing is not possible (or null). Same rule order as optimize(). */
export function optimizeBlockReason(o: { contourErr: string | null; usableArea: number | null; defs: TemplateDef[] }): string | null {
  if (o.contourErr) return 'Fix the outline in step 1.';
  if (!o.defs.length || o.defs.every((d) => d.qty === 0)) return 'Add at least one piece to optimize.';
  if (o.usableArea !== null && o.usableArea <= 0) return 'The excluded zones cover the whole material.';
  return null;
}

export interface ExportState {
  /** SVG/PNG: a verified, up-to-date plan with pieces. */
  exportable: boolean;
  /** 1:1, SVG in cm and DXF: also a physical scale (cm or mm). */
  physical: boolean;
  /** Visible reason when Export is disabled. */
  reason: string | null;
  /** Reason the 1:1 group is disabled. */
  physicalReason: string | null;
}

export function exportState(result: Result | null, stale: boolean): ExportState {
  const exportable = !!result && !stale && result.verify.valid && result.solution.placements.length > 0;
  const physical = exportable && !!result && pxPerCm(result) !== null;
  const reason = exportable ? null
    : !result ? 'Optimize to get a plan.'
      : stale ? 'Re-optimize to export an up-to-date plan.'
        : !result.verify.valid ? 'The plan did not pass verification, so it cannot be exported.'
          : 'There are no placed pieces to export.';
  return { exportable, physical, reason, physicalReason: physical || !exportable ? null : 'Calibrate the photo in cm or mm (step 2) to export at real scale.' };
}

export interface Hero { value: string; unit: string; label: string; warn: string | null }

/** What the user came for, in one number (UX-REDESIGN.md §4.3, F8). */
export function heroFor(result: Result, extraPieces: number, names: Record<string, string>): Hero {
  const m = result.solution.metrics;
  if (result.kits) {
    const n = result.kits.n;
    if (n === 0) return { value: '0', unit: 'sets', label: 'complete', warn: 'Not even one complete set fits. Showing the best partial plan for one set.' };
    const own = m.placedCount - extraPieces;
    return {
      value: fmt(n, 0), unit: n === 1 ? 'set' : 'sets',
      label: `complete · ${plural(own, 'piece', 'pieces')}, ${own === 1 ? 'verified' : 'all verified'}${extraPieces ? ` · ${plural(extraPieces, 'piece', 'pieces')} from other products` : ''}`,
      warn: null,
    };
  }
  const missing = Object.entries(m.pending).filter(([, q]) => q > 0);
  const warn = missing.length
    ? `Verified, but incomplete: missing ${missing.map(([id, q]) => `${fmt(q, 0)} × ${names[id] ?? id}`).join(', ')}. Try allowing 90° rotation or reducing the spacing.`
    : null;
  return { value: `${fmt(m.placedCount, 0)} of ${fmt(m.requestedCount, 0)}`, unit: '', label: 'pieces placed', warn };
}

/** What changed since the last optimization, in one sentence for the out-of-date plan notice. */
export function staleWhat(prevResult: Pick<Result, 'problem' | 'kits' | 'extras'>, now: Problem | null, nowKits: boolean, calibChanged: boolean): string {
  if (!now) return 'The outline is no longer valid.';
  const prev = prevResult.problem;
  const parts: string[] = [];
  if (now.defects.length > prev.defects.length) parts.push(now.defects.length - prev.defects.length === 1 ? 'You marked a new zone' : 'You marked new zones');
  else if (now.defects.length < prev.defects.length) parts.push('You removed an excluded zone');
  else if (JSON.stringify(now.defects) !== JSON.stringify(prev.defects)) parts.push('You moved an excluded zone');
  if (JSON.stringify(now.material) !== JSON.stringify(prev.material)) parts.push('You edited the outline');
  if (calibChanged) parts.push('You changed the scale');
  // With “complete sets” the stored problem multiplies the quantities; added products go at the end.
  const own = prev.templates.length - (prevResult.extras ?? []).reduce((s, e) => s + e.defs.length, 0);
  const sig = (t: Problem['templates'][number], qty: number) => JSON.stringify([t.id, t.name, t.kind, t.w, t.h, t.rotations, t.shape, qty]);
  const before = prev.templates.slice(0, own).map((t) => sig(t, prevResult.kits?.perKit[t.id] ?? t.qty));
  const after = now.templates.map((t) => sig(t, t.qty));
  if (!calibChanged && before.join() !== after.join()) parts.push('You changed the pieces');
  if (now.spacing !== prev.spacing && !calibChanged) parts.push('You changed the spacing');
  if (!!prevResult.kits !== nowKits) parts.push('You changed the fill mode');
  if (!parts.length) return 'You changed the data.';
  return `${parts.join(' · ')}.`;
}

/** A zone that does not touch the material has no effect (none of its vertices inside, and it contains none of the material's). */
export function zoneOutside(zone: Ring, contour: Ring, inRing: (p: Ring[number], r: Ring) => boolean): boolean {
  return !zone.some((v) => inRing(v, contour)) && !contour.some((v) => inRing(v, zone));
}

/** Saved export preferences (try/catch: storage may not exist). `paper: 'Carta'` is the stored id for US Letter. */
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
