/** Contrato compartido entre UI, servidor y motor geométrico. Unidades: píxeles de imagen (o unidades relativas). */
export type Pt = [number, number];
/** Anillo simple, sin repetir el primer punto al final, sin agujeros. */
export type Ring = Pt[];

export type TemplateKind = 'rect' | 'rrect' | 'circle' | 'trapezoid' | 'irregular';

export interface Template {
  id: string;
  name: string;
  color: string;
  kind: TemplateKind;
  /** Ancho y alto del bounding box, en unidades del lienzo. */
  w: number;
  h: number;
  qty: number;
  /** Rotaciones permitidas en grados (p. ej. [0, 180]). */
  rotations: number[];
  /** Forma base (ya dimensionada, bbox con esquina mínima en 0,0). */
  shape: Ring;
}

export interface Problem {
  /** Contorno exterior del material. */
  material: Ring;
  /** Zonas excluidas (pueden solaparse entre sí o salirse del material). */
  defects: Ring[];
  templates: Template[];
  /** Separación mínima entre piezas, entre pieza y defecto y entre pieza y borde. >= 0 */
  spacing: number;
  seed?: number;
  /** Presupuesto de búsqueda en ms (por defecto 4000). */
  timeLimitMs?: number;
}

export interface Placement {
  templateId: string;
  /** Índice de instancia 0..qty-1 de esa plantilla. */
  instance: number;
  /** Grados. Debe pertenecer a template.rotations. */
  rotation: number;
  /** Polígono final en coordenadas del lienzo. */
  polygon: Ring;
}

export interface Metrics {
  totalArea: number;
  excludedArea: number; // unión de defectos ∩ material, sin doble conteo
  usableArea: number;
  occupiedArea: number;
  usableUtilization: number; // % ocupada / utilizable
  materialUtilization: number; // % ocupada / total
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

/** sam = inferencia SAM en vivo · example = máscara precalculada del ejemplo · local = contraste local (no es Meta AI) */
export type ContourSource = 'sam' | 'example' | 'local' | 'manual';
