import { describe, expect, it } from 'vitest';
import { ALIGN_SCHEMA, blankNode, CRITIQUE_SCHEMA, SCENE_SCHEMA, type SceneSpec } from './dsl';
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

describe('scene schema (strict subset)', () => {
  it('closed objects, every key required, no oneOf/allOf or recursion, depth ≤ 10', () => {
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
    expect(walk(ALIGN_SCHEMA, 1)).toBeLessThanOrEqual(10);
  });
});

describe('validator', () => {
  const pieces = [panel(10, 6, 'Body'), panel(10, 3, 'Pocket', 2)];
  it('rejects broken structures and limits the size', () => {
    expect(parseScene(null).ok).toBe(false);
    expect(parseScene({ nodes: 'x' }).ok).toBe(false);
    expect(parseScene({ ...base([]), nodes: Array.from({ length: 61 }, (_, i) => blankNode(`n${i}`)) }).ok).toBe(false);
    expect(parseScene(base([])).ok).toBe(false); // neither nodes nor a macro
  });
  it('clamps out-of-range values with warnings', () => {
    const r = parseScene(base([blankNode('a', { piece: 'Body', hinge_angle_deg: 999, anchor_x: 5, folds: [{ axis: 'vertical', at: 2, angle_deg: 900, radius_mm: -1, moving: 'positive' }] })]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = r.scene.nodes[0];
    expect(n.hinge_angle_deg).toBe(180);
    expect(n.anchor_x).toBe(1);
    expect(n.folds[0]).toMatchObject({ at: 0.98, angle_deg: 360, radius_mm: 0 });
    expect(r.warnings.length).toBeGreaterThanOrEqual(4);
  });
  it('drops made-up pieces, extra instances and duplicates; repairs cycles and roots', () => {
    const r = validateScene(base([
      blankNode('root', { piece: 'body' }),
      blankNode('a', { piece: 'Pocket', instance: 0, parent: 'b', joint: 'stack' }),
      blankNode('b', { piece: 'Pocket', instance: 1, parent: 'a', joint: 'stack' }),
      blankNode('c', { piece: 'Pocket', instance: 1, parent: 'root', joint: 'stack' }),
      blankNode('d', { piece: 'Pocket', instance: 7, parent: 'root', joint: 'stack' }),
      blankNode('e', { piece: 'Giant handle', parent: 'root', joint: 'stack' }),
      blankNode('f', { piece: 'Body', parent: '', joint: 'root' }),
    ]), pieces);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scene.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'root']);
    expect(r.scene.nodes[0].id).toBe('root');
    expect(r.scene.nodes.filter((n) => n.joint === 'root')).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/does not exist/);
    expect(r.warnings.join(' ')).toMatch(/cycle/);
    expect(r.unused).toEqual([]);
    // Parents always come before children.
    const seen = new Set<string>();
    for (const n of r.scene.nodes) { if (n.parent) expect(seen.has(n.parent)).toBe(true); seen.add(n.id); }
  });
});

describe('roles and families', () => {
  it('recognizes the usual piece names, in Spanish and in English', () => {
    expect(guessRole('Bolsillo de tarjeta')).toBe('card_pocket');
    expect(guessRole('Bolsillo frontal')).toBe('pocket');
    expect(guessRole('Solapa')).toBe('flap');
    expect(guessRole('Lengüeta')).toBe('tab');
    expect(guessRole('Panel trasero')).toBe('back');
    expect(guessRole('Asa')).toBe('handle');
    expect(guessRole('Card pocket')).toBe('card_pocket');
    expect(guessRole('Bill pocket')).toBe('bill_pocket');
    expect(guessRole('Coin pocket')).toBe('coin_pocket');
    expect(guessRole('Front pocket')).toBe('pocket');
    expect(guessRole('Exterior')).toBe('body');
    expect(guessRole('Flap')).toBe('flap');
    expect(guessRole('Tab')).toBe('tab');
    expect(guessRole('Zip pull')).toBe('tab');
    expect(guessRole('Back panel')).toBe('back');
    expect(guessRole('Front')).toBe('front');
    expect(guessRole('Handle')).toBe('handle');
    expect(guessRole('Strap')).toBe('handle');
    expect(guessRole('Base')).toBe('base');
    expect(guessRole('Long side')).toBe('wall');
    expect(guessRole('Wall')).toBe('wall');
    expect(guessRole('Lid')).toBe('lid');
    expect(guessRole('Lining')).toBe('lining');
    expect(guessRole('Coaster')).toBe('item');
    expect(guessRole('Keychain strip')).toBe('item');
  });
  it('picks the macro from the product name', () => {
    expect(guessFamily('Una billetera de cuero', fixture('billetera').pieces).macro).toBe('bifold_wallet');
    expect(guessFamily('Funda para el móvil', fixture('celular').pieces).macro).toBe('flat_sleeve');
    expect(guessFamily('algo', [panel(10, 10, 'Posavasos', 6)]).macro).toBe('coaster_stack');
    expect(guessFamily('Estuche de gafas', [panel(8, 30, 'Cuerpo')]).macro).toBe('envelope_flap');
    expect(guessFamily('Leather bifold wallet', fixture('billetera').pieces).macro).toBe('bifold_wallet');
    expect(guessFamily('Leather cardholder', fixture('tarjetero').pieces).macro).toBe('cardholder');
    expect(guessFamily('Phone case', fixture('celular').pieces).macro).toBe('flat_sleeve');
    expect(guessFamily('Small tote', fixture('tote').pieces).macro).toBe('tote');
    expect(guessFamily('Leather keychain', fixture('llavero').pieces).macro).toBe('keychain_loop');
    expect(guessFamily('Felt coasters', [panel(10, 10, 'Coaster', 6)]).macro).toBe('coaster_stack');
    expect(guessFamily('Pencil case', fixture('neceser').pieces).macro).toBe('zip_pouch');
    expect(guessFamily('Cardboard box', fixture('caja').pieces).macro).toBe('box_with_lid');
    expect(guessFamily('something', [panel(10, 10, 'Coaster', 6)]).macro).toBe('coaster_stack');
  });
  it('recognizes garments by the product name or by their pieces', () => {
    const jk = fixture('chaqueta').pieces;
    for (const name of ['Chaqueta de cuero', 'Campera de jean', 'Abrigo largo', 'Blazer entallado', 'Chamarra', 'Camisa de lino', 'Chaleco de fieltro', 'Leather jacket', 'Wool coat', 'Denim vest', 'Sudadera con capucha', 'Hooded sweatshirt'])
      expect(guessFamily(name, jk), name).toEqual({ category: 'garment', macro: 'garment_top' });
    expect(guessFamily('Modelo nuevo', [panel(50, 60, 'Espalda'), panel(20, 55, 'Manga', 2)]).macro).toBe('garment_top');
    expect(guessFamily('New model', [panel(50, 60, 'Back'), panel(20, 55, 'Sleeve', 2)]).macro).toBe('garment_top');
    expect(guessFamily('Funda para el móvil', fixture('celular').pieces).macro).toBe('flat_sleeve');
    expect(guessRole('Manga')).toBe('sleeve');
    expect(guessRole('Cuello')).toBe('collar');
    expect(guessRole('Puño')).toBe('cuff');
    expect(guessRole('Capucha')).toBe('hood');
    expect(guessRole('Espalda')).toBe('back');
    expect(guessRole('Sleeve')).toBe('sleeve');
    expect(guessRole('Collar')).toBe('collar');
    expect(guessRole('Cuff')).toBe('cuff');
    expect(guessRole('Hood')).toBe('hood');
    expect(guessRole('Waistband')).toBe('waistband');
    // A phone "sleeve" is not a garment sleeve outside garments.
    expect(guessRole('Sleeve panel', false)).not.toBe('sleeve');
  });
});

describe('kinematics', () => {
  it('a 180° fold closes the panel in half, with its thickness', () => {
    const { rig } = build(base([blankNode('r', { piece: 'P', folds: [{ axis: 'vertical', at: 0.5, angle_deg: 180, radius_mm: 0, moving: 'negative' }] })]), [panel(20, 10)]);
    const flat = bbox(allPts(rig, 0)), shut = bbox(allPts(rig, 1));
    expect(flat.size[0]).toBeGreaterThan(19);
    expect(shut.size[0]).toBeGreaterThan(9.3);
    expect(shut.size[0]).toBeLessThan(10.6);
    expect(shut.size[1]).toBeGreaterThan(0.15); // two layers stacked (mid-planes ~2 mm apart)
    expect(sanityCheck(rig).intersections).toBe(0);
  });
  it('a 90° hinge raises the wall upright', () => {
    const { rig } = build(base([
      blankNode('b', { piece: 'Base' }),
      blankNode('w', { piece: 'Wall', parent: 'b', joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 90 }),
    ]), [panel(10, 10, 'Base'), panel(10, 5, 'Wall')]);
    const s = samplePanels(pose(rig, 1)).find((x) => rig.nodes[x.node].spec.id === 'w')!;
    const bb = bbox(s.pts);
    expect(bb.size[1]).toBeGreaterThan(4); // vertical extent ≈ wall height
    expect(bb.size[2]).toBeLessThan(0.3);
  });
  it('in the flat layout (t=0) nothing overlaps and everything lies on the table', () => {
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
        expect(ox > 0.3 && oz > 0.3, `${f.key}: ${i} and ${j} overlap when flat`).toBe(false);
      }
    }
  });
  it('the handle forms an arc with its real length', () => {
    const f = fixture('tote');
    const { rig } = build(fallbackScene(f.productName, f.pieces), f.pieces);
    const i = rig.nodes.findIndex((n) => n.spec.type === 'strap');
    const st = pose(rig, 1).strap(i, 80)!;
    let len = 0;
    for (let k = 1; k < st.pts.length; k++) len += Math.hypot(...st.pts[k].map((v, j) => v - st.pts[k - 1][j]) as [number, number, number]);
    expect(len).toBeCloseTo(40, 0);
  });
});

describe('macros and checks with the sample products', () => {
  for (const f of PRODUCT_FIXTURES) {
    it(`${f.key}: assembles without crossings and uses every piece`, () => {
      const { rig } = build(fallbackScene(f.productName, f.pieces, f.assumptions), f.pieces);
      const s = sanityCheck(rig);
      expect(s.intersections, s.issues.join('\n')).toBe(0);
      expect(rig.loose, f.key).toEqual([]);
      expect(s.issues.filter((x) => /floating/.test(x))).toEqual([]);
      const text = describeRig(rig, s);
      for (const p of f.pieces) expect(text).toContain(p.name);
    });
  }
  it('the closed wallet measures about half of the exterior', () => {
    const f = fixture('billetera');
    const { rig } = build(fallbackScene(f.productName, f.pieces), f.pieces);
    const s = sanityCheck(rig);
    expect(s.size[0]).toBeGreaterThan(8);
    expect(s.size[0]).toBeLessThan(11.5);
    expect(s.size[1]).toBeLessThan(2.5);
  });
});

describe('garments and seams', () => {
  const f = fixture('chaqueta');
  const sample = (rig: ReturnType<typeof buildRig>, re: RegExp) => samplePanels(pose(rig, 1)).filter((x) => re.test(rig.nodes[x.node].spec.piece));
  // The root lies face up: its local +y (towards the collar) is world −z.
  const u = (p: number[]) => p[0], v = (p: number[]) => -p[2];

  it('a seam joins the edge of the piece to the parent\'s and turns around that point', () => {
    for (const rot of [0, 40, -70]) {
      const { rig } = build(base([
        blankNode('b', { piece: 'Base' }),
        blankNode('s', { piece: 'Strip', parent: 'b', joint: 'seam', hinge_edge: 'right', anchor_y: 0.2, rotation_deg: rot }),
      ]), [panel(10, 10, 'Base'), panel(4, 12, 'Strip')]);
      const ps = pose(rig, 1);
      const p = [0, -6 + 1.2, 0];
      ps.map(1, p);
      expect(p[0]).toBeCloseTo(5, 6);
      expect(-p[2]).toBeCloseTo(2, 6);
      expect(sanityCheck(rig).penalty).toBe(0);
    }
  });

  it('the jacket assembles with the sleeves sewn next to the shoulders, hanging on each side', () => {
    const { rig } = build(fallbackScene(f.productName, f.pieces, f.assumptions), f.pieces);
    const s = sanityCheck(rig);
    expect(s.disconnected, s.issues.join('\n')).toBe(0);
    expect(s.structural, s.issues.join('\n')).toBe(0);
    expect(s.penalty).toBe(0);
    expect(rig.loose).toEqual([]);
    const torso = sample(rig, /panel$/).flatMap((x) => x.pts);
    const top = Math.max(...torso.map(v));
    const torsoFew = torso.filter((_, k) => k % 5 === 0);
    const sleeves = sample(rig, /^Sleeve/);
    expect(sleeves).toHaveLength(2);
    const sides = sleeves.map((sl) => {
      expect(rig.nodes[sl.node].spec.joint).toBe('seam');
      const vs = sl.pts.map(v);
      expect(top - Math.max(...vs)).toBeLessThan(3); // the cap starts at the shoulder line
      expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(50); // ~58 cm sleeve hanging almost vertical
      const gap = Math.min(...sl.pts.filter((_, k) => k % 6 === 0).map((p) => Math.min(...torsoFew.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])))));
      expect(gap).toBeLessThan(1.5); // sewn to the body, not floating beside it
      return Math.sign(sl.pts.reduce((a, p) => a + u(p), 0));
    });
    expect(sides.sort()).toEqual([-1, 1]);
    const fronts = sample(rig, /^Front panel/).map((x) => [Math.min(...x.pts.map(u)), Math.max(...x.pts.map(u))]).sort((a, b) => a[0] - b[0]);
    expect(fronts[1][0] - fronts[0][1]).toBeLessThan(0.5); // they meet (or cross) at the centre
    const collar = sample(rig, /^Collar/)[0].pts.map(v);
    expect(top - Math.max(...collar)).toBeLessThan(1.5);
  });

  it('the check catches sleeves in a cross, loose or on top of the body', () => {
    const torso = [
      blankNode('back', { piece: 'Back panel' }),
      blankNode('f0', { piece: 'Front panel', instance: 0, parent: 'back', joint: 'stack', anchor_x: -0.24 }),
      blankNode('f1', { piece: 'Front panel', instance: 1, parent: 'back', joint: 'stack', anchor_x: 0.24, layer: 1 }),
      blankNode('c', { piece: 'Collar', parent: 'back', joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 180 }),
      blankNode('p0', { piece: 'Pocket', instance: 0, parent: 'f0', joint: 'stack', anchor_y: -0.25 }),
      blankNode('p1', { piece: 'Pocket', instance: 1, parent: 'f1', joint: 'stack', anchor_y: -0.25 }),
    ];
    const run = (sleeves: SceneSpec['nodes']) => {
      const { rig } = build(base([...torso, ...sleeves], { category: 'garment' }), f.pieces);
      return sanityCheck(rig);
    };
    // Straight out in a cross, as the model drew it.
    const cross = run([
      blankNode('m0', { piece: 'Sleeve', instance: 0, parent: 'back', joint: 'hinge', hinge_edge: 'left', anchor_y: 0.3, hinge_angle_deg: 10 }),
      blankNode('m1', { piece: 'Sleeve', instance: 1, parent: 'back', joint: 'hinge', hinge_edge: 'right', anchor_y: 0.3, hinge_angle_deg: 10 }),
    ]);
    expect(cross.issues.filter((x) => /sticks out horizontally/.test(x))).toHaveLength(2);
    expect(cross.structural).toBeGreaterThanOrEqual(2);
    // Off the body, not touching anything.
    const loose = run([
      blankNode('m0', { piece: 'Sleeve', instance: 0, parent: 'back', joint: 'stack', anchor_x: -1 }),
      blankNode('m1', { piece: 'Sleeve', instance: 1, parent: 'back', joint: 'stack', anchor_x: 1 }),
    ]);
    expect(loose.disconnected).toBe(2);
    expect(loose.issues.join(' ')).toMatch(/floats .* away/);
    // Lying on top of the body.
    const onTop = run([
      blankNode('m0', { piece: 'Sleeve', instance: 0, parent: 'f0', joint: 'stack', layer: 1 }),
      blankNode('m1', { piece: 'Sleeve', instance: 1, parent: 'f1', joint: 'stack', layer: 1 }),
    ]);
    expect(onTop.issues.join(' ')).toMatch(/on top of the body/);
    // Any of them ranks below the rule-based jacket (penalty 0), so the pipeline would never pick it.
    for (const s of [cross, loose, onTop]) expect(s.penalty).toBeGreaterThan(0);
  });
});
