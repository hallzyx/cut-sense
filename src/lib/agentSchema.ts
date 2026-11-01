/**
 * Design agent contract (Muse Spark): the answer schema and its validation.
 * Used on the server (to request structured output and validate it) and on the client.
 * Nothing the model returns is accepted without going through validateTurn.
 */
export const AGENT_NAME = 'Hilo';
export const AGENT_ROLE = 'your pattern-making master';

export const PIECE_KINDS = ['rect', 'rrect', 'circle', 'trapezoid', 'irregular'] as const;
export type AgentPieceKind = (typeof PIECE_KINDS)[number];

export interface AgentPiece {
  name: string;
  kind: AgentPieceKind;
  width_cm: number;
  height_cm: number;
  qty_per_set: number;
  rotations: number[];
  notes: string;
}
export interface AgentProposal { name: string; pieces: AgentPiece[]; assumptions: string[] }
/** question: one single question · proposal: proposed pieces · redirect: the request is out of scope. */
export type AgentTurnType = 'question' | 'proposal' | 'redirect';
export interface AgentTurn { type: AgentTurnType; message: string; quick_replies: string[]; proposal: AgentProposal }

export const LIMITS = { maxPieces: 6, minCm: 0.3, maxCm: 120, maxQty: 50, maxMessage: 2000, maxReplies: 4, maxReplyChars: 40 };

/** JSON Schema (Meta's strict subset: closed objects, everything required, no oneOf/allOf). */
export const TURN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'message', 'quick_replies', 'proposal'],
  properties: {
    type: { type: 'string', enum: ['question', 'proposal', 'redirect'] },
    message: { type: 'string' },
    quick_replies: { type: 'array', items: { type: 'string' } },
    proposal: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'pieces', 'assumptions'],
      properties: {
        name: { type: 'string' },
        assumptions: { type: 'array', items: { type: 'string' } },
        pieces: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'kind', 'width_cm', 'height_cm', 'qty_per_set', 'rotations', 'notes'],
            properties: {
              name: { type: 'string' },
              kind: { type: 'string', enum: [...PIECE_KINDS] },
              width_cm: { type: 'number' },
              height_cm: { type: 'number' },
              qty_per_set: { type: 'integer' },
              rotations: { type: 'array', items: { type: 'integer', enum: [0, 90, 180, 270] } },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

type Result = { ok: true; turn: AgentTurn } | { ok: false; error: string };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const round1 = (n: number) => Math.round(n * 10) / 10;
const countQuestions = (s: string) => (s.match(/\?/g) ?? []).length;

export function validateTurn(raw: unknown): Result {
  const bad = (error: string): Result => ({ ok: false, error });
  if (!isObj(raw)) return bad('the answer is not an object');
  if (raw.type !== 'question' && raw.type !== 'proposal' && raw.type !== 'redirect') return bad('type must be question, proposal or redirect');
  if (typeof raw.message !== 'string' || !raw.message.trim() || raw.message.length > LIMITS.maxMessage) return bad('message is empty or too long');
  if (raw.type === 'question' && countQuestions(raw.message) !== 1) return bad('a question (type question) must contain exactly ONE question; the others go in later turns');
  if (raw.type === 'redirect' && countQuestions(raw.message) > 1) return bad('a redirect must not ask more than one question');

  if (!Array.isArray(raw.quick_replies) || raw.quick_replies.length > LIMITS.maxReplies) return bad(`quick_replies: at most ${LIMITS.maxReplies}`);
  const replies: string[] = [];
  for (const r of raw.quick_replies as unknown[]) {
    if (typeof r !== 'string' || !r.trim() || r.trim().length > LIMITS.maxReplyChars) return bad(`quick_replies: each option must have 1–${LIMITS.maxReplyChars} characters`);
    if (!replies.includes(r.trim())) replies.push(r.trim());
  }

  if (!isObj(raw.proposal)) return bad('proposal is missing');
  const pr = raw.proposal;
  if (typeof pr.name !== 'string' || pr.name.length > 80) return bad('proposal.name');
  if (!Array.isArray(pr.assumptions) || pr.assumptions.length > 10 || pr.assumptions.some((a) => typeof a !== 'string' || a.length > 400)) return bad('proposal.assumptions');
  if (!Array.isArray(pr.pieces) || pr.pieces.length > LIMITS.maxPieces) return bad(`proposal.pieces: at most ${LIMITS.maxPieces} piece types`);

  const pieces: AgentPiece[] = [];
  for (const [i, p] of (pr.pieces as unknown[]).entries()) {
    if (!isObj(p)) return bad(`pieces[${i}]`);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) return bad(`pieces[${i}].name`);
    if (!PIECE_KINDS.includes(p.kind as AgentPieceKind)) return bad(`pieces[${i}].kind not supported`);
    for (const k of ['width_cm', 'height_cm'] as const) {
      const v = p[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < LIMITS.minCm || v > LIMITS.maxCm) return bad(`pieces[${i}].${k} out of range (${LIMITS.minCm}–${LIMITS.maxCm} cm)`);
    }
    if (!Number.isInteger(p.qty_per_set) || (p.qty_per_set as number) < 1 || (p.qty_per_set as number) > LIMITS.maxQty) return bad(`pieces[${i}].qty_per_set`);
    if (!Array.isArray(p.rotations) || !p.rotations.length || p.rotations.some((r) => ![0, 90, 180, 270].includes(r as number))) return bad(`pieces[${i}].rotations`);
    if (typeof p.notes !== 'string' || p.notes.length > 400) return bad(`pieces[${i}].notes`);
    pieces.push({
      name: p.name.trim(), kind: p.kind as AgentPieceKind, width_cm: round1(p.width_cm as number), height_cm: round1(p.height_cm as number),
      qty_per_set: p.qty_per_set as number, rotations: [...new Set(p.rotations as number[])].sort((a, b) => a - b), notes: p.notes,
    });
  }
  if (raw.type === 'proposal' && pieces.length === 0) return bad('a proposal needs at least one piece');
  if (raw.type === 'proposal' && !(pr.name as string).trim()) return bad('a proposal needs a name');

  return {
    ok: true,
    turn: {
      type: raw.type, message: raw.message.trim(), quick_replies: replies,
      proposal: raw.type === 'proposal' ? { name: (pr.name as string).trim(), pieces, assumptions: pr.assumptions as string[] } : { name: '', pieces: [], assumptions: [] },
    },
  };
}
