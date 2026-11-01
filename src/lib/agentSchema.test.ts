import { describe, expect, it } from 'vitest';
import { TURN_SCHEMA, validateTurn } from './agentSchema';

const piece = { name: 'Panel', kind: 'rrect', width_cm: 11.04, height_cm: 9, qty_per_set: 2, rotations: [180, 0, 0], notes: '' };
const proposal = (over: object = {}) => ({ type: 'proposal', message: 'Propuesta lista', quick_replies: [], proposal: { name: 'Billetera', pieces: [piece], assumptions: ['Sin margen de costura'] }, ...over });
const question = { type: 'question', message: 'Entendido. ¿Con monedero?', quick_replies: ['Sí', 'No'], proposal: { name: '', pieces: [], assumptions: [] } };
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
    expect(validateTurn(question)).toMatchObject({ ok: true, turn: { type: 'question', quick_replies: ['Sí', 'No'] } });
    const v = validateTurn(proposal());
    expect(v.ok && v.turn.proposal.pieces[0]).toMatchObject({ width_cm: 11, rotations: [0, 180] });
  });

  it('una pregunta nunca arrastra piezas', () => {
    const v = validateTurn({ ...question, proposal: { name: 'x', pieces: [piece], assumptions: ['a'] } });
    expect(v.ok && v.turn.proposal).toEqual({ name: '', pieces: [], assumptions: [] });
  });

  it('exige UNA sola pregunta por turno', () => {
    const q = (message: string) => validateTurn({ ...question, message });
    expect(q('¿Con monedero?').ok).toBe(true);
    for (const m of ['¿Con monedero? ¿Y con solapa?', 'Sin signo de pregunta', '¿Tipo? ¿Medidas? ¿Costura?']) {
      const v = q(m);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error).toMatch(/UNA pregunta/);
    }
  });

  it('acepta un redirect (fuera de alcance) con a lo sumo una pregunta y sin piezas', () => {
    const r = validateTurn({ type: 'redirect', message: 'Eso no puedo hacerlo. ¿Quieres diseñar un objeto?', quick_replies: ['Una billetera'], proposal: { name: '', pieces: [], assumptions: [] } });
    expect(r).toMatchObject({ ok: true, turn: { type: 'redirect' } });
    expect(validateTurn({ type: 'redirect', message: '¿A? ¿B?', quick_replies: [], proposal: { name: '', pieces: [], assumptions: [] } }).ok).toBe(false);
  });

  it('valida y normaliza las respuestas rápidas', () => {
    const qr = (quick_replies: unknown) => validateTurn({ ...question, quick_replies });
    const ok = qr(['  Bifold ', 'Bifold', 'Simple']);
    expect(ok.ok && ok.turn.quick_replies).toEqual(['Bifold', 'Simple']);
    expect(qr(['a', 'b', 'c', 'd', 'e']).ok).toBe(false);
    expect(qr(['x'.repeat(41)]).ok).toBe(false);
    expect(qr(['']).ok).toBe(false);
    expect(qr([1]).ok).toBe(false);
    expect(qr('Sí').ok).toBe(false);
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
    bad({ type: 'question', message: '¿A?', proposal: question.proposal }, /quick_replies/);
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
