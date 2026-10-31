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
  /** Ancho sugerido para la pieza, en la unidad actual. */
  defaultWidth: number;
  /** Convierte milímetros a la unidad actual (cm o mm); null si la foto no está calibrada. */
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
  const [name, setName] = useState('Pieza propia');
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
    if (bad) { setErr(`${bad} Corrige la forma e inténtalo de nuevo.`); return false; }
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
    if (f.size > 1024 * 1024) { setErr('El SVG pesa más de 1 MB.'); return; }
    try {
      const res = ringFromSvg(await f.text());
      const suggested = mmToCurrent?.(res.widthMm) ?? undefined;
      if (accept(res.ring, suggested ?? undefined)) {
        setName(f.name.replace(/\.svg$/i, '') || 'Pieza propia');
        setNote(`${res.ring.length} vértices${res.found > 1 ? ` · el archivo tenía ${res.found} formas: usé la de mayor área` : ''}. Los huecos interiores se ignoran.${suggested ? ' Tamaño sugerido según las dimensiones del SVG; ajústalo si hace falta.' : ''}`);
      }
    } catch (e) { setErr((e as Error).message); }
  };

  const preview = ring ? normalizeRing(ring).shape.map(([x, y]) => [x * 300 + 50, y * (300 * aspect) + 10] as Pt) : [];
  const prevH = 300 * aspect + 20;
  const sizeOk = w > 0 && h > 0 && name.trim().length > 0;

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal feature-card" role="dialog" aria-modal="true" aria-label={mode === 'draw' ? 'Dibujar pieza propia' : 'Importar pieza desde SVG'}>
        <h2 className="h4">{mode === 'draw' ? 'Dibujar pieza propia' : 'Importar pieza desde SVG'}</h2>
        {err && <p className="alert error" role="alert">{err}</p>}

        {!ring && mode === 'svg' && (
          <div className="stack">
            <p className="caption">Sube un SVG con la silueta de la pieza (path, polygon, rect, circle o ellipse). Se usa el contorno exterior de la forma más grande; las curvas se convierten en polígonos.</p>
            <input type="file" accept=".svg,image/svg+xml" aria-label="Archivo SVG" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        )}

        {!ring && mode === 'draw' && (
          <div className="stack">
            <p className="caption">Haz clic para añadir puntos alrededor de la pieza. Cierra la forma haciendo clic en el primer punto (verde).</p>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="draw-area" onPointerDown={pointer} role="img" aria-label="Área de dibujo de la pieza">
              <rect width={W} height={H} fill="var(--cs-surface-sunk)" />
              {draft.length > 1 && <polyline points={draft.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--cs-text)" strokeWidth="2" strokeDasharray="6 4" />}
              {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? 7 : 4} fill={i === 0 ? '#5BD69A' : '#fff'} stroke="#0B0F0D" strokeWidth="1.5" />)}
            </svg>
            <div className="row wrap">
              <button className="btn ghost sm" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))}>Deshacer punto</button>
              <button className="btn dark sm" disabled={draft.length < 3} onClick={() => accept(draft)}>Cerrar forma</button>
            </div>
          </div>
        )}

        {ring && (
          <div className="stack">
            <svg viewBox={`0 0 400 ${prevH}`} className="draw-area" aria-label="Vista previa de la pieza">
              <rect width="400" height={prevH} fill="var(--cs-surface-sunk)" />
              <path d={ringPath(preview)} fill="var(--cs-piece-a)" fillOpacity=".9" stroke="var(--cs-ov-casing)" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            {note && <p className="caption">{note}</p>}
            <label className="field"><span>Nombre</span><span className="input-wrap"><input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!name.trim()} /></span></label>
            <div className="row3">
              <NumField label="Ancho" value={w} min={0} exclusive suffix={unit} onCommit={(n) => { setW(n); if (keep) setH(Math.round(n * aspect * 10) / 10); }} />
              <NumField label="Alto" value={h} min={0} exclusive suffix={unit} onCommit={(n) => { setH(n); if (keep) setW(Math.round((n / aspect) * 10) / 10); }} />
            </div>
            <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Mantener proporción</label>
          </div>
        )}

        <div className="row wrap modal-foot">
          {ring && <button className="btn primary sm" disabled={!sizeOk} onClick={() => onSave({ name: name.trim(), shape: normalizeRing(ring).shape, w, h })}>Añadir al pedido</button>}
          {ring && <button className="btn ghost sm" onClick={() => { setRing(null); setDraft([]); setNote(null); }}>Empezar de nuevo</button>}
          <button ref={first} className="btn ghost sm" onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
