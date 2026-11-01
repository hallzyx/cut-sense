import type { AgentPiece } from '../agentSchema';
import { PIECE_KINDS, LIMITS } from '../agentSchema';
import { buildShape } from '../../engine/templates';

/** Piece helpers shared by the validator, the macros and the viewer. */

/** Lowercase, no accents, single spaces: piece names are matched loosely ("Card pocket" == "card pocket "). */
export function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface PieceRef { piece: AgentPiece; index: number }

export function findPiece(pieces: AgentPiece[], name: string): PieceRef | null {
  const n = normName(name);
  const index = pieces.findIndex((p) => normName(p.name) === n);
  return index < 0 ? null : { piece: pieces[index], index };
}

/** Defensive copy of the pieces: the preview never trusts its input more than the agent's validator does. */
export function sanitizePieces(raw: unknown): { pieces: AgentPiece[]; error?: string } {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > LIMITS.maxPieces) return { pieces: [], error: `between 1 and ${LIMITS.maxPieces} pieces expected` };
  const out: AgentPiece[] = [];
  const seen = new Set<string>();
  for (const [i, p] of raw.entries()) {
    if (typeof p !== 'object' || p === null) return { pieces: [], error: `piece ${i} is invalid` };
    const r = p as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 60) : '';
    const w = Number(r.width_cm), h = Number(r.height_cm), q = Number(r.qty_per_set);
    if (!name || seen.has(normName(name))) return { pieces: [], error: `piece ${i}: empty or repeated name` };
    if (!PIECE_KINDS.includes(r.kind as AgentPiece['kind'])) return { pieces: [], error: `piece ${i}: shape not supported` };
    if (!(w >= LIMITS.minCm && w <= LIMITS.maxCm && h >= LIMITS.minCm && h <= LIMITS.maxCm)) return { pieces: [], error: `piece ${i}: measurements out of range` };
    if (!Number.isInteger(q) || q < 1 || q > LIMITS.maxQty) return { pieces: [], error: `piece ${i}: quantity out of range` };
    seen.add(normName(name));
    out.push({
      name, kind: r.kind as AgentPiece['kind'], width_cm: w, height_cm: h, qty_per_set: q,
      rotations: Array.isArray(r.rotations) ? (r.rotations as number[]).filter((x) => [0, 90, 180, 270].includes(x)) : [0],
      notes: typeof r.notes === 'string' ? r.notes.slice(0, 400) : '',
    });
  }
  return { pieces: out };
}

/** Piece outline in the panel's local frame: centred, +v up (the engine's shapes are y-down from the top-left). */
export function pieceOutline(p: Pick<AgentPiece, 'kind' | 'width_cm' | 'height_cm'>): [number, number][] {
  const w = p.width_cm, h = p.height_cm;
  const ring = buildShape(p.kind, w, h);
  const pts = ring.map(([x, y]) => [x - w / 2, h / 2 - y] as [number, number]);
  // Keep counter-clockwise winding so outward normals are consistent.
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  return area < 0 ? pts.reverse() : pts;
}

export function totalInstances(pieces: AgentPiece[]): number {
  return pieces.reduce((s, p) => s + p.qty_per_set, 0);
}

/** Typical thickness (mm) when the scene does not say, by material. */
export const DEFAULT_THICKNESS: Record<string, number> = { leather: 1.6, felt: 3, fabric: 0.8, cardboard: 1.5, foam: 4 };
