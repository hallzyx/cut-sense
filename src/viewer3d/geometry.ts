import { ShapeUtils, Vector2 } from 'three';
import type { RigNode } from '../lib/assembly/kinematics';

/**
 * Panel meshes in the panel's flat local frame (u, v, w). Caps are cut into a grid so the
 * vertex deformation can bend them smoothly; the side wall has four rings so the edges read
 * rounded and burnished.
 */
export interface PanelGeo {
  pos: Float32Array; nrm: Float32Array; uv: Float32Array;
  capCount: number; // vertices of the caps (material 0); the rest is the wall (material 1)
}

type P2 = [number, number];

function clipHalf(poly: P2[], axis: 0 | 1, val: number, keepGreater: boolean): P2[] {
  const out: P2[] = [];
  const inside = (p: P2) => (keepGreater ? p[axis] >= val : p[axis] <= val);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (val - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Inward offset with mitred corners (outline is counter-clockwise). */
export function insetPolygon(poly: P2[], e: number): P2[] {
  const n = poly.length;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    const n1 = edgeNormal(a, p), n2 = edgeNormal(p, b);
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml; my /= ml;
    const cos = Math.max(0.35, mx * n2[0] + my * n2[1]);
    return [p[0] - (mx * e) / cos, p[1] - (my * e) / cos] as P2;
  });
}
function edgeNormal(a: P2, b: P2): P2 {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}

function lines(lo: number, hi: number, step: number, zones: [number, number, number][]): number[] {
  const xs = new Set<number>();
  const n = Math.max(1, Math.ceil((hi - lo) / step));
  for (let i = 0; i <= n; i++) xs.add(lo + ((hi - lo) * i) / n);
  for (const [a, b, k] of zones) for (let i = 0; i <= k; i++) { const x = a + ((b - a) * i) / k; if (x > lo && x < hi) xs.add(x); }
  return [...xs].sort((a, b) => a - b).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 1e-4);
}

export function buildPanelGeometry(n: Pick<RigNode, 'outline' | 'W' | 'H' | 'T' | 'folds'>): PanelGeo {
  const { outline, W, H, T } = n;
  const e = Math.min(T * 0.32, 0.07);
  const inner = insetPolygon(outline, e);
  const g = Math.min(1, Math.max(0.3, Math.max(W, H) / 30));
  const zonesU: [number, number, number][] = [], zonesV: [number, number, number][] = [];
  let minZone = Infinity;
  for (const f of n.folds) {
    (f.coord === 0 ? zonesU : zonesV).push([f.c0 - f.L / 2, f.c0 + f.L / 2, Math.max(8, Math.ceil(f.L / 0.12))]);
    minZone = Math.min(minZone, f.L / 10);
  }
  const xs = lines(-W / 2 - 0.01, W / 2 + 0.01, g, zonesU), ys = lines(-H / 2 - 0.01, H / 2 + 0.01, g, zonesV);

  const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
  const tri = (pts: P2[], w: number, up: boolean) => {
    if (pts.length < 3) return;
    const faces = ShapeUtils.triangulateShape(pts.map((p) => new Vector2(p[0], p[1])), []);
    for (const f of faces) {
      const order = up ? f : [f[0], f[2], f[1]];
      for (const k of order) {
        pos.push(pts[k][0], pts[k][1], w);
        nrm.push(0, 0, up ? 1 : -1);
        uv.push(pts[k][0] / 5, pts[k][1] / 5);
      }
    }
  };
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      let c = clipHalf(inner, 0, xs[i], true);
      c = clipHalf(c, 0, xs[i + 1], false);
      c = clipHalf(c, 1, ys[j], true);
      c = clipHalf(c, 1, ys[j + 1], false);
      if (c.length < 3) continue;
      tri(c, T, true);
      tri(c, 0, false);
    }
  }
  const capCount = pos.length / 3;

  // Side wall: resample the outline finely enough to bend with the folds.
  const maxSeg = Math.min(g / 2, Number.isFinite(minZone) ? Math.max(0.05, minZone) : g / 2);
  const ring: P2[] = [], ringNrm: P2[] = [];
  const nOut = outline.length;
  for (let i = 0; i < nOut; i++) {
    const a = outline[i], b = outline[(i + 1) % nOut];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxSeg));
    for (let s = 0; s < k; s++) ring.push([a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
  }
  const m = ring.length;
  for (let i = 0; i < m; i++) {
    const n1 = edgeNormal(ring[(i - 1 + m) % m], ring[i]), n2 = edgeNormal(ring[i], ring[(i + 1) % m]);
    // Sharp corners keep their own normal per side; smooth curves average.
    const l = Math.hypot(n1[0] + n2[0], n1[1] + n2[1]) || 1;
    ringNrm.push([(n1[0] + n2[0]) / l, (n1[1] + n2[1]) / l]);
  }
  const rings: { off: number; w: number; nz: number; nk: number }[] = [
    { off: -e, w: 0, nz: -0.75, nk: 0.66 }, { off: 0, w: e, nz: 0, nk: 1 }, { off: 0, w: T - e, nz: 0, nk: 1 }, { off: -e, w: T, nz: 0.75, nk: 0.66 },
  ];
  let arc = 0;
  const arcs: number[] = [];
  for (let i = 0; i <= m; i++) {
    arcs.push(arc);
    const a = ring[i % m], b = ring[(i + 1) % m];
    arc += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const vert = (i: number, r: (typeof rings)[number]) => {
    const p = ring[i % m], nn = ringNrm[i % m];
    pos.push(p[0] + nn[0] * r.off, p[1] + nn[1] * r.off, r.w);
    nrm.push(nn[0] * r.nk, nn[1] * r.nk, r.nz);
    uv.push(arcs[i] / 5, r.w / 5);
  };
  for (let i = 0; i < m; i++) {
    for (let r = 0; r < rings.length - 1; r++) {
      const r0 = rings[r], r1 = rings[r + 1];
      // two triangles, outward facing (counter-clockwise outline, w up)
      vert(i, r0); vert(i + 1, r0); vert(i + 1, r1);
      vert(i, r0); vert(i + 1, r1); vert(i, r1);
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: new Float32Array(uv), capCount };
}

/** Stitch positions (u, v) and tangents along the chosen edges, inset from the outline. */
export function stitchPoints(n: Pick<RigNode, 'outline' | 'W' | 'H'>, which: string, inset = 0.35, pitch = 0.42): { p: P2; t: P2 }[] {
  if (which === 'none') return [];
  const e = Math.min(inset, Math.min(n.W, n.H) * 0.12);
  const poly = insetPolygon(n.outline, e);
  const want = (nx: number, ny: number) => {
    const side = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : ny > 0 ? 'top' : 'bottom';
    switch (which) {
      case 'all': return true;
      case 'u_shape': return side !== 'top';
      case 'sides': return side === 'left' || side === 'right';
      default: return side === which;
    }
  };
  const out: { p: P2; t: P2 }[] = [];
  let carry = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const [nx, ny] = edgeNormal(a, b);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!want(nx, ny) || len < 1e-6) { carry = 0; continue; }
    const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len;
    let s = carry;
    for (; s < len; s += pitch) out.push({ p: [a[0] + tx * s, a[1] + ty * s], t: [tx, ty] });
    carry = s - len;
  }
  return out;
}
