import type { Pt, Ring } from '../types';

export interface Example {
  id: string;
  title: string;
  blurb: string;
  w: number;
  h: number;
  src: string;
  /** Precomputed outline (NOT live inference; it is labeled "saved"). */
  cachedPolygon: Ring;
  /** Assumed scale of the (synthetic) example: it is labeled as such in the UI. */
  calib?: { a: Pt; b: Pt; dist: number; unit: string };
  kitId?: string;
}

const svg = (body: string) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <defs>
        <filter id="n" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="t"/>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.16 0"/>
        </filter>
      </defs>
      <rect width="800" height="600" fill="#e3dccb"/>
      <rect width="800" height="600" filter="url(#n)"/>
      ${body}
    </svg>`);

const felt: Ring = [[110, 120], [300, 70], [520, 95], [700, 160], [730, 330], [650, 480], [470, 520], [380, 450], [250, 505], [120, 430], [90, 280]];
const leather: Ring = [[150, 160], [330, 90], [470, 150], [640, 100], [720, 230], [690, 400], [560, 500], [400, 470], [260, 540], [130, 430], [100, 300]];

const pts = (r: Ring) => r.map((p) => p.join(',')).join(' ');

export const EXAMPLES: Example[] = [
  {
    id: 'fieltro',
    title: 'Felt offcut',
    blurb: 'A concave edge, a hole and a stain, all visible.',
    w: 800, h: 600, cachedPolygon: felt,
    src: svg(`
      <polygon points="${pts(felt)}" fill="#2f7f86" stroke="#1f5c62" stroke-width="3" stroke-linejoin="round"/>
      <polygon points="${pts(felt)}" fill="#2f7f86" filter="url(#n)"/>
      <circle cx="520" cy="300" r="38" fill="#e3dccb"/>
      <ellipse cx="235" cy="215" rx="42" ry="26" fill="#1c4a4f" opacity=".75"/>`),
  },
  {
    id: 'cuero',
    title: 'Leather scrap',
    blurb: 'Leather scrap with an assumed scale (14 px = 1 cm) for cutting a bifold wallet.',
    w: 800, h: 600, cachedPolygon: leather,
    calib: { a: [100, 565], b: [240, 565], dist: 10, unit: 'cm' }, kitId: 'cartera',
    src: svg(`
      <polygon points="${pts(leather)}" fill="#a8602f" stroke="#7a4219" stroke-width="3" stroke-linejoin="round"/>
      <polygon points="${pts(leather)}" fill="#a8602f" filter="url(#n)"/>
      <ellipse cx="420" cy="300" rx="48" ry="30" fill="#6a3715" opacity=".8"/>`),
  },
];
