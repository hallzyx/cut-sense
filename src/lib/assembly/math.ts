/** Minimal rigid-transform math (column-major 4×4, three.js compatible) so the kinematics stay pure and testable. */
export type M4 = Float64Array;
export type V3 = [number, number, number];

export function ident(): M4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
export function mul(a: M4, b: M4): M4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}
export const chain = (...ms: M4[]) => ms.reduce((acc, m) => mul(acc, m), ident());
export function trans(x: number, y: number, z: number): M4 {
  const m = ident();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}
export function rotX(a: number): M4 {
  const m = ident(), c = Math.cos(a), s = Math.sin(a);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}
export function rotZ(a: number): M4 {
  const m = ident(), c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}
/** p ← m·p (point). */
export function applyP(m: M4, p: number[]): void {
  const x = p[0], y = p[1], z = p[2];
  p[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  p[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  p[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}
/** d ← R·d (direction, rotation part only). */
export function applyD(m: M4, d: number[]): void {
  const x = d[0], y = d[1], z = d[2];
  d[0] = m[0] * x + m[4] * y + m[8] * z;
  d[1] = m[1] * x + m[5] * y + m[9] * z;
  d[2] = m[2] * x + m[6] * y + m[10] * z;
}
/** Inverse of a rigid transform (rotation + translation). */
export function invRigid(m: M4): M4 {
  const o = ident();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c];
  const tx = m[12], ty = m[13], tz = m[14];
  o[12] = -(o[0] * tx + o[4] * ty + o[8] * tz);
  o[13] = -(o[1] * tx + o[5] * ty + o[9] * tz);
  o[14] = -(o[2] * tx + o[6] * ty + o[10] * tz);
  return o;
}

type Q = [number, number, number, number];
function toQuat(m: M4): Q {
  const m00 = m[0], m11 = m[5], m22 = m[10], tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s; x = (m[6] - m[9]) * s; y = (m[8] - m[2]) * s; z = (m[1] - m[4]) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m[6] - m[9]) / s; x = 0.25 * s; y = (m[4] + m[1]) / s; z = (m[8] + m[2]) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m[8] - m[2]) / s; x = (m[4] + m[1]) / s; y = 0.25 * s; z = (m[9] + m[6]) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m[1] - m[4]) / s; x = (m[8] + m[2]) / s; y = (m[9] + m[6]) / s; z = 0.25 * s;
  }
  return [x, y, z, w];
}
function fromQuat([x, y, z, w]: Q, px: number, py: number, pz: number): M4 {
  const m = ident();
  const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz); m[1] = xy + wz; m[2] = xz - wy;
  m[4] = xy - wz; m[5] = 1 - (xx + zz); m[6] = yz + wx;
  m[8] = xz + wy; m[9] = yz - wx; m[10] = 1 - (xx + yy);
  m[12] = px; m[13] = py; m[14] = pz;
  return m;
}
function slerp(a: Q, b: Q, t: number): Q {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb: Q = cos < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b;
  cos = Math.abs(cos);
  if (cos > 0.9995) {
    const q = a.map((v, i) => v + (bb[i] - v) * t) as Q;
    const l = Math.hypot(...q);
    return q.map((v) => v / l) as Q;
  }
  const th = Math.acos(cos), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i] * wb) as Q;
}
/** Interpolate two rigid transforms, adding an arc of `lift` along `up` so pieces travel over, not through, each other. */
export function interpRigid(a: M4, b: M4, t: number, lift = 0, up: V3 = [0, 1, 0]): M4 {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const q = slerp(toQuat(a), toQuat(b), t);
  const h = Math.sin(Math.PI * t) * lift;
  return fromQuat(q, a[12] + (b[12] - a[12]) * t + up[0] * h, a[13] + (b[13] - a[13]) * t + up[1] * h, a[14] + (b[14] - a[14]) * t + up[2] * h);
}

export const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function norm(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
