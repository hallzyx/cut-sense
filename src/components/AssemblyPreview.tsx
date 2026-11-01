import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AgentPiece } from '../lib/agentSchema';
import { AssemblyApiError, requestAlign, requestCritique, requestScene } from '../lib/assembly/client';
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
 * 1. A deterministic scene (archetype macro picked from the product name) is built at once; it is
 *    the baseline every model answer is measured against, and what is shown if the model fails.
 * 2. Muse Spark proposes its own scene (validated data, never code).
 * 3. Up to two critique rounds: the assembled model is rendered from four angles and sent with
 *    the scene and the automatic sanity report; the model answers "ok" or a corrected scene.
 * 4. Verification: if the deterministic checks still measure problems (detached or floating pieces,
 *    misplaced sleeves…), one more call asks the model to fix exactly those.
 * Every candidate is scored by the deterministic checks and a worse one is never accepted. While the
 * pipeline runs the viewer stays mounted (it renders the captures) under an opaque progress overlay;
 * the 3D appears only once the final scene is chosen. three.js is loaded on demand.
 */
export interface AssemblyPreviewProps {
  productName: string;
  pieces: AgentPiece[];
  assumptions?: string[];
  /** Use the AI modelling, critique and verification (default true). Without it the rule-based scene is shown. */
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
  state(): { phase: Phase; source: Source; sanity: Sanity | null; scene: SceneSpec | null; log: string[]; ready: boolean; pct: number };
}

type Phase = 'idle' | 'modelling' | 'reviewing' | 'aligning' | 'finalizing' | 'done' | 'failed' | 'unavailable';
type Source = 'rules' | 'ai' | 'ai-reviewed' | 'given';
interface Current { scene: SceneSpec; rig: Rig; sanity: Sanity; text: string; source: Source; warnings: string[] }

const VIEWS = [{ az: 30, el: 32 }, { az: 210, el: 32 }, { az: 100, el: 8 }, { az: 0, el: 85 }];
const cache = new Map<string, { scene: SceneSpec; source: Source }>();
/** Share of the progress bar for each model call (percent); the bar only moves forward and stops at 99 until the reveal. */
const STAGES = { scene: [0, 34], review1: [34, 56], review2: [56, 74], align: [74, 94], finalize: [94, 99] } as const;
const BUSY: Phase[] = ['modelling', 'reviewing', 'aligning', 'finalizing'];

function build(raw: unknown, pieces: AgentPiece[], source: Source): Current | { error: string } {
  const v = validateScene(raw, pieces);
  if (!v.ok) return { error: v.error };
  const rig = buildRig(v.scene, pieces, v.unused);
  const sanity = sanityCheck(rig);
  return { scene: v.scene, rig, sanity, text: describeRig(rig, sanity), source, warnings: v.warnings };
}

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
  idle: '', modelling: 'Modelling the assembly with AI…', reviewing: 'Reviewing the model with AI…', aligning: 'Checking that every piece fits…',
  finalizing: 'Preparing the 3D preview…', done: '', failed: 'The AI did not answer; showing the rule-based assembly.', unavailable: 'AI unavailable; showing the rule-based assembly.',
};
const PARTIAL = 'The AI review did not finish; showing the best assembly so far.';

export function AssemblyPreview({ productName, pieces, assumptions = [], ai = true, scene: given, onDevApi }: AssemblyPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [viewerState, setViewerState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewerTry, setViewerTry] = useState(0);
  const [current, setCurrent] = useState<Current | null>(null);
  const [inputError, setInputError] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [failNote, setFailNote] = useState('');
  const [round, setRound] = useState(0);
  const [aiTry, setAiTry] = useState(0);
  const [progress, setProgress] = useState(0);
  const [pipePct, setPipePct] = useState(0);
  const [mode, setMode] = useState<ColorMode>('material');
  const [reviewIssues, setReviewIssues] = useState<string[]>([]);
  const playRef = useRef(0);
  const progressRef = useRef(0);
  const pctRef = useRef(0);
  const capRef = useRef(0);
  const logRef = useRef<string[]>([]);
  const firstShow = useRef(true);
  const descId = useId();
  const labelId = useId();
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const piecesKey = JSON.stringify(pieces);
  const busy = BUSY.includes(phase);

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

  // Pipeline progress: completed stages move the bar; within a stage it creeps toward 85 % of the
  // stage's share, so it never runs ahead of the work, never goes back and never passes 99 before the reveal.
  const bump = useCallback((v: number) => {
    const n = Math.min(99, Math.max(pctRef.current, v));
    if (n !== pctRef.current) { pctRef.current = n; setPipePct(n); }
  }, []);
  const enter = useCallback(([from, to]: readonly [number, number]) => { bump(from); capRef.current = Math.min(99, from + 0.85 * (to - from)); }, [bump]);
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      const p = pctRef.current, cap = capRef.current;
      if (cap > p + 0.05) bump(p + Math.max(0.05, (cap - p) * 0.05));
    }, 250);
    return () => window.clearInterval(id);
  }, [busy, bump]);

  useEffect(() => { progressRef.current = progress; if (!busy) viewerRef.current?.setProgress(progress); }, [progress, viewerState, busy]);
  useEffect(() => { viewerRef.current?.setColorMode(mode); }, [mode, viewerState]);
  // The shown scene reaches the viewer only once the pipeline is over (until then the viewer renders the captures, hidden).
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !current || viewerState !== 'ready' || busy) return;
    v.setRig(current.rig);
    v.setColorMode(mode);
    v.setProgress(progressRef.current);
    if (firstShow.current) { firstShow.current = false; animateTo(0, 1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, viewerState, busy]);

  // Scene pipeline: rules → model → critique → verification → reveal.
  useEffect(() => {
    const ctl = new AbortController();
    const log = (s: string) => { logRef.current.push(s); };
    logRef.current = [];
    setReviewIssues([]);
    setRound(0);
    setFailNote('');
    const { pieces: clean, error } = sanitizePieces(pieces);
    if (error) { setInputError(error); setCurrent(null); return; }
    setInputError('');
    const fb = build(fallbackScene(productName, clean, assumptions), clean, 'rules');
    if ('error' in fb) { setInputError(fb.error); return; }
    const reveal = (c: Current, ph: Phase) => { firstShow.current = true; setCurrent(c); setPhase(ph); };
    if (given !== undefined) {
      const g = build(given, clean, 'given');
      if ('error' in g) log(`given scene is invalid: ${g.error}`);
      reveal('error' in g ? fb : g, 'done');
      return () => ctl.abort();
    }
    const key = `${productName}\u0000${piecesKey}`;
    const hit = cache.get(key);
    if (hit) {
      const c = build(hit.scene, clean, hit.source);
      if (!('error' in c)) { reveal(c, 'done'); return () => ctl.abort(); }
    }
    if (!ai) { reveal(fb, 'idle'); return () => ctl.abort(); }

    // Gate the 3D: nothing is shown until the final scene is chosen.
    setCurrent(null);
    pctRef.current = 0; capRef.current = 0; setPipePct(0);
    log(`rules: ${fb.scene.macro.type}, penalty ${fb.sanity.penalty}`);
    (async () => {
      let cur: Current = fb;
      const req = { productName, pieces: clean, assumptions };
      try {
        setPhase('modelling');
        enter(STAGES.scene);
        const res = await requestScene(req, ctl.signal);
        log(`model scene in ${res.latencyMs} ms${res.warnings.length ? `; warnings: ${res.warnings.join(' | ')}` : ''}`);
        const cand = build(res.scene, clean, 'ai');
        if ('error' in cand) log(`model scene dropped: ${cand.error}`);
        else if (cand.sanity.penalty > fb.sanity.penalty) log(`model scene worse than the rule-based one (penalty ${cand.sanity.penalty} vs ${fb.sanity.penalty}); reviewing the rule-based one`);
        else { cur = cand; log(`model scene accepted (penalty ${cand.sanity.penalty})`); }

        // Critique: render the assembled object (hidden) and let the model judge it.
        const viewer = await waitFor(() => viewerRef.current, ctl.signal);
        if (ctl.signal.aborted) return;
        const shoot = (c: Current) => { if (!viewer) return ''; viewer.setRig(c.rig); return viewer.capture(VIEWS, 384, 1); };
        if (!viewer) log('no 3D view: skipping the image review');
        for (let r = 1; viewer && r <= 2; r++) {
          setPhase('reviewing');
          setRound(r);
          enter(r === 1 ? STAGES.review1 : STAGES.review2);
          const out = await requestCritique({ ...req, scene: explicitScene(cur.scene), image: shoot(cur), sanity: sanityText(cur.sanity), round: r }, ctl.signal);
          log(`review ${r}: ${out.verdict} (${out.score}/10) in ${out.latencyMs} ms${out.issues.length ? ` — ${out.issues.join(' | ')}` : ''}`);
          setReviewIssues(out.issues);
          if (out.verdict === 'ok') { if (cur.source === 'ai') cur = { ...cur, source: 'ai-reviewed' }; break; }
          const next = build(out.scene, clean, 'ai-reviewed');
          if ('error' in next) { log(`correction dropped: ${next.error}`); break; }
          if (JSON.stringify(next.scene.nodes) === JSON.stringify(cur.scene.nodes)) { log('the review does not change the scene; stopping'); break; }
          if (next.sanity.penalty > cur.sanity.penalty) { log(`correction dropped: worse (penalty ${next.sanity.penalty} vs ${cur.sanity.penalty})`); break; }
          cur = next;
          log(`correction accepted (penalty ${cur.sanity.penalty})`);
        }
        bump(STAGES.align[0]);

        // Verification: one more call only if the deterministic checks still measure problems.
        if (cur.sanity.penalty > 0) {
          setPhase('aligning');
          enter(STAGES.align);
          const out = await requestAlign({ ...req, scene: explicitScene(cur.scene), issues: cur.sanity.issues, sanity: sanityText(cur.sanity), image: shoot(cur) || undefined }, ctl.signal);
          log(`verification in ${out.latencyMs} ms${out.changes.length ? ` — ${out.changes.join(' | ')}` : ''}`);
          const next = build(out.scene, clean, 'ai-reviewed');
          if ('error' in next) log(`verification dropped: ${next.error}`);
          else if (next.sanity.penalty < cur.sanity.penalty) { cur = next; log(`verification accepted (penalty ${cur.sanity.penalty})`); }
          else log(`verification dropped: no improvement (penalty ${next.sanity.penalty} vs ${cur.sanity.penalty})`);
        } else log('verification: no measured problems');

        setPhase('finalizing');
        enter(STAGES.finalize);
        await new Promise((r) => setTimeout(r, 120));
        if (ctl.signal.aborted) return;
        bump(99);
        cache.set(key, { scene: explicitScene(cur.scene), source: cur.source });
        reveal(cur, 'done');
      } catch (e) {
        if ((e as Error).name === 'AbortError' || ctl.signal.aborted) return;
        const code = e instanceof AssemblyApiError ? e.code : 'ERROR';
        log(`IA: ${code} ${(e as Error).message}`);
        // Never hang: show the best scene measured so far, with an honest note.
        const unavailable = code === 'ASSEMBLY_NOT_CONFIGURED' || (e instanceof AssemblyApiError && e.status === 404);
        if (cur !== fb) setFailNote(PARTIAL);
        reveal(cur, unavailable && cur === fb ? 'unavailable' : 'failed');
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
      state: () => ({ phase, source: current?.source ?? 'rules', sanity: current?.sanity ?? null, scene: current?.scene ?? null, log: logRef.current, ready: viewerState === 'ready' && !!current && !busy, pct: pctRef.current }),
    });
  }, [onDevApi, phase, current, viewerState, busy]);

  const onKey = (e: React.KeyboardEvent) => {
    const v = viewerRef.current;
    if (!v || busy) return;
    const map: Record<string, () => void> = {
      ArrowLeft: () => v.orbitBy(-12, 0), ArrowRight: () => v.orbitBy(12, 0), ArrowUp: () => v.orbitBy(0, 8), ArrowDown: () => v.orbitBy(0, -8),
      '+': () => v.zoomBy(0.85), '=': () => v.zoomBy(0.85), '-': () => v.zoomBy(1.18), Home: () => v.setView(current?.scene.camera.azimuth_deg ?? 30, current?.scene.camera.elevation_deg ?? 35),
    };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  };

  const pct = Math.round(progress * 100);
  const shownPct = Math.floor(pipePct);
  const stageText = phase === 'reviewing' ? `Reviewing the model with AI (${round}/2)…` : STATUS[phase];
  const sourceLabel = current?.source === 'ai-reviewed' ? 'Assembly proposed by AI and reviewed' : current?.source === 'ai' ? 'Assembly proposed by AI' : current?.source === 'given' ? 'Loaded scene' : 'Rule-based assembly';
  const thickness = current ? String(current.scene.material.thickness_mm) : '';
  const loose = current ? [...new Set(current.rig.loose.map((l) => l.piece))] : [];
  const note = phase === 'failed' ? failNote || STATUS.failed : phase === 'unavailable' ? STATUS.unavailable : '';

  if (inputError) {
    return (
      <section className="asm" aria-label="3D preview of the assembly">
        <p className="asm-error" role="alert">The 3D preview cannot be shown: {inputError}.</p>
      </section>
    );
  }

  return (
    <section className="asm" aria-label="3D preview of the assembly" aria-busy={busy}>
      <header className="asm-head">
        <div>
          <h3 className="asm-title">How it would look assembled</h3>
          <p className="asm-sub">{current?.scene.label || productName}</p>
        </div>
        <span className="cs-pill cs-pill--ai asm-pill">Approximate preview</span>
      </header>

      <div className="asm-stage" ref={stageRef} data-state={viewerState}>
        <canvas
          ref={canvasRef}
          className="asm-canvas"
          tabIndex={busy ? -1 : 0}
          role="img"
          aria-hidden={busy || undefined}
          aria-label={`3D model: ${current?.scene.label || productName}. Drag or use the arrow keys to rotate, + and − to zoom.`}
          aria-describedby={descId}
          onKeyDown={onKey}
        />
        {viewerState === 'loading' && !busy && <div className="asm-overlay" aria-hidden="true"><span className="asm-spinner" />Preparing the 3D preview…</div>}
        {viewerState === 'error' && (
          <div className="asm-overlay asm-overlay--error" role="alert">
            <p>The 3D preview could not start in this browser.</p>
            <button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" onClick={() => setViewerTry((x) => x + 1)}>Retry</button>
          </div>
        )}
        {!busy && (
          <div className="asm-tools" role="group" aria-label="Camera controls">
            <button type="button" className="asm-tool" onClick={() => viewerRef.current?.orbitBy(-20, 0)} aria-label="Rotate left">⟲</button>
            <button type="button" className="asm-tool" onClick={() => viewerRef.current?.orbitBy(20, 0)} aria-label="Rotate right">⟳</button>
            <button type="button" className="asm-tool" onClick={() => viewerRef.current?.zoomBy(0.85)} aria-label="Zoom in">+</button>
            <button type="button" className="asm-tool" onClick={() => viewerRef.current?.zoomBy(1.18)} aria-label="Zoom out">−</button>
            <button type="button" className="asm-tool" onClick={() => current && viewerRef.current?.setView(current.scene.camera.azimuth_deg, current.scene.camera.elevation_deg)} aria-label="Reset view">⌖</button>
          </div>
        )}
        {busy && viewerState !== 'error' && (
          <div
            className="asm-overlay asm-overlay--pipeline"
            role="progressbar"
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={shownPct}
            aria-valuetext={`${shownPct} %. ${stageText}`}
          >
            <span className="asm-spinner asm-spinner--lg" aria-hidden="true" />
            <span className="asm-pct" aria-hidden="true">{shownPct} %</span>
            <span className="asm-stage-label" id={labelId}>{stageText}</span>
            <span className="asm-bar" aria-hidden="true"><span className="asm-bar-fill" style={{ width: `${shownPct}%` }} /></span>
            <span className="asm-overlay-hint">The 3D preview appears once the model is reviewed and verified.</span>
          </div>
        )}
      </div>

      <div className="asm-controls">
        <label className="asm-slider">
          <span className="asm-slider-label">Assemble</span>
          <input
            type="range" min={0} max={100} step={1} value={pct} disabled={busy}
            onChange={(e) => { cancelAnimationFrame(playRef.current); setProgress(Number(e.target.value) / 100); }}
            aria-valuetext={pct === 0 ? 'Flat pieces' : pct === 100 ? 'Assembled object' : `${pct} % assembled`}
          />
          <span className="asm-ends" aria-hidden="true"><span>Flat pieces</span><span>Assembled</span></span>
        </label>
        <div className="asm-row">
          <button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" disabled={busy} onClick={() => animateTo(progress >= 0.99 ? 0 : progress, 1)}>
            {reduced ? 'Show assembled' : 'See how it goes together'}
          </button>
          <div className="cs-segmented" role="group" aria-label="Colors">
            <button type="button" aria-pressed={mode === 'material'} onClick={() => setMode('material')}>Material</button>
            <button type="button" aria-pressed={mode === 'pieces'} onClick={() => setMode('pieces')}>By piece</button>
          </div>
        </div>
      </div>

      <p className="asm-status" role="status" aria-live="polite">
        {busy ? stageText : current ? sourceLabel + (note ? ` · ${note}` : '') : ''}
        {phase === 'failed' && ai && given === undefined && (
          <button type="button" className="cs-link asm-retry" onClick={() => setAiTry((x) => x + 1)}>Retry with AI</button>
        )}
      </p>

      <p className="asm-caption">
        Approximate preview, not a technical drawing. Measurements taken from the pieces{thickness ? `; uniform ${thickness} mm thickness` : ''}, ideal folds and symbolic stitching and hardware.
        {loose.length > 0 && <> Not placed: {loose.map((l) => `“${l}”`).join(', ')}.</>}
      </p>
      {current && current.scene.assembly_notes.length > 0 && (
        <ul className="asm-notes" aria-label="Assembly assumptions">{current.scene.assembly_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      {reviewIssues.length > 0 && phase === 'done' && current?.source !== 'ai-reviewed' && (
        <p className="asm-caption">Review notes: {reviewIssues.join(' · ')}</p>
      )}
      <details className="asm-details">
        <summary>Model description</summary>
        <p id={descId}>{current ? `${current.scene.description ? current.scene.description + ' ' : ''}${current.text}` : 'Loading…'}</p>
      </details>
    </section>
  );
}

export default AssemblyPreview;
