import type { Role } from './dsl';
import { pose, samplePanels, type Pose, type Rig } from './kinematics';
import { guessRole } from './macros';
import { dot } from './math';
import { normName } from './pieces';

/**
 * Cheap deterministic checks on the assembled pose. They catch what a picture may hide
 * (pieces passing through each other, floating or detached, overhanging, straps that cannot
 * reach, garment parts out of place) and are sent to the model as text during the critique and
 * the verification step. `penalty` ranks candidate scenes: lower is better, 0 = nothing found.
 */
export interface Sanity {
  issues: string[];
  /** Assembled bounding box in cm: [width, height, depth] (world x, y up, z). */
  size: [number, number, number];
  intersections: number;
  /** Pieces not attached to the rest of the model (an island, or a seam outside its parent's edge). */
  disconnected: number;
  /** Structural problems: weak joints, pieces off their parent, garment parts out of place. */
  structural: number;
  /** Objective cost used to compare candidates (intersections and detached pieces weigh most). */
  penalty: number;
  score: number;
}

const fmt = (x: number) => String(Math.round(x * 10) / 10);
const W_SEVERE = 3, W_STRUCT = 2, W_MINOR = 1;

/** Roles of the scene's panels: the macro binding when there is one, otherwise guessed from the name. */
function roleOf(rig: Rig): (i: number) => Role {
  const bound = new Map(rig.scene.macro.roles.map((r) => [normName(r.piece), r.role]));
  return (i) => bound.get(normName(rig.nodes[i].spec.piece)) ?? guessRole(rig.nodes[i].spec.piece, true);
}

export function sanityCheck(rig: Rig): Sanity {
  const ps = pose(rig, 1);
  const issues: string[] = [];
  let penalty = 0, disconnected = 0, structural = 0;
  const severe = (s: string) => { issues.push(s); penalty += W_SEVERE; disconnected++; };
  const struct = (s: string) => { issues.push(s); penalty += W_STRUCT; structural++; };
  const minor = (s: string) => { issues.push(s); penalty += W_MINOR; };
  const name = (i: number) => `“${rig.nodes[i].spec.piece}” (${rig.nodes[i].spec.id})`;
  const step = 0.8;
  const samples = samplePanels(ps, step);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of samples) for (const p of s.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const size: [number, number, number] = samples.length ? [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] : [0, 0, 0];

  // Pieces occupying the same space: two samples closer along the normal than half their thicknesses.
  const cell = 1;
  const grid = new Map<string, { s: number; k: number }[]>();
  const key = (p: number[]) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
  samples.forEach((s, si) => s.pts.forEach((p, k) => {
    const kk = key(p);
    (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push({ s: si, k });
  }));
  const hits = new Map<string, number>();
  const related = (a: number, b: number) => {
    const na = rig.nodes[a], nb = rig.nodes[b];
    return (na.parent === b && na.spec.joint === 'hinge') || (nb.parent === a && nb.spec.joint === 'hinge');
  };
  samples.forEach((sa, ai) => {
    const A = rig.nodes[sa.node];
    sa.pts.forEach((p) => {
      const [cx, cy, cz] = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const { s: bi, k } of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
          if (bi <= ai) continue;
          const sb = samples[bi], B = rig.nodes[sb.node];
          if (related(sa.node, sb.node)) continue;
          const q = sb.pts[k], n = sb.nrm[k];
          const d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
          const nd = Math.abs(dot(d, n));
          const lat = Math.sqrt(Math.max(0, dot(d, d) - nd * nd));
          if (lat < step * 0.5 && nd < (A.T + B.T) / 2 - 0.04) {
            const kk = `${ai}|${bi}`;
            hits.set(kk, (hits.get(kk) ?? 0) + 1);
          }
        }
      }
    });
  });
  let intersections = 0;
  for (const [kk, count] of hits) {
    const [ai, bi] = kk.split('|').map(Number);
    const minN = Math.min(samples[ai].pts.length, samples[bi].pts.length);
    if (count >= Math.max(2, minN * 0.04)) {
      intersections++;
      penalty += W_SEVERE;
      if (intersections <= 6) issues.push(`${name(samples[ai].node)} and ${name(samples[bi].node)} pass through each other in the assembled model (${Math.round((100 * count) / Math.max(1, minN))} % of the smaller piece).`);
    }
  }
  if (intersections > 6) issues.push(`…and ${intersections - 6} more crossings between pieces.`);

  // Attachment: which pieces touch which (samples closer than a seam's reach), and what is reachable from the root.
  const contact = contacts(rig, samples, step);
  const touch = (a: number, b: number) => (contact.get(a)?.get(b) ?? 0);
  const rootNode = rig.nodes.findIndex((n) => n.parent < 0);
  const sampled = new Set(samples.map((s) => s.node));
  const reached = new Set<number>();
  if (sampled.has(rootNode)) {
    const queue = [rootNode];
    reached.add(rootNode);
    while (queue.length) {
      const a = queue.shift()!;
      for (const [b, c] of contact.get(a) ?? []) if (c > 0 && !reached.has(b)) { reached.add(b); queue.push(b); }
    }
  }
  const islands = samples.filter((s) => !reached.has(s.node));
  if (sampled.has(rootNode)) {
    // Gap to the attached part of the model, on a subsample (it only labels the issue).
    const anchorPts = samples.filter((s) => reached.has(s.node)).flatMap((s) => s.pts.filter((_, k) => k % 6 === 0));
    for (const s of islands) {
      let best = Infinity;
      for (let k = 0; k < s.pts.length; k += 4) for (const q of anchorPts) best = Math.min(best, (s.pts[k][0] - q[0]) ** 2 + (s.pts[k][1] - q[1]) ** 2 + (s.pts[k][2] - q[2]) ** 2);
      best = Math.sqrt(best);
      severe(`${name(s.node)} floats ${fmt(best)} cm away from the rest of the model: it is not attached to any piece.`);
    }
  }

  for (const n of rig.nodes) {
    const s = n.spec;
    if (n.parent < 0) continue;
    const p = rig.nodes[n.parent];
    if (s.type === 'panel' && s.joint === 'stack') {
      const cx = n.rest[12], cy = n.rest[13];
      const ox = Math.max(0, Math.min(cx + n.Wr / 2, p.W / 2) - Math.max(cx - n.Wr / 2, -p.W / 2));
      const oy = Math.max(0, Math.min(cy + n.Hr / 2, p.H / 2) - Math.max(cy - n.Hr / 2, -p.H / 2));
      const frac = (ox * oy) / (n.Wr * n.Hr);
      if (frac < 0.5) struct(`${name(n.i)} sits almost off ${name(p.i)} (only ${Math.round(frac * 100)} % on top): it looks like it is floating.`);
      // A fanned pile of identical pieces (coasters) overhangs on purpose.
      else if (frac < 0.75 && s.piece !== p.spec.piece) minor(`${name(n.i)} overhangs ${name(p.i)} (${Math.round(frac * 100)} % on top).`);
      if (s.offset_mm > 3) minor(`${name(n.i)} is ${fmt(s.offset_mm)} mm away from its base: it does not touch the piece.`);
    }
    if (s.type === 'panel' && s.joint === 'seam') {
      const along = s.hinge_edge === 'top' || s.hinge_edge === 'bottom' ? s.anchor_x : s.anchor_y;
      if (Math.abs(along) > 0.52) struct(`${name(n.i)} is sewn outside the ${s.hinge_edge} edge of ${name(p.i)} (anchor ${fmt(along)}; it must be between -0.5 and 0.5).`);
    }
    if (s.type === 'panel' && s.joint === 'hinge') {
      const edgeLen = s.hinge_edge === 'top' || s.hinge_edge === 'bottom' ? p.W : p.H;
      if (n.Wr > edgeLen * 1.15) minor(`${name(n.i)} (${fmt(n.Wr)} cm) is wider than the edge of ${name(p.i)} it joins (${fmt(edgeLen)} cm).`);
    }
    // A reached piece that does not touch its own parent hangs from the wrong place; a hinge or seam touching at a point is barely sewn.
    if (s.type === 'panel' && sampled.has(n.i) && sampled.has(p.i) && reached.has(n.i)) {
      const c = touch(n.i, p.i);
      if (c === 0) struct(`${name(n.i)} does not touch ${name(p.i)}, the piece it should be attached to.`);
      else if ((s.joint === 'hinge' || s.joint === 'seam') && c * step < Math.min(2.5, 0.3 * Math.min(n.W, n.H))) struct(`${name(n.i)} barely touches ${name(p.i)} (a joint of about ${fmt(c * step)} cm): it looks detached.`);
    }
    if (s.type === 'strap') {
      const st = ps.strap(n.i, 2);
      if (st) {
        const [a, , b] = st.pts;
        const chord = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (chord > n.strapLen) struct(`${name(n.i)} is ${fmt(n.strapLen)} cm long and does not reach between its ends (${fmt(chord)} cm).`);
      }
    }
  }
  for (const n of rig.nodes) {
    if (n.spec.type !== 'panel') continue;
    for (const f of n.spec.folds) if (Math.abs(f.angle_deg) > 200 && f.radius_mm === 0) minor(`${name(n.i)} rolls more than 200° with no radius: check the fold.`);
  }
  if (rig.loose.length) {
    const names = [...new Set(rig.loose.map((l) => l.piece))];
    issues.push(`Pieces left out of the assembly: ${names.map((x) => `“${x}” ×${rig.loose.filter((l) => l.piece === x).length}`).join(', ')}.`);
    penalty += W_STRUCT * rig.loose.length;
  }

  garmentChecks(rig, ps, samples, step, rootNode, { struct, name });

  const score = Math.max(0, Math.round(10 - penalty));
  return { issues, size, intersections, disconnected, structural, penalty, score };
}

type Samples = ReturnType<typeof samplePanels>;

/** contact[a][b] = how many samples of a lie within a seam's reach of some sample of b. */
function contacts(rig: Rig, samples: Samples, step: number): Map<number, Map<number, number>> {
  const tol = step * 1.5 + 2 * rig.T + 0.2;
  const grid = new SpatialGrid<number>(tol);
  for (const s of samples) for (const p of s.pts) grid.add(p, s.node);
  const out = new Map<number, Map<number, number>>();
  const tol2 = tol * tol;
  // stamp[node] = last sample that already counted a contact with that node (no per-sample sets).
  const stamp = new Int32Array(rig.nodes.length).fill(-1);
  let sid = 0;
  for (const s of samples) {
    const row = new Map<number, number>();
    out.set(s.node, row);
    for (const p of s.pts) {
      sid++;
      grid.near(p, (q, node) => {
        if (node === s.node || stamp[node] === sid) return;
        const ddx = p[0] - q[0], ddy = p[1] - q[1], ddz = p[2] - q[2];
        if (ddx * ddx + ddy * ddy + ddz * ddz <= tol2) { stamp[node] = sid; row.set(node, (row.get(node) ?? 0) + 1); }
      });
    }
  }
  return out;
}

/** Uniform 3D hash grid: `near` visits the points in the 27 cells around p (cell size = search radius). */
class SpatialGrid<T> {
  private cells = new Map<number, { p: number[]; v: T }[]>();
  constructor(private size: number) {}
  private key(cx: number, cy: number, cz: number) { return ((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) | 0; }
  add(p: number[], v: T) {
    const k = this.key(Math.floor(p[0] / this.size), Math.floor(p[1] / this.size), Math.floor(p[2] / this.size));
    const c = this.cells.get(k);
    if (c) c.push({ p, v }); else this.cells.set(k, [{ p, v }]);
  }
  near(p: number[], visit: (q: number[], v: T) => void) {
    const cx = Math.floor(p[0] / this.size), cy = Math.floor(p[1] / this.size), cz = Math.floor(p[2] / this.size);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const c = this.cells.get(this.key(cx + dx, cy + dy, cz + dz));
      if (c) for (const e of c) visit(e.p, e.v);
    }
  }
}

/**
 * Garments (jackets, coats, shirts, vests): sleeves sewn near the shoulder and hanging down at the
 * sides, fronts meeting at the centre, the back behind them, the collar at the neckline.
 * Measured in the torso's own frame (the root piece: u across, v up the garment, n out of its face).
 */
function garmentChecks(rig: Rig, ps: Pose, samples: Samples, step: number, rootNode: number,
  out: { struct: (s: string) => void; name: (i: number) => string }) {
  const role = roleOf(rig);
  const panels = samples.filter((s) => s.pts.length);
  const roles = new Map(panels.map((s) => [s.node, role(s.node)]));
  const has = (r: Role) => [...roles.values()].includes(r);
  const garment = rig.scene.category === 'garment' || rig.scene.macro.type === 'garment_top' || (has('sleeve') && (has('front') || has('back') || has('body')));
  if (!garment || rootNode < 0 || !panels.some((s) => s.node === rootNode)) return;

  const T = rig.nodes[rootNode].T;
  const O = [0, 0, T / 2], U = [0, 1, 0], R = [1, 0, 0], N = [0, 0, 1];
  ps.map(rootNode, O, U, R);
  const Nw = [0, 0, 0];
  { const o = [0, 0, T / 2]; const d = N.slice(); ps.map(rootNode, o, d); Nw[0] = d[0]; Nw[1] = d[1]; Nw[2] = d[2]; }
  const rel = (p: number[]) => [p[0] - O[0], p[1] - O[1], p[2] - O[2]];
  const uOf = (p: number[]) => dot(rel(p), R), vOf = (p: number[]) => dot(rel(p), U), nOf = (p: number[]) => dot(rel(p), Nw);

  const torsoRoles: Role[] = ['back', 'front', 'body'];
  const torso = panels.filter((s) => s.node === rootNode || torsoRoles.includes(roles.get(s.node)!));
  const tPts = torso.flatMap((s) => s.pts);
  let vTop = -Infinity, vBot = Infinity, half = 0;
  for (const p of tPts) { const v = vOf(p); vTop = Math.max(vTop, v); vBot = Math.min(vBot, v); half = Math.max(half, Math.abs(uOf(p))); }
  const Ht = Math.max(1e-6, vTop - vBot);

  // Torso samples on a grid, to find where each sleeve meets the body.
  const tol = step * 1.5 + 2 * rig.T + 0.2;
  const grid = new SpatialGrid<true>(tol);
  for (const p of tPts) grid.add(p, true);
  const touchesTorso = (p: number[]) => {
    let hit = false;
    grid.near(p, (q) => { if (!hit && (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 <= tol * tol) hit = true; });
    return hit;
  };

  const sides: number[] = [];
  for (const s of panels) {
    if (roles.get(s.node) !== 'sleeve' || s.node === rootNode) continue;
    const att = s.pts.filter(touchesTorso);
    const inside = s.pts.filter((p) => Math.abs(uOf(p)) < half * 0.92).length / s.pts.length;
    const meanU = s.pts.reduce((a, p) => a + uOf(p), 0) / s.pts.length;
    sides.push(Math.sign(meanU));
    if (inside > 0.6) { out.struct(`The sleeve ${out.name(s.node)} lies on top of the body, not at one side: it must be sewn to the armhole (side edge, next to the shoulder) and hang down.`); continue; }
    if (!att.length) { out.struct(`The sleeve ${out.name(s.node)} is not attached to the body of the garment: it must be sewn to the armhole, next to the shoulder.`); continue; }
    const A = [0, 1, 2].map((k) => att.reduce((a, p) => a + p[k], 0) / att.length);
    if (vOf(A) < vTop - 0.4 * Ht) out.struct(`The sleeve ${out.name(s.node)} joins too low (${fmt(vTop - vOf(A))} cm below the shoulder): it must start next to the shoulder.`);
    let F = A, best = -1;
    for (const p of s.pts) { const d = Math.hypot(p[0] - A[0], p[1] - A[1], p[2] - A[2]); if (d > best) { best = d; F = p; } }
    const down = -(vOf(F) - vOf(A)) / Math.max(1e-6, best);
    if (down < 0.5) out.struct(`The sleeve ${out.name(s.node)} sticks out ${down < -0.2 ? 'upward' : 'horizontally'} (${Math.round((Math.asin(Math.max(-1, Math.min(1, down))) * 180) / Math.PI)}° below horizontal): it should hang down from the shoulder.`);
  }
  if (sides.length >= 2 && (sides.every((x) => x > 0) || sides.every((x) => x < 0))) out.struct('The sleeves are on the same side of the body: there must be one on each side.');

  const fronts = panels.filter((s) => roles.get(s.node) === 'front' && s.node !== rootNode);
  if (fronts.length >= 2) {
    const spans = fronts.map((s) => { let a = Infinity, b = -Infinity; for (const p of s.pts) { const u = uOf(p); a = Math.min(a, u); b = Math.max(b, u); } return { a, b, c: (a + b) / 2 }; }).sort((x, y) => x.c - y.c);
    for (let k = 1; k < spans.length; k++) {
      const gap = spans[k].a - spans[k - 1].b;
      if (gap > 1.5) out.struct(`The fronts do not meet at the centre (a ${fmt(gap)} cm gap): they must meet or cross over at the centre of the body.`);
    }
  }
  const backs = panels.filter((s) => roles.get(s.node) === 'back');
  if (fronts.length && backs.length) {
    const mean = (ss: Samples) => { const pts = ss.flatMap((s) => s.pts); return pts.reduce((a, p) => a + nOf(p), 0) / Math.max(1, pts.length); };
    if (mean(fronts) < mean(backs) - 0.05) out.struct('The back panel sits in front of the fronts: the back must go behind.');
  }
  for (const s of panels) {
    if (roles.get(s.node) !== 'collar' || s.node === rootNode) continue;
    const top = Math.max(...s.pts.map(vOf));
    if (top < vTop - 0.2 * Ht) out.struct(`The collar ${out.name(s.node)} is not at the neckline: it must go on the top edge of the body.`);
  }
}

export function sanityText(s: Sanity): string {
  const head = `Assembled model size: ${fmt(s.size[0])} × ${fmt(s.size[2])} cm footprint, ${fmt(s.size[1])} cm tall.`;
  return s.issues.length ? `${head}\n- ${s.issues.join('\n- ')}` : `${head}\nNo geometric problems found.`;
}
