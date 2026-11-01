import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AgentPiece } from '../lib/agentSchema';
import { AssemblyApiError, requestCritique, requestScene } from '../lib/assembly/client';
import { describeRig } from '../lib/assembly/describe';
import type { SceneSpec } from '../lib/assembly/dsl';
import { fallbackScene } from '../lib/assembly/fallback';
import { buildRig, type Rig } from '../lib/assembly/kinematics';
import { sanitizePieces } from '../lib/assembly/pieces';
import { sanityCheck, sanityText, type Sanity } from '../lib/assembly/sanity';
import { explicitScene, validateScene } from '../lib/assembly/validate';
import type { ColorMode, Viewer } from '../viewer3d/viewer';
import './AssemblyPreview.css';

/**
 * 3D assembly preview of the agent's flat pieces.
 *
 * 1. A deterministic scene (archetype macro picked from the product name) renders at once.
 * 2. Muse Spark proposes its own scene (validated data, never code); it replaces the first one
 *    unless it is geometrically worse.
 * 3. Up to two critique rounds: the assembled model is rendered from four angles and sent with
 *    the scene and the automatic sanity report; the model answers "ok" or a corrected scene.
 * three.js is loaded on demand, so the main bundle does not grow.
 */
export interface AssemblyPreviewProps {
  productName: string;
  pieces: AgentPiece[];
  assumptions?: string[];
  /** Use the AI modelling and critique (default true). Without it the rule-based scene is shown. */
  ai?: boolean;
  /** Dev/lab only: render this scene instead of asking the model. */
  scene?: unknown;
  /** Dev/lab only: receives a small control API (progress, view, capture, state). */
  onDevApi?: (api: AssemblyDevApi) => void;
}
export interface AssemblyDevApi {
  setProgress(t: number): void;
  setView(az: number, el: number): void;
  setColorMode(m: ColorMode): void;
  capture(views: { az: number; el: number }[], tile?: number, t?: number): string | null;
  state(): { phase: Phase; source: Source; sanity: Sanity | null; scene: SceneSpec | null; log: string[]; ready: boolean };
}

type Phase = 'idle' | 'modelling' | 'reviewing' | 'done' | 'failed' | 'unavailable';
type Source = 'rules' | 'ai' | 'ai-reviewed' | 'given';
interface Current { scene: SceneSpec; rig: Rig; sanity: Sanity; text: string; source: Source; warnings: string[] }

const VIEWS = [{ az: 30, el: 32 }, { az: 210, el: 32 }, { az: 100, el: 8 }, { az: 0, el: 85 }];
const cache = new Map<string, { scene: SceneSpec; source: Source }>();

function build(raw: unknown, pieces: AgentPiece[], source: Source): Current | { error: string } {
  const v = validateScene(raw, pieces);
  if (!v.ok) return { error: v.error };
  const rig = buildRig(v.scene, pieces, v.unused);
  const sanity = sanityCheck(rig);
  return { scene: v.scene, rig, sanity, text: describeRig(rig, sanity), source, warnings: v.warnings };
}
/** Prefer the candidate unless it is clearly worse geometrically. */
const better = (cand: Current, cur: Current) => cand.sanity.intersections <= cur.sanity.intersections && cand.rig.loose.length <= cur.rig.loose.length;

/** Resolve once `get` returns something (the viewer loads in parallel with the first model call). */
async function waitFor<T>(get: () => T | null, signal: AbortSignal, ms = 20_000): Promise<T | null> {
  const t0 = Date.now();
  while (!signal.aborted && Date.now() - t0 < ms) {
    const v = get();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

const STATUS: Record<Phase, string> = {
  idle: '', modelling: 'Modelando el armado con IA…', reviewing: 'Revisando con IA…', done: '', failed: 'La IA no respondió; se muestra el armado por reglas.', unavailable: 'IA no disponible; se muestra el armado por reglas.',
};

export function AssemblyPreview({ productName, pieces, assumptions = [], ai = true, scene: given, onDevApi }: AssemblyPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [viewerState, setViewerState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewerTry, setViewerTry] = useState(0);
  const [current, setCurrent] = useState<Current | null>(null);
  const [inputError, setInputError] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState(0);
  const [aiTry, setAiTry] = useState(0);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<ColorMode>('material');
  const [reviewIssues, setReviewIssues] = useState<string[]>([]);
  const playRef = useRef(0);
  const progressRef = useRef(0);
  const logRef = useRef<string[]>([]);
  const firstShow = useRef(true);
  const descId = useId();
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const piecesKey = JSON.stringify(pieces);

  // three.js viewer, loaded on demand.
  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    setViewerState('loading');
    import('../viewer3d/viewer').then(({ createViewer }) => {
      if (!alive || !canvasRef.current || !stageRef.current) return;
      const v = createViewer(canvasRef.current, { reducedMotion: reduced, onContextLost: () => setViewerState('error') });
      viewerRef.current = v;
      const fit = () => { const r = stageRef.current!.getBoundingClientRect(); v.resize(Math.max(1, r.width), Math.max(1, r.height)); };
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(stageRef.current);
      setViewerState('ready');
    }).catch(() => { if (alive) setViewerState('error'); });
    return () => {
      alive = false;
      ro?.disconnect();
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, [viewerTry, reduced]);

  const animateTo = useCallback((from: number, to: number) => {
    cancelAnimationFrame(playRef.current);
    if (reduced) { setProgress(to); return; }
    const t0 = performance.now(), dur = 2600 * Math.abs(to - from);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / Math.max(1, dur));
      setProgress(from + (to - from) * k);
      if (k < 1) playRef.current = requestAnimationFrame(step);
    };
    playRef.current = requestAnimationFrame(step);
  }, [reduced]);

  useEffect(() => { progressRef.current = progress; viewerRef.current?.setProgress(progress); }, [progress, viewerState]);
  useEffect(() => { viewerRef.current?.setColorMode(mode); }, [mode, viewerState]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !current || viewerState !== 'ready') return;
    v.setRig(current.rig);
    v.setColorMode(mode);
    v.setProgress(progressRef.current);
    if (firstShow.current) { firstShow.current = false; animateTo(0, 1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, viewerState]);

  // Scene pipeline: rules → model → critique.
  useEffect(() => {
    const ctl = new AbortController();
    const log = (s: string) => { logRef.current.push(s); };
    logRef.current = [];
    setReviewIssues([]);
    setRound(0);
    const { pieces: clean, error } = sanitizePieces(pieces);
    if (error) { setInputError(error); setCurrent(null); return; }
    setInputError('');
    const fb = build(fallbackScene(productName, clean, assumptions), clean, 'rules');
    if ('error' in fb) { setInputError(fb.error); return; }
    if (given !== undefined) {
      const g = build(given, clean, 'given');
      setCurrent('error' in g ? fb : g);
      setPhase('done');
      if ('error' in g) log(`escena dada inválida: ${g.error}`);
      return () => ctl.abort();
    }
    const key = `${productName}\u0000${piecesKey}`;
    const hit = cache.get(key);
    if (hit) {
      const c = build(hit.scene, clean, hit.source);
      if (!('error' in c)) { setCurrent(c); setPhase('done'); return () => ctl.abort(); }
    }
    setCurrent(fb);
    if (!ai) { setPhase('idle'); return () => ctl.abort(); }

    (async () => {
      let cur: Current = fb;
      try {
        setPhase('modelling');
        const res = await requestScene({ productName, pieces: clean, assumptions }, ctl.signal);
        log(`escena del modelo en ${res.latencyMs} ms${res.warnings.length ? `; avisos: ${res.warnings.join(' | ')}` : ''}`);
        const cand = build(res.scene, clean, 'ai');
        if ('error' in cand) log(`escena del modelo descartada: ${cand.error}`);
        else if (cand.sanity.intersections > fb.sanity.intersections + 1 || cand.rig.loose.length > fb.rig.loose.length + 1) log('escena del modelo peor que la de reglas; se revisa la de reglas');
        else { cur = cand; setCurrent(cand); }
        // Critique: render the assembled object and let the model judge it.
        for (let r = 1; r <= 2; r++) {
          setPhase('reviewing');
          setRound(r);
          const viewer = await waitFor(() => viewerRef.current, ctl.signal);
          if (ctl.signal.aborted || !viewer) return;
          viewer.setRig(cur.rig);
          const image = viewer.capture(VIEWS, 384, 1);
          viewer.setRig(cur.rig);
          viewer.setProgress(progressRef.current);
          const out = await requestCritique({ productName, pieces: clean, assumptions, scene: explicitScene(cur.scene), image, sanity: sanityText(cur.sanity), round: r }, ctl.signal);
          log(`revisión ${r}: ${out.verdict} (${out.score}/10) en ${out.latencyMs} ms${out.issues.length ? ` — ${out.issues.join(' | ')}` : ''}`);
          setReviewIssues(out.issues);
          if (out.verdict === 'ok') { cur = { ...cur, source: cur.source === 'rules' ? 'rules' : 'ai-reviewed' }; break; }
          const next = build(out.scene, clean, 'ai-reviewed');
          if ('error' in next) { log(`corrección descartada: ${next.error}`); break; }
          if (!better(next, cur)) { log('corrección descartada: más cruces o piezas sin colocar'); break; }
          if (JSON.stringify(next.scene.nodes) === JSON.stringify(cur.scene.nodes)) { log('la revisión no cambia la escena; se detiene'); break; }
          cur = next;
          setCurrent(next);
        }
        setCurrent(cur);
        cache.set(key, { scene: explicitScene(cur.scene), source: cur.source });
        setPhase('done');
      } catch (e) {
        if ((e as Error).name === 'AbortError' || ctl.signal.aborted) return;
        const code = e instanceof AssemblyApiError ? e.code : 'ERROR';
        log(`IA: ${code} ${(e as Error).message}`);
        setPhase(code === 'ASSEMBLY_NOT_CONFIGURED' || e instanceof AssemblyApiError && e.status === 404 ? 'unavailable' : cur === fb ? 'failed' : 'done');
      }
    })();
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productName, piecesKey, ai, given, aiTry]);

  useEffect(() => {
    onDevApi?.({
      setProgress: (t) => { cancelAnimationFrame(playRef.current); setProgress(t); viewerRef.current?.setProgress(t); },
      setView: (az, el) => viewerRef.current?.setView(az, el),
      setColorMode: (m) => setMode(m),
      capture: (views, tile, t) => viewerRef.current?.capture(views, tile, t) ?? null,
      state: () => ({ phase, source: current?.source ?? 'rules', sanity: current?.sanity ?? null, scene: current?.scene ?? null, log: logRef.current, ready: viewerState === 'ready' && !!current }),
    });
  }, [onDevApi, phase, current, viewerState]);

  const onKey = (e: React.KeyboardEvent) => {
    const v = viewerRef.current;
    if (!v) return;
    const map: Record<string, () => void> = {
      ArrowLeft: () => v.orbitBy(-12, 0), ArrowRight: () => v.orbitBy(12, 0), ArrowUp: () => v.orbitBy(0, 8), ArrowDown: () => v.orbitBy(0, -8),
      '+': () => v.zoomBy(0.85), '=': () => v.zoomBy(0.85), '-': () => v.zoomBy(1.18), Home: () => v.setView(current?.scene.camera.azimuth_deg ?? 30, current?.scene.camera.elevation_deg ?? 35),
    };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  };

  const pct = Math.round(progress * 100);
  const busy = phase === 'modelling' || phase === 'reviewing';
  const sourceLabel = current?.source === 'ai-reviewed' ? 'Armado propuesto por IA y revisado' : current?.source === 'ai' ? 'Armado propuesto por IA' : current?.source === 'given' ? 'Escena cargada' : 'Armado por reglas';
  const thickness = current ? String(current.scene.material.thickness_mm).replace('.', ',') : '';
  const loose = current ? [...new Set(current.rig.loose.map((l) => l.piece))] : [];

  if (inputError) {
    return (
      <section className="asm" aria-label="Vista previa 3D del armado">
        <p className="asm-error" role="alert">No se puede mostrar la vista 3D: {inputError}.</p>
      </section>
    );
  }

  return (
    <section className="asm" aria-label="Vista previa 3D del armado">
      <header className="asm-head">
        <div>
          <h3 className="asm-title">Así quedaría armado</h3>
          <p className="asm-sub">{current?.scene.label || productName}</p>
        </div>
        <span className="cs-pill cs-pill--ai asm-pill">Vista previa aproximada</span>
      </header>

      <div className="asm-stage" ref={stageRef} data-state={viewerState}>
        <canvas
          ref={canvasRef}
          className="asm-canvas"
          tabIndex={0}
          role="img"
          aria-label={`Modelo 3D: ${current?.scene.label || productName}. Arrastra o usa las flechas para girar, + y − para acercar.`}
          aria-describedby={descId}
          onKeyDown={onKey}
        />
        {viewerState === 'loading' && <div className="asm-overlay" aria-hidden="true"><span className="asm-spinner" />Preparando vista 3D…</div>}
        {viewerState === 'error' && (
          <div className="asm-overlay asm-overlay--error" role="alert">
            <p>No se pudo iniciar la vista 3D en este navegador.</p>
            <button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" onClick={() => setViewerTry((x) => x + 1)}>Reintentar</button>
          </div>
        )}
        {busy && <p className="asm-ai" aria-hidden="true"><span className="asm-dot" />{phase === 'reviewing' ? `Revisando con IA… (${round}/2)` : STATUS[phase]}</p>}
        <div className="asm-tools" role="group" aria-label="Controles de cámara">
          <button type="button" className="asm-tool" onClick={() => viewerRef.current?.orbitBy(-20, 0)} aria-label="Girar a la izquierda">⟲</button>
          <button type="button" className="asm-tool" onClick={() => viewerRef.current?.orbitBy(20, 0)} aria-label="Girar a la derecha">⟳</button>
          <button type="button" className="asm-tool" onClick={() => viewerRef.current?.zoomBy(0.85)} aria-label="Acercar">+</button>
          <button type="button" className="asm-tool" onClick={() => viewerRef.current?.zoomBy(1.18)} aria-label="Alejar">−</button>
          <button type="button" className="asm-tool" onClick={() => current && viewerRef.current?.setView(current.scene.camera.azimuth_deg, current.scene.camera.elevation_deg)} aria-label="Centrar vista">⌖</button>
        </div>
      </div>

      <div className="asm-controls">
        <label className="asm-slider">
          <span className="asm-slider-label">Armar</span>
          <input
            type="range" min={0} max={100} step={1} value={pct}
            onChange={(e) => { cancelAnimationFrame(playRef.current); setProgress(Number(e.target.value) / 100); }}
            aria-valuetext={pct === 0 ? 'Piezas planas' : pct === 100 ? 'Objeto armado' : `${pct} % armado`}
          />
          <span className="asm-ends" aria-hidden="true"><span>Piezas planas</span><span>Armado</span></span>
        </label>
        <div className="asm-row">
          <button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" onClick={() => animateTo(progress >= 0.99 ? 0 : progress, 1)}>
            {reduced ? 'Mostrar armado' : 'Ver cómo se arma'}
          </button>
          <div className="cs-segmented" role="group" aria-label="Colores">
            <button type="button" aria-pressed={mode === 'material'} onClick={() => setMode('material')}>Material</button>
            <button type="button" aria-pressed={mode === 'pieces'} onClick={() => setMode('pieces')}>Por pieza</button>
          </div>
        </div>
      </div>

      <p className="asm-status" role="status" aria-live="polite">
        {busy ? (phase === 'reviewing' ? `Revisando con IA… (${round}/2)` : STATUS[phase]) : current ? sourceLabel + (phase === 'failed' || phase === 'unavailable' ? ` · ${STATUS[phase]}` : '') : ''}
        {(phase === 'failed') && ai && given === undefined && (
          <button type="button" className="cs-link asm-retry" onClick={() => setAiTry((x) => x + 1)}>Reintentar con IA</button>
        )}
      </p>

      <p className="asm-caption">
        Vista previa aproximada, no es un plano técnico. Medidas tomadas de las piezas; grosor uniforme de {thickness} mm, pliegues ideales y costuras y herrajes simbólicos.
        {loose.length > 0 && <> Sin colocar: {loose.map((l) => `«${l}»`).join(', ')}.</>}
      </p>
      {current && current.scene.assembly_notes.length > 0 && (
        <ul className="asm-notes" aria-label="Supuestos del armado">{current.scene.assembly_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      {reviewIssues.length > 0 && phase === 'done' && current?.source !== 'ai-reviewed' && (
        <p className="asm-caption">Observaciones de la revisión: {reviewIssues.join(' · ')}</p>
      )}
      <details className="asm-details">
        <summary>Descripción del modelo</summary>
        <p id={descId}>{current ? `${current.scene.description ? current.scene.description + ' ' : ''}${current.text}` : 'Cargando…'}</p>
      </details>
    </section>
  );
}

export default AssemblyPreview;
