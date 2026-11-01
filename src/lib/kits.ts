import type { TemplateKind } from '../types';

export interface KitPiece { name: string; kind: TemplateKind; w: number; h: number; qty: number; rotations?: number[] }
/** kit = product made of several pieces that only counts when complete · piece = a single piece repeated as many times as it fits. */
export interface Kit { id: string; name: string; blurb: string; kind?: 'kit' | 'piece'; pieces: KitPiece[] }

/** Measurements in cm. They require a photo calibrated in cm. Handy reference: a bank card is 8.56 cm long. */
export const KITS: Kit[] = [
  {
    id: 'tarjetero', name: 'Leather cardholder', blurb: '5 pieces · body, 3 pockets and flap',
    pieces: [
      { name: 'Body', kind: 'rrect', w: 9.5, h: 6.5, qty: 1 },
      { name: 'Front pocket', kind: 'rrect', w: 9.5, h: 6, qty: 1 },
      { name: 'Card pocket', kind: 'rrect', w: 9.5, h: 4.5, qty: 2 },
      { name: 'Flap', kind: 'trapezoid', w: 6, h: 3, qty: 1 },
    ],
  },
  {
    id: 'cartera', name: 'Leather bifold wallet', blurb: '7 pieces · outer, bills, 4 cards and coin pocket',
    pieces: [
      { name: 'Outer', kind: 'rrect', w: 18.5, h: 9.5, qty: 1, rotations: [0, 180] },
      { name: 'Bill pocket', kind: 'rrect', w: 17, h: 8, qty: 1, rotations: [0, 180] },
      { name: 'Card pocket', kind: 'rrect', w: 8.5, h: 5.5, qty: 4, rotations: [0, 90, 180, 270] },
      { name: 'Coin pocket', kind: 'trapezoid', w: 8, h: 7, qty: 1, rotations: [0, 180] },
    ],
  },
  {
    id: 'llavero', name: 'Keychains', kind: 'piece', blurb: 'single piece · 7 × 3 cm, as many as fit',
    pieces: [{ name: 'Keychain', kind: 'rrect', w: 7, h: 3, qty: 1, rotations: [0, 90, 180, 270] }],
  },
  {
    id: 'posavasos', name: 'Coasters', kind: 'piece', blurb: 'single piece · 9 cm diameter',
    pieces: [{ name: 'Coaster', kind: 'circle', w: 9, h: 9, qty: 1, rotations: [0] }],
  },
  {
    id: 'marcapaginas', name: 'Bookmarks', kind: 'piece', blurb: 'single piece · 4 × 14 cm',
    pieces: [{ name: 'Bookmark', kind: 'rrect', w: 4, h: 14, qty: 1, rotations: [0, 90, 180, 270] }],
  },
];
