import type { AgentPiece } from '../agentSchema';

/** Sample piece sets (as the design agent would propose them) for the lab page and the tests. */
const p = (name: string, kind: AgentPiece['kind'], w: number, h: number, qty = 1, notes = ''): AgentPiece => ({
  name, kind, width_cm: w, height_cm: h, qty_per_set: qty, rotations: [0, 180], notes,
});

export interface ProductFixture { key: string; productName: string; pieces: AgentPiece[]; assumptions: string[] }

export const PRODUCT_FIXTURES: ProductFixture[] = [
  {
    key: 'billetera', productName: 'Billetera bifold de cuero',
    pieces: [p('Exterior', 'rrect', 18.5, 9.5), p('Bolsillo de billetes', 'rrect', 17, 8), p('Bolsillo de tarjeta', 'rrect', 8.5, 5.5, 4), p('Monedero', 'trapezoid', 8, 7)],
    assumptions: ['Cuero de 1,5 mm', 'Unión cosida a mano con margen de 0,4 cm'],
  },
  {
    key: 'tarjetero', productName: 'Tarjetero de cuero',
    pieces: [p('Cuerpo', 'rrect', 9.5, 6.5), p('Bolsillo frontal', 'rrect', 9.5, 6), p('Bolsillo de tarjeta', 'rrect', 9.5, 4.5, 2), p('Pestaña', 'trapezoid', 6, 3)],
    assumptions: ['Para 4–6 tarjetas', 'Cuero de 1,2 mm'],
  },
  {
    key: 'monedero', productName: 'Monedero con cierre de broche',
    pieces: [p('Trasera', 'rrect', 11, 8.5), p('Delantera', 'rrect', 11, 7.5), p('Solapa', 'trapezoid', 9, 4.5)],
    assumptions: ['Cierre con broche de presión', 'Cuero de 1,5 mm'],
  },
  {
    key: 'gafas', productName: 'Estuche de gafas de cuero',
    pieces: [p('Panel trasero', 'rrect', 8, 17.5), p('Panel delantero', 'rrect', 8, 16), p('Solapa', 'rrect', 8, 5)],
    assumptions: ['Gafas de hasta 15 cm de ancho', 'Cierre con broche'],
  },
  {
    key: 'celular', productName: 'Funda de celular de fieltro',
    pieces: [p('Panel de funda', 'rrect', 8.5, 16.5, 2), p('Lengüeta', 'rrect', 3, 4)],
    assumptions: ['Fieltro de 3 mm', 'Teléfono de 7,5 × 15,5 cm'],
  },
  {
    key: 'tote', productName: 'Bolso tote pequeño de lona',
    pieces: [p('Frente y espalda', 'rect', 24, 26, 2), p('Base', 'rect', 24, 8), p('Lateral', 'rect', 8, 26, 2), p('Asa', 'rect', 2.5, 40, 2)],
    assumptions: ['Lona gruesa', 'Asas de 40 cm cosidas por dentro'],
  },
  {
    key: 'llavero', productName: 'Llavero de cuero',
    pieces: [p('Tira del llavero', 'rrect', 2.5, 12)],
    assumptions: ['Argolla metálica de 2,5 cm', 'Remache de cierre'],
  },
  {
    key: 'posavasos', productName: 'Set de posavasos de fieltro',
    pieces: [p('Posavasos', 'circle', 10, 10, 6)],
    assumptions: ['Fieltro de 4 mm'],
  },
  {
    key: 'neceser', productName: 'Neceser con cremallera',
    pieces: [p('Panel', 'rrect', 22, 14, 2), p('Tirador', 'rrect', 2, 6)],
    assumptions: ['Cremallera de 20 cm', 'Polipiel'],
  },
  {
    key: 'caja', productName: 'Caja con tapa de cartón',
    pieces: [p('Base', 'rect', 12, 9), p('Lateral largo', 'rect', 12, 5, 2), p('Lateral corto', 'rect', 9, 5, 2), p('Tapa', 'rect', 12, 9)],
    assumptions: ['Cartón gris de 2 mm'],
  },
];
