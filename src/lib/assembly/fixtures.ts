import type { AgentPiece } from '../agentSchema';

/** Sample piece sets (as the design agent would propose them) for the lab page and the tests. */
const p = (name: string, kind: AgentPiece['kind'], w: number, h: number, qty = 1, notes = ''): AgentPiece => ({
  name, kind, width_cm: w, height_cm: h, qty_per_set: qty, rotations: [0, 180], notes,
});

export interface ProductFixture { key: string; productName: string; pieces: AgentPiece[]; assumptions: string[] }

export const PRODUCT_FIXTURES: ProductFixture[] = [
  {
    key: 'billetera', productName: 'Leather bifold wallet',
    pieces: [p('Exterior', 'rrect', 18.5, 9.5), p('Bill pocket', 'rrect', 17, 8), p('Card pocket', 'rrect', 8.5, 5.5, 4), p('Coin pocket', 'trapezoid', 8, 7)],
    assumptions: ['1.5 mm leather', 'Hand-stitched with a 0.4 cm allowance'],
  },
  {
    key: 'tarjetero', productName: 'Leather cardholder',
    pieces: [p('Body', 'rrect', 9.5, 6.5), p('Front pocket', 'rrect', 9.5, 6), p('Card pocket', 'rrect', 9.5, 4.5, 2), p('Tab', 'trapezoid', 6, 3)],
    assumptions: ['Holds 4–6 cards', '1.2 mm leather'],
  },
  {
    key: 'monedero', productName: 'Coin purse with snap closure',
    pieces: [p('Back', 'rrect', 11, 8.5), p('Front', 'rrect', 11, 7.5), p('Flap', 'trapezoid', 9, 4.5)],
    assumptions: ['Press snap closure', '1.5 mm leather'],
  },
  {
    key: 'gafas', productName: 'Leather glasses case',
    pieces: [p('Back panel', 'rrect', 8, 17.5), p('Front panel', 'rrect', 8, 16), p('Flap', 'rrect', 8, 5)],
    assumptions: ['Glasses up to 15 cm wide', 'Snap closure'],
  },
  {
    key: 'celular', productName: 'Felt phone sleeve',
    pieces: [p('Case panel', 'rrect', 8.5, 16.5, 2), p('Tab', 'rrect', 3, 4)],
    assumptions: ['3 mm felt', 'Phone of 7.5 × 15.5 cm'],
  },
  {
    key: 'tote', productName: 'Small canvas tote bag',
    pieces: [p('Front and back', 'rect', 24, 26, 2), p('Base', 'rect', 24, 8), p('Side', 'rect', 8, 26, 2), p('Handle', 'rect', 2.5, 40, 2)],
    assumptions: ['Heavy canvas', '40 cm handles sewn on the inside'],
  },
  {
    key: 'llavero', productName: 'Leather keychain',
    pieces: [p('Keychain strip', 'rrect', 2.5, 12)],
    assumptions: ['2.5 cm metal key ring', 'Closing rivet'],
  },
  {
    key: 'posavasos', productName: 'Felt coaster set',
    pieces: [p('Coaster', 'circle', 10, 10, 6)],
    assumptions: ['4 mm felt'],
  },
  {
    key: 'neceser', productName: 'Toiletry bag with zipper',
    pieces: [p('Panel', 'rrect', 22, 14, 2), p('Zip pull', 'rrect', 2, 6)],
    assumptions: ['20 cm zipper', 'Faux leather'],
  },
  {
    key: 'caja', productName: 'Cardboard box with lid',
    pieces: [p('Base', 'rect', 12, 9), p('Long side', 'rect', 12, 5, 2), p('Short side', 'rect', 9, 5, 2), p('Lid', 'rect', 12, 9)],
    assumptions: ['2 mm grey board'],
  },
  {
    key: 'chaqueta', productName: 'Leather jacket',
    pieces: [p('Front panel', 'rect', 28, 60, 2), p('Back panel', 'rect', 54, 60), p('Sleeve', 'rect', 20, 58, 2), p('Collar', 'rrect', 40, 8), p('Pocket', 'rrect', 14, 16, 2)],
    assumptions: ['1.2 mm leather', 'Front zipper closure'],
  },
  {
    key: 'sudadera', productName: 'Hooded sweatshirt',
    pieces: [p('Front', 'rect', 50, 62), p('Back', 'rect', 50, 62), p('Sleeve', 'rect', 22, 60, 2), p('Hood', 'rrect', 30, 34), p('Cuff', 'rect', 22, 6, 2), p('Waistband', 'rect', 50, 8)],
    assumptions: ['Cotton fleece', 'Rib-knit cuffs and waistband'],
  },
];
