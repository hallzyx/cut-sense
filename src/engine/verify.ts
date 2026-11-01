/**
 * INDEPENDENT verifier for cut plans.
 *
 * It does not reuse the optimizer's placement code: containment, defect invasion and overlap are
 * decided here by the AREA of boolean operations (polygon-clipping), and spacing by the exact
 * segment-to-segment distance between outlines. The optimizer, by contrast, decides by
 * point-in-polygon + margin distances and never calls polygon-clipping per candidate.
 *
 * Tolerances (S = longest side of the material bbox, minimum 1):
 * - lengths: lenEps = LEN_EPS_REL·S (1e-9·S). Spacing is valid if dist >= spacing − lenEps.
 * - areas: areaEps = AREA_EPS_REL·S² (1e-8·S²). Overlap/invasion/out-of-bounds if area > areaEps.
 * - shape: every vertex must match the template rotated+translated to within
 *   SHAPE_EPS_REL·max(w, h, 1) (1e-6 relative).
 * - rotation: belongs to template.rotations modulo 360 with a tolerance of 1e-9 degrees.
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

/** Is `poly` `shape` rotated by `rot` degrees and translated? Allows a cyclic shift of the starting index. */
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

/** Area of a boolean operation; if the library fails it returns +Infinity (conservative ⇒ violation). */
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
      violations.push({ code: 'UNKNOWN_TEMPLATE', message: `Unknown template "${pl.templateId}"`, placementIndex: i });
    } else {
      if (!Number.isInteger(pl.instance) || pl.instance < 0 || pl.instance >= t.qty) {
        violations.push({ code: 'QTY_EXCEEDED', message: `Instance ${pl.instance} outside 0..${t.qty - 1} for "${t.id}"`, placementIndex: i });
      }
      const key = `${pl.templateId}#${pl.instance}`;
      if (seen.has(key)) {
        violations.push({ code: 'QTY_EXCEEDED', message: `Duplicate instance ${key}`, placementIndex: i });
      }
      seen.add(key);
      if (!rotationAllowed(pl.rotation, t.rotations)) {
        violations.push({ code: 'BAD_ROTATION', message: `Rotation ${pl.rotation}° not allowed for "${t.id}" (${t.rotations.join(', ')})`, placementIndex: i });
      }
    }

    const poly = Array.isArray(pl.polygon) ? pl.polygon : [];
    const finite = poly.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (poly.length < 3 || !finite || Math.abs(signedArea(poly)) <= areaEps || !isSimple(poly)) {
      violations.push({ code: 'DEGENERATE', message: 'Degenerate polygon or self-intersections', placementIndex: i });
      return;
    }
    if (t) {
      const tol = SHAPE_EPS_REL * Math.max(t.w, t.h, 1);
      if (!shapeMatches(t.shape, pl.rotation, poly, tol)) {
        violations.push({ code: 'SHAPE_MISMATCH', message: `Shape does not match "${t.id}" rotated ${pl.rotation}°`, placementIndex: i });
      }
    }

    // inside the material + spacing to the edge
    const outside = safeArea(() => difference(poly, material));
    if (outside > areaEps) {
      violations.push({ code: 'OUT_OF_BOUNDS', message: `The piece extends outside the material (outside area ≈ ${fmt(outside)})`, placementIndex: i });
    } else if (spacing > 0) {
      const d = boundaryDistance(poly, material);
      if (d < spacing - lenEps) {
        violations.push({ code: 'SPACING', message: `Spacing to edge ${fmt(d)} < ${spacing}`, placementIndex: i });
      }
    }

    // defects (union, no double counting)
    const bb = bbox(poly);
    if (defectBox && bboxGap(bb, defectBox) < spacing + lenEps) {
      const inv = defectUnionOk
        ? safeArea(() => intersection(poly, defectUnion))
        : Math.max(...defects.map((d) => safeArea(() => intersection(poly, d))));
      if (inv > areaEps) {
        violations.push({ code: 'DEFECT_INVADED', message: `The piece invades a defect (area ≈ ${fmt(inv)})`, placementIndex: i });
      } else if (spacing > 0) {
        const d = Math.min(...defectRings.map((r) => boundaryDistance(poly, r)));
        if (d < spacing - lenEps) {
          violations.push({ code: 'SPACING', message: `Spacing to defect ${fmt(d)} < ${spacing}`, placementIndex: i });
        }
      }
    }
    good.push({ i, poly, bb });
  });

  // piece pairs
  for (let a = 0; a < good.length; a++) {
    for (let b = a + 1; b < good.length; b++) {
      const A = good[a], B = good[b];
      if (bboxGap(A.bb, B.bb) >= spacing + lenEps && bboxGap(A.bb, B.bb) > 0) continue;
      const ov = safeArea(() => intersection(A.poly, B.poly));
      if (ov > areaEps) {
        violations.push({ code: 'OVERLAP', message: `Pieces ${A.i} and ${B.i} overlap (area ≈ ${fmt(ov)})`, placementIndex: B.i, otherIndex: A.i });
      } else if (spacing > 0) {
        const d = boundaryDistance(A.poly, B.poly);
        if (d < spacing - lenEps) {
          violations.push({ code: 'SPACING', message: `Spacing between pieces ${A.i} and ${B.i}: ${fmt(d)} < ${spacing}`, placementIndex: B.i, otherIndex: A.i });
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

function fmt(x: number): string {
  return Number.isFinite(x) ? (Math.round(x * 1000) / 1000).toString() : '∞';
}
