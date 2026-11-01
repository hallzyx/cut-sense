import type { Pt, Ring } from '../types';
import type { Project, Result } from '../state';
import { bbox } from './poly';
import { pxPerCm } from './print';

/**
 * DXF export in the variant most compatible with laser cutters, plotters and CNC machines:
 * R12 (AC1009) ASCII, millimeters, closed polylines, layers with standard colors.
 *   CUT       (red, 1)  outline of each placed piece — what the machine must cut
 *   MATERIAL  (blue, 5)  edge of the material  — reference only, optional
 *   DEFECTS   (magenta, 6) excluded zones    — reference only, optional
 * Origin at the bottom-left corner of the material; Y axis pointing up.
 */
export interface DxfOptions {
  /** Includes MATERIAL and DEFECTS. Off by default: some machines cut every layer. */
  reference?: boolean;
}

const LAYERS = [
  { name: 'CUT', color: 1 },
  { name: 'MATERIAL', color: 5 },
  { name: 'DEFECTS', color: 6 },
];

export function buildDxf(p: Project, r: Result, opts: DxfOptions = {}): string {
  const k = pxPerCm(r);
  if (!k) throw new Error('The DXF needs a calibration in cm or mm.');
  const b = bbox(p.contour);
  const hMm = (b.h / k) * 10;
  // photo px → mm, with origin at bottom-left and Y pointing up
  const mm = ([x, y]: Pt): Pt => [((x - b.x0) / k) * 10, hMm - ((y - b.y0) / k) * 10];
  const f = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3);

  const out: (string | number)[] = [];
  const g = (code: number, value: string | number) => out.push(code, value);

  const poly = (layer: string, ring: Ring) => {
    g(0, 'POLYLINE'); g(8, layer); g(66, 1); g(70, 1);
    for (const q of ring.map(mm)) { g(0, 'VERTEX'); g(8, layer); g(10, f(q[0])); g(20, f(q[1])); g(30, '0.000'); }
    g(0, 'SEQEND'); g(8, layer);
  };

  const layers = LAYERS.filter((l) => l.name === 'CUT' || opts.reference);

  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); g(70, 4);
  g(9, '$MEASUREMENT'); g(70, 1);
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, '0.0');
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
  for (const l of layers) { g(0, 'LAYER'); g(2, l.name); g(70, 0); g(62, l.color); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const pl of r.solution.placements) poly('CUT', pl.polygon);
  if (opts.reference) {
    poly('MATERIAL', p.contour);
    for (const d of p.defects) poly('DEFECTS', d);
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');

  // DXF files use code/value pairs, one per line, with CRLF.
  return out.join('\r\n') + '\r\n';
}
