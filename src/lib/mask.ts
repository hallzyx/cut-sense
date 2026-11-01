import type { Pt, Ring } from '../types';
import { simplifyRing } from './poly';

/** Binary mask on a grid (1 = material). */
export interface Mask { w: number; h: number; data: Uint8Array }

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('Could not decode the image.'));
    im.src = src;
  });
}

function drawScaled(im: HTMLImageElement, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0, w, h);
  return { c, ctx, w, h };
}

/** Mask returned by a model (PNG): foreground = opaque and light. */
export async function maskFromModelPng(dataUrl: string, maxSide = 512): Promise<Mask> {
  const im = await loadImage(dataUrl);
  const { ctx, w, h } = drawScaled(im, maxSide);
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const lum = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
    data[i] = px[i * 4 + 3] > 128 && lum > 128 ? 1 : 0;
  }
  return { w, h, data };
}

/** Local segmentation by contrast with the background (NOT Meta AI): edge median + color distance. */
export async function segmentLocal(src: string, maxSide = 384, threshold = 38): Promise<Mask> {
  const im = await loadImage(src);
  const { ctx, w, h } = drawScaled(im, maxSide);
  const px = ctx.getImageData(0, 0, w, h).data;
  const border: number[][] = [[], [], []];
  const take = (x: number, y: number) => {
    const o = (y * w + x) * 4;
    for (let k = 0; k < 3; k++) border[k].push(px[o + k]);
  };
  for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y++) { take(0, y); take(w - 1, y); }
  const bg = border.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]);
    data[i] = d > threshold ? 1 : 0;
  }
  return { w, h, data };
}

/** Keeps the largest connected component (4-neighborhood) and fills interior holes. */
export function largestComponent(m: Mask): Mask {
  return fillHoles(keepLargest(m));
}

/** Only the largest connected component (4-neighborhood), without filling holes. */
export function keepLargest(m: Mask): Mask {
  const { w, h, data } = m;
  const label = new Int32Array(w * h);
  let best = 0, bestSize = 0, id = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!data[s] || label[s]) continue;
    id++; let size = 0; stack.push(s); label[s] = id;
    while (stack.length) {
      const p = stack.pop()!; size++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && data[p - 1] && !label[p - 1]) { label[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && data[p + 1] && !label[p + 1]) { label[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && data[p - w] && !label[p - w]) { label[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && data[p + w] && !label[p + w]) { label[p + w] = id; stack.push(p + w); }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = best && label[i] === best ? 1 : 0;
  return { w, h, data: out };
}

/** Background not reachable from the edge becomes material. */
export function fillHoles(m: Mask): Mask {
  const { w, h, data: out } = m;
  const outside = new Uint8Array(w * h);
  const q: number[] = [];
  const push = (p: number) => { if (!out[p] && !outside[p]) { outside[p] = 1; q.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (q.length) {
    const p = q.pop()!; const x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = outside[i] ? 0 : 1;
  return { w, h, data: filled };
}

const DIRS: Pt[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

/** Outer outline by Moore neighborhood tracing (Jacob's stopping criterion). */
export function traceOuter(m: Mask): Pt[] {
  const { w, h, data } = m;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1;
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y)) { sx = x; sy = y; break outer; }
  if (sx < 0) return [];
  const pts: Pt[] = [[sx, sy]];
  let cx = sx, cy = sy, back = 0; // the west neighbor of the first pixel is background
  let firstMove = -1;
  for (let guard = 0; guard < w * h * 4; guard++) {
    let moved = false;
    for (let i = 1; i <= 8; i++) {
      const k = (back + i) % 8;
      const nx = cx + DIRS[k][0], ny = cy + DIRS[k][1];
      if (!at(nx, ny)) continue;
      const pk = (k + 7) % 8;
      const dx = cx + DIRS[pk][0] - nx, dy = cy + DIRS[pk][1] - ny;
      back = DIRS.findIndex(([ax, ay]) => ax === dx && ay === dy);
      if (cx === sx && cy === sy && firstMove >= 0 && k === firstMove) { pts.pop(); return pts; }
      if (firstMove < 0) firstMove = k;
      cx = nx; cy = ny; pts.push([cx, cy]); moved = true;
      break;
    }
    if (!moved) break; // isolated pixel
  }
  if (pts.length > 1 && pts[pts.length - 1][0] === sx && pts[pts.length - 1][1] === sy) pts.pop();
  return pts;
}

export interface MaskToPolygonResult { polygon: Ring; areaFraction: number; holes: Ring[] }

/** Interior gaps in the material (holes) as polygons; ignores gaps smaller than 0.3% of the material. */
export function maskHoles(mask: Mask, imgW: number, imgH: number): Ring[] {
  const comp = keepLargest(mask);
  const filled = fillHoles(comp);
  const { w, h } = comp;
  const hole = new Uint8Array(w * h);
  let matter = 0;
  for (let i = 0; i < w * h; i++) { hole[i] = filled.data[i] && !comp.data[i] ? 1 : 0; matter += filled.data[i]; }
  const label = new Int32Array(w * h);
  const out: Ring[] = [];
  const sx = imgW / w, sy = imgH / h;
  for (let s = 0; s < w * h; s++) {
    if (!hole[s] || label[s]) continue;
    const pix: number[] = [s]; label[s] = 1;
    for (let k = 0; k < pix.length; k++) {
      const p = pix[k], x = p % w, y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && hole[q] && !label[q]) { label[q] = 1; pix.push(q); }
      }
    }
    if (pix.length < matter * 0.003) continue;
    const m = new Uint8Array(w * h);
    for (const p of pix) m[p] = 1;
    const tr = traceOuter({ w, h, data: m });
    if (tr.length < 3) continue;
    const ring = simplifyRing(tr.map(([x, y]) => [(x + 0.5) * sx, (y + 0.5) * sy] as Pt), Math.hypot(imgW, imgH) * 0.003)
      .map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as Pt);
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}

/** Mask → polygon in original image coordinates (cleanup + simplification). */
export function maskToPolygon(mask: Mask, imgW: number, imgH: number): MaskToPolygonResult {
  const clean = largestComponent(mask);
  const trace = traceOuter(clean);
  let count = 0;
  for (const v of clean.data) count += v;
  if (trace.length < 3) return { polygon: [], areaFraction: 0, holes: [] };
  const sx = imgW / clean.w, sy = imgH / clean.h;
  const scaled: Ring = trace.map(([x, y]) => [(x + 0.5) * sx, (y + 0.5) * sy]);
  const eps = Math.hypot(imgW, imgH) * 0.004;
  const polygon = simplifyRing(scaled, eps).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as Pt);
  return { polygon, areaFraction: count / (clean.w * clean.h), holes: maskHoles(mask, imgW, imgH) };
}
