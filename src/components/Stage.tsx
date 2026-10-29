import { useRef, useState } from 'react';
import type { Placement, Pt, Ring, Template } from '../types';
import { centroid } from '../state';
import { nearestEdge, ringPath } from '../lib/poly';

export type Mode = 'view' | 'contour' | 'defects' | 'calib' | 'points';
export interface SamPoint { p: Pt; label: 0 | 1 }

interface Props {
  src: string;
  w: number;
  h: number;
  showImage: boolean;
  mode: Mode;
  contour: Ring;
  onContour: (r: Ring) => void;
  proposal?: Ring | null;
  defects: Ring[];
  onDefects: (d: Ring[]) => void;
  selDefect: number | null;
  onSelDefect: (i: number | null) => void;
  /** Polígono en trazado (null = no se está dibujando). */
  draft: Pt[] | null;
  onDraft: (d: Pt[] | null) => void;
  onCloseDraft: () => void;
  calibPts: Pt[];
  onCalibPts: (p: Pt[]) => void;
  samPoints: SamPoint[];
  onSamPoints: (p: SamPoint[]) => void;
  placements: Placement[];
  templates: Template[];
  stale: boolean;
  selPlacement: number | null;
  onSelPlacement: (i: number | null) => void;
}

const PATTERN_SHAPES = [
  null,
  (c: string) => <path d="M0,8 L8,0" stroke={c} strokeWidth="1.6" />,
  (c: string) => <circle cx="4" cy="4" r="1.5" fill={c} />,
  (c: string) => <path d="M0,0 L8,8 M8,0 L0,8" stroke={c} strokeWidth="1.2" />,
  (c: string) => <path d="M0,4 H8" stroke={c} strokeWidth="1.6" />,
  (c: string) => <path d="M4,0 V8" stroke={c} strokeWidth="1.6" />,
];

export const templateLetter = (i: number) => String.fromCharCode(65 + i);

export default function Stage(p: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);

  const editRing: Ring | null =
    p.mode === 'contour' && p.draft === null ? p.contour
      : p.mode === 'defects' && p.draft === null && p.selDefect !== null ? p.defects[p.selDefect] ?? null
        : null;

  const setEdit = (r: Ring) => {
    if (p.mode === 'contour') p.onContour(r);
    else if (p.selDefect !== null) p.onDefects(p.defects.map((d, i) => (i === p.selDefect ? r : d)));
  };

  const pt = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM()!.inverse();
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [Math.max(0, Math.min(p.w, q.x)), Math.max(0, Math.min(p.h, q.y))];
  };
  const k = () => svgRef.current?.getScreenCTM()?.a ?? 1; // px de pantalla por unidad de imagen
  const hr = () => 7 / k();

  const onDown = (e: React.PointerEvent) => {
    const q = pt(e);
    if (p.draft) {
      if (p.draft.length >= 3 && Math.hypot(q[0] - p.draft[0][0], q[1] - p.draft[0][1]) < 12 / k()) { p.onCloseDraft(); return; }
      p.onDraft([...p.draft, q]);
    } else if (p.mode === 'calib') {
      p.onCalibPts(p.calibPts.length >= 2 ? [q] : [...p.calibPts, q]);
    } else if (p.mode === 'points') {
      p.onSamPoints([...p.samPoints, { p: q, label: e.shiftKey ? 0 : 1 }]);
    } else if (p.mode === 'defects') {
      p.onSelDefect(null);
    } else if (p.placements.length) {
      p.onSelPlacement(null);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const q = pt(e);
    if (p.draft) setHover(q);
    if (drag !== null && editRing) setEdit(editRing.map((v, i) => (i === drag ? q : v)));
  };

  const insertVertex = (e: React.PointerEvent) => {
    if (!editRing) return;
    e.stopPropagation();
    const q = pt(e);
    const { i } = nearestEdge(q, editRing);
    const next = [...editRing.slice(0, i + 1), q, ...editRing.slice(i + 1)];
    setEdit(next);
    setDrag(i + 1);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const removeVertex = (i: number) => {
    if (editRing && editRing.length > 3) setEdit(editRing.filter((_, j) => j !== i));
  };

  const nudge = (e: React.KeyboardEvent, i: number) => {
    if (!editRing) return;
    const d = e.shiftKey ? 8 : 2;
    const mv: Record<string, Pt> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (mv[e.key]) { e.preventDefault(); setEdit(editRing.map((v, j) => (j === i ? [v[0] + mv[e.key][0], v[1] + mv[e.key][1]] as Pt : v))); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeVertex(i); }
  };

  const drawing = p.draft !== null;
  const cursor = drawing || p.mode === 'calib' || p.mode === 'points' ? 'crosshair' : 'default';
  const r = hr();
  const sw = 2 / k();

  return (
    <svg
      ref={svgRef}
      className="stage"
      viewBox={`0 0 ${p.w} ${p.h}`}
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(e) => { if (p.mode === 'points') { e.preventDefault(); p.onSamPoints([...p.samPoints, { p: pt(e), label: 0 }]); } }}
      role="img"
      aria-label="Lienzo del material con contorno, zonas excluidas y piezas colocadas"
    >
      <defs>
        {p.templates.map((t, i) => (
          <pattern key={t.id} id={`pat-${t.id}`} width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill={t.color} fillOpacity=".62" />
            {PATTERN_SHAPES[i % PATTERN_SHAPES.length]?.('#000000a8')}
          </pattern>
        ))}
        <pattern id="pat-defect" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#ff3b30" fillOpacity=".28" />
          <path d="M0,8 L8,0" stroke="#c4140b" strokeWidth="1.6" />
        </pattern>
      </defs>

      {p.showImage ? <image href={p.src} width={p.w} height={p.h} /> : <rect width={p.w} height={p.h} fill="#f2f4f5" />}

      {p.contour.length > 2 && (
        <path d={ringPath(p.contour)} fill="#00f0a0" fillOpacity={p.mode === 'contour' ? 0.22 : 0.1} stroke="#00a86b" strokeWidth={sw * 1.5} strokeLinejoin="round" />
      )}

      {p.proposal && p.proposal.length > 2 && (
        <path d={ringPath(p.proposal)} fill="#00f0a0" fillOpacity=".3" stroke="#000" strokeWidth={sw * 1.5} strokeDasharray={`${8 / k()} ${5 / k()}`} />
      )}

      {p.defects.map((d, i) => (
        <path
          key={i}
          d={ringPath(d)}
          fill="url(#pat-defect)"
          stroke="#c4140b"
          strokeWidth={p.selDefect === i ? sw * 2 : sw}
          strokeDasharray={`${6 / k()} ${3 / k()}`}
          style={{ cursor: p.mode === 'defects' ? 'pointer' : undefined }}
          onPointerDown={(e) => { if (p.mode === 'defects' && !drawing) { e.stopPropagation(); p.onSelDefect(i); } }}
        >
          <title>{`Zona excluida ${i + 1}`}</title>
        </path>
      ))}

      <g opacity={p.stale ? 0.4 : 1}>
        {p.placements.map((pl, i) => {
          const ti = p.templates.findIndex((t) => t.id === pl.templateId);
          const c = centroid(pl.polygon);
          const sel = p.selPlacement === i;
          return (
            <g key={i} onPointerDown={(e) => { e.stopPropagation(); p.onSelPlacement(sel ? null : i); }} style={{ cursor: 'pointer' }}>
              <path d={ringPath(pl.polygon)} fill={`url(#pat-${pl.templateId})`} stroke={sel ? '#000' : '#0b0b0b'} strokeWidth={sel ? sw * 3 : sw} strokeLinejoin="round" />
              <text x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="central" fontSize={15 / k()} fontWeight="700" fill="#000" stroke="#fff" strokeWidth={3 / k()} paintOrder="stroke">
                {templateLetter(ti)}{pl.instance + 1}
              </text>
            </g>
          );
        })}
      </g>

      {editRing && (
        <>
          <path d={ringPath(editRing)} fill="none" stroke="transparent" strokeWidth={14 / k()} onPointerDown={insertVertex} style={{ cursor: 'copy' }} />
          {editRing.map((v, i) => (
            <circle
              key={i}
              cx={v[0]} cy={v[1]} r={r}
              className="handle"
              tabIndex={0}
              role="button"
              aria-label={`Vértice ${i + 1} de ${editRing.length}. Flechas para mover, Supr para eliminar`}
              onPointerDown={(e) => { e.stopPropagation(); setDrag(i); (e.target as Element).setPointerCapture?.(e.pointerId); }}
              onDoubleClick={() => removeVertex(i)}
              onKeyDown={(e) => nudge(e, i)}
              strokeWidth={sw}
            />
          ))}
        </>
      )}

      {p.draft && (
        <g>
          <polyline points={[...p.draft, ...(hover ? [hover] : [])].map((v) => v.join(',')).join(' ')} fill="none" stroke="#000" strokeWidth={sw * 1.5} strokeDasharray={`${5 / k()} ${4 / k()}`} />
          {p.draft.map((v, i) => <circle key={i} cx={v[0]} cy={v[1]} r={i === 0 ? r * 1.4 : r * 0.8} fill={i === 0 ? '#00f0a0' : '#fff'} stroke="#000" strokeWidth={sw} />)}
        </g>
      )}

      {p.calibPts.length > 0 && (
        <g>
          {p.calibPts.length === 2 && <line x1={p.calibPts[0][0]} y1={p.calibPts[0][1]} x2={p.calibPts[1][0]} y2={p.calibPts[1][1]} stroke="#000" strokeWidth={sw * 1.5} />}
          {p.calibPts.map((v, i) => <circle key={i} cx={v[0]} cy={v[1]} r={r} fill="#00f0a0" stroke="#000" strokeWidth={sw} />)}
        </g>
      )}

      {p.samPoints.map((s, i) => (
        <g key={i}>
          <circle cx={s.p[0]} cy={s.p[1]} r={r * 1.2} fill={s.label ? '#00f0a0' : '#ff3b30'} stroke="#000" strokeWidth={sw} />
          <text x={s.p[0]} y={s.p[1]} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.6} fontWeight="700">{s.label ? '+' : '−'}</text>
        </g>
      ))}
    </svg>
  );
}
