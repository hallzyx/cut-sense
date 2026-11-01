import { CanvasTexture, Color, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2, type Material } from 'three';
import type { ColorName, MaterialKind } from '../lib/assembly/dsl';

/** Procedural surface: a tiny height field per material turned into a normal map (no image assets). */
export const BASE_COLORS: Record<ColorName, string> = {
  cognac: '#9A5A2E', tan: '#B98552', brown: '#6E4529', dark_brown: '#3F281B', black: '#26231F', burgundy: '#6B2430',
  olive: '#5E6136', navy: '#28334D', grey: '#8B8A86', natural: '#D2B48C', red: '#A3302A', green: '#3F6B4A', blue: '#3F5F93',
};
/** Brand piece colours A–F (same order as the cutting plan). */
export const PIECE_COLORS = ['#F5B800', '#4FC3F7', '#F2609E', '#1FB5A0', '#A07CFF', '#B5E61D'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const cache = new Map<string, CanvasTexture>();
function heightField(kind: MaterialKind, size = 256): Float32Array {
  const h = new Float32Array(size * size);
  const r = rng(kind.length * 7919 + 17);
  const blob = (cx: number, cy: number, rad: number, amp: number) => {
    const r2 = rad * rad;
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
      for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
        const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const k = 1 - d2 / r2;
        h[((y + size) % size) * size + ((x + size) % size)] += amp * k * k;
      }
    }
  };
  if (kind === 'leather') {
    for (let i = 0; i < 1600; i++) blob(r() * size, r() * size, 3 + r() * 5, 0.5 + r() * 0.5); // pebble grain
    for (let i = 0; i < 40; i++) { // a few creases
      let x = r() * size, y = r() * size, a = r() * Math.PI;
      for (let k = 0; k < 40; k++) { blob(x, y, 1.6, -0.6); x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5; a += (r() - 0.5) * 0.4; }
    }
  } else if (kind === 'felt' || kind === 'foam') {
    for (let i = 0; i < 9000; i++) blob(r() * size, r() * size, 1 + r() * 2.5, r() - 0.4);
  } else if (kind === 'fabric') {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = Math.sin((x / size) * Math.PI * 64) * 0.5 + Math.sin((y / size) * Math.PI * 64) * 0.5 + (r() - 0.5) * 0.3;
  } else {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = Math.sin((y / size) * Math.PI * 24) * 0.15 + (r() - 0.5) * 0.25;
  }
  return h;
}

export function normalMap(kind: MaterialKind): CanvasTexture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const size = 256;
  const h = heightField(kind, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  const k = kind === 'leather' ? 1.4 : 0.9;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(kind, tex);
  return tex;
}

/** Face and edge materials for one panel. `tone` nudges lightness so stacked layers stay readable. */
export function panelMaterials(kind: MaterialKind, color: string, tone: number): [Material, Material] {
  const base = new Color(color);
  base.offsetHSL(0, 0, tone);
  const nm = normalMap(kind);
  const face = kind === 'felt' || kind === 'fabric'
    ? new MeshPhysicalMaterial({ color: base, roughness: 1, sheen: 1, sheenRoughness: 0.45, sheenColor: base.clone().offsetHSL(0, -0.05, 0.3), normalMap: nm, normalScale: new Vector2(kind === 'felt' ? 1.1 : 0.6, kind === 'felt' ? 1.1 : 0.6) })
    : new MeshStandardMaterial({ color: base, roughness: kind === 'leather' ? 0.58 : 0.85, metalness: 0, normalMap: nm, normalScale: new Vector2(0.45, 0.45) });
  // Burnished / painted edge: darker and a little glossier on leather.
  const edgeColor = base.clone().multiplyScalar(kind === 'leather' ? 0.45 : 0.68);
  const edge = new MeshStandardMaterial({ color: edgeColor, roughness: kind === 'leather' ? 0.4 : 0.9, metalness: 0 });
  return [face, edge];
}

/** Contrasting thread: dark on light materials, cream on dark ones. */
export function threadColor(color: ColorName, kind: MaterialKind): string {
  const c = new Color(BASE_COLORS[color]);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (lum > 0.35) return kind === 'felt' ? '#6B5A48' : '#5A3A22';
  return kind === 'felt' ? '#F1EBDD' : '#EDE3CC';
}

export function srgb(tex: CanvasTexture) {
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
