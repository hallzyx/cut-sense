import { describe, expect, it } from 'vitest';
import { TURN_SCHEMA, validateTurn } from './agentSchema';

const piece = { name: 'Panel', kind: 'rrect', width_cm: 11.04, height_cm: 9, qty_per_set: 2, rotations: [180, 0, 0], notes: '' };
const proposal = (over: object = {}) => ({ type: 'proposal', message: 'Proposal ready', quick_replies: [], proposal: { name: 'Wallet', pieces: [piece], assumptions: ['No seam allowance'] }, ...over });
const question = { type: 'question', message: 'Got it. With a coin pocket?', quick_replies: ['Yes', 'No'], proposal: { name: '', pieces: [], assumptions: [] } };
const withPieces = (pieces: unknown[], name = 'B') => proposal({ proposal: { name, pieces, assumptions: [] } });

describe('agent schema', () => {
  it('is a strict schema: closed objects and everything required', () => {
    const walk = (s: any) => {
      if (s?.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect(new Set(s.required)).toEqual(new Set(Object.keys(s.properties)));
        Object.values(s.properties).forEach(walk);
      }
      if (s?.type === 'array') walk(s.items);
    };
    walk(TURN_SCHEMA);
  });

  it('accepts a question and normalizes the proposal (rounding, unique and sorted rotations)', () => {
    expect(validateTurn(question)).toMatchObject({ ok: true, turn: { type: 'question', quick_replies: ['Yes', 'No'] } });
    const v = validateTurn(proposal());
    expect(v.ok && v.turn.proposal.pieces[0]).toMatchObject({ width_cm: 11, rotations: [0, 180] });
  });

  it('a question never carries pieces', () => {
    const v = validateTurn({ ...question, proposal: { name: 'x', pieces: [piece], assumptions: ['a'] } });
    expect(v.ok && v.turn.proposal).toEqual({ name: '', pieces: [], assumptions: [] });
  });

  it('requires ONE single question per turn', () => {
    const q = (message: string) => validateTurn({ ...question, message });
    expect(q('With a coin pocket?').ok).toBe(true);
    expect(q('¿Con monedero?').ok).toBe(true);
    for (const m of ['With a coin pocket? And a flap?', 'No question mark', 'Type? Measurements? Stitching?']) {
      const v = q(m);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error).toMatch(/ONE question/);
    }
  });

  it('accepts a redirect (out of scope) with at most one question and no pieces', () => {
    const r = validateTurn({ type: 'redirect', message: 'I cannot do that. Would you like to design an object?', quick_replies: ['A wallet'], proposal: { name: '', pieces: [], assumptions: [] } });
    expect(r).toMatchObject({ ok: true, turn: { type: 'redirect' } });
    expect(validateTurn({ type: 'redirect', message: 'A? B?', quick_replies: [], proposal: { name: '', pieces: [], assumptions: [] } }).ok).toBe(false);
  });

  it('validates and normalizes the quick replies', () => {
    const qr = (quick_replies: unknown) => validateTurn({ ...question, quick_replies });
    const ok = qr(['  Bifold ', 'Bifold', 'Simple']);
    expect(ok.ok && ok.turn.quick_replies).toEqual(['Bifold', 'Simple']);
    expect(qr(['a', 'b', 'c', 'd', 'e']).ok).toBe(false);
    expect(qr(['x'.repeat(41)]).ok).toBe(false);
    expect(qr(['']).ok).toBe(false);
    expect(qr([1]).ok).toBe(false);
    expect(qr('Yes').ok).toBe(false);
  });

  it('rejects what does not comply: types, ranges, shapes and limits', () => {
    const bad = (turn: unknown, re: RegExp) => {
      const v = validateTurn(turn);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error).toMatch(re);
    };
    bad(null, /object/);
    bad({ ...question, type: 'otro' }, /type/);
    bad({ ...question, message: '  ' }, /message/);
    bad({ type: 'question', message: 'A?', proposal: question.proposal }, /quick_replies/);
    bad(withPieces([]), /at least one piece/);
    bad(withPieces([piece], ''), /name/);
    bad(withPieces([{ ...piece, kind: 'polygon' }]), /kind/);
    bad(withPieces([{ ...piece, width_cm: 0 }]), /width_cm/);
    bad(withPieces([{ ...piece, height_cm: 5000 }]), /height_cm/);
    bad(withPieces([{ ...piece, width_cm: 'ten' }]), /width_cm/);
    bad(withPieces([{ ...piece, qty_per_set: 2.5 }]), /qty/);
    bad(withPieces([{ ...piece, qty_per_set: 0 }]), /qty/);
    bad(withPieces([{ ...piece, rotations: [45] }]), /rotations/);
    bad(withPieces([{ ...piece, rotations: [] }]), /rotations/);
    bad(withPieces(Array(7).fill(piece)), /at most/);
  });
});
