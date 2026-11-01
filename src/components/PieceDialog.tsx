import { useEffect, useRef, useState } from 'react';
import type { Pt, Ring } from '../types';
import { customShapeProblem, normalizeRing } from '../lib/custom';
import { ringFromSvg } from '../lib/svgImport';
import { ringPath } from '../lib/poly';
import { NumField } from './fields';

export interface NewPiece { name: string; shape: Ring; w: number; h: number }

interface Props {
  mode: 'draw' | 'svg';
  unit: string;
  /** Suggested piece width, in the current unit. */
  defaultWidth: number;
  /** Converts millimetres to the current unit (cm or mm); null if the photo is not calibrated. */
  mmToCurrent?: (mm: number) => number | null;
  onCancel: () => void;
  onSave: (p: NewPiece) => void;
}

const W = 400, H = 300;

export default function PieceDialog({ mode, unit, defaultWidth, mmToCurrent, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState<Pt[]>([]);
  const [ring, setRing] = useState<Ring | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [name, setName] = useState('Custom piece');
  const [w, setW] = useState(defaultWidth);
  const [h, setH] = useState(defaultWidth);
  const [aspect, setAspect] = useState(1);
  const [keep, setKeep] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);

  const accept = (r: Ring, suggestedW?: number) => {
    const bad = customShapeProblem(r);
    if (bad) { setErr(`${bad} Fix the shape and try again.`); return false; }
    const { aspect: a } = normalizeRing(r);
    const nw = suggestedW && suggestedW > 0 ? Math.round(suggestedW * 10) / 10 : defaultWidth;
    setRing(r); setAspect(a); setW(nw); setH(Math.round(nw * a * 10) / 10); setErr(null);
    return true;
  };

  const pointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (ring) return;
    const m = svgRef.current!.getScreenCTM()!.inverse();
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    const p: Pt = [Math.max(0, Math.min(W, q.x)), Math.max(0, Math.min(H, q.y))];
    if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 14) { accept(draft); return; }
    setDraft([...draft, p]); setErr(null);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(null); setNote(null);
    if (f.size > 1024 * 1024) { setErr('The SVG is larger than 1 MB.'); return; }
    try {
      const res = ringFromSvg(await f.text());
      const suggested = mmToCurrent?.(res.widthMm) ?? undefined;
      if (accept(res.ring, suggested ?? undefined)) {
        setName(f.name.replace(/\.svg$/i, '') || 'Custom piece');
        setNote(`${res.ring.length} vertices${res.found > 1 ? ` · the file had ${res.found} shapes: I used the largest one` : ''}. Inner holes are ignored.${suggested ? ' Size suggested from the SVG dimensions; adjust it if needed.' : ''}`);
      }
    } catch (e) { setErr((e as Error).message); }
  };

  const preview = ring ? normalizeRing(ring).shape.map(([x, y]) => [x * 300 + 50, y * (300 * aspect) + 10] as Pt) : [];
  const prevH = 300 * aspect + 20;
  const sizeOk = w > 0 && h > 0 && name.trim().length > 0;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal feature-card" role="dialog" aria-modal="true" aria-label={mode === 'draw' ? 'Draw a custom piece' : 'Import a piece from SVG'}>
        <h2 className="h4">{mode === 'draw' ? 'Draw a custom piece' : 'Import a piece from SVG'}</h2>
        {err && <p className="alert error" role="alert">{err}</p>}

        {!ring && mode === 'svg' && (
          <div className="stack">
            <p className="caption">Upload an SVG with the piece silhouette (path, polygon, rect, circle or ellipse). The outer outline of the largest shape is used; curves become polygons.</p>
            <input type="file" accept=".svg,image/svg+xml" aria-label="SVG file" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        )}

        {!ring && mode === 'draw' && (
          <div className="stack">
            <p className="caption">Click to add points around the piece. Close the shape by clicking the first point (green).</p>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="draw-area" onPointerDown={pointer} role="img" aria-label="Piece drawing area">
              <rect width={W} height={H} fill="var(--cs-surface-sunk)" />
              {draft.length > 1 && <polyline points={draft.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--cs-text)" strokeWidth="2" strokeDasharray="6 4" />}
              {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? 7 : 4} fill={i === 0 ? '#5BD69A' : '#fff'} stroke="#0B0F0D" strokeWidth="1.5" />)}
            </svg>
            <div className="row wrap">
              <button className="btn ghost sm" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))}>Undo point</button>
              <button className="btn dark sm" disabled={draft.length < 3} onClick={() => accept(draft)}>Close shape</button>
            </div>
          </div>
        )}

        {ring && (
          <div className="stack">
            <svg viewBox={`0 0 400 ${prevH}`} className="draw-area" aria-label="Piece preview">
              <rect width="400" height={prevH} fill="var(--cs-surface-sunk)" />
              <path d={ringPath(preview)} fill="var(--cs-piece-a)" fillOpacity=".9" stroke="var(--cs-ov-casing)" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            {note && <p className="caption">{note}</p>}
            <label className="field"><span>Name</span><span className="input-wrap"><input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!name.trim()} /></span></label>
            <div className="row3">
              <NumField label="Width" value={w} min={0} exclusive suffix={unit} onCommit={(n) => { setW(n); if (keep) setH(Math.round(n * aspect * 10) / 10); }} />
              <NumField label="Height" value={h} min={0} exclusive suffix={unit} onCommit={(n) => { setH(n); if (keep) setW(Math.round((n / aspect) * 10) / 10); }} />
            </div>
            <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep proportions</label>
          </div>
        )}

        <div className="row wrap modal-foot">
          {ring && <button className="btn primary sm" disabled={!sizeOk} onClick={() => onSave({ name: name.trim(), shape: normalizeRing(ring).shape, w, h })}>Add to order</button>}
          {ring && <button className="btn ghost sm" onClick={() => { setRing(null); setDraft([]); setNote(null); }}>Start over</button>}
          <button ref={first} className="btn ghost sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
