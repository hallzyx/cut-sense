import type { TemplateKind } from '../types';

/** Texto que se le entrega a Hilo cuando el plan no logró ni un producto completo. */
export interface ShortfallInput {
  product: string;
  unit: string;
  pieces: { name: string; kind: TemplateKind; w: number; h: number; qty: number; rotations: number[] }[];
  /** Caja que envuelve al material, en la unidad actual. */
  materialW: number;
  materialH: number;
  usableArea: number;
  spacing: number;
  placed: number;
  requested: number;
  calibration: { dist: number; unit: string } | null;
}

const KIND: Record<string, string> = { rect: 'rectángulo', rrect: 'rectángulo redondeado', circle: 'círculo', trapezoid: 'trapecio', irregular: 'silueta en L', custom: 'forma propia' };
const n = (x: number) => (Math.round(x * 10) / 10).toLocaleString('es', { maximumFractionDigits: 1 });

export function shortfallMessage(s: ShortfallInput): string {
  const lines = s.pieces.slice(0, 8).map((p) => `- ${p.name.slice(0, 40)}: ${KIND[p.kind] ?? p.kind}, ${n(p.w)} × ${n(p.h)} ${s.unit}, ${p.qty} por producto, giros ${p.rotations.join('/')}°`);
  const big = s.pieces.reduce((a, p) => (p.w * p.h > a.w * a.h ? p : a), s.pieces[0] ?? { w: 0, h: 0, name: '' });
  return [
    `Optimicé «${s.product.slice(0, 60)}» y no cupo ni un producto completo: solo se colocaron ${s.placed} de ${s.requested} piezas de un solo producto.`,
    'Piezas de un producto:',
    ...lines,
    `Material: caja de ${n(s.materialW)} × ${n(s.materialH)} ${s.unit}, área útil ${n(s.usableArea)} ${s.unit}², separación ${n(s.spacing)} ${s.unit}.`,
    big.name ? `La pieza más grande es «${big.name.slice(0, 40)}» (${n(big.w)} × ${n(big.h)} ${s.unit}).` : '',
    s.calibration ? `La escala se calibró con una referencia de ${n(s.calibration.dist)} ${s.calibration.unit}.` : 'La foto no tiene calibración física.',
    'Ayúdame a entender qué pasó: ¿puede estar mal la calibración o alguna medida? Dime mis opciones y, si de verdad no alcanza, sé sincero y sugiéreme otro objeto más pequeño que sí pueda hacer con este material.',
  ].filter(Boolean).join('\n');
}
