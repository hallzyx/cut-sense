import type { ContourSource, Placement, Pt, Problem, Ring, Solution, Template, TemplateKind, VerifyResult } from './types';
import { buildShape, makeTemplate, PALETTE } from './engine/templates';
import type { Kit } from './lib/kits';

export interface TemplateDef {
  id: string;
  name: string;
  color: string;
  kind: TemplateKind;
  /** Dimensiones en unidades de visualización (u relativas o unidad física calibrada). */
  w: number;
  h: number;
  qty: number;
  rotations: number[];
  /** Forma propia normalizada a [0,1]² (solo kind === 'custom'). */
  custom?: Ring;
}

export interface Calib { a: Pt; b: Pt; dist: number; unit: string }

export interface ImageInfo { src: string; w: number; h: number; name: string; exampleId?: string }

export interface Project {
  image: ImageInfo | null;
  contour: Ring;
  lastValid: Ring;
  source: ContourSource | null;
  edited: boolean;
  samInfo: string | null;
  defects: Ring[];
  calib: Calib | null;
  defs: TemplateDef[];
  /** Separación mínima en unidades de visualización. */
  spacing: number;
  /** fixed: se coloca el pedido tal cual · maxKits: se busca el máximo de juegos completos del pedido. */
  fill: 'fixed' | 'maxKits';
}

export interface Result {
  solution: Solution;
  verify: VerifyResult;
  problemKey: string;
  /** Presente con fill = 'maxKits': juegos completos colocados y piezas por juego. */
  kits?: { n: number; perKit: Record<string, number> };
  ppu: number;
  unit: string;
  calibrated: boolean;
  problem: Problem;
}

export const emptyProject = (): Project => ({
  image: null, contour: [], lastValid: [], source: null, edited: false, samInfo: null,
  defects: [], calib: null, defs: [], spacing: 0, fill: 'fixed',
});

/** Etiqueta de una pieza: letra de plantilla + nº de copia dentro de su juego (+ juego si hay varios). */
export function pieceLabel(templateIndex: number, instance: number, perKit?: number): string {
  const letter = String.fromCharCode(65 + templateIndex);
  if (!perKit) return `${letter}${instance + 1}`;
  return `${letter}${(instance % perKit) + 1}·${Math.floor(instance / perKit) + 1}`;
}

export const calibPx = (c: Calib) => Math.hypot(c.a[0] - c.b[0], c.a[1] - c.b[1]);
/** Píxeles por unidad de visualización. Sin calibración: 1 u = 1 % del ancho de la imagen. */
export const pxPerUnit = (c: Calib | null, imgW: number) => (c ? calibPx(c) / c.dist : imgW / 100);
export const unitLabel = (c: Calib | null) => (c ? c.unit : 'u');

export function toTemplate(d: TemplateDef, ppu: number): Template {
  const w = d.w * ppu, h = d.h * ppu;
  return { id: d.id, name: d.name, color: d.color, kind: d.kind, w, h, qty: d.qty, rotations: d.rotations, shape: buildShape(d.kind, w, h, d.custom) };
}

export function defaultDefs(): TemplateDef[] {
  const mk = (i: number, kind: TemplateKind, w: number, h: number, qty: number): TemplateDef => {
    const t = makeTemplate(i, kind, w, h, qty);
    return { id: t.id, name: t.name, color: t.color, kind, w, h, qty, rotations: [0, 180] };
  };
  return [mk(0, 'rect', 20, 12, 3), mk(1, 'circle', 13, 13, 3), mk(2, 'trapezoid', 18, 11, 2), mk(3, 'irregular', 16, 12, 2)];
}

export function kitToDefs(kit: Kit): TemplateDef[] {
  return kit.pieces.map((k, i) => ({ id: `t${i}`, name: k.name, color: PALETTE[i % PALETTE.length], kind: k.kind, w: k.w, h: k.h, qty: k.qty, rotations: k.rotations ?? [0, 180] }));
}

export function buildProblem(p: Project): Problem | null {
  if (!p.image || p.contour.length < 3) return null;
  const ppu = pxPerUnit(p.calib, p.image.w);
  return {
    material: p.contour,
    defects: p.defects,
    templates: p.defs.map((d) => toTemplate(d, ppu)),
    spacing: Math.max(0, p.spacing * ppu),
    seed: 1,
    timeLimitMs: 4000,
  };
}

export const problemKey = (pr: Problem | null, calib: Calib | null) => JSON.stringify([pr, calib && [calib.a, calib.b, calib.dist, calib.unit]]);

export const fmt = (n: number, d = 1) => n.toLocaleString('es-PE', { maximumFractionDigits: d, minimumFractionDigits: 0 });

export const centroid = (r: Ring): Pt => {
  let x = 0, y = 0;
  for (const p of r) { x += p[0]; y += p[1]; }
  return [x / r.length, y / r.length];
};

export interface Change { label: string; detail: string }

/** Diferencias entre dos soluciones/problemas para el panel "Qué cambió". */
export function diffResults(prev: Result, next: Result): { changes: Change[]; moved: number } {
  const changes: Change[] = [];
  const a = prev.problem, b = next.problem;
  if (a.defects.length !== b.defects.length) changes.push({ label: 'Zonas excluidas', detail: `${a.defects.length} → ${b.defects.length}` });
  else if (JSON.stringify(a.defects) !== JSON.stringify(b.defects)) changes.push({ label: 'Zonas excluidas', detail: 'geometría modificada' });
  if (JSON.stringify(a.material) !== JSON.stringify(b.material)) changes.push({ label: 'Contorno del material', detail: 'modificado' });
  const dem = (p: Problem) => p.templates.map((t) => `${t.name}×${t.qty}[${t.rotations.join('/')}]${Math.round(t.w)}x${Math.round(t.h)}`).join(' · ');
  if (dem(a) !== dem(b)) changes.push({ label: 'Pedido / plantillas', detail: 'modificado' });
  if (a.spacing !== b.spacing) changes.push({ label: 'Separación mínima', detail: `${fmt(a.spacing / prev.ppu)} → ${fmt(b.spacing / next.ppu)} ${next.unit}` });
  const pm = prev.solution.metrics, nm = next.solution.metrics;
  const key = (p: Placement) => `${p.templateId}#${p.instance}`;
  const old = new Map(prev.solution.placements.map((p) => [key(p), p]));
  let moved = 0;
  for (const p of next.solution.placements) {
    const o = old.get(key(p));
    if (!o) { moved++; continue; }
    const c1 = centroid(o.polygon), c2 = centroid(p.polygon);
    if (Math.hypot(c1[0] - c2[0], c1[1] - c2[1]) > 1 || o.rotation !== p.rotation) moved++;
  }
  if (pm.placedCount !== nm.placedCount) changes.push({ label: 'Piezas colocadas', detail: `${pm.placedCount} → ${nm.placedCount}` });
  return { changes, moved };
}
