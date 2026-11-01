import type { Rig } from './kinematics';
import type { Sanity } from './sanity';

/** Plain-language text alternative of the assembled model (English, user-facing). */
const fmt = (x: number) => String(Math.round(x * 10) / 10);
const HW: Record<string, string> = { snap: 'a snap', stud: 'a press stud', ring: 'a ring', zipper: 'a zipper', rivet: 'a rivet', buckle: 'a buckle' };

export function describeRig(rig: Rig, sanity?: Sanity): string {
  const out: string[] = [];
  const { scene } = rig;
  const panels = rig.nodes.filter((n) => n.spec.type !== 'hardware').length;
  const head = `${scene.label || 'Object'}: approximate preview assembled from ${panels} ${panels === 1 ? 'piece' : 'pieces'}`;
  out.push(sanity ? `${head}, about ${fmt(sanity.size[0])} × ${fmt(sanity.size[2])} cm and ${fmt(sanity.size[1])} cm tall.` : `${head}.`);
  const groups = new Map<string, { text: string; count: number }>();
  const put = (k: string, text: string) => {
    const g = groups.get(k);
    if (g) g.count++;
    else groups.set(k, { text, count: 1 });
  };
  for (const n of rig.nodes) {
    const s = n.spec;
    const p = n.parent >= 0 ? rig.nodes[n.parent].spec.piece || 'the piece' : '';
    const piece = `“${s.piece}” (${fmt(n.W)} × ${fmt(n.H)} cm)`;
    if (s.type === 'hardware') { put(`hw|${s.hardware}|${p}`, `${HW[s.hardware] ?? 'a hardware fitting'} on “${p}”`); continue; }
    if (s.type === 'strap') { put(`st|${s.piece}`, `${piece} forms a handle over “${p}”`); continue; }
    const folds = s.folds.length === 1 ? (Math.abs(s.folds[0].angle_deg) > 300 ? ', rolled into a tube' : `, folded ${Math.round(Math.abs(s.folds[0].angle_deg))}°`) : s.folds.length > 1 ? `, folded into ${s.folds.length + 1} parts` : '';
    if (n.parent < 0) { out.push(`The base is ${piece}${folds}.`); continue; }
    if (s.joint === 'hinge') put(`h|${s.piece}|${p}|${s.hinge_edge}|${s.hinge_angle_deg}`, `${piece} joined to the ${s.hinge_edge} edge of “${p}”, turned ${Math.round(s.hinge_angle_deg)}°${folds}`);
    else if (s.joint === 'seam') put(`c|${s.piece}|${p}|${s.hinge_edge}`, `${piece} sewn to the ${s.hinge_edge} edge of “${p}”${folds}`);
    else put(`s|${s.piece}|${p}|${s.side}`, `${piece} ${s.side === 'top' ? 'on top of' : 'under'} “${p}”${folds}`);
  }
  for (const g of groups.values()) out.push(`${g.count > 1 ? `${g.count} × ` : ''}${g.text[0].toUpperCase()}${g.text.slice(1)}.`);
  if (rig.loose.length) out.push(`Not placed: ${[...new Set(rig.loose.map((l) => `“${l.piece}”`))].join(', ')}.`);
  return out.join(' ');
}
