import type { TemplateKind } from '../types';

/** Text handed to Hilo when the plan could not fit even one complete product. */
export interface ShortfallInput {
  product: string;
  unit: string;
  pieces: { name: string; kind: TemplateKind; w: number; h: number; qty: number; rotations: number[] }[];
  /** Box that wraps the material, in the current unit. */
  materialW: number;
  materialH: number;
  usableArea: number;
  spacing: number;
  placed: number;
  requested: number;
  calibration: { dist: number; unit: string } | null;
}

const KIND: Record<string, string> = { rect: 'rectangle', rrect: 'rounded rectangle', circle: 'circle', trapezoid: 'trapezoid', irregular: 'L-shaped silhouette', custom: 'custom shape' };
const n = (x: number) => (Math.round(x * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });

export function shortfallMessage(s: ShortfallInput): string {
  const lines = s.pieces.slice(0, 8).map((p) => `- ${p.name.slice(0, 40)}: ${KIND[p.kind] ?? p.kind}, ${n(p.w)} × ${n(p.h)} ${s.unit}, ${p.qty} per product, rotations ${p.rotations.join('/')}°`);
  const big = s.pieces.reduce((a, p) => (p.w * p.h > a.w * a.h ? p : a), s.pieces[0] ?? { w: 0, h: 0, name: '' });
  return [
    `I optimized "${s.product.slice(0, 60)}" and not even one complete product fit: only ${s.placed} of ${s.requested} pieces of a single product were placed.`,
    'Pieces of one product:',
    ...lines,
    `Material: box of ${n(s.materialW)} × ${n(s.materialH)} ${s.unit}, usable area ${n(s.usableArea)} ${s.unit}², spacing ${n(s.spacing)} ${s.unit}.`,
    big.name ? `The largest piece is "${big.name.slice(0, 40)}" (${n(big.w)} × ${n(big.h)} ${s.unit}).` : '',
    s.calibration ? `The scale was calibrated with a reference of ${n(s.calibration.dist)} ${s.calibration.unit}.` : 'The photo has no physical calibration.',
    'Help me understand what happened: could the calibration or one of the measurements be wrong? Tell me my options and, if it truly does not fit, be honest and suggest a smaller object I can make with this material.',
  ].filter(Boolean).join('\n');
}
