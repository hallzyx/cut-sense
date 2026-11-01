import { describe, expect, it } from 'vitest';
import { TURN_SCHEMA, validateTurn } from './agentSchema';

const piece = { name: 'Panel', kind: 'rrect', width_cm: 11.04, height_cm: 9, qty_per_set: 2, rotations: [180, 0, 0], notes: '' };
const proposal = (over: object = {}) => ({ type: 'proposal', message: 'Propuesta lista', proposal: { name: 'Billetera', pieces: [piece], assumptions: ['Sin margen de costura'] }, ...over });
const question = { type: 'question', message: '¿Con monedero?', proposal: { name: '', pieces: [], assumptions: [] } };
const withPieces = (pieces: unknown[], name = 'B') => proposal({ proposal: { name, pieces, assumptions: [] } });

describe('esquema del agente', () => {
  it('es un esquema estricto: objetos cerrados y todo requerido', () => {
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

  it('acepta una pregunta y normaliza la propuesta (redondeo, giros únicos y ordenados)', () => {
    expect(validateTurn(question)).toMatchObject({ ok: true, turn: { type: 'question' } });
    const v = validateTurn(proposal());
    expect(v.ok && v.turn.proposal.pieces[0]).toMatchObject({ width_cm: 11, rotations: [0, 180] });
  });

  it('una pregunta nunca arrastra piezas', () => {
    const v = validateTurn({ ...question, proposal: { name: 'x', pieces: [piece], assumptions: ['a'] } });
    expect(v.ok && v.turn.proposal).toEqual({ name: '', pieces: [], assumptions: [] });
  });

  it('rechaza lo que no cumple: tipos, rangos, formas y límites', () => {
    const bad = (turn: unknown, re: RegExp) => {
      const v = validateTurn(turn);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error).toMatch(re);
    };
    bad(null, /objeto/);
    bad({ ...question, type: 'otro' }, /type/);
    bad({ ...question, message: '  ' }, /message/);
    bad(withPieces([]), /al menos una pieza/);
    bad(withPieces([piece], ''), /nombre/);
    bad(withPieces([{ ...piece, kind: 'poligono' }]), /kind/);
    bad(withPieces([{ ...piece, width_cm: 0 }]), /width_cm/);
    bad(withPieces([{ ...piece, height_cm: 5000 }]), /height_cm/);
    bad(withPieces([{ ...piece, width_cm: 'diez' }]), /width_cm/);
    bad(withPieces([{ ...piece, qty_per_set: 2.5 }]), /qty/);
    bad(withPieces([{ ...piece, qty_per_set: 0 }]), /qty/);
    bad(withPieces([{ ...piece, rotations: [45] }]), /rotations/);
    bad(withPieces([{ ...piece, rotations: [] }]), /rotations/);
    bad(withPieces(Array(7).fill(piece)), /máximo/);
  });
});
