/** Shared contract between the UI, the server and the geometry engine. Units: image pixels (or relative units). */
export type Pt = [number, number];
/** Simple ring: the first point is not repeated at the end, and there are no holes. */
export type Ring = Pt[];

export type TemplateKind = 'rect' | 'rrect' | 'circle' | 'trapezoid' | 'irregular' | 'custom';

export interface Template {
  id: string;
  name: string;
  color: string;
  kind: TemplateKind;
  /** Bounding-box width and height, in canvas units. */
  w: number;
  h: number;
  qty: number;
  /** Allowed rotations in degrees (e.g. [0, 180]). */
  rotations: number[];
  /** Base shape (already sized, bbox with its minimum corner at 0,0). */
  shape: Ring;
}

export interface Problem {
  /** Outer outline of the material. */
  material: Ring;
  /** Excluded zones (they may overlap each other or extend past the material). */
  defects: Ring[];
  templates: Template[];
  /** Minimum spacing between pieces, between a piece and a defect, and between a piece and the edge. >= 0 */
  spacing: number;
  seed?: number;
  /** Search budget in ms (default 4000). */
  timeLimitMs?: number;
}

export interface Placement {
  templateId: string;
  /** Instance index 0..qty-1 of that template. */
  instance: number;
  /** Degrees. Must be one of template.rotations. */
  rotation: number;
  /** Final polygon in canvas coordinates. */
  polygon: Ring;
}

export interface Metrics {
  totalArea: number;
  excludedArea: number; // union of defects ∩ material, no double counting
  usableArea: number;
  occupiedArea: number;
  usableUtilization: number; // % occupied / usable
  materialUtilization: number; // % occupied / total
  requested: Record<string, number>;
  placed: Record<string, number>;
  pending: Record<string, number>;
  placedCount: number;
  requestedCount: number;
}

export interface Solution {
  placements: Placement[];
  metrics: Metrics;
  elapsedMs: number;
  optimizerVersion: string;
  seed: number;
}

export interface Violation {
  code:
    | 'OUT_OF_BOUNDS' | 'OVERLAP' | 'DEFECT_INVADED' | 'SPACING' | 'BAD_ROTATION'
    | 'UNKNOWN_TEMPLATE' | 'QTY_EXCEEDED' | 'DEGENERATE' | 'SHAPE_MISMATCH';
  message: string;
  placementIndex?: number;
  otherIndex?: number;
}

export interface VerifyResult {
  valid: boolean;
  violations: Violation[];
}

/** sam = live SAM inference · example = precomputed mask of the example · local = local contrast (not Meta AI) */
export type ContourSource = 'sam' | 'example' | 'local' | 'manual' | 'leftover';
