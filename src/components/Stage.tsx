import { useRef, useState } from 'react';
import type { Placement, Pt, Ring, Template } from '../types';
import { centroid, pieceLabel } from '../state';
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
  /** Polygon being traced (null = not drawing). */
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
  /** Pieces per set of each template (max sets mode): label “A1·2”. */
  kitQty?: Record<string, number>;
  /** Zones proposed by the AI, pending confirmation. */
  defectProposals?: Ring[];
  /** Material fragments left over after the plan. */
  leftover?: Ring[];
  /** Provenance of the material outline: AI proposal, human-corrected, or verified plan. */
  outlineKind: 'ai' | 'human' | 'verified' | 'stale';
  /** Desaturated pieces (leftover view). */
  dimPieces?: boolean;
  /** Dimension line on the canvas (e.g. “width = ? cm” when calibrating by width). */
  guide?: { x0: number; x1: number; y: number; label: string } | null;
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

const OV = { halo: 'rgba(255,255,255,.78)', casing: '#0B0F0D', ai: '#4D7CFF', human: '#FF5A1F', verified: '#5BD69A', stale: '#F2B544', defect: '#FF3B30' };

/** Tri-stroke: light halo > dark casing > colour core, legible on any photo. */
function Tri({ d, color, sw, dash, fill, fillOpacity, onPointerDown, cursor }: { d: string; color: string; sw: number; dash?: string; fill?: string; fillOpacity?: number; onPointerDown?: (e: React.PointerEvent) => void; cursor?: string }) {
  return (
    <g onPointerDown={onPointerDown} style={{ cursor }}>
      <path d={d} fill="none" stroke={OV.halo} strokeWidth={sw * 3.4} strokeLinejoin="round" strokeDasharray={dash} />
      <path d={d} fill="none" stroke={OV.casing} strokeWidth={sw * 2.3} strokeLinejoin="round" strokeDasharray={dash} />
      <path d={d} fill={fill ?? 'none'} fillOpacity={fillOpacity} stroke={color} strokeWidth={sw} strokeLinejoin="round" strokeDasharray={dash} />
    </g>
  );
}

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
  const k = () => svgRef.current?.getScreenCTM()?.a ?? 1; // screen px per image unit
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
      aria-label="Material canvas with outline, excluded zones and placed pieces"
    >
      <defs>
        {p.templates.map((t, i) => (
          <pattern key={t.id} id={`pat-${t.id}`} width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill={t.color} fillOpacity=".92" />
            {PATTERN_SHAPES[i % PATTERN_SHAPES.length]?.('rgba(11,15,13,.55)')}
          </pattern>
        ))}
 <pattern id="pat-left" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#ffffff" fillOpacity=".35" />
          <path d="M0,10 L10,0" stroke="#5A615B" strokeWidth="1.2" />
        </pattern>
        <pattern id="pat-defect" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#ffffff" fillOpacity=".55" />
          <path d="M-1,5 L5,-1 M3,9 L9,3" stroke="#FF3B30" strokeWidth="3" />
        </pattern>
      </defs>

      {p.showImage ? <image href={p.src} width={p.w} height={p.h} /> : <rect width={p.w} height={p.h} fill="#f2f4f5" />}

      {p.contour.length > 2 && (
        <Tri d={ringPath(p.contour)} color={OV[p.outlineKind]} sw={sw * (p.outlineKind === 'verified' ? 2 : 1.4)} dash={p.outlineKind === 'ai' ? `${8 / k()} ${5 / k()}` : p.outlineKind === 'stale' ? `${1 / k()} ${7 / k()}` : undefined} fill={OV[p.outlineKind]} fillOpacity={p.mode === 'contour' ? 0.16 : 0.07} />
      )}

      {p.proposal && p.proposal.length > 2 && (
        <Tri d={ringPath(p.proposal)} color={OV.ai} sw={sw * 1.5} dash={`${8 / k()} ${5 / k()}`} fill={OV.ai} fillOpacity={0.2} />
      )}

      {p.defects.map((d, i) => (
        <path
          key={i}
          d={ringPath(d)}
          fill="url(#pat-defect)"
          stroke={OV.defect}
          strokeWidth={p.selDefect === i ? sw * 2.4 : sw * 1.3}
          strokeDasharray={`${6 / k()} ${3 / k()}`}
          style={{ cursor: p.mode === 'defects' ? 'pointer' : undefined }}
          onPointerDown={(e) => { if (p.mode === 'defects' && !drawing) { e.stopPropagation(); p.onSelDefect(i); } }}
        >
          <title>{`Excluded zone ${i + 1}`}</title>
        </path>
      ))}

      {p.leftover?.map((l, i) => (
        <path key={`l${i}`} d={ringPath(l)} fill="url(#pat-left)" stroke="#5A615B" strokeWidth={sw * 1.4} strokeDasharray={`${4 / k()} ${3 / k()}`} />
      ))}

      {p.defectProposals?.map((d, i) => (
        <Tri key={`dp${i}`} d={ringPath(d)} color={OV.ai} sw={sw * 1.3} dash={`${6 / k()} ${4 / k()}`} fill={OV.ai} fillOpacity={0.3} />
      ))}

      <g opacity={p.stale ? 0.4 : 1} style={p.stale || p.dimPieces ? { filter: `grayscale(${p.stale ? 1 : 0.9})${p.dimPieces ? ' brightness(1.15)' : ''}` } : undefined}>
        {p.placements.map((pl, i) => {
          const ti = p.templates.findIndex((t) => t.id === pl.templateId);
          const c = centroid(pl.polygon);
          const sel = p.selPlacement === i;
          return (
            <g key={i} onPointerDown={(e) => { e.stopPropagation(); p.onSelPlacement(sel ? null : i); }} style={{ cursor: 'pointer' }}>
              <path d={ringPath(pl.polygon)} fill={`url(#pat-${pl.templateId})`} stroke={sel ? '#000' : '#0b0b0b'} strokeWidth={sel ? sw * 3 : sw} strokeLinejoin="round" />
              <text x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="central" fontSize={15 / k()} fontWeight="700" fill="#000" stroke="#fff" strokeWidth={3 / k()} paintOrder="stroke">
                {pieceLabel(ti, pl.instance, p.kitQty?.[pl.templateId])}
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
              aria-label={`Vertex ${i + 1} of ${editRing.length}. Arrow keys to move, Delete to remove`}
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
          {p.draft.map((v, i) => <circle key={i} cx={v[0]} cy={v[1]} r={i === 0 ? r * 1.4 : r * 0.8} fill={i === 0 ? OV.human : '#fff'} stroke="#000" strokeWidth={sw} />)}
        </g>
      )}

      {p.guide && (
        <g aria-hidden="true">
          <line x1={p.guide.x0} y1={p.guide.y} x2={p.guide.x1} y2={p.guide.y} stroke="#fff" strokeWidth={sw * 2.5} />
          <line x1={p.guide.x0} y1={p.guide.y} x2={p.guide.x1} y2={p.guide.y} stroke="#0B0F0D" strokeWidth={sw} strokeDasharray={`${6 / k()} ${4 / k()}`} />
          {[p.guide.x0, p.guide.x1].map((x) => <line key={x} x1={x} y1={p.guide!.y - 10 / k()} x2={x} y2={p.guide!.y + 10 / k()} stroke="#0B0F0D" strokeWidth={sw * 1.25} />)}
          <rect x={(p.guide.x0 + p.guide.x1) / 2 - 64 / k()} y={p.guide.y - 13 / k()} width={128 / k()} height={26 / k()} rx={4 / k()} fill="rgba(11,15,13,.86)" />
          <text x={(p.guide.x0 + p.guide.x1) / 2} y={p.guide.y} textAnchor="middle" dominantBaseline="central" fontSize={13 / k()} fontFamily="JetBrains Mono, monospace" fontWeight="600" fill="#fff">{p.guide.label}</text>
        </g>
      )}

      {p.calibPts.length > 0 && (
        <g>
          {p.calibPts.length === 2 && <line x1={p.calibPts[0][0]} y1={p.calibPts[0][1]} x2={p.calibPts[1][0]} y2={p.calibPts[1][1]} stroke="#000" strokeWidth={sw * 1.5} />}
          {p.calibPts.map((v, i) => <circle key={i} cx={v[0]} cy={v[1]} r={r} fill={OV.human} stroke="#0B0F0D" strokeWidth={sw} />)}
        </g>
      )}

      {p.samPoints.map((s, i) => (
        <g key={i}>
          <circle cx={s.p[0]} cy={s.p[1]} r={r * 1.2} fill={s.label ? OV.verified : OV.defect} stroke="#000" strokeWidth={sw} />
          <text x={s.p[0]} y={s.p[1]} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.6} fontWeight="700">{s.label ? '+' : '−'}</text>
        </g>
      ))}
    </svg>
  );
}
