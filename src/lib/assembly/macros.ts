import type { AgentPiece } from '../agentSchema';
import { blankNode, type MacroType, type Role, type SceneNode, type SceneSpec } from './dsl';
import { seamPlacement } from './kinematics';
import { DEFAULT_THICKNESS, findPiece, normName } from './pieces';

/**
 * Archetype macros. Each one expands deterministically into explicit nodes built from the
 * real pieces: the macro decides placement, folds and hardware, never sizes.
 * Pieces are bound to roles by the model (macro.roles) or, failing that, by keywords.
 */
export interface Inst { name: string; instance: number; w: number; h: number; kind: AgentPiece['kind']; role: Role }

/** Piece names may be Spanish or English (the kits, the people and the agent use both): every rule lists both. */
const RULES: [Role, RegExp][] = [
  // Garment parts first: "Manga delantera" / "Front sleeve" is a sleeve, "Cuello trasero" / "Back collar" a collar.
  ['sleeve', /\bmanga|sleeve/],
  ['cuff', /\bpuno|cuff/],
  ['hood', /capucha|hood/],
  ['collar', /cuello|collar|\bsolapa de cuello|lapel/],
  ['waistband', /pretina|cinturilla|waistband|\bhem\b|hem band|dobladillo|bajo de la prenda|ribbing/],
  ['card_pocket', /tarjet|card|ranura|slot/],
  ['bill_pocket', /billete|bill|cash|dinero|banknote|currency/],
  ['coin_pocket', /moneda|monedero|coin/],
  ['handle', /\basa|handle|correa|manija|strap|asidero/],
  ['flap', /solapa|flap|cierre|tapeta|closure/],
  ['tab', /pestana|lengueta|tirador|presilla|trabilla|\btab\b|pull/],
  ['lining', /forro|lining/],
  ['lid', /tapa\b|\btapa |\blid\b|cover/],
  ['base', /\bbase|fondo|suela|bottom|\bsole\b/],
  ['gusset', /fuelle|gusset|banda/],
  ['wall', /lateral|pared|costado|\bside|wall|canto/],
  ['back', /traser|posterior|espalda|\bback|dorso|reverso|\brear\b/],
  ['front', /frente|frontal|delanter|\bfront|cara/],
  ['pocket', /bolsillo|pocket|compartiment/],
  ['item', /posavaso|coaster|llavero|marcapagina|keychain|key ?ring|key ?fob|bookmark|tag\b|etiqueta|label/],
  ['body', /cuerpo|exterior|body|principal|cubierta|carcasa|funda|panel|pieza|piece|outer|shell|\bmain\b|\bcase\b|\bsleeve\b/],
];

const GARMENT_ROLES: Role[] = ['sleeve', 'cuff', 'hood', 'collar', 'waistband'];

/** Role from the piece name. Garment roles are only guessed for garments (a "Sleeve" of a phone case is its body). */
export function guessRole(pieceName: string, garment = true): Role {
  const n = normName(pieceName);
  // "Bolsillo frontal" / "Front pocket" is a pocket, not the front panel.
  if (/bolsillo|pocket/.test(n) && !/tarjet|card|billete|bill|moneda|coin/.test(n)) return 'pocket';
  for (const [role, re] of RULES) if ((garment || !GARMENT_ROLES.includes(role)) && re.test(n)) return role;
  return 'other';
}

interface Ctx {
  spec: SceneSpec;
  T: number; // thickness, cm
  pool: Inst[];
  warnings: string[];
  nodes: SceneNode[];
  closure: SceneSpec['macro']['closure'];
  foldAngle: number;
}

function instances(spec: SceneSpec, pieces: AgentPiece[]): Inst[] {
  const bound = new Map<string, Role>();
  for (const r of spec.macro.roles) {
    const ref = findPiece(pieces, r.piece);
    if (ref && !bound.has(ref.piece.name)) bound.set(ref.piece.name, r.role);
  }
  const used = new Set(spec.nodes.filter((n) => n.type !== 'hardware').map((n) => `${normName(n.piece)}#${n.instance}`));
  const out: Inst[] = [];
  for (const p of pieces) {
    const role = bound.get(p.name) ?? guessRole(p.name, spec.macro.type === 'garment_top');
    for (let k = 0; k < p.qty_per_set; k++) {
      if (used.has(`${normName(p.name)}#${k}`)) continue; // the model placed this instance explicitly
      out.push({ name: p.name, instance: k, w: p.width_cm, h: p.height_cm, kind: p.kind, role });
    }
  }
  return out;
}

const area = (i: Inst) => i.w * i.h;
function take(ctx: Ctx, roles: Role[], n = Infinity): Inst[] {
  const got: Inst[] = [];
  for (const role of roles) {
    for (let i = 0; i < ctx.pool.length && got.length < n; ) {
      if (ctx.pool[i].role === role) got.push(...ctx.pool.splice(i, 1));
      else i++;
    }
  }
  return got;
}
function takeLargest(ctx: Ctx, roles: Role[]): Inst | undefined {
  const cands = ctx.pool.filter((i) => roles.includes(i.role));
  const pick = (cands.length ? cands : ctx.pool).slice().sort((a, b) => area(b) - area(a))[0];
  if (pick) ctx.pool.splice(ctx.pool.indexOf(pick), 1);
  return pick;
}

let seq = 0;
function add(ctx: Ctx, inst: Inst | null, patch: Partial<SceneNode>): SceneNode {
  const id = inst ? `m_${inst.role}_${seq++}` : `m_hw_${seq++}`;
  const n = blankNode(id, inst ? { piece: inst.name, instance: inst.instance, ...patch } : { type: 'hardware', joint: 'stack', ...patch });
  ctx.nodes.push(n);
  return n;
}
const root = (ctx: Ctx, inst: Inst, patch: Partial<SceneNode> = {}) => add(ctx, inst, { joint: 'root', stitch: 'all', ...patch });
/** Stack `inst` on `parent` with its bottom edge `margin` cm above the parent's bottom edge. */
function stackBottom(ctx: Ctx, inst: Inst, parent: SceneNode, pw: number, ph: number, cx: number, margin: number, patch: Partial<SceneNode> = {}) {
  const rotated = (patch.rotation_deg ?? 0) % 180 !== 0;
  const h = rotated ? inst.w : inst.h;
  return add(ctx, inst, {
    parent: parent.id, joint: 'stack', side: 'top', anchor_x: cx / pw, anchor_y: (-ph / 2 + margin + h / 2) / ph, stitch: 'u_shape', ...patch,
  });
}
const snap = (ctx: Ctx, parent: SceneNode, ax: number, ay: number, side: 'top' | 'bottom', kind: SceneNode['hardware'] = 'snap') =>
  add(ctx, null, { parent: parent.id, hardware: kind, anchor_x: ax, anchor_y: ay, side });
const dims = (i: Inst) => ({ w: i.w, h: i.h });

function bifoldWallet(ctx: Ctx) {
  const body = takeLargest(ctx, ['body', 'back', 'front'])!;
  const { w: W, h: H } = dims(body);
  const landscape = W >= H;
  const angle = ctx.foldAngle || 179;
  const b = root(ctx, body, { folds: [{ axis: landscape ? 'vertical' : 'horizontal', at: 0.5, angle_deg: angle, radius_mm: 0, moving: 'negative' }] });
  // Work in a frame where the fold is vertical; for a portrait body swap axes when writing anchors.
  const half = (landscape ? W : H) / 2, len = landscape ? H : W;
  const place = (inst: Inst, along: number, across: number, layer: number, stitch: SceneNode['stitch'] = 'u_shape') => {
    const rot = landscape ? 0 : 90;
    add(ctx, inst, {
      parent: b.id, joint: 'stack', side: 'top', layer, stitch, rotation_deg: rot,
      anchor_x: landscape ? along / W : across / W, anchor_y: landscape ? across / H : along / H,
    });
  };
  const bills = take(ctx, ['bill_pocket']);
  for (const [k, bill] of bills.entries()) {
    const m = Math.max(0, Math.min((half * 2 - bill.w) / 2, (len - bill.h) / 2));
    place(bill, 0, -len / 2 + m + bill.h / 2, k);
  }
  const base = bills.length;
  const cards = take(ctx, ['card_pocket', 'pocket']);
  const coins = take(ctx, ['coin_pocket']);
  // Card slots on both halves; a coin pocket goes in front of the right-hand slots, which peek out above it.
  const left = cards.slice(0, Math.ceil(cards.length / 2));
  const right = [...cards.slice(Math.ceil(cards.length / 2)), ...coins];
  const stagger = (list: Inst[], cx: number) => {
    list.forEach((c, j) => {
      const m = Math.max(0.3, Math.min(0.8, (half - c.w) / 2));
      const top = len / 2 - m, bottom = -len / 2 + m;
      const step = list.length > 1 ? Math.min(1.6, Math.max(0.6, (top - bottom - c.h) / (list.length - 1))) : 0;
      const cy = c.role === 'coin_pocket' ? bottom + c.h / 2 : Math.max(bottom + c.h / 2, top - c.h / 2 - j * step);
      place(c, cx, cy, base + j);
    });
  };
  stagger(left, -half / 2);
  stagger(right, half / 2);
  const flap = take(ctx, ['flap', 'tab'], 1)[0];
  if (flap) {
    const f = add(ctx, flap, { parent: b.id, joint: 'hinge', hinge_edge: landscape ? 'right' : 'top', hinge_angle_deg: 180, stitch: 'all', rotation_deg: 0 });
    snap(ctx, f, 0, 0.3, 'bottom');
  } else if (ctx.closure === 'snap' || ctx.closure === 'stud') {
    snap(ctx, b, landscape ? -0.45 : 0, landscape ? 0 : -0.45, 'bottom', ctx.closure);
  }
}

function cardholder(ctx: Ctx, withFlap = true) {
  const body = takeLargest(ctx, ['body', 'back'])!;
  const b = root(ctx, body);
  const pockets = take(ctx, ['front', 'pocket', 'card_pocket', 'bill_pocket', 'coin_pocket']).sort((x, y) => y.h - x.h);
  // Tiers must be visible: a pocket goes on the front face only if its top sits clearly below the
  // previous tier; otherwise it goes on the back face (two-sided cardholder).
  const last: Record<'top' | 'bottom', number> = { top: Infinity, bottom: Infinity };
  const layers = { top: 0, bottom: 0 };
  pockets.forEach((p) => {
    const rot = p.w > body.w * 1.05 && p.h <= body.w ? 90 : 0;
    const h = rot ? p.w : p.h;
    const side: 'top' | 'bottom' = last.top - h >= 0.8 ? 'top' : last.bottom - h >= 0.8 ? 'bottom' : 'top';
    stackBottom(ctx, p, b, body.w, body.h, 0, 0, { layer: layers[side]++, rotation_deg: rot, side });
    last[side] = h;
  });
  const flap = withFlap ? take(ctx, ['flap', 'tab'], 1)[0] : undefined;
  if (flap) {
    const f = add(ctx, flap, { parent: b.id, joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 180, stitch: 'all' });
    if (ctx.closure !== 'none' || flap.role === 'flap' || flap.role === 'tab') snap(ctx, f, 0, 0.15, 'bottom');
  }
}

function bulgeFor(i: Inst, k = 0.7) {
  return Math.max(2, Math.min(25, Math.min(i.w, i.h) * k));
}

function pair(ctx: Ctx): [Inst, Inst | undefined] {
  const back = take(ctx, ['back'], 1)[0] ?? takeLargest(ctx, ['body', 'front'])!;
  let front = take(ctx, ['front'], 1)[0];
  if (!front) {
    // Same piece cut twice, or the closest-sized body piece.
    const same = ctx.pool.find((i) => i.name === back.name) ?? ctx.pool.filter((i) => i.role === 'body').sort((a, b) => Math.abs(a.h - back.h) - Math.abs(b.h - back.h))[0];
    if (same) { front = same; ctx.pool.splice(ctx.pool.indexOf(same), 1); }
  }
  return [back, front];
}

function zipPouch(ctx: Ctx) {
  const [back, front] = pair(ctx);
  const linings = take(ctx, ['lining']);
  const zipEdge = 'top';
  if (!front) {
    // One piece folded in half: the fold is the bottom, the zip runs along the open edge.
    const tall = back.h >= back.w;
    const b = root(ctx, back, { folds: [{ axis: tall ? 'horizontal' : 'vertical', at: 0.5, angle_deg: 180, radius_mm: 0, moving: 'positive' }], stitch: 'sides' });
    add(ctx, null, { parent: b.id, hardware: 'zipper', hinge_edge: tall ? 'bottom' : 'left', side: 'top' });
    return;
  }
  const bulge = bulgeFor(back, 1.5);
  const b = root(ctx, back, { bulge_mm: -bulge, stitch: 'all' });
  linings.slice(0, 1).forEach((l) => add(ctx, l, { parent: b.id, joint: 'stack', layer: 0, stitch: 'none' }));
  const f = add(ctx, front, { parent: b.id, joint: 'stack', layer: 1, bulge_mm: bulge, stitch: 'all' });
  add(ctx, null, { parent: f.id, hardware: 'zipper', hinge_edge: zipEdge, side: 'top' });
  const tab = take(ctx, ['tab', 'handle', 'flap'], 1)[0];
  if (tab) {
    add(ctx, tab, {
      parent: f.id, joint: 'hinge', hinge_edge: 'right', anchor_y: 0.38, hinge_angle_deg: -20, stitch: 'all',
      rotation_deg: tab.w > tab.h ? 90 : 0, folds: [{ axis: 'horizontal', at: 0.5, angle_deg: 170, radius_mm: 0, moving: 'positive' }],
    });
  }
}

function flapPouch(ctx: Ctx) {
  const [back, front] = pair(ctx);
  const flap = take(ctx, ['flap', 'tab'], 1)[0];
  const bulge = bulgeFor(back, 0.35);
  if (front && !flap && back.h > front.h * 1.25) {
    // The back is taller: its top part folds down as the flap.
    const at = Math.min(0.9, (front.h + 0.4) / back.h);
    const b = root(ctx, back, { bulge_mm: -bulge, folds: [{ axis: 'horizontal', at, angle_deg: 180, radius_mm: 0, moving: 'positive' }] });
    stackBottom(ctx, front, b, back.w, back.h, 0, 0, { bulge_mm: bulge, stitch: 'u_shape' });
    snap(ctx, b, 0, Math.min(0.45, at - 0.5 + (1 - at) * 0.75), 'bottom');
    return;
  }
  const b = root(ctx, back, { bulge_mm: -bulge });
  if (front) stackBottom(ctx, front, b, back.w, back.h, 0, 0, { bulge_mm: bulge, stitch: 'u_shape' });
  if (flap) {
    const f = add(ctx, flap, { parent: b.id, joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 180, stitch: 'all' });
    snap(ctx, f, 0, 0.25, 'bottom', ctx.closure === 'stud' ? 'stud' : 'snap');
  } else if (ctx.closure === 'zipper' && front) {
    add(ctx, null, { parent: ctx.nodes[ctx.nodes.length - 1].id, hardware: 'zipper', hinge_edge: 'top', side: 'top' });
  }
}

function flatSleeve(ctx: Ctx) {
  const [back, front] = pair(ctx);
  const b = root(ctx, back, { bulge_mm: -Math.min(3, bulgeFor(back, 0.2)) });
  if (front) stackBottom(ctx, front, b, back.w, back.h, 0, 0, { bulge_mm: Math.min(3, bulgeFor(back, 0.2)), stitch: 'u_shape' });
  const flap = take(ctx, ['flap'], 1)[0];
  if (flap) {
    const f = add(ctx, flap, { parent: b.id, joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 180, stitch: 'all' });
    if (ctx.closure !== 'none') snap(ctx, f, 0, 0.25, 'bottom', ctx.closure === 'stud' ? 'stud' : 'snap');
  }
  const tab = take(ctx, ['tab'], 1)[0];
  if (tab) add(ctx, tab, { parent: b.id, joint: 'hinge', hinge_edge: 'top', anchor_y: 0, hinge_angle_deg: 0, stitch: 'all', rotation_deg: tab.w > tab.h ? 90 : 0, self_y: 0 });
  if (!front) take(ctx, ['pocket', 'card_pocket']).forEach((p, j) => stackBottom(ctx, p, b, back.w, back.h, 0, 0.5, { layer: j }));
}

function envelope(ctx: Ctx) {
  const body = takeLargest(ctx, ['body', 'back', 'front'])!;
  const T = ctx.T;
  const r1 = (T + 0.4) / 2 + 0.02, r2 = r1 + T / 2 + 0.04;
  const tall = body.h >= body.w;
  const axis = tall ? 'horizontal' : 'vertical';
  const b = root(ctx, body, {
    stitch: 'sides',
    folds: [
      { axis, at: 0.37, angle_deg: 180, radius_mm: r1 * 10, moving: 'negative' },
      { axis, at: 0.73, angle_deg: 176, radius_mm: r2 * 10, moving: 'positive' },
    ],
  });
  snap(ctx, b, tall ? 0 : 0.4, tall ? 0.4 : 0, 'bottom', ctx.closure === 'stud' ? 'stud' : 'snap');
}

function tube(ctx: Ctx) {
  const body = takeLargest(ctx, ['body', 'front', 'back'])!;
  const wraps = body.w <= body.h ? body.w : body.h;
  const theta = (350 * Math.PI) / 180;
  const radiusCm = (wraps * 0.98) / theta;
  root(ctx, body, {
    stitch: 'sides',
    folds: [{ axis: body.w <= body.h ? 'vertical' : 'horizontal', at: 0.5, angle_deg: 350, radius_mm: radiusCm * 10, moving: 'positive' }],
  });
}

function box(ctx: Ctx) {
  const base = take(ctx, ['base'], 1)[0] ?? takeLargest(ctx, ['body', 'back', 'front'])!;
  const b = root(ctx, base, { stitch: 'none' });
  const walls = take(ctx, ['wall', 'gusset', 'front', 'back', 'body']);
  const edges: { edge: SceneNode['hinge_edge']; len: number }[] = [
    { edge: 'top', len: base.w }, { edge: 'bottom', len: base.w }, { edge: 'left', len: base.h }, { edge: 'right', len: base.h },
  ];
  let back: SceneNode | null = null;
  for (const e of edges) {
    if (!walls.length) break;
    const score = (i: Inst) => Math.min(Math.abs(i.w - e.len), Math.abs(i.h - e.len));
    walls.sort((a, c) => score(a) - score(c));
    const wall = walls.shift()!;
    const rot = Math.abs(wall.w - e.len) <= Math.abs(wall.h - e.len) ? 0 : 90;
    const n = add(ctx, wall, { parent: b.id, joint: 'hinge', hinge_edge: e.edge, hinge_angle_deg: 90, rotation_deg: rot, stitch: 'none' });
    if (e.edge === 'top') back = n;
  }
  walls.forEach((w) => ctx.pool.push(w));
  const lid = take(ctx, ['lid'], 1)[0];
  if (lid) {
    if (back) add(ctx, lid, { parent: back.id, joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 90, stitch: 'none' });
    else add(ctx, lid, { parent: b.id, joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 100, stitch: 'none' });
  }
}

function tote(ctx: Ctx) {
  const base = take(ctx, ['base'], 1)[0];
  const panels = take(ctx, ['front', 'back', 'body']);
  const sides = take(ctx, ['wall', 'gusset']);
  const handles = take(ctx, ['handle']);
  const faces: SceneNode[] = [];
  if (base) {
    const b = root(ctx, base, { stitch: 'none' });
    const edges: SceneNode['hinge_edge'][] = ['bottom', 'top'];
    panels.slice(0, 2).forEach((p, k) => {
      const rot = Math.abs(p.w - base.w) <= Math.abs(p.h - base.w) ? 0 : 90;
      faces.push(add(ctx, p, { parent: b.id, joint: 'hinge', hinge_edge: edges[k], hinge_angle_deg: 90, rotation_deg: rot, stitch: 'none' }));
    });
    const sideEdges: SceneNode['hinge_edge'][] = ['left', 'right'];
    sides.slice(0, 2).forEach((s, k) => {
      const rot = Math.abs(s.w - base.h) <= Math.abs(s.h - base.h) ? 0 : 90;
      add(ctx, s, { parent: b.id, joint: 'hinge', hinge_edge: sideEdges[k], hinge_angle_deg: 90, rotation_deg: rot, stitch: 'none' });
    });
    ctx.pool.push(...panels.slice(2), ...sides.slice(2));
  } else if (panels.length) {
    const b = root(ctx, panels[0], { stitch: 'all' });
    faces.push(b);
    if (panels[1]) faces.push(add(ctx, panels[1], { parent: b.id, joint: 'stack', layer: 0, stitch: 'u_shape' }));
    sides.forEach((s) => ctx.pool.push(s));
    ctx.pool.push(...panels.slice(2));
  }
  handles.forEach((h, k) => {
    const face = faces[k % Math.max(1, faces.length)];
    if (!face) { ctx.pool.push(h); return; }
    add(ctx, h, { type: 'strap', joint: 'stack', parent: face.id, target: face.id, anchor_x: -0.22, anchor_y: 0.4, target_x: 0.22, target_y: 0.4, hinge_edge: 'top' });
  });
}

function keychain(ctx: Ctx) {
  const body = takeLargest(ctx, ['item', 'body', 'tab'])!;
  const long = Math.max(body.w, body.h) / Math.min(body.w, body.h) >= 2;
  const landscape = body.w >= body.h;
  if (long) {
    const b = root(ctx, body, { folds: [{ axis: landscape ? 'vertical' : 'horizontal', at: 0.5, angle_deg: 180, radius_mm: 3.5, moving: 'positive' }] });
    add(ctx, null, { parent: b.id, hardware: 'ring', anchor_x: 0, anchor_y: 0, hinge_edge: landscape ? 'right' : 'top' });
    add(ctx, null, { parent: b.id, hardware: 'rivet', anchor_x: landscape ? 0.36 : 0, anchor_y: landscape ? 0 : 0.36, side: 'bottom' });
  } else {
    const b = root(ctx, body);
    const ay = landscape ? 0 : 0.5 - 0.7 / body.h, ax = landscape ? 0.5 - 0.7 / body.w : 0;
    add(ctx, null, { parent: b.id, hardware: 'ring', anchor_x: ax, anchor_y: ay, hinge_edge: landscape ? 'right' : 'top' });
  }
}

function coasters(ctx: Ctx) {
  const holder = take(ctx, ['base', 'body'], 1)[0];
  const items = take(ctx, ['item', 'other', 'body', 'front', 'back']).sort((a, b) => area(b) - area(a));
  const first = holder ?? items.shift();
  if (!first) return;
  const r = root(ctx, first, { stitch: holder ? 'all' : 'none' });
  // A fanned pile: each coaster rests on the previous one, slightly shifted and turned.
  let prev = r;
  items.forEach((it, k) => {
    prev = add(ctx, it, {
      parent: holder ? r.id : prev.id, joint: 'stack', layer: holder ? k : 0, stitch: 'none',
      anchor_x: holder ? 0 : 0.16, anchor_y: holder ? 0 : -0.03, rotation_deg: holder ? 0 : 7,
    });
  });
}

/** Sleeves hang this many degrees out from the vertical (a technical flat drawing of a jacket). */
const SLEEVE_SPLAY = 12;

/**
 * Garment top (jacket, coat, shirt, vest) laid flat, face up, as in a technical flat: the back is
 * the root, the fronts lie on it and meet (or cross over) at the centre, the sleeves are sewn to
 * the armholes just below the shoulder line and hang down, the collar folds over the neckline,
 * a hood or waistband is sewn to the top or bottom edge and cuffs to the end of the sleeves.
 */
function garmentTop(ctx: Ctx) {
  const largest = (a: Inst, b: Inst) => area(b) - area(a);
  const backs = take(ctx, ['back']).sort(largest);
  const fronts = take(ctx, ['front']).sort(largest);
  const bodies = () => ctx.pool.filter((i) => i.role === 'body').sort(largest);
  let back = backs.shift() ?? bodies()[0];
  if (back && ctx.pool.includes(back)) ctx.pool.splice(ctx.pool.indexOf(back), 1);
  if (!back) back = fronts.shift() ?? takeLargest(ctx, ['other', 'lining', 'item'])!;
  if (!fronts.length) {
    // A second body piece of about the same height is the front.
    const same = bodies().sort((a, b) => Math.abs(a.h - back!.h) - Math.abs(b.h - back!.h))[0];
    if (same) { fronts.push(same); ctx.pool.splice(ctx.pool.indexOf(same), 1); }
  }
  const W = back.w, H = back.h;
  const topY = (h: number) => (h <= H ? (H / 2 - h / 2) / H : 0);
  const r = root(ctx, back, { stitch: 'sides' });

  // Linings and any extra back piece lie inside, under the fronts.
  [...take(ctx, ['lining']), ...backs].forEach((l) => add(ctx, l, { parent: r.id, joint: 'stack', side: 'top', layer: 0, anchor_y: topY(l.h), stitch: 'none' }));

  // Fronts: aligned with the shoulder line; two halves meet at the centre or, if wider, cross over.
  const fr: { node: SceneNode; inst: Inst; inner: 'left' | 'right' }[] = [];
  if (fronts.length === 1) {
    const f = fronts[0];
    fr.push({ node: add(ctx, f, { parent: r.id, joint: 'stack', side: 'top', layer: 1, anchor_y: topY(f.h), stitch: 'sides' }), inst: f, inner: 'left' });
  } else if (fronts.length >= 2) {
    const [a, b] = fronts;
    const meet = a.w + b.w < W * 0.98;
    const ax = meet ? -a.w / 2 : -W / 2 + a.w / 2, bx = meet ? b.w / 2 : W / 2 - b.w / 2;
    fr.push({ node: add(ctx, a, { parent: r.id, joint: 'stack', side: 'top', layer: 1, anchor_x: ax / W, anchor_y: topY(a.h), stitch: 'sides' }), inst: a, inner: 'right' });
    fr.push({ node: add(ctx, b, { parent: r.id, joint: 'stack', side: 'top', layer: 2, anchor_x: bx / W, anchor_y: topY(b.h), stitch: 'sides' }), inst: b, inner: 'left' });
    fronts.slice(2).forEach((f, k) => add(ctx, f, { parent: r.id, joint: 'stack', side: 'top', layer: 3 + k, anchor_y: topY(f.h), stitch: 'sides' }));
  }

  // Pockets low on the fronts (or on the back when there is no front); flaps cover them, or become lapels.
  const hosts = fr.length ? fr.map((f) => ({ node: f.node, w: f.inst.w, h: f.inst.h, x: 0, inner: f.inner })) : [
    { node: r, w: W, h: H, x: -W / 4, inner: 'right' as const }, { node: r, w: W, h: H, x: W / 4, inner: 'left' as const },
  ];
  const pockets = take(ctx, ['pocket', 'card_pocket', 'bill_pocket', 'coin_pocket']);
  const pocketTops: { host: (typeof hosts)[number]; top: number }[] = [];
  pockets.forEach((pk, k) => {
    const host = hosts[k % hosts.length], round = Math.floor(k / hosts.length);
    const margin = Math.min(host.h * 0.12 + round * (pk.h + 2), Math.max(0, host.h - pk.h - 1));
    stackBottom(ctx, pk, host.node, host.w, host.h, host.x, margin, { layer: 0 });
    pocketTops.push({ host, top: -host.h / 2 + margin + pk.h });
  });
  take(ctx, ['flap', 'tab']).forEach((f, k) => {
    const pt = pocketTops[k];
    if (pt) {
      add(ctx, f, { parent: pt.host.node.id, joint: 'stack', side: 'top', layer: 1, anchor_x: pt.host.x / pt.host.w, anchor_y: (pt.top + 0.6 - f.h / 2) / pt.host.h, stitch: 'top' });
      return;
    }
    const host = hosts[k % hosts.length];
    const dir = host.inner === 'right' ? 1 : -1;
    add(ctx, f, {
      parent: host.node.id, joint: 'stack', side: 'top', layer: 1, stitch: 'sides',
      anchor_x: Math.max(-0.5, Math.min(0.5, (dir * Math.max(0, host.w / 2 - f.w / 2)) / host.w)), anchor_y: (host.h / 2 - f.h / 2) / host.h,
    });
  });

  // Sleeves: tucked under the back at the armhole (the side edge hides the cap from the shoulder down to
  // the underarm) and hanging down, splayed a little; the cap stays below the shoulder line.
  const a = SLEEVE_SPLAY;
  const sleeves = take(ctx, ['sleeve']);
  const sleeveNodes: { node: SceneNode; inst: Inst; far: SceneNode['hinge_edge'] }[] = [];
  sleeves.forEach((s, k) => {
    const left = k % 2 === 0;
    const portrait = s.h >= s.w;
    const cap = portrait ? s.w : s.h;
    const tuck = Math.max(1, Math.min(5, cap * 0.2));
    const al = Math.min(1.2, s.h * 0.15);
    // Portrait: the cap is the bottom edge and the sleeve runs along +v. Landscape: the cap is the left edge, it runs along +u.
    const patch: Partial<SceneNode> = portrait
      ? { self_x: left ? -0.5 + tuck / s.w : 0.5 - tuck / s.w, self_y: 0, rotation_deg: left ? 90 - a : -(90 - a) }
      : { self_x: -0.5 + Math.min(1.2, s.w * 0.15) / s.w, self_y: left ? (s.h - al - tuck) / s.h : (tuck - al) / s.h, rotation_deg: left ? 180 - a : a };
    const spec = blankNode('tmp', { joint: 'seam', hinge_edge: left ? 'left' : 'right', ...patch });
    const pl = seamPlacement(spec, W, H, s.w, s.h);
    const phi = (pl.rot * Math.PI) / 180;
    const hy = Math.abs(Math.sin(phi)) * s.w / 2 + Math.abs(Math.cos(phi)) * s.h / 2;
    const anchorY = Math.min(0.5, Math.max(-0.45, (H / 2 - 0.3 - (pl.cy + hy)) / H));
    const node = add(ctx, s, { ...patch, parent: r.id, joint: 'seam', side: 'bottom', hinge_edge: left ? 'left' : 'right', anchor_y: anchorY, stitch: 'sides' });
    sleeveNodes.push({ node, inst: s, far: portrait ? 'top' : 'right' });
  });
  take(ctx, ['cuff']).forEach((c, k) => {
    const sl = sleeveNodes[k % Math.max(1, sleeveNodes.length)];
    if (!sl || k >= sleeveNodes.length) { ctx.pool.push(c); return; }
    add(ctx, c, { parent: sl.node.id, joint: 'seam', side: 'top', hinge_edge: sl.far, rotation_deg: c.w >= c.h ? 0 : 90, stitch: 'bottom' });
  });

  // Collar folded down over the neckline; a hood stands up from it; waistbands below the hem.
  take(ctx, ['collar']).forEach((c, k) => {
    const rot = c.w >= c.h ? 0 : 90;
    const len = rot ? c.h : c.w;
    if (k === 0 && len <= W * 1.1) add(ctx, c, { parent: r.id, joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 180, rotation_deg: rot, stitch: 'all' });
    else add(ctx, c, { parent: r.id, joint: 'seam', side: 'top', hinge_edge: 'top', rotation_deg: rot, stitch: 'bottom' });
  });
  take(ctx, ['hood']).forEach((h) => add(ctx, h, { parent: r.id, joint: 'seam', side: 'top', hinge_edge: 'top', stitch: 'bottom' }));
  take(ctx, ['waistband']).forEach((b, k) => {
    const host = k === 0 || !fr[k - 1] ? { node: r, w: W } : { node: fr[k - 1].node, w: fr[k - 1].inst.w };
    add(ctx, b, { parent: host.node.id, joint: 'seam', side: 'top', hinge_edge: 'bottom', rotation_deg: b.w >= b.h ? 0 : 90, stitch: 'bottom' });
  });

  // Closure along the centre front.
  const top = fr.length >= 2 ? fr[1] : fr[0];
  if (top && ctx.closure === 'zipper') add(ctx, null, { parent: top.node.id, hardware: 'zipper', hinge_edge: top.inner, side: 'top' });
  else if (top && ctx.closure !== 'none') {
    const ax = (top.inner === 'left' ? -1 : 1) * (0.5 - Math.min(0.2, 1.5 / top.inst.w));
    for (const y of [0.32, 0.1, -0.12, -0.34]) snap(ctx, top.node, ax, y, 'top', ctx.closure === 'stud' ? 'stud' : ctx.closure === 'buckle' ? 'buckle' : 'snap');
  }

  // Anything else that fits lies on the back, under the fronts (a yoke, an inner pocket…).
  ctx.pool.splice(0).forEach((p) => {
    if (p.role === 'handle' || p.w > W * 1.02 || p.h > H * 1.02) { ctx.pool.push(p); return; }
    add(ctx, p, { parent: r.id, joint: 'stack', side: 'top', layer: 0, anchor_y: topY(p.h), stitch: 'none' });
  });
}

function generic(ctx: Ctx) {
  const body = takeLargest(ctx, ['body', 'back', 'base', 'front'])!;
  const b = root(ctx, body);
  const flaps = take(ctx, ['flap'], 1);
  const rest = ctx.pool.splice(0).filter((i) => i.role !== 'handle').sort((a, c) => area(c) - area(a));
  rest.forEach((p, j) => {
    const fits = p.w <= body.w * 1.02 && p.h <= body.h * 1.02;
    if (!fits) { ctx.pool.push(p); return; }
    stackBottom(ctx, p, b, body.w, body.h, 0, Math.min(0.4, (body.h - p.h) / 2), { layer: j });
  });
  flaps.forEach((f) => add(ctx, f, { parent: b.id, joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 180, stitch: 'all' }));
}

const MACRO_FNS: Record<Exclude<MacroType, 'none'>, (ctx: Ctx) => void> = {
  bifold_wallet: bifoldWallet,
  cardholder: (ctx) => cardholder(ctx, true),
  card_slot_stack: (ctx) => cardholder(ctx, false),
  zip_pouch: zipPouch,
  flap_pouch: flapPouch,
  flat_sleeve: flatSleeve,
  envelope_flap: envelope,
  tube_sleeve: tube,
  box_with_lid: box,
  tote,
  keychain_loop: keychain,
  coaster_stack: coasters,
  garment_top: garmentTop,
  generic_stack: generic,
};

/** Expand spec.macro into nodes. Instances the model already placed explicitly are skipped. */
export function expandMacro(spec: SceneSpec, pieces: AgentPiece[], warnings: string[]): SceneNode[] {
  if (spec.macro.type === 'none') return [];
  seq = 0;
  const pool = instances(spec, pieces);
  if (!pool.length) return [];
  const ctx: Ctx = {
    spec, pool, warnings, nodes: [], closure: spec.macro.closure, foldAngle: spec.macro.fold_angle_deg,
    T: (spec.material.thickness_mm || DEFAULT_THICKNESS[spec.material.kind] || 1.5) / 10,
  };
  // An explicit root from the model wins: then the macro hangs everything from it.
  MACRO_FNS[spec.macro.type](ctx);
  const explicitRoot = spec.nodes.find((n) => n.joint === 'root');
  if (explicitRoot) {
    for (const n of ctx.nodes) if (n.joint === 'root') { n.joint = 'stack'; n.parent = explicitRoot.id; }
  }
  if (ctx.pool.length) warnings.push(`not placed by the macro: ${[...new Set(ctx.pool.map((i) => i.name))].join(', ')}`);
  return ctx.nodes;
}
