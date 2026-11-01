import type { Ring, Template, TemplateKind } from '../types';

/** Builds the base shape of a template (bbox with its minimum corner at 0,0). */
/** `custom` is a shape normalized to [0,1]² that gets scaled to w×h. */
export function buildShape(kind: TemplateKind, w: number, h: number, custom?: Ring): Ring {
  switch (kind) {
    case 'custom':
      return (custom ?? [[0, 0], [1, 0], [1, 1], [0, 1]]).map(([x, y]) => [x * w, y * h] as [number, number]);
    case 'rect':
      return [[0, 0], [w, 0], [w, h], [0, h]];
    case 'rrect': {
      const r = Math.min(w, h) * 0.14, seg = 5, pts: Ring = [];
      const corners: [number, number, number][] = [[w - r, r, -90], [w - r, h - r, 0], [r, h - r, 90], [r, r, 180]];
      for (const [cx, cy, a0] of corners) {
        for (let i = 0; i <= seg; i++) {
          const a = ((a0 + (i / seg) * 90) * Math.PI) / 180;
          pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
      }
      return pts;
    }
    case 'circle': {
      const n = 24, pts: Ring = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push([w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]);
      }
      return pts;
    }
    case 'trapezoid':
      return [[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]];
    case 'irregular': // L-shaped silhouette / simple chevron
      return [[0, 0], [w * 0.55, 0], [w * 0.55, h * 0.45], [w, h * 0.45], [w, h], [0, h]];
  }
}

export const KIND_LABEL: Record<TemplateKind, string> = {
  rect: 'Rectangle', rrect: 'Rounded rectangle', circle: 'Circle (polygon)', trapezoid: 'Trapezoid', irregular: 'L-shape', custom: 'Custom',
};

/** Piece colours A–F from the CutSense brand system (design/tokens.css), paired with PATTERNS by index. */
export const PALETTE = ['#F5B800', '#4FC3F7', '#F2609E', '#1FB5A0', '#A07CFF', '#B5E61D'];
// SVG patterns so that meaning does not rely on colour alone
export const PATTERNS = ['solid', 'diag', 'dots', 'cross', 'horiz', 'vert'] as const;

export function makeTemplate(i: number, kind: TemplateKind, w: number, h: number, qty: number, name?: string): Template {
  return {
    id: `t${i}`, name: name ?? `${KIND_LABEL[kind]} ${String.fromCharCode(65 + i)}`,
    color: PALETTE[i % PALETTE.length], kind, w, h, qty, rotations: [0, 180],
    shape: buildShape(kind, w, h),
  };
}
