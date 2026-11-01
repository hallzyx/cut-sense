/**
 * Deterministic nesting optimizer — 'cs-nest-1.0'.
 *
 * Goal: maximize the number of placed pieces; ties broken by larger occupied area.
 *
 * Method:
 * 1. Each template is expanded into instances; each allowed rotation yields an "orientation"
 *    (shape rotated around its bbox center and normalized to a minimum corner at (0,0)).
 * 2. Generalized "bottom-left" greedy passes: for each piece, in order, candidate positions are
 *    swept (adaptive grid + anchors at material vertices, defect vertices and
 *    the edges of already placed pieces, offset by the spacing) in the order of a
 *    "gravity" (primary/secondary axis and direction). The first valid position is compacted
 *    by sliding it towards the gravity with a binary search. The orientation with the best
 *    score is chosen.
 * 3. Validity by direct collision: point-in-polygon + segment-to-segment distance >= spacing + margin,
 *    against the material outline (spatial grid index), defects and placed pieces.
 *    An occupancy raster (S/256 cells) rejects in O(1) positions whose deep interior points
 *    fall in a blocked zone (exact: it only discards invalid positions).
 * 4. Several passes (150 by default): 4 with area ordering and uniform gravity, then a genome
 *    (order + per-piece gravity) that alternates random restarts and mutations of the current genome
 *    (hill climbing that accepts ties; moves forward pieces that did not fit), with a seeded
 *    mulberry32 PRNG (seed). At the end, repair: insertion of pending pieces with a fine grid and by
 *    swapping with a smaller piece. The best plan is kept. Every improvement goes through `verifySolution`
 *    (independent); if it fails, the offending pieces are removed: an invalid plan is never returned.
 *
 * Determinism: same problem + seed ⇒ same sequence of passes. The search stops after
 * `maxIterations` passes (deterministic), when everything is placed, or when `timeLimitMs` runs out (safeguard:
 * if the clock cuts in before maxIterations, slower machines might explore fewer passes).
 */
import type { Placement, Problem, Pt, Ring, Solution, Template } from '../types';
import {
  type BBox, bbox, centroid, dedupeRing, difference, isSimple, multiArea, placeShape, pointInRing, ringArea,
  pointSegDist2, scaleOf, segSegDist2, translateRing,
} from './geometry';
import { computeMetrics } from './metrics';
import { verifySolution } from './verify';

export const OPTIMIZER_VERSION = 'cs-nest-1.0';
export const DEFAULT_TIME_LIMIT_MS = 4000;
export const DEFAULT_MAX_ITERATIONS = 150;
export const DEFAULT_SEED = 1;
/** Extra margin (relative to the scale) the optimizer adds to the spacing so it does not graze the verifier tolerance. */
export const OPT_MARGIN_REL = 1e-7;
const MAX_INSTANCES = 400;
/** Minimum step of the refined grid: S / REFINE_MIN_DIV. */
const REFINE_MIN_DIV = 100;
/** Minimum grid step in the final repair: S / REPAIR_MIN_DIV. */
const REPAIR_MIN_DIV = 200;
/** Occupancy raster resolution: cells of S / RASTER_DIV. */
const RASTER_DIV = 256;

export interface OptimizeProgress {
  /** Estimated progress 0..1: max(passes done / maxIterations, time / timeLimitMs); 1 when finished. */
  fraction: number;
  iteration: number;
  maxIterations: number;
  bestPlaced: number;
  requested: number;
  elapsedMs: number;
}

export interface OptimizeOptions {
  /** Injectable clock (ms). Defaults to performance.now() or Date.now(). */
  now?: () => number;
  /** Maximum number of greedy passes (default 150). */
  maxIterations?: number;
  /** Called after each pass and at the end: (fraction 0..1, detail). */
  onProgress?: ProgressCallback;
}

export type ProgressCallback = (fraction: number, detail: OptimizeProgress) => void;

/** mulberry32 PRNG: returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const defaultNow = (): number =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();

// ---------------------------------------------------------------- internal structures

/**
 * `probe`: interior point of the shape (quick overlap test before exact distances).
 * `deep`: interior points more than one cell away from the edge; if their raster cell is blocked,
 * there is a blocked point inside the piece ⇒ invalid position (exact O(1) rejection).
 */
interface Orient { rot: number; base: Ring; w: number; h: number; probe: Pt; deep: Pt[] }
interface Item { t: Template; tIdx: number; orients: Orient[]; area: number }
interface Obstacle { ring: Ring; bb: BBox }
interface Placed { item: Item; o: Orient; x: number; y: number; ring: Ring; bb: BBox }
/** Gravity: primary axis and direction (1 = towards the minimum, −1 = towards the maximum) on each axis. */
interface Gravity { primary: 'x' | 'y'; dirP: 1 | -1; dirS: 1 | -1 }
type Score = [number, number];

const GRAVITIES: Gravity[] = [
  { primary: 'y', dirP: 1, dirS: 1 }, { primary: 'x', dirP: 1, dirS: 1 },
  { primary: 'y', dirP: -1, dirS: -1 }, { primary: 'x', dirP: -1, dirS: -1 },
  { primary: 'y', dirP: 1, dirS: -1 }, { primary: 'x', dirP: 1, dirS: -1 },
  { primary: 'y', dirP: -1, dirS: 1 }, { primary: 'x', dirP: -1, dirS: 1 },
];

/** Uniform spatial index of the material outline segments. */
class SegGrid {
  private segs: Float64Array;
  private cells: number[][];
  private nx: number;
  private ny: number;
  private cell: number;
  private stamp: Uint32Array;
  private stampId = 0;
  private buf: number[] = [];

  constructor(ring: Ring, private b: BBox) {
    const n = ring.length;
    this.segs = new Float64Array(n * 4);
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      this.segs.set([p[0], p[1], q[0], q[1]], i * 4);
    }
    const w = Math.max(b.maxX - b.minX, 1e-9), h = Math.max(b.maxY - b.minY, 1e-9);
    const k = Math.max(4, Math.min(64, Math.ceil(Math.sqrt(n) * 2)));
    this.cell = Math.max(w, h) / k;
    this.nx = Math.ceil(w / this.cell) + 1;
    this.ny = Math.ceil(h / this.cell) + 1;
    this.cells = Array.from({ length: this.nx * this.ny }, () => []);
    this.stamp = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const s = this.segs;
      const x0 = Math.min(s[i * 4], s[i * 4 + 2]), x1 = Math.max(s[i * 4], s[i * 4 + 2]);
      const y0 = Math.min(s[i * 4 + 1], s[i * 4 + 3]), y1 = Math.max(s[i * 4 + 1], s[i * 4 + 3]);
      for (let cy = this.cy(y0); cy <= this.cy(y1); cy++)
        for (let cx = this.cx(x0); cx <= this.cx(x1); cx++) this.cells[cy * this.nx + cx].push(i);
    }
  }

  private cx(x: number): number { return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.b.minX) / this.cell))); }
  private cy(y: number): number { return Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.b.minY) / this.cell))); }

  /** Is any outline segment at distance < d from the piece (base offset ox, oy)? */
  closer(base: Ring, ox: number, oy: number, minX: number, minY: number, maxX: number, maxY: number, d: number): boolean {
    this.stampId = (this.stampId + 1) >>> 0;
    if (this.stampId === 0) { this.stamp.fill(0); this.stampId = 1; }
    const list = this.buf;
    list.length = 0;
    for (let cy = this.cy(minY); cy <= this.cy(maxY); cy++)
      for (let cx = this.cx(minX); cx <= this.cx(maxX); cx++)
        for (const i of this.cells[cy * this.nx + cx]) {
          if (this.stamp[i] !== this.stampId) { this.stamp[i] = this.stampId; list.push(i); }
        }
    if (list.length === 0) return false;
    const s = this.segs, d2 = d * d, n = base.length;
    for (let e = 0; e < n; e++) {
      const p = base[e], q = base[(e + 1) % n];
      const ax = p[0] + ox, ay = p[1] + oy, bx = q[0] + ox, by = q[1] + oy;
      const ex0 = Math.min(ax, bx) - d, ex1 = Math.max(ax, bx) + d;
      const ey0 = Math.min(ay, by) - d, ey1 = Math.max(ay, by) + d;
      for (const i of list) {
        const j = i * 4;
        const cx = s[j], cy = s[j + 1], dx = s[j + 2], dy = s[j + 3];
        if ((cx < ex0 && dx < ex0) || (cx > ex1 && dx > ex1) || (cy < ey0 && dy < ey0) || (cy > ey1 && dy > ey1)) continue;
        if (segSegDist2(ax, ay, bx, by, cx, cy, dx, dy) < d2) return true;
      }
    }
    return false;
  }
}

/** Is any pair of edges (offset piece, obstacle) at distance < d? */
function ringsCloser(base: Ring, ox: number, oy: number, ob: Ring, d: number): boolean {
  const d2 = d * d, n = base.length, m = ob.length;
  for (let e = 0; e < n; e++) {
    const p = base[e], q = base[(e + 1) % n];
    const ax = p[0] + ox, ay = p[1] + oy, bx = q[0] + ox, by = q[1] + oy;
    const ex0 = Math.min(ax, bx) - d, ex1 = Math.max(ax, bx) + d;
    const ey0 = Math.min(ay, by) - d, ey1 = Math.max(ay, by) + d;
    for (let f = 0; f < m; f++) {
      const r = ob[f], s = ob[(f + 1) % m];
      if ((r[0] < ex0 && s[0] < ex0) || (r[0] > ex1 && s[0] > ex1) || (r[1] < ey0 && s[1] < ey0) || (r[1] > ey1 && s[1] > ey1)) continue;
      if (segSegDist2(ax, ay, bx, by, r[0], r[1], s[0], s[1]) < d2) return true;
    }
  }
  return false;
}

function better(a: Score, b: Score, tol: number): boolean {
  if (a[0] < b[0] - tol) return true;
  if (a[0] > b[0] + tol) return false;
  return a[1] < b[1] - tol;
}

/** A strictly interior point of a simple ring (centroid if it falls inside; otherwise a horizontal sweep). */
function interiorPoint(ring: Ring): Pt {
  const c = centroid(ring);
  if (pointInRing(c[0], c[1], ring)) return c;
  const b = bbox(ring);
  for (const f of [0.5, 0.25, 0.75, 0.1, 0.9]) {
    const y = b.minY + (b.maxY - b.minY) * f;
    const xs: number[] = [];
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((a, b2) => a - b2);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const m = (xs[i] + xs[i + 1]) / 2;
      if (xs[i + 1] - xs[i] > 0 && pointInRing(m, y, ring)) return [m, y];
    }
  }
  return ring[0];
}

/** Sample points on an interior grid at distance > 1.5·cell from the edge (max ~12). */
function deepPoints(ring: Ring, cell: number): Pt[] {
  const b = bbox(ring), out: Pt[] = [];
  const need2 = (1.5 * cell) ** 2, n = ring.length;
  const k = 4;
  for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) {
    const x = b.minX + ((a + 0.5) / k) * (b.maxX - b.minX), y = b.minY + ((c + 0.5) / k) * (b.maxY - b.minY);
    if (!pointInRing(x, y, ring)) continue;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      if (pointSegDist2(x, y, p[0], p[1], q[0], q[1]) <= need2) ok = false;
    }
    if (ok) out.push([x, y]);
  }
  return out;
}

// ---------------------------------------------------------------- engine

class Nester {
  readonly S: number;
  readonly d: number;
  readonly mb: BBox;
  private grid: SegGrid;
  // occupancy raster: 1 = the cell center is outside the material, in a defect or in a piece
  readonly rc: number;
  private rnx: number;
  private rny: number;
  private rStatic: Uint8Array;
  private rDyn: Uint8Array;
  private defects: Obstacle[];
  private placed: Placed[] = [];
  private baseAnchors: { x: number[]; y: number[] };
  private deadline = Infinity;
  aborted = false;
  /** Positions (in the order of the last pass) of the pieces that did not fit. */
  lastFailed: number[] = [];

  constructor(private material: Ring, defects: Ring[], spacing: number, private now: () => number) {
    this.S = scaleOf(material);
    this.d = spacing + OPT_MARGIN_REL * this.S;
    this.mb = bbox(material);
    this.grid = new SegGrid(material, this.mb);
    const reach = this.d;
    this.defects = defects
      .map((r) => ({ ring: r, bb: bbox(r) }))
      .filter(({ bb }) => !(bb.minX > this.mb.maxX + reach || bb.maxX < this.mb.minX - reach || bb.minY > this.mb.maxY + reach || bb.maxY < this.mb.minY - reach));
    const ax: number[] = [], ay: number[] = [];
    for (const [x, y] of material) { ax.push(x); ay.push(y); }
    for (const ob of this.defects) for (const [x, y] of ob.ring) { ax.push(x); ay.push(y); }
    this.baseAnchors = { x: ax, y: ay };
    this.rc = this.S / RASTER_DIV;
    this.rnx = Math.ceil((this.mb.maxX - this.mb.minX) / this.rc) + 1;
    this.rny = Math.ceil((this.mb.maxY - this.mb.minY) / this.rc) + 1;
    this.rStatic = new Uint8Array(this.rnx * this.rny);
    for (let j = 0; j < this.rny; j++) {
      const cy = this.mb.minY + (j + 0.5) * this.rc;
      for (let i = 0; i < this.rnx; i++) {
        const cx = this.mb.minX + (i + 0.5) * this.rc;
        let blocked = !pointInRing(cx, cy, material);
        if (!blocked) for (const ob of this.defects) {
          const bb = ob.bb;
          if (cx >= bb.minX && cx <= bb.maxX && cy >= bb.minY && cy <= bb.maxY && pointInRing(cx, cy, ob.ring)) { blocked = true; break; }
        }
        this.rStatic[j * this.rnx + i] = blocked ? 1 : 0;
      }
    }
    this.rDyn = this.rStatic.slice();
  }

  private paint(ring: Ring, bb: BBox): void {
    const i0 = Math.max(0, Math.floor((bb.minX - this.mb.minX) / this.rc - 0.5));
    const i1 = Math.min(this.rnx - 1, Math.ceil((bb.maxX - this.mb.minX) / this.rc));
    const j0 = Math.max(0, Math.floor((bb.minY - this.mb.minY) / this.rc - 0.5));
    const j1 = Math.min(this.rny - 1, Math.ceil((bb.maxY - this.mb.minY) / this.rc));
    for (let j = j0; j <= j1; j++) {
      const cy = this.mb.minY + (j + 0.5) * this.rc;
      for (let i = i0; i <= i1; i++) {
        const cx = this.mb.minX + (i + 0.5) * this.rc;
        if (pointInRing(cx, cy, ring)) this.rDyn[j * this.rnx + i] = 1;
      }
    }
  }

  /** Replaces the placed pieces and rebuilds the dynamic raster. */
  setPlaced(list: Placed[]): void {
    this.placed = list;
    this.rDyn.set(this.rStatic);
    for (const p of list) this.paint(p.ring, p.bb);
  }

  addPlaced(p: Placed): void {
    this.placed.push(p);
    this.paint(p.ring, p.bb);
  }

  private blockedAt(x: number, y: number): boolean {
    const i = Math.floor((x - this.mb.minX) / this.rc), j = Math.floor((y - this.mb.minY) / this.rc);
    if (i < 0 || j < 0 || i >= this.rnx || j >= this.rny) return true;
    return this.rDyn[j * this.rnx + i] === 1;
  }

  /** Does orientation `o` fit with its minimum corner at (x, y)? */
  fits(o: Orient, x: number, y: number): boolean {
    const d = this.d, mb = this.mb;
    const minX = x, minY = y, maxX = x + o.w, maxY = y + o.h;
    if (minX < mb.minX + d || minY < mb.minY + d || maxX > mb.maxX - d || maxY > mb.maxY - d) return false;
    const eMinX = minX - d, eMinY = minY - d, eMaxX = maxX + d, eMaxY = maxY + d;
    const b0 = o.base[0];
    for (const q of o.deep) if (this.blockedAt(q[0] + x, q[1] + y)) return false;
    const px = o.probe[0] + x, py = o.probe[1] + y;
    // cheap rejection: the interior point of the piece falls outside the material or inside an obstacle
    if (!pointInRing(px, py, this.material)) return false;
    for (let k = 0; k < 2; k++) {
      const list: Obstacle[] = k === 0 ? this.placed : this.defects;
      for (const ob of list) {
        const bb = ob.bb;
        if (px < bb.minX || px > bb.maxX || py < bb.minY || py > bb.maxY) continue;
        if (pointInRing(px, py, ob.ring)) return false;
      }
    }
    for (let k = 0; k < 2; k++) {
      const list: Obstacle[] = k === 0 ? this.placed : this.defects;
      for (const ob of list) {
        const bb = ob.bb;
        if (bb.maxX < eMinX || bb.minX > eMaxX || bb.maxY < eMinY || bb.minY > eMaxY) continue;
        if (ringsCloser(o.base, x, y, ob.ring, d)) return false;
        if (pointInRing(b0[0] + x, b0[1] + y, ob.ring)) return false;
        if (pointInRing(ob.ring[0][0] - x, ob.ring[0][1] - y, o.base)) return false;
      }
    }
    if (!pointInRing(b0[0] + x, b0[1] + y, this.material)) return false;
    if (this.grid.closer(o.base, x, y, eMinX, eMinY, eMaxX, eMaxY, d)) return false;
    return true;
  }

  private step(o: Orient): number {
    return Math.min(this.S / 8, Math.max(this.S / 60, Math.min(o.w, o.h) / 2));
  }

  private coords(axis: 'x' | 'y', size: number, g: number, fine = false): number[] {
    const d = this.d;
    const lo = (axis === 'x' ? this.mb.minX : this.mb.minY) + d;
    const hi = (axis === 'x' ? this.mb.maxX : this.mb.maxY) - d - size;
    if (hi < lo) return [];
    const raw: number[] = [];
    const n = Math.floor((hi - lo) / g);
    for (let i = 0; i <= n; i++) raw.push(lo + i * g);
    raw.push(hi);
    const push = (a: number) => { raw.push(a + d, a - d - size); };
    for (const a of this.baseAnchors[axis]) push(a);
    for (const p of this.placed) {
      if (axis === 'x') { push(p.bb.minX); push(p.bb.maxX); } else { push(p.bb.minY); push(p.bb.maxY); }
    }
    const vals = raw.filter((v) => v >= lo && v <= hi).sort((a, b) => a - b);
    const q = fine ? g / 4 : Math.max(g / 8, this.S / 160);
    const out: number[] = [];
    let last = -Infinity;
    for (const v of vals) if (v - last > q) { out.push(v); last = v; }
    return out;
  }

  private score(o: Orient, x: number, y: number, g: Gravity): Score {
    const ax = (pos: number, size: number, dir: 1 | -1) => (dir === 1 ? pos + size : -pos);
    return g.primary === 'y'
      ? [ax(y, o.h, g.dirP), ax(x, o.w, g.dirS)]
      : [ax(x, o.w, g.dirP), ax(y, o.h, g.dirS)];
  }

  /** Slides the piece towards the gravity while it keeps fitting (search with a decreasing step). */
  private compact(o: Orient, x: number, y: number, g: Gravity, step0: number): [number, number] {
    const minStep = step0 / 128;
    for (let round = 0; round < 2; round++) {
      for (const axis of g.primary === 'y' ? (['y', 'x'] as const) : (['x', 'y'] as const)) {
        const dir = axis === g.primary ? g.dirP : g.dirS;
        let step = step0, tries = 0;
        while (step >= minStep && tries < 80) {
          tries++;
          const nx = axis === 'x' ? x - dir * step : x;
          const ny = axis === 'y' ? y - dir * step : y;
          if (this.fits(o, nx, ny)) { x = nx; y = ny; } else step /= 2;
        }
      }
    }
    return [x, y];
  }

  /**
   * Finds the first valid position in gravity order. If the coarse grid finds
   * none, it refines it (step/2) down to `minStep`: large pieces in irregular convex
   * materials often have feasible regions smaller than the initial step.
   */
  *find(o: Orient, g: Gravity, bound: Score | null, minDiv = REFINE_MIN_DIV): Generator<void, { x: number; y: number; score: Score } | null, void> {
    const minStep = this.S / minDiv;
    for (let step = this.step(o), level = 0; ; step /= 2, level++) {
      const r: { x: number; y: number; score: Score } | null = yield* this.scan(o, g, bound, step, level > 0);
      if (r || this.aborted || bound || step / 2 < minStep) return r;
    }
  }

  private *scan(o: Orient, g: Gravity, bound: Score | null, step: number, fine: boolean): Generator<void, { x: number; y: number; score: Score } | null, void> {
    const xs = this.coords('x', o.w, step, fine), ys = this.coords('y', o.h, step, fine);
    if (!xs.length || !ys.length) return null;
    let P = g.primary === 'y' ? ys : xs, Sx = g.primary === 'y' ? xs : ys;
    if (g.dirP === -1) P = P.slice().reverse();
    if (g.dirS === -1) Sx = Sx.slice().reverse();
    const sizeP = g.primary === 'y' ? o.h : o.w;
    const tol = 1e-9 * this.S;
    let rows = 0;
    for (const p of P) {
      if (bound) {
        const s1 = g.dirP === 1 ? p + sizeP : -p;
        if (s1 > bound[0] + tol) break;
      }
      for (const s of Sx) {
        const x = g.primary === 'y' ? s : p, y = g.primary === 'y' ? p : s;
        if (this.fits(o, x, y)) {
          const [cx, cy] = this.compact(o, x, y, g, step);
          return { x: cx, y: cy, score: this.score(o, cx, cy, g) };
        }
      }
      if (++rows % 4 === 0) {
        yield;
        if (this.now() > this.deadline) { this.aborted = true; return null; }
      }
    }
    return null;
  }

  /** Best position (across orientations) for `item` with gravity `g`, or null. */
  private *placeOne(item: Item, g: Gravity, minDiv = REFINE_MIN_DIV): Generator<void, Placed | null, void> {
    const tol = 1e-9 * this.S;
    let best: { x: number; y: number; score: Score; o: Orient } | null = null;
    for (const o of item.orients) {
      const r: { x: number; y: number; score: Score } | null = yield* this.find(o, g, best ? best.score : null, minDiv);
      if (this.aborted) return null;
      if (r && (!best || better(r.score, best.score, tol))) best = { ...r, o };
    }
    if (!best) return null;
    const ring = translateRing(best.o.base, best.x, best.y);
    return { item, o: best.o, x: best.x, y: best.y, ring, bb: bbox(ring) };
  }

  /**
   * One greedy pass; `gravs[i]` is the gravity of the i-th piece in the order.
   * Returns the placed pieces (partial if time ran out; see `aborted`).
   */
  *pass(order: Item[], gravs: Gravity[], deadline: number): Generator<void, Placed[], void> {
    this.setPlaced([]);
    this.lastFailed = [];
    this.deadline = deadline;
    this.aborted = false;
    // The candidate set does not depend on the gravity (only its sweep order), so if a
    // template did not fit, it fits with no gravity, and with more pieces placed it will not either.
    const failed = new Set<number>();
    for (let i = 0; i < order.length; i++) {
      const item = order[i], g = gravs[i];
      const key = item.tIdx;
      if (failed.has(key)) { this.lastFailed.push(i); continue; }
      const pl: Placed | null = yield* this.placeOne(item, g);
      if (this.aborted) return this.placed;
      if (!pl) { failed.add(key); this.lastFailed.push(i); continue; }
      this.addPlaced(pl);
      yield;
      if (this.now() > deadline) { this.aborted = true; return this.placed; }
    }
    return this.placed;
  }

  /**
   * Final repair: tries to insert each pending piece with a finer grid; if it does not fit, it tries removing a smaller placed piece, inserting the
   * pending one and reinserting the removed one (accepted only if both fit).
   */
  *insertPending(placed: Placed[], pending: Item[], deadline: number): Generator<void, Placed[], void> {
    this.setPlaced(placed.slice());
    this.deadline = deadline;
    this.aborted = false;
    // a single gravity is enough to decide whether it fits: the candidates do not depend on it
    const tryPlace = function* (self: Nester, item: Item): Generator<void, Placed | null, void> {
      return yield* self.placeOne(item, GRAVITIES[0], REPAIR_MIN_DIV);
    };
    const failedT = new Set<number>();
    for (const item of pending) {
      if (failedT.has(item.tIdx)) continue;
      let pl: Placed | null = yield* tryPlace(this, item);
      if (this.aborted) break;
      if (pl) { this.addPlaced(pl); continue; }
      // swap: remove a smaller-area piece, place the pending one and re-place the removed one
      let done = false;
      const victims = this.placed.map((p, i) => ({ p, i })).filter(({ p }) => p.item.area < item.area)
        .sort((a, b) => a.p.item.area - b.p.item.area);
      for (const { p: v } of victims) {
        const saved = this.placed;
        this.setPlaced(saved.filter((q) => q !== v));
        pl = yield* tryPlace(this, item);
        if (pl && !this.aborted) {
          this.addPlaced(pl);
          const back: Placed | null = yield* tryPlace(this, v.item);
          if (back && !this.aborted) { this.addPlaced(back); done = true; break; }
        }
        this.setPlaced(saved);
        if (this.aborted) break;
      }
      if (this.aborted) break;
      if (!done) failedT.add(item.tIdx);
    }
    return this.placed;
  }
}

function toPlacements(placed: Placed[]): Placement[] {
  const next = new Map<string, number>();
  return placed.map((p) => {
    const k = next.get(p.item.t.id) ?? 0;
    next.set(p.item.t.id, k + 1);
    return { templateId: p.item.t.id, instance: k, rotation: p.o.rot, polygon: p.ring };
  });
}

/** Removes offending pieces until the independent verifier accepts the plan. */
export function repairPlacements(problem: Problem, placements: Placement[]): Placement[] {
  let cur = placements.slice();
  for (let guard = 0; guard <= placements.length; guard++) {
    const v = verifySolution(problem, cur);
    if (v.valid) return cur;
    const drop = new Set<number>();
    for (const x of v.violations) {
      if (x.placementIndex === undefined) return [];
      drop.add(x.otherIndex !== undefined ? Math.max(x.placementIndex, x.otherIndex) : x.placementIndex);
    }
    cur = cur.filter((_, i) => !drop.has(i));
  }
  return verifySolution(problem, cur).valid ? cur : [];
}

function planArea(ps: Placement[]): number {
  return ps.reduce((s, p) => s + ringArea(p.polygon), 0);
}

function buildItems(problem: Problem, nester: Nester | null): { instances: Item[]; requested: number } {
  const instances: Item[] = [];
  let requested = 0;
  problem.templates.forEach((t, tIdx) => {
    const qty = Math.max(0, Math.floor(t.qty || 0));
    requested += qty;
    if (!nester || qty === 0) return;
    const shape = dedupeRing(t.shape);
    if (shape.length < 3 || !isSimple(shape)) return;
    const seen = new Set<number>();
    const orients: Orient[] = [];
    const mb = nester.mb, d = nester.d;
    for (const rot of t.rotations) {
      if (!Number.isFinite(rot)) continue;
      const key = Math.round((((rot % 360) + 360) % 360) * 1e6);
      if (seen.has(key)) continue;
      seen.add(key);
      const base = placeShape(shape, rot, 0, 0);
      const b = bbox(base);
      const o: Orient = { rot, base, w: b.maxX - b.minX, h: b.maxY - b.minY, probe: interiorPoint(base), deep: deepPoints(base, nester.rc) };
      if (o.w <= mb.maxX - mb.minX - 2 * d && o.h <= mb.maxY - mb.minY - 2 * d) orients.push(o);
    }
    if (!orients.length) return;
    const item: Item = { t, tIdx, orients, area: ringArea(shape) };
    for (let k = 0; k < qty && instances.length < MAX_INSTANCES; k++) instances.push(item);
  });
  return { instances, requested };
}

function shuffleInPlace<T>(a: T[], rng: () => number, swaps: number): void {
  for (let s = 0; s < swaps; s++) {
    const i = Math.floor(rng() * a.length), j = Math.floor(rng() * a.length);
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/** Core as a generator: yields control periodically (used by optimizeAsync). */
export function* optimizeSteps(problem: Problem, options: OptimizeOptions = {}): Generator<void, Solution, void> {
  const now = options.now ?? defaultNow;
  const start = now();
  const seed = (problem.seed ?? DEFAULT_SEED) >>> 0;
  const timeLimit = problem.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const maxIter = Math.max(1, Math.floor(options.maxIterations ?? DEFAULT_MAX_ITERATIONS));
  const rng = mulberry32(seed);

  let iterationsDone = 0, requestedTotal = 0, lastFraction = 0;
  const report = (fraction: number, bestPlaced: number) => {
    lastFraction = fraction;
    options.onProgress?.(fraction, {
      fraction, iteration: iterationsDone, maxIterations: maxIter, bestPlaced, requested: requestedTotal, elapsedMs: now() - start,
    });
  };
  const finish = (placements: Placement[]): Solution => {
    if (lastFraction < 1) report(1, placements.length);
    return {
      placements,
      metrics: computeMetrics(problem, placements),
      elapsedMs: now() - start,
      optimizerVersion: OPTIMIZER_VERSION,
      seed,
    };
  };

  const material = dedupeRing(problem.material);
  if (material.length < 3 || ringArea(material) <= 0) return finish([]);
  const defects = problem.defects.map((d) => dedupeRing(d)).filter((d) => d.length >= 3);
  const spacing = Math.max(0, problem.spacing || 0);
  const nester = new Nester(material, defects, spacing, now);

  let usableArea = ringArea(material);
  try { usableArea = multiArea(difference(material, ...defects)); } catch { /* upper bound: material area */ }
  const { instances: all, requested } = buildItems(problem, nester);
  requestedTotal = requested;
  const instances = all.filter((it) => it.area <= usableArea * (1 + 1e-9));
  if (!instances.length || usableArea <= 0) return finish([]);

  const baseOrder = instances.slice().sort((a, b) => b.area - a.area || a.tIdx - b.tIdx);
  const areaTol = 1e-9 * nester.S * nester.S;
  let best: Placement[] = [];
  let bestArea = 0;
  let bestPlaced: Placed[] = [];
  // "current" genome of the hill climbing: ties are accepted so it can walk across plateaus
  let bestGenome: { order: Item[]; gravs: Gravity[]; failed: number[] } | null = null;
  let curCount = -1;
  const randGrav = () => GRAVITIES[Math.floor(rng() * GRAVITIES.length)];

  /** Accepts `placed` as the best plan if it improves (piece count, then area) and passes the verifier. */
  const consider = (placed: Placed[]): boolean => {
    let cand = toPlacements(placed);
    const candArea = planArea(cand);
    if (!(cand.length > best.length || (cand.length === best.length && candArea > bestArea + areaTol))) return false;
    cand = repairPlacements(problem, cand);
    const a = planArea(cand);
    if (!(cand.length > best.length || (cand.length === best.length && a > bestArea + areaTol))) return false;
    best = cand;
    bestArea = a;
    const kept = new Set(cand.map((c) => c.polygon));
    bestPlaced = placed.filter((q) => kept.has(q.ring));
    return true;
  };

  for (let iter = 0; iter < maxIter; iter++) {
    const elapsed = now() - start;
    if (iter > 0 && elapsed > timeLimit) break;
    // genome = piece order + per-piece gravity
    let order = baseOrder;
    let gravs: Gravity[] = order.map(() => GRAVITIES[iter % 4]);
    if (iter >= 4) {
      if (bestGenome && rng() < 0.5) {
        // mutation of the best genome: order swaps and/or gravity changes
        order = bestGenome.order.slice();
        gravs = bestGenome.gravs.slice();
        if (bestGenome.failed.length && rng() < 0.6) {
        // move forward a piece that did not fit (usually unblocks the plan) and maybe change its gravity
          const i = bestGenome.failed[Math.floor(rng() * bestGenome.failed.length)];
          const j = Math.floor(rng() * (i + 1));
          const [it] = order.splice(i, 1), [gv] = gravs.splice(i, 1);
          order.splice(j, 0, it);
          gravs.splice(j, 0, rng() < 0.5 ? gv : randGrav());
        }
        const swaps = Math.floor(rng() * 2) + (bestGenome.failed.length ? 0 : 1);
        for (let k = 0; k < swaps; k++) {
          const i = Math.floor(rng() * order.length), j = Math.floor(rng() * order.length);
          [order[i], order[j]] = [order[j], order[i]];
          [gravs[i], gravs[j]] = [gravs[j], gravs[i]];
        }
        if (rng() < 0.6) {
          const changes = 1 + Math.floor(rng() * 2);
          for (let k = 0; k < changes; k++) gravs[Math.floor(rng() * gravs.length)] = randGrav();
        }
      } else {
        const noise = 0.25 + 0.75 * rng();
        const keyed = baseOrder.map((it) => ({ it, k: it.area * (1 + noise * (rng() - 0.5)) }));
        keyed.sort((x, y) => y.k - x.k);
        order = keyed.map((x) => x.it);
        if (rng() < 0.5) shuffleInPlace(order, rng, 1 + Math.floor(rng() * 3));
        if (rng() < 0.5) { const g = randGrav(); gravs = order.map(() => g); } else gravs = order.map(() => randGrav());
      }
    }
    // the first pass gets 2× the budget to guarantee some result
    const deadline = start + (iter === 0 ? 2 * timeLimit : timeLimit);
    const placed = yield* nester.pass(order, gravs, deadline);
    const aborted = nester.aborted;
    if (!aborted || iter === 0) {
      consider(placed);
      if (placed.length >= curCount) {
        curCount = placed.length;
        bestGenome = { order, gravs, failed: nester.lastFailed.slice() };
      }
    }
    iterationsDone = iter + 1;
    const el = now() - start;
    report(Math.min(0.99, Math.max(iterationsDone / maxIter, timeLimit > 0 ? el / timeLimit : 0)), best.length);
    if (aborted || best.length >= instances.length) break;
  }

  // final repair: insert pending pieces into the best plan (fine grid, all gravities, swaps)
  if (best.length < instances.length && now() - start <= timeLimit) {
    const count = new Map<number, number>();
    for (const p of bestPlaced) count.set(p.item.tIdx, (count.get(p.item.tIdx) ?? 0) + 1);
    const pending: Item[] = [];
    for (const it of baseOrder) {
      const c = count.get(it.tIdx) ?? 0;
      if (c > 0) count.set(it.tIdx, c - 1); else pending.push(it);
    }
    const placed = yield* nester.insertPending(bestPlaced, pending, start + 1.25 * timeLimit);
    if (!nester.aborted) consider(placed);
  }
  return finish(best);
}

/** Optimizes synchronously. Always returns a plan that passes `verifySolution`. */
export function optimize(problem: Problem, options: OptimizeOptions = {}): Solution {
  const gen = optimizeSteps(problem, options);
  for (;;) {
    const r: IteratorResult<void, Solution> = gen.next();
    if (r.done) return r.value;
  }
}

/**
 * Same as `optimize` but yields the event loop every ~`yieldEveryMs` (50 ms) so the UI does not freeze
 * when called from the main thread.
 */
export async function optimizeAsync(
  problem: Problem,
  onProgress?: ProgressCallback,
  options: OptimizeOptions & { yieldEveryMs?: number } = {},
): Promise<Solution> {
  const now = options.now ?? defaultNow;
  const every = options.yieldEveryMs ?? 50;
  const gen = optimizeSteps(problem, { ...options, onProgress: onProgress ?? options.onProgress });
  let last = now();
  for (;;) {
    const r: IteratorResult<void, Solution> = gen.next();
    if (r.done) return r.value;
    if (now() - last >= every) {
      await new Promise<void>((res) => setTimeout(res, 0));
      last = now();
    }
  }
}
