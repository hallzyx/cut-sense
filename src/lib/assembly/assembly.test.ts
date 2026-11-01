import { describe, expect, it } from 'vitest';
import { blankNode, CRITIQUE_SCHEMA, SCENE_SCHEMA, type SceneSpec } from './dsl';
import { describeRig } from './describe';
import { fallbackScene, guessFamily } from './fallback';
import { PRODUCT_FIXTURES } from './fixtures';
import { buildRig, pose, samplePanels } from './kinematics';
import { guessRole } from './macros';
import { sanityCheck } from './sanity';
import { parseScene, resolveScene, validateScene } from './validate';
import type { AgentPiece } from '../agentSchema';

const fixture = (key: string) => PRODUCT_FIXTURES.find((f) => f.key === key)!;
function build(spec: SceneSpec, pieces: AgentPiece[]) {
  const r = resolveScene(spec, pieces);
  if (!r.ok) throw new Error(r.error);
  return { rig: buildRig(r.scene, pieces, r.unused), resolved: r };
}
function bbox(points: number[][]) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { lo, hi, size: hi.map((h, k) => h - lo[k]) };
}
const allPts = (rig: ReturnType<typeof buildRig>, t: number) => samplePanels(pose(rig, t)).flatMap((s) => s.pts);
const panel = (w: number, h: number, name = 'P', qty = 1): AgentPiece => ({ name, kind: 'rect', width_cm: w, height_cm: h, qty_per_set: qty, rotations: [0], notes: '' });
const base = (nodes: SceneSpec['nodes'], extra: Partial<SceneSpec> = {}): SceneSpec => ({
  category: 'other', label: 'x', description: '', material: { kind: 'leather', color: 'tan', thickness_mm: 2 },
  macro: { type: 'none', roles: [], closure: 'none', fold_angle_deg: 0 }, nodes, camera: { azimuth_deg: 30, elevation_deg: 30 }, assembly_notes: [], ...extra,
});

describe('esquema de escena (subconjunto estricto)', () => {
  it('objetos cerrados, todas las claves requeridas, sin oneOf/allOf ni recursión, profundidad ≤ 10', () => {
    const walk = (s: any, depth: number): number => {
      expect(s.oneOf).toBeUndefined();
      expect(s.allOf).toBeUndefined();
      expect(s.$ref).toBeUndefined();
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort());
        return Math.max(depth, ...Object.values(s.properties).map((p) => walk(p, depth + 1)));
      }
      if (s.type === 'array') return walk(s.items, depth + 1);
      return depth;
    };
    expect(walk(SCENE_SCHEMA, 1)).toBeLessThanOrEqual(10);
    expect(walk(CRITIQUE_SCHEMA, 1)).toBeLessThanOrEqual(10);
  });
});

describe('validador', () => {
  const pieces = [panel(10, 6, 'Cuerpo'), panel(10, 3, 'Bolsillo', 2)];
  it('rechaza estructuras rotas y limita el tamaño', () => {
    expect(parseScene(null).ok).toBe(false);
    expect(parseScene({ nodes: 'x' }).ok).toBe(false);
    expect(parseScene({ ...base([]), nodes: Array.from({ length: 61 }, (_, i) => blankNode(`n${i}`)) }).ok).toBe(false);
    expect(parseScene(base([])).ok).toBe(false); // ni nodos ni macro
  });
  it('recorta valores fuera de rango con avisos', () => {
    const r = parseScene(base([blankNode('a', { piece: 'Cuerpo', hinge_angle_deg: 999, anchor_x: 5, folds: [{ axis: 'vertical', at: 2, angle_deg: 900, radius_mm: -1, moving: 'positive' }] })]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = r.scene.nodes[0];
    expect(n.hinge_angle_deg).toBe(180);
    expect(n.anchor_x).toBe(1);
    expect(n.folds[0]).toMatchObject({ at: 0.98, angle_deg: 360, radius_mm: 0 });
    expect(r.warnings.length).toBeGreaterThanOrEqual(4);
  });
  it('descarta piezas inventadas, instancias de más y duplicados; repara ciclos y raíces', () => {
    const r = validateScene(base([
      blankNode('root', { piece: 'cuerpo' }),
      blankNode('a', { piece: 'Bolsillo', instance: 0, parent: 'b', joint: 'stack' }),
      blankNode('b', { piece: 'Bolsillo', instance: 1, parent: 'a', joint: 'stack' }),
      blankNode('c', { piece: 'Bolsillo', instance: 1, parent: 'root', joint: 'stack' }),
      blankNode('d', { piece: 'Bolsillo', instance: 7, parent: 'root', joint: 'stack' }),
      blankNode('e', { piece: 'Asa gigante', parent: 'root', joint: 'stack' }),
      blankNode('f', { piece: 'Cuerpo', parent: '', joint: 'root' }),
    ]), pieces);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scene.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'root']);
    expect(r.scene.nodes[0].id).toBe('root');
    expect(r.scene.nodes.filter((n) => n.joint === 'root')).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/no existe/);
    expect(r.warnings.join(' ')).toMatch(/ciclo/);
    expect(r.unused).toEqual([]);
    // Parents always come before children.
    const seen = new Set<string>();
    for (const n of r.scene.nodes) { if (n.parent) expect(seen.has(n.parent)).toBe(true); seen.add(n.id); }
  });
});

describe('roles y familias', () => {
  it('reconoce los nombres habituales de piezas', () => {
    expect(guessRole('Bolsillo de tarjeta')).toBe('card_pocket');
    expect(guessRole('Bolsillo frontal')).toBe('pocket');
    expect(guessRole('Solapa')).toBe('flap');
    expect(guessRole('Lengüeta')).toBe('tab');
    expect(guessRole('Panel trasero')).toBe('back');
    expect(guessRole('Asa')).toBe('handle');
  });
  it('elige la macro por el nombre del producto', () => {
    expect(guessFamily('Una billetera de cuero', fixture('billetera').pieces).macro).toBe('bifold_wallet');
    expect(guessFamily('Funda para el móvil', fixture('celular').pieces).macro).toBe('flat_sleeve');
    expect(guessFamily('algo', [panel(10, 10, 'Posavasos', 6)]).macro).toBe('coaster_stack');
    expect(guessFamily('Estuche de gafas', [panel(8, 30, 'Cuerpo')]).macro).toBe('envelope_flap');
  });
});

describe('cinemática', () => {
  it('un pliegue de 180° cierra el panel por la mitad, con su espesor', () => {
    const { rig } = build(base([blankNode('r', { piece: 'P', folds: [{ axis: 'vertical', at: 0.5, angle_deg: 180, radius_mm: 0, moving: 'negative' }] })]), [panel(20, 10)]);
    const flat = bbox(allPts(rig, 0)), shut = bbox(allPts(rig, 1));
    expect(flat.size[0]).toBeGreaterThan(19);
    expect(shut.size[0]).toBeGreaterThan(9.3);
    expect(shut.size[0]).toBeLessThan(10.6);
    expect(shut.size[1]).toBeGreaterThan(0.15); // two layers stacked (mid-planes ~2 mm apart)
    expect(sanityCheck(rig).intersections).toBe(0);
  });
  it('una bisagra de 90° levanta la pared en vertical', () => {
    const { rig } = build(base([
      blankNode('b', { piece: 'Base' }),
      blankNode('w', { piece: 'Pared', parent: 'b', joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 90 }),
    ]), [panel(10, 10, 'Base'), panel(10, 5, 'Pared')]);
    const s = samplePanels(pose(rig, 1)).find((x) => rig.nodes[x.node].spec.id === 'w')!;
    const bb = bbox(s.pts);
    expect(bb.size[1]).toBeGreaterThan(4); // vertical extent ≈ wall height
    expect(bb.size[2]).toBeLessThan(0.3);
  });
  it('en el plano extendido (t=0) nada se superpone y todo está sobre la mesa', () => {
    for (const f of PRODUCT_FIXTURES) {
      const { rig } = build(fallbackScene(f.productName, f.pieces, f.assumptions), f.pieces);
      const ps = pose(rig, 0);
      const s = samplePanels(ps);
      const ys = s.flatMap((x) => x.pts.map((p) => p[1]));
      expect(Math.max(...ys) - Math.min(...ys), f.key).toBeLessThan(0.5);
      const boxes = s.map((x) => bbox(x.pts));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ox = Math.min(a.hi[0], b.hi[0]) - Math.max(a.lo[0], b.lo[0]);
        const oz = Math.min(a.hi[2], b.hi[2]) - Math.max(a.lo[2], b.lo[2]);
        expect(ox > 0.3 && oz > 0.3, `${f.key}: ${i} y ${j} se superponen en plano`).toBe(false);
      }
    }
  });
  it('el asa forma un arco con su longitud real', () => {
    const f = fixture('tote');
    const { rig } = build(fallbackScene(f.productName, f.pieces), f.pieces);
    const i = rig.nodes.findIndex((n) => n.spec.type === 'strap');
    const st = pose(rig, 1).strap(i, 80)!;
    let len = 0;
    for (let k = 1; k < st.pts.length; k++) len += Math.hypot(...st.pts[k].map((v, j) => v - st.pts[k - 1][j]) as [number, number, number]);
    expect(len).toBeCloseTo(40, 0);
  });
});

describe('macros y comprobaciones con los productos de ejemplo', () => {
  for (const f of PRODUCT_FIXTURES) {
    it(`${f.key}: se arma sin cruces y usa todas las piezas`, () => {
      const { rig } = build(fallbackScene(f.productName, f.pieces, f.assumptions), f.pieces);
      const s = sanityCheck(rig);
      expect(s.intersections, s.issues.join('\n')).toBe(0);
      expect(rig.loose, f.key).toEqual([]);
      expect(s.issues.filter((x) => /flotar/.test(x))).toEqual([]);
      const text = describeRig(rig, s);
      for (const p of f.pieces) expect(text).toContain(p.name);
    });
  }
  it('la billetera cerrada mide cerca de la mitad del exterior', () => {
    const f = fixture('billetera');
    const { rig } = build(fallbackScene(f.productName, f.pieces), f.pieces);
    const s = sanityCheck(rig);
    expect(s.size[0]).toBeGreaterThan(8);
    expect(s.size[0]).toBeLessThan(11.5);
    expect(s.size[1]).toBeLessThan(2.5);
  });
});
