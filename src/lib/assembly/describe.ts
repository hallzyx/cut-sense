import type { Rig } from './kinematics';
import type { Sanity } from './sanity';

/** Plain-language text alternative of the assembled model (Spanish, user-facing). */
const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const EDGE: Record<string, string> = { top: 'superior', bottom: 'inferior', left: 'izquierdo', right: 'derecho' };
const HW: Record<string, string> = { snap: 'un broche', stud: 'un botón de presión', ring: 'una argolla', zipper: 'una cremallera', rivet: 'un remache', buckle: 'una hebilla' };

export function describeRig(rig: Rig, sanity?: Sanity): string {
  const out: string[] = [];
  const { scene } = rig;
  const panels = rig.nodes.filter((n) => n.spec.type !== 'hardware').length;
  const head = `${scene.label || 'Objeto'}: vista previa aproximada armada con ${panels} ${panels === 1 ? 'pieza' : 'piezas'}`;
  out.push(sanity ? `${head}, de unos ${fmt(sanity.size[0])} × ${fmt(sanity.size[2])} cm y ${fmt(sanity.size[1])} cm de alto.` : `${head}.`);
  const groups = new Map<string, { text: string; count: number }>();
  const put = (k: string, text: string) => {
    const g = groups.get(k);
    if (g) g.count++;
    else groups.set(k, { text, count: 1 });
  };
  for (const n of rig.nodes) {
    const s = n.spec;
    const p = n.parent >= 0 ? rig.nodes[n.parent].spec.piece || 'la pieza' : '';
    const piece = `«${s.piece}» (${fmt(n.W)} × ${fmt(n.H)} cm)`;
    if (s.type === 'hardware') { put(`hw|${s.hardware}|${p}`, `${HW[s.hardware] ?? 'un herraje'} en «${p}»`); continue; }
    if (s.type === 'strap') { put(`st|${s.piece}`, `${piece} forma un asa sobre «${p}»`); continue; }
    const folds = s.folds.length === 1 ? (Math.abs(s.folds[0].angle_deg) > 300 ? ', enrollada en tubo' : `, doblada ${Math.round(Math.abs(s.folds[0].angle_deg))}°`) : s.folds.length > 1 ? `, doblada en ${s.folds.length + 1} partes` : '';
    if (n.parent < 0) { out.push(`La base es ${piece}${folds}.`); continue; }
    if (s.joint === 'hinge') put(`h|${s.piece}|${p}|${s.hinge_edge}|${s.hinge_angle_deg}`, `${piece} unida al borde ${EDGE[s.hinge_edge]} de «${p}», girada ${Math.round(s.hinge_angle_deg)}°${folds}`);
    else if (s.joint === 'seam') put(`c|${s.piece}|${p}|${s.hinge_edge}`, `${piece} cosida al borde ${EDGE[s.hinge_edge]} de «${p}»${folds}`);
    else put(`s|${s.piece}|${p}|${s.side}`, `${piece} ${s.side === 'top' ? 'sobre' : 'debajo de'} «${p}»${folds}`);
  }
  for (const g of groups.values()) out.push(`${g.count > 1 ? `${g.count} × ` : ''}${g.text[0].toUpperCase()}${g.text.slice(1)}.`);
  if (rig.loose.length) out.push(`Sin colocar: ${[...new Set(rig.loose.map((l) => `«${l.piece}»`))].join(', ')}.`);
  return out.join(' ');
}
