import type { TemplateKind } from '../types';

export interface KitPiece { name: string; kind: TemplateKind; w: number; h: number; qty: number; rotations?: number[] }
export interface Kit { id: string; name: string; blurb: string; pieces: KitPiece[] }

/** Medidas en cm. Requieren una foto calibrada en cm. Referencia útil: una tarjeta bancaria mide 8,56 cm de largo. */
export const KITS: Kit[] = [
  {
    id: 'tarjetero', name: 'Tarjetero de cuero', blurb: '5 piezas · cuerpo, 3 bolsillos y pestaña',
    pieces: [
      { name: 'Cuerpo', kind: 'rrect', w: 9.5, h: 6.5, qty: 1 },
      { name: 'Bolsillo frontal', kind: 'rrect', w: 9.5, h: 6, qty: 1 },
      { name: 'Bolsillo de tarjeta', kind: 'rrect', w: 9.5, h: 4.5, qty: 2 },
      { name: 'Pestaña', kind: 'trapezoid', w: 6, h: 3, qty: 1 },
    ],
  },
  {
    id: 'cartera', name: 'Cartera bifold de cuero', blurb: '7 piezas · exterior, billetes, 4 tarjetas y monedero',
    pieces: [
      { name: 'Exterior', kind: 'rrect', w: 18.5, h: 9.5, qty: 1, rotations: [0, 180] },
      { name: 'Bolsillo de billetes', kind: 'rrect', w: 17, h: 8, qty: 1, rotations: [0, 180] },
      { name: 'Bolsillo de tarjeta', kind: 'rrect', w: 8.5, h: 5.5, qty: 4, rotations: [0, 90, 180, 270] },
      { name: 'Monedero', kind: 'trapezoid', w: 8, h: 7, qty: 1, rotations: [0, 180] },
    ],
  },
];
