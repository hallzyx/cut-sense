import type { AgentPiece } from '../agentSchema';
import {
  CATEGORIES, CLOSURES, COLORS, EDGES, FOLD_AXES, HARDWARE, JOINTS, MACROS, MATERIAL_KINDS, MOVING, NODE_TYPES, ROLES, SCENE_LIMITS, SIDES, STITCHES,
  blankNode, type FoldSpec, type SceneNode, type SceneSpec,
} from './dsl';
import { expandMacro } from './macros';
import { DEFAULT_THICKNESS, findPiece } from './pieces';

/**
 * Hand-written validator for scenes coming from the model (or a recording).
 * Two layers:
 *  1. parseScene: types and ranges. Out-of-range numbers are clamped and reported as warnings;
 *     a wrong structure is an error (the server retries once with that error).
 *  2. resolveScene: expands the macro and checks the graph against the real pieces
 *     (unknown piece refs, instance out of range, duplicates, a single root, no cycles, ≤ 60 nodes).
 *     Broken nodes are dropped with a warning, so a partly wrong scene still renders honestly.
 */
export type ParseResult = { ok: true; scene: SceneSpec; warnings: string[] } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(vals: readonly T[], v: unknown, dflt: T): T => (vals.includes(v as T) ? (v as T) : dflt);

export function parseScene(raw: unknown): ParseResult {
  const warnings: string[] = [];
  const bad = (error: string): ParseResult => ({ ok: false, error });
  if (!isObj(raw)) return bad('the scene is not an object');
  const clamp = (v: unknown, lo: number, hi: number, dflt: number, what: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) { warnings.push(`${what}: not a number`); return dflt; }
    if (v < lo || v > hi) { warnings.push(`${what} out of range (${lo}..${hi})`); return Math.min(hi, Math.max(lo, v)); }
    return v;
  };
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '');
  const enumOrWarn = <T extends string>(vals: readonly T[], v: unknown, dflt: T, what: string): T => {
    if (!vals.includes(v as T)) warnings.push(`${what}: value not supported`);
    return oneOf(vals, v, dflt);
  };

  if (!Array.isArray(raw.nodes)) return bad('nodes (list) is missing');
  if (raw.nodes.length > SCENE_LIMITS.maxNodes) return bad(`too many nodes (at most ${SCENE_LIMITS.maxNodes})`);
  const mat = isObj(raw.material) ? raw.material : {};
  const kind = enumOrWarn(MATERIAL_KINDS, mat.kind, 'leather', 'material.kind');
  const macroRaw = isObj(raw.macro) ? raw.macro : {};
  const cam = isObj(raw.camera) ? raw.camera : {};

  const roles = Array.isArray(macroRaw.roles) ? macroRaw.roles.slice(0, SCENE_LIMITS.maxRoles).flatMap((r) => {
    if (!isObj(r) || !ROLES.includes(r.role as never) || typeof r.piece !== 'string') { warnings.push('macro.roles: invalid entry dropped'); return []; }
    return [{ role: r.role as SceneSpec['macro']['roles'][number]['role'], piece: text(r.piece, 60) }];
  }) : [];

  const nodes: SceneNode[] = [];
  for (const [i, n] of (raw.nodes as unknown[]).entries()) {
    if (!isObj(n)) return bad(`nodes[${i}] is not an object`);
    const id = text(n.id, SCENE_LIMITS.maxId).replace(/[^\w-]/g, '_');
    if (!id) return bad(`nodes[${i}].id is empty`);
    const at = `nodes[${i}]`;
    const folds: FoldSpec[] = [];
    if (Array.isArray(n.folds)) {
      if (n.folds.length > SCENE_LIMITS.maxFolds) warnings.push(`${at}: more than ${SCENE_LIMITS.maxFolds} folds, the rest are ignored`);
      for (const f of n.folds.slice(0, SCENE_LIMITS.maxFolds)) {
        if (!isObj(f)) { warnings.push(`${at}.folds: invalid fold`); continue; }
        folds.push({
          axis: enumOrWarn(FOLD_AXES, f.axis, 'vertical', `${at}.fold.axis`),
          at: clamp(f.at, 0.02, 0.98, 0.5, `${at}.fold.at`),
          angle_deg: clamp(f.angle_deg, -360, 360, 180, `${at}.fold.angle_deg`),
          radius_mm: clamp(f.radius_mm, 0, 100, 0, `${at}.fold.radius_mm`),
          moving: enumOrWarn(MOVING, f.moving, 'positive', `${at}.fold.moving`),
        });
      }
    }
    nodes.push(blankNode(id, {
      type: enumOrWarn(NODE_TYPES, n.type, 'panel', `${at}.type`),
      piece: text(n.piece, 60),
      instance: Math.round(clamp(n.instance, 0, SCENE_LIMITS.maxInstances, 0, `${at}.instance`)),
      parent: text(n.parent, SCENE_LIMITS.maxId).replace(/[^\w-]/g, '_'),
      joint: enumOrWarn(JOINTS, n.joint, 'stack', `${at}.joint`),
      side: enumOrWarn(SIDES, n.side, 'top', `${at}.side`),
      layer: Math.round(clamp(n.layer, 0, 20, 0, `${at}.layer`)),
      anchor_x: clamp(n.anchor_x, -1, 1, 0, `${at}.anchor_x`),
      anchor_y: clamp(n.anchor_y, -1, 1, 0, `${at}.anchor_y`),
      self_x: clamp(n.self_x, -1, 1, 0, `${at}.self_x`),
      self_y: clamp(n.self_y, -1, 1, 0, `${at}.self_y`),
      rotation_deg: ((clamp(n.rotation_deg, -720, 720, 0, `${at}.rotation_deg`) % 360) + 360) % 360,
      flip: n.flip === true,
      offset_mm: clamp(n.offset_mm, -20, 20, 0, `${at}.offset_mm`),
      hinge_edge: enumOrWarn(EDGES, n.hinge_edge, 'top', `${at}.hinge_edge`),
      hinge_angle_deg: clamp(n.hinge_angle_deg, -180, 180, 0, `${at}.hinge_angle_deg`),
      folds,
      bulge_mm: clamp(n.bulge_mm, -30, 30, 0, `${at}.bulge_mm`),
      stitch: enumOrWarn(STITCHES, n.stitch, 'none', `${at}.stitch`),
      hardware: enumOrWarn(HARDWARE, n.hardware, 'none', `${at}.hardware`),
      target: text(n.target, SCENE_LIMITS.maxId).replace(/[^\w-]/g, '_'),
      target_x: clamp(n.target_x, -1, 1, 0, `${at}.target_x`),
      target_y: clamp(n.target_y, -1, 1, 0, `${at}.target_y`),
    }));
  }

  const notes = Array.isArray(raw.assembly_notes) ? raw.assembly_notes.filter((x) => typeof x === 'string').slice(0, SCENE_LIMITS.maxNotes).map((x) => text(x, SCENE_LIMITS.maxNote)).filter(Boolean) : [];
  const scene: SceneSpec = {
    category: enumOrWarn(CATEGORIES, raw.category, 'other', 'category'),
    label: text(raw.label, SCENE_LIMITS.maxLabel),
    description: text(raw.description, SCENE_LIMITS.maxDescription),
    material: {
      kind, color: enumOrWarn(COLORS, mat.color, 'cognac', 'material.color'),
      thickness_mm: clamp(mat.thickness_mm, SCENE_LIMITS.minThicknessMm, SCENE_LIMITS.maxThicknessMm, DEFAULT_THICKNESS[kind], 'material.thickness_mm'),
    },
    macro: {
      type: enumOrWarn(MACROS, macroRaw.type, 'none', 'macro.type'), roles,
      closure: enumOrWarn(CLOSURES, macroRaw.closure, 'none', 'macro.closure'),
      fold_angle_deg: clamp(macroRaw.fold_angle_deg, 0, 360, 0, 'macro.fold_angle_deg'),
    },
    nodes,
    camera: { azimuth_deg: clamp(cam.azimuth_deg, -360, 360, 30, 'camera.azimuth_deg'), elevation_deg: clamp(cam.elevation_deg, 0, 89, 35, 'camera.elevation_deg') },
    assembly_notes: notes,
  };
  if (scene.macro.type === 'none' && nodes.length === 0) return bad('the scene has neither nodes nor a macro');
  return { ok: true, scene, warnings };
}

export type ResolveResult = { ok: true; scene: SceneSpec; warnings: string[]; unused: { piece: string; instance: number }[] } | { ok: false; error: string };

/**
 * Expand the macro and check the node graph against the real pieces.
 * The result is explicit (macro.type keeps the archetype name for reference, every node is listed).
 */
export function resolveScene(spec: SceneSpec, pieces: AgentPiece[]): ResolveResult {
  const warnings: string[] = [];
  const macroNodes = spec.macro.type === 'none' ? [] : expandMacro(spec, pieces, warnings);
  const all = [...macroNodes, ...spec.nodes];
  if (all.length === 0) return { ok: false, error: 'the scene produced no nodes' };

  const kept: SceneNode[] = [];
  const ids = new Set<string>();
  const used = new Set<string>();
  for (const n of all) {
    if (ids.has(n.id)) { warnings.push(`node ${n.id} repeated, dropped`); continue; }
    if (n.type === 'hardware') {
      if (n.hardware === 'none') { warnings.push(`node ${n.id}: hardware without a type, dropped`); continue; }
      ids.add(n.id); kept.push({ ...n, piece: '', instance: 0, folds: [], joint: 'stack' });
      continue;
    }
    const ref = findPiece(pieces, n.piece);
    if (!ref) { warnings.push(`node ${n.id}: the piece “${n.piece}” does not exist, dropped`); continue; }
    if (n.instance >= ref.piece.qty_per_set) { warnings.push(`node ${n.id}: there are only ${ref.piece.qty_per_set} of “${ref.piece.name}”, dropped`); continue; }
    const key = `${ref.index}#${n.instance}`;
    if (used.has(key)) { warnings.push(`node ${n.id}: “${ref.piece.name}” ${n.instance + 1} is already placed, dropped`); continue; }
    used.add(key); ids.add(n.id);
    kept.push({ ...n, piece: ref.piece.name });
  }
  if (kept.length > SCENE_LIMITS.maxNodes) { warnings.push(`more than ${SCENE_LIMITS.maxNodes} nodes, trimmed`); kept.length = SCENE_LIMITS.maxNodes; }

  // Parents must exist and be panels; exactly one root.
  const byId = new Map(kept.map((n) => [n.id, n]));
  let nodes = kept;
  const root = nodes.find((n) => n.type === 'panel' && n.joint === 'root') ?? nodes.find((n) => n.type === 'panel' && !n.parent);
  if (!root) return { ok: false, error: 'there is no root piece' };
  for (const n of nodes) {
    if (n === root) { n.parent = ''; n.joint = 'root'; continue; }
    const p = byId.get(n.parent);
    if (!p || p.type !== 'panel' || n.parent === n.id) {
      if (n.type === 'panel' || n.type === 'strap') warnings.push(`node ${n.id}: invalid parent “${n.parent}”, stacked on the root`);
      n.parent = root.id;
      if (n.joint === 'root') n.joint = 'stack';
    }
    if (n.joint === 'root') { warnings.push(`node ${n.id}: there can only be one root, stacked on it`); n.joint = 'stack'; }
    if (n.type === 'strap') {
      const t = byId.get(n.target);
      if (!t || t.type !== 'panel') { n.target = n.parent; }
    }
  }
  // Cycles: walk up from every node; a node that cannot reach the root is re-attached to it.
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    let cur = n;
    while (cur.parent) {
      if (seen.has(cur.parent)) { warnings.push(`cycle at ${n.id}, stacked on the root`); n.parent = root.id; if (n.joint === 'root') n.joint = 'stack'; break; }
      seen.add(cur.parent);
      cur = byId.get(cur.parent)!;
    }
  }
  // Order parents before children (stable), so consumers can process the list in one pass.
  const order: SceneNode[] = [];
  const placed = new Set<string>();
  const visit = (n: SceneNode) => {
    if (placed.has(n.id)) return;
    if (n.parent) visit(byId.get(n.parent)!);
    placed.add(n.id); order.push(n);
  };
  nodes.forEach(visit);
  nodes = order;

  const unused: { piece: string; instance: number }[] = [];
  pieces.forEach((p, i) => { for (let k = 0; k < p.qty_per_set; k++) if (!used.has(`${i}#${k}`)) unused.push({ piece: p.name, instance: k }); });
  return { ok: true, scene: { ...spec, nodes }, warnings, unused };
}

/** Full pipeline: raw JSON from the model → explicit scene. */
export function validateScene(raw: unknown, pieces: AgentPiece[]): ResolveResult & { parseWarnings?: string[] } {
  const p = parseScene(raw);
  if (!p.ok) return p;
  const r = resolveScene(p.scene, pieces);
  return r.ok ? { ...r, warnings: [...p.warnings, ...r.warnings] } : r;
}

/** The explicit form of a resolved scene, ready to send back to the model for critique. */
export function explicitScene(scene: SceneSpec): SceneSpec {
  return { ...scene, macro: { type: 'none', roles: [], closure: scene.macro.closure, fold_angle_deg: 0 } };
}
