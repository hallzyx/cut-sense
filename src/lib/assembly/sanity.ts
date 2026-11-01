import { pose, samplePanels, type Rig } from './kinematics';
import { dot } from './math';

/**
 * Cheap deterministic checks on the assembled pose. They catch what a picture may hide
 * (pieces passing through each other, floating or overhanging, straps that cannot reach)
 * and are sent to the model as text during the critique.
 */
export interface Sanity {
  issues: string[];
  /** Assembled bounding box in cm: [width, height, depth] (world x, y up, z). */
  size: [number, number, number];
  intersections: number;
  score: number;
}

const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

export function sanityCheck(rig: Rig): Sanity {
  const ps = pose(rig, 1);
  const issues: string[] = [];
  const name = (i: number) => `«${rig.nodes[i].spec.piece}» (${rig.nodes[i].spec.id})`;
  const step = 0.8;
  const samples = samplePanels(ps, step);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of samples) for (const p of s.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const size: [number, number, number] = samples.length ? [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] : [0, 0, 0];

  // Pieces occupying the same space: two samples closer along the normal than half their thicknesses.
  const cell = 1;
  const grid = new Map<string, { s: number; k: number }[]>();
  const key = (p: number[]) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
  samples.forEach((s, si) => s.pts.forEach((p, k) => {
    const kk = key(p);
    (grid.get(kk) ?? grid.set(kk, []).get(kk)!).push({ s: si, k });
  }));
  const hits = new Map<string, number>();
  const related = (a: number, b: number) => {
    const na = rig.nodes[a], nb = rig.nodes[b];
    return (na.parent === b && na.spec.joint === 'hinge') || (nb.parent === a && nb.spec.joint === 'hinge');
  };
  samples.forEach((sa, ai) => {
    const A = rig.nodes[sa.node];
    sa.pts.forEach((p) => {
      const [cx, cy, cz] = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const { s: bi, k } of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
          if (bi <= ai) continue;
          const sb = samples[bi], B = rig.nodes[sb.node];
          if (related(sa.node, sb.node)) continue;
          const q = sb.pts[k], n = sb.nrm[k];
          const d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
          const nd = Math.abs(dot(d, n));
          const lat = Math.sqrt(Math.max(0, dot(d, d) - nd * nd));
          if (lat < step * 0.5 && nd < (A.T + B.T) / 2 - 0.04) {
            const kk = `${ai}|${bi}`;
            hits.set(kk, (hits.get(kk) ?? 0) + 1);
          }
        }
      }
    });
  });
  let intersections = 0;
  for (const [kk, count] of hits) {
    const [ai, bi] = kk.split('|').map(Number);
    const minN = Math.min(samples[ai].pts.length, samples[bi].pts.length);
    if (count >= Math.max(2, minN * 0.04)) {
      intersections++;
      if (intersections <= 6) issues.push(`${name(samples[ai].node)} y ${name(samples[bi].node)} se atraviesan en el modelo armado (${Math.round((100 * count) / Math.max(1, minN))} % de la pieza menor).`);
    }
  }
  if (intersections > 6) issues.push(`…y ${intersections - 6} cruces más entre piezas.`);

  for (const n of rig.nodes) {
    const s = n.spec;
    if (n.parent < 0) continue;
    const p = rig.nodes[n.parent];
    if (s.type === 'panel' && s.joint === 'stack') {
      const cx = n.rest[12], cy = n.rest[13];
      const ox = Math.max(0, Math.min(cx + n.Wr / 2, p.W / 2) - Math.max(cx - n.Wr / 2, -p.W / 2));
      const oy = Math.max(0, Math.min(cy + n.Hr / 2, p.H / 2) - Math.max(cy - n.Hr / 2, -p.H / 2));
      const frac = (ox * oy) / (n.Wr * n.Hr);
      if (frac < 0.5) issues.push(`${name(n.i)} queda casi fuera de ${name(p.i)} (solo ${Math.round(frac * 100)} % encima): parece flotar.`);
      else if (frac < 0.75) issues.push(`${name(n.i)} sobresale de ${name(p.i)} (${Math.round(frac * 100)} % encima).`);
      if (s.offset_mm > 3) issues.push(`${name(n.i)} está separada ${fmt(s.offset_mm)} mm de su base: no toca la pieza.`);
    }
    if (s.type === 'panel' && s.joint === 'hinge') {
      const edgeLen = s.hinge_edge === 'top' || s.hinge_edge === 'bottom' ? p.W : p.H;
      if (n.Wr > edgeLen * 1.15) issues.push(`${name(n.i)} (${fmt(n.Wr)} cm) es más ancha que el borde de ${name(p.i)} al que se une (${fmt(edgeLen)} cm).`);
    }
    if (s.type === 'strap') {
      const st = ps.strap(n.i, 2);
      if (st) {
        const [a, , b] = st.pts;
        const chord = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (chord > n.strapLen) issues.push(`${name(n.i)} mide ${fmt(n.strapLen)} cm y no alcanza entre sus extremos (${fmt(chord)} cm).`);
      }
    }
  }
  for (const n of rig.nodes) {
    if (n.spec.type !== 'panel') continue;
    for (const f of n.spec.folds) if (Math.abs(f.angle_deg) > 200 && f.radius_mm === 0) issues.push(`${name(n.i)} se enrolla más de 200° sin radio: revisa el pliegue.`);
  }
  if (rig.loose.length) {
    const names = [...new Set(rig.loose.map((l) => l.piece))];
    issues.push(`Piezas sin colocar en el armado: ${names.map((x) => `«${x}» ×${rig.loose.filter((l) => l.piece === x).length}`).join(', ')}.`);
  }
  const score = Math.max(0, 10 - intersections * 2 - issues.length + intersections);
  return { issues, size, intersections, score };
}

export function sanityText(s: Sanity): string {
  const head = `Medidas del modelo armado: ${fmt(s.size[0])} × ${fmt(s.size[2])} cm en planta, ${fmt(s.size[1])} cm de alto.`;
  return s.issues.length ? `${head}\n- ${s.issues.join('\n- ')}` : `${head}\nSin problemas geométricos detectados.`;
}
