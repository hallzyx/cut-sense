import type { AgentPiece } from '../agentSchema';
import type { SceneNode, SceneSpec } from './dsl';
import { applyD, applyP, chain, clamp01, cross, dot, ident, interpRigid, invRigid, mul, norm, rotX, rotZ, smooth, trans, type M4 } from './math';
import { DEFAULT_THICKNESS, findPiece, pieceOutline } from './pieces';

/**
 * Kinematics of the assembly: turns an explicit scene into a rig and evaluates it at any
 * "armar" progress t ∈ [0,1]. Pure (no three.js), so the sanity checks and the tests use
 * exactly what the viewer draws.
 *
 * Timeline: phase A (t 0→0.5) moves each stacked piece from the flat layout onto its parent;
 * phase B (t 0.5→1) closes hinges and folds and puffs the pouches.
 * World: y up; a panel lying on the table has its top face up and its +v edge away from the camera.
 */
export interface FoldRt { coord: 0 | 1; c0: number; dir: 1 | -1; theta: number; L: number; wm: number; rho: number }

export interface RigNode {
  i: number;
  spec: SceneNode;
  parent: number;
  children: number[];
  W: number; H: number; T: number;
  /** Rotated footprint (stack/hinge placement). */
  Wr: number; Hr: number;
  outline: [number, number][];
  pieceIndex: number;
  rest: M4;
  edge: M4;
  hingeH: number;
  hingeTheta: number;
  folds: FoldRt[];
  bulge: number;
  topStack: number; bottomStack: number;
  net: number;
  layout: M4;
  /** Order in which stacked pieces fly in during phase A. */
  seq: number;
  strapLen: number; strapWidth: number;
}
export interface Loose { piece: string; instance: number; W: number; H: number; T: number; outline: [number, number][]; pieceIndex: number; layout: M4 }
export interface Rig { nodes: RigNode[]; loose: Loose[]; T: number; scene: SceneSpec; stackCount: number }

/** Local → world for things lying on the table: local z (thickness) becomes world up, local +y goes away from the camera. */
export const G = rotX(-Math.PI / 2);
const HW_HEIGHT: Record<string, number> = { snap: 0.3, stud: 0.35, rivet: 0.2, buckle: 0.3, zipper: 0.25, ring: 0, none: 0 };
const GAP = 2.5;

export function buildRig(scene: SceneSpec, pieces: AgentPiece[], unused: { piece: string; instance: number }[] = []): Rig {
  const T = (scene.material.thickness_mm || DEFAULT_THICKNESS[scene.material.kind] || 1.5) / 10;
  const idx = new Map(scene.nodes.map((n, i) => [n.id, i]));
  const nodes: RigNode[] = scene.nodes.map((spec, i) => {
    const ref = spec.type === 'hardware' ? null : findPiece(pieces, spec.piece);
    const W = ref?.piece.width_cm ?? 1, H = ref?.piece.height_cm ?? 1;
    const r = (spec.rotation_deg * Math.PI) / 180;
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    return {
      i, spec, parent: spec.parent ? idx.get(spec.parent) ?? -1 : -1, children: [],
      W, H, T: spec.type === 'hardware' ? HW_HEIGHT[spec.hardware] ?? 0.2 : T,
      Wr: c * W + s * H, Hr: s * W + c * H,
      outline: ref ? pieceOutline(ref.piece) : [],
      pieceIndex: ref?.index ?? -1,
      rest: ident(), edge: ident(), hingeH: 0, hingeTheta: (spec.hinge_angle_deg * Math.PI) / 180,
      folds: [], bulge: spec.bulge_mm / 10, topStack: 0, bottomStack: 0, net: -1, layout: ident(), seq: -1,
      strapLen: Math.max(W, H), strapWidth: Math.min(W, H),
    };
  });
  nodes.forEach((n) => { if (n.parent >= 0) nodes[n.parent].children.push(n.i); });
  const rootIdx = nodes.findIndex((n) => n.parent < 0);

  // 1) Stacking (post-order): every node's own stacks are known before it is placed on its parent.
  const place = (p: RigNode) => {
    for (const c of p.children) place(nodes[c]);
    const stacked = p.children.map((c) => nodes[c]).filter((c) => c.spec.type === 'panel' && c.spec.joint === 'stack');
    stacked.sort((a, b) => (a.spec.side === b.spec.side ? a.spec.layer - b.spec.layer || a.i - b.i : a.spec.side === 'top' ? -1 : 1));
    const placedRects: { side: string; x0: number; x1: number; y0: number; y1: number; top: number }[] = [];
    for (const c of stacked) {
      const s = c.spec;
      const cx = s.anchor_x * p.W - s.self_x * c.Wr, cy = s.anchor_y * p.H - s.self_y * c.Hr;
      const rect = { side: s.side, x0: cx - c.Wr / 2, x1: cx + c.Wr / 2, y0: cy - c.Hr / 2, y1: cy + c.Hr / 2, top: 0 };
      let base = 0;
      for (const o of placedRects) {
        if (o.side !== s.side) continue;
        const ov = Math.min(o.x1, rect.x1) - Math.max(o.x0, rect.x0), oh = Math.min(o.y1, rect.y1) - Math.max(o.y0, rect.y0);
        if (ov > 0.05 && oh > 0.05) base = Math.max(base, o.top);
      }
      const off = s.offset_mm / 10;
      // A cushioned piece rises above its own thickness; whatever folds over it must clear that too.
      const ext = c.T + (s.flip ? c.bottomStack : c.topStack) + Math.max(0, (s.side === 'top') !== s.flip ? c.bulge : -c.bulge);
      rect.top = base + off + ext;
      placedRects.push(rect);
      const rz = rotZ((s.rotation_deg * Math.PI) / 180);
      const flip = s.flip ? mul(trans(0, 0, c.T), rotX(Math.PI)) : ident();
      const w0 = s.side === 'top' ? p.T + base + off : -(base + off) - c.T;
      c.rest = chain(trans(cx, cy, w0), rz, flip);
      if (s.side === 'top') p.topStack = Math.max(p.topStack, rect.top);
      else p.bottomStack = Math.max(p.bottomStack, rect.top);
    }
  };
  if (rootIdx >= 0) place(nodes[rootIdx]);

  // 2) Folds: bend radius fits whatever is stacked on the inner face (both halves meet).
  for (const n of nodes) {
    if (n.spec.type !== 'panel') continue;
    const folds = n.spec.folds.map((f) => {
      const coord: 0 | 1 = f.axis === 'horizontal' ? 1 : 0;
      const dim = coord ? n.H : n.W;
      const c0 = (f.at - 0.5) * dim;
      const dir: 1 | -1 = f.moving === 'positive' ? 1 : -1;
      const theta = (f.angle_deg * Math.PI) / 180;
      let rho: number;
      if (f.radius_mm > 0) rho = Math.max(f.radius_mm / 10, n.T / 2 + 0.01);
      else {
        let moving = 0, fixed = 0;
        for (const ci of n.children) {
          const c = nodes[ci];
          if (c.spec.type !== 'panel' || c.spec.joint !== 'stack' || (c.spec.side === 'top') !== theta > 0) continue;
          const pos = coord ? c.rest[13] : c.rest[12];
          // Height of the stack above (or below) the inner face.
          const h = theta > 0 ? c.rest[14] - n.T + c.T + c.topStack : -c.rest[14] + c.bottomStack;
          if ((pos - c0) * dir > 0) moving = Math.max(moving, h);
          else fixed = Math.max(fixed, h);
        }
        rho = (n.T + moving + fixed) / 2 + 0.03;
      }
      let L = rho * Math.abs(theta);
      if (L > dim * 0.98) { L = dim * 0.98; rho = L / Math.max(Math.abs(theta), 1e-6); }
      return { coord, c0, dir, theta, L, wm: n.T / 2, rho } satisfies FoldRt;
    });
    // Outer folds first (a fold nested inside another fold's moving part is applied before it).
    n.folds = folds.sort((a, b) => b.c0 * b.dir - a.c0 * a.dir);
  }

  // 3) Hinges: edge frame on the parent; the pivot rises when the piece folds over a stack.
  for (const n of nodes) {
    if (n.parent < 0 || n.spec.joint !== 'hinge' || n.spec.type !== 'panel') continue;
    const p = nodes[n.parent], s = n.spec;
    const e = s.hinge_edge;
    n.edge = e === 'top' ? trans(s.anchor_x * p.W, p.H / 2, 0)
      : e === 'bottom' ? mul(trans(s.anchor_x * p.W, -p.H / 2, 0), rotZ(Math.PI))
        : e === 'right' ? mul(trans(p.W / 2, s.anchor_y * p.H, 0), rotZ(-Math.PI / 2))
          : mul(trans(-p.W / 2, s.anchor_y * p.H, 0), rotZ(Math.PI / 2));
    const th = n.hingeTheta;
    let st = p.topStack;
    for (const f of p.folds) if (f.theta > (3 * Math.PI) / 4) st = Math.max(st, 2 * f.rho);
    n.hingeH = th >= (3 * Math.PI) / 4 ? (p.T + st + n.T) / 2 + 0.02 : th <= (-3 * Math.PI) / 4 ? -p.bottomStack / 2 - 0.02 : th >= 0 ? p.T : 0;
    const flip = s.flip ? mul(trans(0, 0, n.T), rotX(Math.PI)) : ident();
    n.rest = chain(trans(-s.self_x * n.Wr, n.Hr / 2, 0), rotZ((s.rotation_deg * Math.PI) / 180), flip);
  }

  // 4) Hardware sits on a face of its parent.
  for (const n of nodes) {
    if (n.spec.type !== 'hardware' || n.parent < 0) continue;
    const p = nodes[n.parent], s = n.spec;
    const up = s.side === 'top';
    n.rest = chain(trans(s.anchor_x * p.W, s.anchor_y * p.H, up ? p.T : 0), up ? ident() : rotX(Math.PI));
  }

  // 5) Flat layout: each stacked piece (with whatever hangs from it by hinges) is a "net" laid on the table.
  const nets: number[] = [];
  const netOf = (i: number): number => {
    const n = nodes[i];
    if (n.net >= 0) return n.net;
    if (n.parent < 0 || (n.spec.joint === 'stack' && n.spec.type === 'panel') || n.spec.type === 'strap') { n.net = i; nets.push(i); }
    else n.net = netOf(n.parent);
    return n.net;
  };
  nodes.forEach((n) => netOf(n.i));
  const relFlat = (i: number, root: number): M4 => {
    const n = nodes[i];
    if (i === root) return ident();
    const local = n.spec.joint === 'hinge' ? mul(n.edge, n.rest) : n.rest;
    return mul(relFlat(n.parent, root), local);
  };
  const boxes = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
  for (const n of nodes) {
    if (n.spec.type === 'hardware' || !n.outline.length) continue;
    const root = n.net;
    const m = n.spec.type === 'strap' ? ident() : relFlat(n.i, root);
    const b = boxes.get(root) ?? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    const pts: [number, number][] = n.spec.type === 'strap' ? [[-n.strapLen / 2, -n.strapWidth / 2], [n.strapLen / 2, n.strapWidth / 2]] : n.outline;
    for (const [u, v] of pts) {
      const q = [u, v, 0];
      applyP(m, q);
      b.x0 = Math.min(b.x0, q[0]); b.x1 = Math.max(b.x1, q[0]); b.y0 = Math.min(b.y0, q[1]); b.y1 = Math.max(b.y1, q[1]);
    }
    boxes.set(root, b);
  }
  const loose: Loose[] = unused.map((u) => {
    const ref = findPiece(pieces, u.piece)!;
    return { piece: ref.piece.name, instance: u.instance, W: ref.piece.width_cm, H: ref.piece.height_cm, T, outline: pieceOutline(ref.piece), pieceIndex: ref.index, layout: ident() };
  });
  const rootBox = boxes.get(rootIdx) ?? { x0: -1, x1: 1, y0: -1, y1: 1 };
  const items: { w: number; h: number; set: (x: number, y: number) => void }[] = [];
  for (const r of nets) {
    if (r === rootIdx) continue;
    const b = boxes.get(r);
    if (!b) continue;
    items.push({ w: b.x1 - b.x0, h: b.y1 - b.y0, set: (x, y) => { nodes[r].layout = mul(G, trans(x - b.x0, y - b.y1, 0)); } });
  }
  for (const l of loose) items.push({ w: l.W, h: l.H, set: (x, y) => { l.layout = mul(G, trans(x + l.W / 2, y - l.H / 2, 0)); } });
  const totalArea = items.reduce((s, it) => s + it.w * it.h, 0) + (rootBox.x1 - rootBox.x0) * (rootBox.y1 - rootBox.y0);
  const rowW = Math.max(rootBox.x1 - rootBox.x0, Math.sqrt(totalArea) * 1.5);
  let x = rootBox.x0, y = rootBox.y0 - GAP, rowH = 0;
  for (const it of items.sort((a, b) => b.h - a.h)) {
    if (x > rootBox.x0 && x + it.w > rootBox.x0 + rowW) { x = rootBox.x0; y -= rowH + GAP; rowH = 0; }
    it.set(x, y);
    x += it.w + GAP; rowH = Math.max(rowH, it.h);
  }
  if (rootIdx >= 0) nodes[rootIdx].layout = G;

  // Stacked pieces fly in one after another, parents before children, lower layers first.
  let seq = 0;
  const visit = (i: number) => {
    const n = nodes[i];
    if (n.parent >= 0 && n.spec.joint === 'stack' && n.spec.type === 'panel') n.seq = seq++;
    [...n.children].sort((a, b) => nodes[a].spec.layer - nodes[b].spec.layer).forEach(visit);
  };
  if (rootIdx >= 0) visit(rootIdx);
  return { nodes, loose, T, scene, stackCount: seq };
}

export interface Pose {
  t: number; a: number; b: number;
  rig: Rig;
  /** Relative transform of each node in its parent's (flat) frame at this t. */
  rel: M4[];
  /** Map a point (and optionally a direction) from node i's flat local frame to the world, in place. */
  map(i: number, p: number[], d?: number[] | null, d2?: number[] | null): void;
  strap(i: number, samples?: number): { pts: number[][]; radial: number[][]; normal: number[][]; tangent: number[][] } | null;
  hardware(i: number): M4;
}

/** Bend field of one fold at progress b, applied to a point (and directions) in the panel frame. */
function applyFold(f: FoldRt, b: number, flat: number[], p: number[], dirs: (number[] | null | undefined)[]) {
  const th = f.theta * b;
  if (Math.abs(th) < 1e-7) return;
  const kappa = th / f.L;
  const s0 = (flat[f.coord] - f.c0) * f.dir;
  const sigma = Math.min(f.L, Math.max(0, s0 + f.L / 2));
  if (sigma <= 0) return;
  const rho = 1 / kappa;
  const phi = kappa * sigma;
  const c = Math.cos(phi), s = Math.sin(phi);
  const cs = -f.L / 2, cw = f.wm + rho;
  const sp = (p[f.coord] - f.c0) * f.dir - sigma, wp = p[2];
  const ds = sp - cs, dw = wp - cw;
  p[f.coord] = f.c0 + f.dir * (cs + c * ds - s * dw);
  p[2] = cw + s * ds + c * dw;
  for (const d of dirs) {
    if (!d) continue;
    const a = d[f.coord] * f.dir, w = d[2];
    d[f.coord] = f.dir * (c * a - s * w);
    d[2] = s * a + c * w;
  }
}

export function pose(rig: Rig, t: number): Pose {
  const { nodes } = rig;
  const tt = clamp01(t);
  const a = clamp01(tt / 0.5), b = smooth(clamp01((tt - 0.5) / 0.5));
  const rel: M4[] = new Array(nodes.length);
  const world: M4[] = new Array(nodes.length); // rigid world during phase A (fields are identity then)
  const K = Math.max(1, rig.stackCount);
  for (const n of nodes) {
    if (n.parent < 0) { rel[n.i] = G; world[n.i] = G; continue; }
    const s = n.spec;
    if (s.type === 'panel' && s.joint === 'hinge') {
      rel[n.i] = chain(n.edge, trans(0, 0, n.hingeH), rotX(n.hingeTheta * b), trans(0, 0, -n.hingeH), n.rest);
    } else if (s.type === 'panel' && s.joint === 'stack' && a < 1) {
      const start = (n.seq / K) * 0.55, ak = smooth(clamp01((a - start) / 0.45));
      const target = mul(world[n.parent], n.rest);
      const lift = 0.35 * Math.max(n.W, n.H) + 1.5;
      const w = interpRigid(n.layout, target, ak, lift);
      rel[n.i] = mul(invRigid(world[n.parent]), w);
    } else rel[n.i] = n.rest;
    world[n.i] = mul(world[n.parent], rel[n.i]);
  }

  const flat = [0, 0, 0];
  const map = (i: number, p: number[], d?: number[] | null, d2?: number[] | null) => {
    let cur = i, from = -1;
    while (cur >= 0) {
      const n = nodes[cur];
      if (b > 0 && n.spec.type === 'panel') {
        flat[0] = p[0]; flat[1] = p[1]; flat[2] = p[2];
        // A child only rides the parent's cushion if it sits on the side the cushion pushes toward
        // (a pocket on a puffed front does; the other half of a pouch does not).
        const child = from >= 0 ? nodes[from].spec : null;
        const rides = !child || (child.joint === 'stack' && (child.side === 'top') === n.bulge > 0);
        if (n.bulge !== 0 && rides) {
          const fu = Math.cos((Math.PI * p[0]) / n.W), fv = Math.cos((Math.PI * p[1]) / n.H);
          if (fu > 0 && fv > 0 && Math.abs(p[0]) < n.W / 2 && Math.abs(p[1]) < n.H / 2) p[2] += n.bulge * b * Math.pow(fu * fv, 0.6);
        }
        for (const f of n.folds) applyFold(f, b, flat, p, [d, d2]);
      }
      applyP(rel[cur], p);
      if (d) applyD(rel[cur], d);
      if (d2) applyD(rel[cur], d2);
      from = cur;
      cur = n.parent;
    }
  };

  const strap = (i: number, samples = 40) => {
    const n = nodes[i];
    if (n.spec.type !== 'strap' || n.parent < 0) return null;
    const s = n.spec;
    const p = nodes[n.parent];
    const tgt = nodes[nodes.findIndex((x) => x.spec.id === s.target)] ?? p;
    const P0 = [s.anchor_x * p.W, s.anchor_y * p.H, p.T + n.T / 2];
    const up = s.hinge_edge === 'top' ? [0, 1, 0] : s.hinge_edge === 'bottom' ? [0, -1, 0] : s.hinge_edge === 'left' ? [-1, 0, 0] : [1, 0, 0];
    const N = [0, 0, 1];
    map(p.i, P0, up, N);
    const P1 = [s.target_x * tgt.W, s.target_y * tgt.H, tgt.T + n.T / 2];
    map(tgt.i, P1);
    const chord = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]];
    const c = Math.hypot(chord[0], chord[1], chord[2]);
    const e1 = c > 1e-6 ? chord.map((v) => v / c) : norm(cross(up, N));
    const upPerp = up.map((v, k) => v - dot(up, e1) * e1[k]);
    const e2 = norm(Math.hypot(...upPerp) > 1e-6 ? upPerp : cross(N, e1));
    const ratio = n.strapLen / Math.max(c, 1e-6);
    // Long handles: two straight legs and a half circle (a tote handle), not an ever-wider circle.
    const loopU = ratio > Math.PI / 2;
    const legH = loopU ? (n.strapLen - (Math.PI * c) / 2) / 2 : 0;
    // Solve θ/sin θ = L/c for the half-angle of the arc whose length is the strap's real length.
    let lo = 1e-4, hi = Math.PI * 0.985;
    if (ratio <= 1.0001) hi = lo;
    for (let k = 0; k < 50 && hi > lo; k++) { const mid = (lo + hi) / 2; if (mid / Math.sin(mid) < ratio) lo = mid; else hi = mid; }
    const th = (lo + hi) / 2;
    const straight = th < 1e-3;
    const R = straight ? 0 : c / (2 * Math.sin(th));
    const M = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2, (P0[2] + P1[2]) / 2];
    const C = straight ? M : M.map((v, k) => v - R * Math.cos(th) * e2[k]);
    const pts: number[][] = [], radial: number[][] = [], tangent: number[][] = [], normal: number[][] = [];
    // Flat layout band, blended in during phase A.
    for (let k = 0; k <= samples; k++) {
      const u = k / samples;
      let pt: number[], rd: number[], tg: number[];
      if (loopU) {
        const sArc = u * n.strapLen, Rc = c / 2;
        if (sArc <= legH) {
          pt = P0.map((v, j) => v + e2[j] * sArc); rd = e1.map((v) => -v); tg = e2;
        } else if (sArc >= legH + Math.PI * Rc) {
          pt = P1.map((v, j) => v + e2[j] * (n.strapLen - sArc)); rd = e1; tg = e2.map((v) => -v);
        } else {
          const phi = Math.PI - (sArc - legH) / Rc;
          rd = e1.map((v, j) => Math.cos(phi) * v + Math.sin(phi) * e2[j]);
          tg = e1.map((v, j) => Math.sin(phi) * v - Math.cos(phi) * e2[j]);
          pt = M.map((v, j) => v + e2[j] * legH + Rc * rd[j]);
        }
      } else if (straight) {
        pt = P0.map((v, j) => v + (P1[j] - v) * u); // too short for an arc: drawn straight (the sanity checks report it)
        rd = e2; tg = e1;
      } else {
        const phi = -th + 2 * th * u;
        rd = e1.map((v, j) => Math.sin(phi) * v + Math.cos(phi) * e2[j]);
        tg = e1.map((v, j) => Math.cos(phi) * v - Math.sin(phi) * e2[j]);
        pt = C.map((v, j) => v + R * rd[j]);
      }
      if (a < 1) {
        const lay = [-n.strapLen / 2 + n.strapLen * u, 0, n.T / 2];
        applyP(n.layout, lay);
        const ak = smooth(a);
        pt = pt.map((v, j) => lay[j] + (v - lay[j]) * ak + (j === 1 ? Math.sin(Math.PI * ak) * 3 : 0));
        const layR = [0, 0, -1], layT = [1, 0, 0];
        rd = norm(rd.map((v, j) => layR[j] + (v - layR[j]) * ak));
        tg = norm(tg.map((v, j) => layT[j] + (v - layT[j]) * ak));
      }
      pts.push(pt); radial.push(rd); tangent.push(tg); normal.push(norm(cross(tg, rd)));
    }
    return { pts, radial, normal, tangent };
  };

  const hardware = (i: number): M4 => {
    const n = nodes[i], p = nodes[n.parent], s = n.spec;
    const O = [s.anchor_x * p.W, s.anchor_y * p.H, s.side === 'top' ? p.T : 0];
    const edgeDir = s.hinge_edge === 'top' ? [0, 1, 0] : s.hinge_edge === 'bottom' ? [0, -1, 0] : s.hinge_edge === 'left' ? [-1, 0, 0] : [1, 0, 0];
    let X = s.hardware === 'zipper' ? [Math.abs(edgeDir[1]), Math.abs(edgeDir[0]), 0] : s.hardware === 'ring' ? edgeDir : [1, 0, 0];
    let Z = [0, 0, s.side === 'top' ? 1 : -1];
    if (s.hardware === 'zipper') {
      // Runs along the chosen edge, just inside it.
      const inset = 0.45;
      if (edgeDir[1]) { O[0] = 0; O[1] = edgeDir[1] * (p.H / 2 - inset); } else { O[1] = 0; O[0] = edgeDir[0] * (p.W / 2 - inset); }
    }
    let P = O.slice();
    if (s.hardware === 'ring') {
      // In a bend the ring threads the loop: it hangs outward from the bend's apex.
      const inFold = p.folds.find((f) => Math.abs((O[f.coord] - f.c0) * f.dir) < f.L / 2);
      if (inFold) {
        P = [O[0], O[1], p.T / 2];
        const out = [0, 0, -1], along = inFold.coord === 0 ? [0, 1, 0] : [1, 0, 0];
        const X0 = edgeDir.slice(), Y0 = [0, 0, 1];
        map(p.i, P, out, along);
        map(p.i, O.slice(), X0, Y0); // directions only
        X = norm(X0.map((v, k) => v + (out[k] - v) * b));
        const Yd = norm(Y0.map((v, k) => v + (along[k] - v) * b));
        Z = norm(cross(X, Yd));
        const C = P.map((v, k) => v + X[k] * 1.25);
        return frame(C, X, Yd, Z);
      }
      const Y0 = [0, 0, 1];
      const X0 = edgeDir.slice();
      map(p.i, P, X0, Y0);
      const C = P.map((v, k) => v + X0[k] * 1.25);
      return frame(C, X0, Y0, norm(cross(X0, Y0)));
    }
    map(p.i, P, X, Z);
    const Y = norm(cross(Z, X));
    return frame(P, norm(cross(Y, Z)), Y, norm(Z));
  };

  return { t: tt, a, b, rig, rel, map, strap, hardware };
}

function frame(o: number[], x: number[], y: number[], z: number[]): M4 {
  const m = ident();
  m[0] = x[0]; m[1] = x[1]; m[2] = x[2];
  m[4] = y[0]; m[5] = y[1]; m[6] = y[2];
  m[8] = z[0]; m[9] = z[1]; m[10] = z[2];
  m[12] = o[0]; m[13] = o[1]; m[14] = o[2];
  return m;
}

/** Point samples (mid-plane) of every panel, mapped to the world at t — used by the sanity checks and tests. */
export function samplePanels(ps: Pose, step = 0.8): { node: number; pts: number[][]; nrm: number[][] }[] {
  const out: { node: number; pts: number[][]; nrm: number[][] }[] = [];
  for (const n of ps.rig.nodes) {
    if (n.spec.type !== 'panel' || !n.outline.length) continue;
    const pts: number[][] = [], nrm: number[][] = [];
    const nx = Math.max(2, Math.round(n.W / step)), ny = Math.max(2, Math.round(n.H / step));
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        const u = -n.W / 2 + ((ix + 0.5) / nx) * n.W, v = -n.H / 2 + ((iy + 0.5) / ny) * n.H;
        if (!inside(n.outline, u, v)) continue;
        const p = [u, v, n.T / 2], d = [0, 0, 1];
        ps.map(n.i, p, d);
        pts.push(p); nrm.push(norm(d));
      }
    }
    out.push({ node: n.i, pts, nrm });
  }
  return out;
}

export function inside(poly: [number, number][], x: number, y: number): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
