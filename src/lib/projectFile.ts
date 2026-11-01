import { computeMetrics, verifySolution } from '../engine';
import type { Placement, Pt, Ring, TemplateKind } from '../types';
import {
  buildProblem, problemKey, pxPerUnit, toTemplate, unitLabel,
  type Calib, type ExtraProduct, type Project, type Result, type TemplateDef,
} from '../state';

/**
 * Archivo de proyecto de CutSense (.json): foto, contorno, defectos, calibración, pedido y plan.
 * Al abrirlo se valida todo y el plan se VUELVE a verificar: nunca se confía en lo guardado.
 */
export const FILE_VERSION = 1;
export const MAX_FILE_BYTES = 40 * 1024 * 1024;

const KINDS: TemplateKind[] = ['rect', 'rrect', 'circle', 'trapezoid', 'irregular', 'custom'];
const SOURCES = ['sam', 'example', 'local', 'manual', 'leftover'];

const fail = (m: string): never => { throw new Error(`Archivo de proyecto no válido: ${m}.`); };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, label: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(label));
const int = (v: unknown, label: string, min: number, max: number): number => {
  const n = num(v, label);
  return Number.isInteger(n) && n >= min && n <= max ? n : fail(label);
};
const str = (v: unknown, label: string, max: number): string => (typeof v === 'string' && v.length <= max ? v : fail(label));
const pt = (v: unknown, label: string): Pt => (Array.isArray(v) && v.length === 2 ? [num(v[0], label), num(v[1], label)] : fail(label));
const ring = (v: unknown, label: string, min = 3): Ring => {
  if (!Array.isArray(v) || v.length < min || v.length > 5000) fail(label);
  return (v as unknown[]).map((q) => pt(q, label));
};
const arr = (v: unknown, label: string, max: number): unknown[] => (Array.isArray(v) && v.length <= max ? v : fail(label));

function parseDefs(v: unknown, label: string, max: number): TemplateDef[] {
  return arr(v, label, max).map((raw, i) => {
    if (!isObj(raw)) return fail(`${label}[${i}]`);
    const kind = raw.kind as TemplateKind;
    if (!KINDS.includes(kind)) fail(`${label}[${i}].kind`);
    const rotations = arr(raw.rotations, `${label}[${i}].rotations`, 4).map((r) => num(r, 'rotación'));
    if (!rotations.length || rotations.some((r) => ![0, 90, 180, 270].includes(r))) fail(`${label}[${i}].rotations`);
    const w = num(raw.w, 'ancho'), h = num(raw.h, 'alto');
    if (w <= 0 || h <= 0) fail(`${label}[${i}] tiene dimensiones no positivas`);
    if (typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color)) fail(`${label}[${i}].color`);
    return {
      id: str(raw.id, 'id', 40), name: str(raw.name, 'nombre', 80), color: raw.color as string, kind, w, h,
      qty: int(raw.qty, `${label}[${i}].qty`, 0, 1000), rotations,
      ...(raw.custom !== undefined ? { custom: ring(raw.custom, 'forma propia') } : {}),
    };
  });
}

function parseProject(v: unknown): Project {
  if (!isObj(v)) return fail('falta el proyecto');
  let image: Project['image'] = null;
  if (v.image !== null) {
    const im = v.image;
    if (!isObj(im)) return fail('imagen');
    const src = str(im.src, 'imagen.src', MAX_FILE_BYTES);
    if (!/^data:image\/(png|jpe?g|webp|svg\+xml)[;,]/.test(src)) fail('la imagen debe ser una imagen incrustada');
    image = {
      src, w: int(im.w, 'imagen.w', 1, 20000), h: int(im.h, 'imagen.h', 1, 20000), name: str(im.name, 'imagen.name', 200),
      ...(typeof im.exampleId === 'string' ? { exampleId: str(im.exampleId, 'exampleId', 40) } : {}),
    };
  }
  if (!image) fail('el proyecto no tiene imagen');
  let calib: Calib | null = null;
  if (v.calib !== null) {
    const c = v.calib;
    if (!isObj(c)) return fail('calibración');
    const dist = num(c.dist, 'calibración.dist');
    if (dist <= 0) fail('calibración.dist');
    calib = { a: pt(c.a, 'calibración.a'), b: pt(c.b, 'calibración.b'), dist, unit: str(c.unit, 'calibración.unit', 8) };
  }
  const contour = arr(v.contour, 'contorno', 5000).length ? ring(v.contour, 'contorno') : [];
  const lastValid = arr(v.lastValid, 'último contorno', 5000).length ? ring(v.lastValid, 'último contorno') : [];
  const source = v.source === null ? null : SOURCES.includes(v.source as string) ? (v.source as Project['source']) : fail('origen del contorno');
  const spacing = num(v.spacing, 'separación');
  if (spacing < 0) fail('separación');
  if (v.fill !== 'fixed' && v.fill !== 'maxKits') fail('modo de llenado');
  return {
    image, contour, lastValid, source, edited: v.edited === true,
    samInfo: v.samInfo === null ? null : str(v.samInfo, 'samInfo', 300),
    defects: arr(v.defects, 'defectos', 50).map((d) => ring(d, 'defecto')),
    calib, defs: parseDefs(v.defs, 'piezas', 12), spacing, fill: v.fill as Project['fill'],
  };
}

export function serializeProject(p: Project, result: Result | null, step: number): string {
  return JSON.stringify({
    app: 'cutsense', version: FILE_VERSION, savedAt: new Date().toISOString(), step,
    project: p,
    plan: result && {
      placements: result.solution.placements, seed: result.solution.seed, optimizerVersion: result.solution.optimizerVersion,
      elapsedMs: result.solution.elapsedMs, kits: result.kits ?? null, extras: result.extras ?? [],
    },
  });
}

export interface LoadedProject { project: Project; result: Result | null; step: 1 | 2 | 3; notice: string | null }

export function parseProjectFile(text: string): LoadedProject {
  if (text.length > MAX_FILE_BYTES) fail('el archivo es demasiado grande');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return fail('no es un JSON'); }
  if (!isObj(raw) || raw.app !== 'cutsense') return fail('no es un proyecto de CutSense');
  if (raw.version !== FILE_VERSION) return fail(`versión ${String(raw.version)} no admitida (se esperaba ${FILE_VERSION})`);
  const project = parseProject(raw.project);
  const hasContour = project.contour.length >= 3;
  const stepRaw = raw.step === 2 || raw.step === 3 ? raw.step : 1;
  const step: 1 | 2 | 3 = hasContour ? stepRaw : 1;

  if (!isObj(raw.plan) || !hasContour) return { project, result: null, step: step === 3 ? 2 : step, notice: null };
  const plan = raw.plan;
  const placements: Placement[] = arr(plan.placements, 'plan.placements', 2000).map((q, i) => {
    if (!isObj(q)) return fail(`plan.placements[${i}]`);
    return {
      templateId: str(q.templateId, 'templateId', 40), instance: int(q.instance, 'instance', 0, 100000),
      rotation: num(q.rotation, 'rotación'), polygon: ring(q.polygon, 'polígono de pieza'),
    };
  });
  const extras: ExtraProduct[] = arr(plan.extras, 'plan.extras', 12).map((e, i) => {
    if (!isObj(e) || !isObj(e.kits)) return fail(`plan.extras[${i}]`);
    const perKit: Record<string, number> = {};
    for (const [k, val] of Object.entries(e.kits.perKit && isObj(e.kits.perKit) ? e.kits.perKit : {})) perKit[k] = int(val, 'piezas por juego', 1, 1000);
    return {
      id: str(e.id, 'extra.id', 40), name: str(e.name, 'extra.name', 80), kind: e.kind === 'piece' ? 'piece' : 'kit',
      defs: parseDefs(e.defs, 'extra.defs', 6), kits: { n: int(e.kits.n, 'extra.kits.n', 0, 1000), perKit },
    };
  });
  let kits: Result['kits'];
  if (plan.kits !== null && plan.kits !== undefined) {
    if (!isObj(plan.kits)) return fail('plan.kits');
    const perKit: Record<string, number> = {};
    for (const [k, val] of Object.entries(isObj(plan.kits.perKit) ? plan.kits.perKit : {})) perKit[k] = int(val, 'piezas por juego', 1, 1000);
    kits = { n: int(plan.kits.n, 'plan.kits.n', 0, 1000), perKit };
  }

  // Reconstruye el problema y VUELVE a verificar; nada de lo guardado se da por bueno.
  const base = buildProblem(project);
  if (!base) return { project, result: null, step: step === 3 ? 2 : step, notice: null };
  const ppu = pxPerUnit(project.calib, project.image!.w);
  const mult = kits ? Math.max(kits.n, 1) : 1;
  const problem = {
    ...base,
    templates: [
      ...base.templates.map((t) => ({ ...t, qty: t.qty * mult })),
      ...extras.flatMap((e) => e.defs.map((d) => toTemplate(d, ppu)).map((t) => ({ ...t, qty: t.qty * e.kits.n }))),
    ],
  };
  const verify = verifySolution(problem, placements);
  const currentKey = problemKey(base, project.calib) + project.fill;
  if (!verify.valid) {
    return { project, result: null, step: step === 3 ? 2 : step, notice: 'El plan guardado ya no pasa la verificación geométrica, así que no se cargó. Vuelve a optimizar.' };
  }
  const result: Result = {
    solution: {
      placements, metrics: computeMetrics(problem, placements),
      elapsedMs: num(plan.elapsedMs, 'elapsedMs'), optimizerVersion: str(plan.optimizerVersion, 'optimizerVersion', 40), seed: num(plan.seed, 'seed'),
    },
    verify, problemKey: currentKey, kits, extras: extras.length ? extras : undefined,
    ppu, unit: unitLabel(project.calib), calibrated: !!project.calib, problem,
  };
  return { project, result, step, notice: null };
}
