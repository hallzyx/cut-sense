/**
 * Verificador INDEPENDIENTE de planes de corte.
 *
 * No reutiliza el código de colocación del optimizador: aquí la contención, la invasión de
 * defectos y el solape se deciden por ÁREA de operaciones booleanas (polygon-clipping), y la
 * separación por distancia exacta segmento-segmento entre contornos. El optimizador, en cambio,
 * decide por punto-en-polígono + distancias con margen y nunca llama a polygon-clipping por candidato.
 *
 * Tolerancias (S = lado mayor del bbox del material, mínimo 1):
 * - longitudes: lenEps = LEN_EPS_REL·S (1e-9·S). Separación válida si dist >= spacing − lenEps.
 * - áreas: areaEps = AREA_EPS_REL·S² (1e-8·S²). Solape/invasión/salida si el área > areaEps.
 * - forma: cada vértice debe coincidir con la plantilla rotada+trasladada a menos de
 *   SHAPE_EPS_REL·max(w, h, 1) (1e-6 relativo).
 * - rotación: pertenece a template.rotations módulo 360 con tolerancia 1e-9 grados.
 */
import type { Placement, Problem, Ring, Template, Violation, VerifyResult } from '../types';
import {
  AREA_EPS_REL, LEN_EPS_REL, SHAPE_EPS_REL, type BBox, type MultiPolygon,
  bbox, boundaryDistance, dedupeRing, difference, intersection, isSimple, multiArea, multiRings,
  rotateRing, scaleOf, signedArea, union,
} from './geometry';

export interface VerifyTolerances { lenEps: number; areaEps: number; scale: number }

export function verifyTolerances(problem: Problem): VerifyTolerances {
  const scale = scaleOf(problem.material);
  return { scale, lenEps: LEN_EPS_REL * scale, areaEps: AREA_EPS_REL * scale * scale };
}

function rotationAllowed(rot: number, allowed: number[]): boolean {
  if (!Number.isFinite(rot)) return false;
  const r = ((rot % 360) + 360) % 360;
  return allowed.some((a) => {
    const b = ((a % 360) + 360) % 360;
    const d = Math.abs(r - b);
    return Math.min(d, 360 - d) <= 1e-9;
  });
}

/** ¿`poly` es `shape` rotada `rot` grados y trasladada? Admite desplazamiento cíclico del índice inicial. */
export function shapeMatches(shape: Ring, rot: number, poly: Ring, tol: number): boolean {
  const ref = rotateRing(dedupeRing(shape), rot, [0, 0]);
  const n = ref.length;
  if (n !== poly.length || n < 3) return false;
  for (let k = 0; k < n; k++) {
    const tx = poly[k][0] - ref[0][0], ty = poly[k][1] - ref[0][1];
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const p = poly[(i + k) % n];
      if (Math.abs(p[0] - ref[i][0] - tx) > tol || Math.abs(p[1] - ref[i][1] - ty) > tol) ok = false;
    }
    if (ok) return true;
  }
  return false;
}

function bboxGap(a: BBox, b: BBox): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

/** Área de una operación booleana; si la librería falla devuelve +Infinity (conservador ⇒ violación). */
function safeArea(f: () => MultiPolygon): number {
  try { return multiArea(f()); } catch { return Infinity; }
}

export function verifySolution(problem: Problem, placements: Placement[]): VerifyResult {
  const violations: Violation[] = [];
  const { lenEps, areaEps } = verifyTolerances(problem);
  const spacing = Math.max(0, problem.spacing || 0);
  const material = dedupeRing(problem.material);
  const templates = new Map<string, Template>(problem.templates.map((t) => [t.id, t]));

  let defectUnion: MultiPolygon = [];
  const defects = problem.defects.map((d) => dedupeRing(d)).filter((d) => d.length >= 3);
  let defectRings: Ring[] = [];
  let defectUnionOk = true;
  if (defects.length) {
    try {
      defectUnion = union(...defects);
      defectRings = multiRings(defectUnion);
    } catch {
      defectUnionOk = false;
      defectRings = defects;
    }
  }
  const defectBox = defectRings.length ? bbox(defectRings) : null;

  const seen = new Set<string>();
  const good: { i: number; poly: Ring; bb: BBox }[] = [];

  placements.forEach((pl, i) => {
    const t = templates.get(pl.templateId);
    if (!t) {
      violations.push({ code: 'UNKNOWN_TEMPLATE', message: `Plantilla desconocida "${pl.templateId}"`, placementIndex: i });
    } else {
      if (!Number.isInteger(pl.instance) || pl.instance < 0 || pl.instance >= t.qty) {
        violations.push({ code: 'QTY_EXCEEDED', message: `Instancia ${pl.instance} fuera de 0..${t.qty - 1} para "${t.id}"`, placementIndex: i });
      }
      const key = `${pl.templateId}#${pl.instance}`;
      if (seen.has(key)) {
        violations.push({ code: 'QTY_EXCEEDED', message: `Instancia duplicada ${key}`, placementIndex: i });
      }
      seen.add(key);
      if (!rotationAllowed(pl.rotation, t.rotations)) {
        violations.push({ code: 'BAD_ROTATION', message: `Rotación ${pl.rotation}° no permitida para "${t.id}" (${t.rotations.join(', ')})`, placementIndex: i });
      }
    }

    const poly = Array.isArray(pl.polygon) ? pl.polygon : [];
    const finite = poly.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (poly.length < 3 || !finite || Math.abs(signedArea(poly)) <= areaEps || !isSimple(poly)) {
      violations.push({ code: 'DEGENERATE', message: 'Polígono degenerado o con autointersecciones', placementIndex: i });
      return;
    }
    if (t) {
      const tol = SHAPE_EPS_REL * Math.max(t.w, t.h, 1);
      if (!shapeMatches(t.shape, pl.rotation, poly, tol)) {
        violations.push({ code: 'SHAPE_MISMATCH', message: `La forma no coincide con "${t.id}" rotada ${pl.rotation}°`, placementIndex: i });
      }
    }

    // dentro del material + separación al borde
    const outside = safeArea(() => difference(poly, material));
    if (outside > areaEps) {
      violations.push({ code: 'OUT_OF_BOUNDS', message: `La pieza sale del material (área fuera ≈ ${fmt(outside)})`, placementIndex: i });
    } else if (spacing > 0) {
      const d = boundaryDistance(poly, material);
      if (d < spacing - lenEps) {
        violations.push({ code: 'SPACING', message: `Separación al borde ${fmt(d)} < ${spacing}`, placementIndex: i });
      }
    }

    // defectos (unión, sin doble conteo)
    const bb = bbox(poly);
    if (defectBox && bboxGap(bb, defectBox) < spacing + lenEps) {
      const inv = defectUnionOk
        ? safeArea(() => intersection(poly, defectUnion))
        : Math.max(...defects.map((d) => safeArea(() => intersection(poly, d))));
      if (inv > areaEps) {
        violations.push({ code: 'DEFECT_INVADED', message: `La pieza invade un defecto (área ≈ ${fmt(inv)})`, placementIndex: i });
      } else if (spacing > 0) {
        const d = Math.min(...defectRings.map((r) => boundaryDistance(poly, r)));
        if (d < spacing - lenEps) {
          violations.push({ code: 'SPACING', message: `Separación a defecto ${fmt(d)} < ${spacing}`, placementIndex: i });
        }
      }
    }
    good.push({ i, poly, bb });
  });

  // pares de piezas
  for (let a = 0; a < good.length; a++) {
    for (let b = a + 1; b < good.length; b++) {
      const A = good[a], B = good[b];
      if (bboxGap(A.bb, B.bb) >= spacing + lenEps && bboxGap(A.bb, B.bb) > 0) continue;
      const ov = safeArea(() => intersection(A.poly, B.poly));
      if (ov > areaEps) {
        violations.push({ code: 'OVERLAP', message: `Las piezas ${A.i} y ${B.i} se solapan (área ≈ ${fmt(ov)})`, placementIndex: B.i, otherIndex: A.i });
      } else if (spacing > 0) {
        const d = boundaryDistance(A.poly, B.poly);
        if (d < spacing - lenEps) {
          violations.push({ code: 'SPACING', message: `Separación entre piezas ${A.i} y ${B.i}: ${fmt(d)} < ${spacing}`, placementIndex: B.i, otherIndex: A.i });
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

function fmt(x: number): string {
  return Number.isFinite(x) ? (Math.round(x * 1000) / 1000).toString() : '∞';
}
