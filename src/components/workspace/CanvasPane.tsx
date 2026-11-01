import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { KIND_LABEL } from '../../engine/templates';
import { bbox } from '../../lib/poly';
import { centroid, fmt, kitQtyFor, pieceLabel, type Project } from '../../state';
import Stage, { templateLetter, type Mode } from '../Stage';
import { Popover } from './Menu';
import { Swatch } from './PiecesStep';
import { CanvasToolbar, type Tool } from './primitives';
import { originPill } from './Step1Panel';
import { ToastRegion } from './Toasts';
import type { WS } from './useWorkspace';

/** Lienzo: foto + capas, etiqueta de procedencia, pista del modo, herramientas del paso, avisos y leyenda. */

type TagKind = 'plain' | 'ai' | 'human' | 'ok' | 'stale' | 'danger';
function Tag({ kind, children, testId, bare }: { kind: TagKind; children: ReactNode; testId?: string; bare?: boolean }) {
  const line = bare ? null : kind === 'ai' ? 'ux-tag__dash' : kind === 'stale' ? 'ux-tag__dot' : kind === 'plain' ? null : 'ux-tag__solid';
  return <span className={`ux-tag ${kind !== 'plain' ? `ux-tag--${kind}` : ''}`} data-testid={testId}>{line && <span className={line} aria-hidden="true" />}{children}</span>;
}

/** Ficha de la pieza seleccionada, junto a la pieza (sustituye el aviso del panel). */
function PlacementPopover({ w, host }: { w: WS; host: React.RefObject<HTMLDivElement | null> }) {
  const r = w.result!;
  const pl = r.solution.placements[w.selPlacement!];
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ti = r.problem.templates.findIndex((t) => t.id === pl?.templateId);
  const def = w.resultDefs.find((d) => d.id === pl?.templateId);
  useLayoutEffect(() => {
    const svg = host.current?.querySelector('svg.stage') as SVGSVGElement | null;
    const box = host.current?.getBoundingClientRect();
    const m = svg?.getScreenCTM();
    if (!pl || !m || !box) return;
    const c = centroid(pl.polygon), b = bbox(pl.polygon);
    const q = new DOMPoint(c[0], b.y1).matrixTransform(m);
    setPos({ left: Math.max(8, Math.min(box.width - 268, q.x - box.left - 130)), top: Math.min(box.height - 90, q.y - box.top + 8) });
  }, [pl, host]);
  if (!pl || !def) return null;
  const label = pieceLabel(ti, pl.instance, kitQtyFor(r, pl.templateId));
  return (
    <div className="ux-placement" role="status" data-testid="placement-popover" style={pos ?? { visibility: 'hidden' }}>
      <Swatch i={ti} color={def.color} />
      <div><b>{label} · {def.name} #{pl.instance + 1}</b><br /><span className="cs-caption">giro {pl.rotation}° · {fmt(def.w)} × {fmt(def.h)} {r.unit} · {KIND_LABEL[def.kind]}</span></div>
      <button type="button" className="ux-iconbtn" aria-label="Cerrar ficha" onClick={() => w.setSelPlacement(null)}>×</button>
    </div>
  );
}

function Legend({ w }: { w: WS }) {
  const r = w.result!;
  const items = (
    <>
      {w.resultDefs.map((d, i) => <li key={d.id}><Swatch i={i} color={d.color} size={16} />{templateLetter(i)} · {d.name}</li>)}
      <li><span className="cs-swatch cs-swatch--defect" style={{ width: 16, height: 16 }} aria-hidden="true" />Zona excluida</li>
    </>
  );
  const scheme = r.kits && r.kits.n > 1 ? 'Cada pieza lleva su número de juego («A1·2» = pieza A, copia 1, juego 2).' : 'Etiqueta = letra de la pieza + número de copia.';
  return (
    <>
      <ul className="ux-legend ux-legend--strip" aria-label="Leyenda" title={scheme}>{items}<li className="ux-sr">{scheme}</li></ul>
      <details className="ux-legend ux-legend--chip">
        <summary>Leyenda</summary>
        <ul aria-label="Leyenda">{items}<li className="ux-legend__note">{scheme}</li></ul>
      </details>
    </>
  );
}

export function CanvasPane({ w, p }: { w: WS; p: Project }) {
  const host = useRef<HTMLDivElement>(null);
  const detectBtn = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState(false);
  const { step, result, stale } = w;
  const drawingZone = !!w.draft && w.drawTarget === 'defect';
  const tracing = !!w.draft && w.drawTarget === 'contour';
  const verifiedOk = step === 3 && !!result && result.verify.valid && !stale && result.solution.placements.length > 0;
  useEffect(() => { if (step !== 3) setZoom(false); }, [step]);

  /* ---------- etiqueta y pista ---------- */
  let tag: ReactNode = null;
  let hint: string | null = null;
  const origin = () => { const o = originPill(p.source, p.edited); return <Tag kind={o.cls.includes('ai') ? 'ai' : o.cls.includes('human') ? 'human' : 'plain'} testId="canvas-tag">{o.text.replace(' · SAM 3.1', '')}</Tag>; };
  if (step === 1) {
    if (w.proposal) tag = <Tag kind={w.proposal.source === 'sam' ? 'ai' : 'plain'} testId="canvas-tag">{w.proposal.source === 'sam' ? 'Propuesta IA' : 'Propuesta sin IA'}</Tag>;
    else if (p.contour.length && !w.redetect) tag = origin();
    else tag = <Tag kind="plain" testId="canvas-tag">{w.img.exampleId ? 'Imagen de ejemplo' : w.img.name}</Tag>;
    if (w.mode === 'points') hint = 'Clic = incluir · Shift+clic o clic derecho = excluir';
    else if (tracing) hint = 'Clic para añadir puntos · clic en el primero para cerrar';
    else if (w.mode === 'contour' && !w.proposal) hint = 'Arrastra un vértice · clic en un borde añade · Supr quita';
  } else if (step === 2) {
    tag = w.detected.length ? <Tag kind="ai" testId="canvas-tag">{w.detected.length === 1 ? '1 zona propuesta' : `${w.detected.length} zonas propuestas`}</Tag> : origin();
    if (w.mode === 'calib') hint = `Marca 2 puntos de longitud conocida (${w.calibPts.length}/2)`;
    else if (drawingZone) hint = 'Clic para añadir puntos · clic en el primero para cerrar';
    else if (w.mode === 'defects' && w.selDefect !== null) hint = 'Arrastra los vértices de la zona · Supr quita uno';
  } else {
    if (w.busy === 'opt') tag = <Tag kind="plain" testId="canvas-tag">Calculando · semilla {w.problem?.seed ?? 1}</Tag>;
    else if (!result) tag = null;
    else if (!result.verify.valid) tag = <Tag kind="danger" testId="canvas-tag">Falló la verificación</Tag>;
    else if (stale) tag = <Tag kind="stale" testId="canvas-tag">Desactualizado · reoptimiza</Tag>;
    else if (!result.solution.placements.length) tag = <Tag kind="plain" testId="canvas-tag">Sin solución válida</Tag>;
    else if (w.tab === 'leftover' && w.leftover) tag = <Tag kind="ok" testId="canvas-tag">Sobrante · {w.leftover.fragments.length === 1 ? '1 fragmento' : `${w.leftover.fragments.length} fragmentos`}</Tag>;
    else tag = <Tag kind="ok" bare testId="canvas-tag">✓ Verificado</Tag>;
    if (drawingZone) hint = 'Clic para añadir puntos · clic en el primero para cerrar';
  }

  /* ---------- herramientas del paso (las únicas herramientas de lienzo) ---------- */
  const zoneDraw: (Tool | 'sep')[] = drawingZone
    ? [{ id: 'cancel-draw', label: 'Cancelar trazado', icon: 'x', onClick: () => w.setDraft(null) }]
    : [
      { id: 'draw-zone', label: 'Dibujar', more: ' zona', icon: 'poly', onClick: w.startDefect },
      { id: 'circle', label: 'Círculo', icon: 'circle', onClick: w.quickDefect },
    ];
  let tools: (Tool | 'sep')[] = [];
  let toolsLabel = '';
  if (step === 1) {
    toolsLabel = 'Herramientas del contorno';
    if (tracing) tools = [{ id: 'cancel-trace', label: 'Cancelar trazado', icon: 'x', onClick: () => w.setDraft(null) }];
    else if (w.mode === 'points') tools = [
      { id: 'points-done', label: 'Terminar puntos', icon: 'target', pressed: true, onClick: w.togglePoints },
      ...(w.samPoints.length ? [{ id: 'points-clear', label: `Quitar ${w.samPoints.length}`, icon: 'x' as const, onClick: () => w.setSamPoints([]) }] : []),
    ];
    else if (p.contour.length && !w.proposal && !w.redetect) tools = [
      { id: 'revert', label: 'Volver al último válido', icon: 'undo', disabled: !w.canRevert, onClick: w.revertContour },
      'sep',
      { id: 'redetect', label: 'Detectar de nuevo', icon: 'spark', ai: true, onClick: () => { w.setRedetect(true); w.setMode('view'); } },
      { id: 'zoom', label: zoom ? 'Reducir' : 'Ampliar', icon: 'expand', pressed: zoom, onClick: () => setZoom((z) => !z) },
    ];
  } else if (step === 2 && (w.openItem === 'zones' || drawingZone || w.detected.length > 0)) {
    toolsLabel = 'Herramientas de zonas';
    tools = [...zoneDraw, 'sep', { id: 'detect', label: 'Detectar', more: ' con IA', icon: 'spark', ai: true, popup: 'dialog', expanded: w.detectOpen, disabled: !!w.busy || drawingZone, ref: detectBtn, onClick: () => w.setDetectOpen(!w.detectOpen) }];
  } else if (step === 2 && w.mode === 'calib') {
    toolsLabel = 'Calibración';
    tools = [{ id: 'zoom', label: zoom ? 'Reducir' : 'Ampliar', icon: 'expand', pressed: zoom, onClick: () => setZoom((z) => !z) }];
  } else if (step === 3 && result && w.busy !== 'opt') {
    toolsLabel = 'Herramientas del resultado';
    tools = [
      { id: 'photo', label: 'Foto', icon: 'photo', pressed: w.showImage, onClick: () => w.setShowImage(!w.showImage) },
      'sep',
      ...(w.zoneTools
        ? [...zoneDraw, { id: 'zones-done', label: 'Listo', icon: 'x' as const, onClick: () => { w.setZoneTools(false); w.setDraft(null); w.setMode('view'); w.setSelDefect(null); } }]
        : [{ id: 'mark-zone', label: 'Marcar zona', icon: 'poly' as const, expanded: false, onClick: () => { w.setZoneTools(true); w.setTab('plan'); } }]),
    ];
  }

  const stageMode: Mode = w.draft ? 'view' : w.mode;
  const b = p.contour.length > 2 ? bbox(p.contour) : null;
  const guide = step === 2 && w.openItem === 'scale' && !p.calib && w.scaleMethod === 'width' && b
    ? { x0: b.x0, x1: b.x1, y: Math.min(w.img.h - 16, b.y1 + 18), label: 'ancho = ? cm' } : null;
  const outlineKind = verifiedOk ? 'verified' : step === 3 && stale ? 'stale' : p.edited || p.source === 'manual' ? 'human' : 'ai';
  const detectErr = w.errAt === 'zones' ? w.err : null;

  return (
    <div className={`ux-canvas ${zoom ? 'ux-canvas--zoom' : ''}`} ref={host}>
      <div className="ux-stage">
        <Stage
          src={w.img.src} w={w.img.w} h={w.img.h} showImage={step !== 3 || w.showImage} mode={stageMode}
          contour={p.contour} onContour={w.setContour} proposal={w.proposal?.polygon}
          defects={p.defects} onDefects={(d) => w.setDefectsGeom(d)} selDefect={w.selDefect} onSelDefect={w.setSelDefect}
          draft={w.draft} onDraft={w.setDraft} onCloseDraft={w.closeDraft}
          calibPts={w.calibPts} onCalibPts={w.setCalibPts} samPoints={w.samPoints} onSamPoints={w.setSamPoints}
          placements={step === 3 && result ? result.solution.placements : []} templates={result ? result.problem.templates : []} stale={stale}
          kitQty={result ? Object.fromEntries(result.problem.templates.flatMap((t) => { const q = kitQtyFor(result, t.id); return q ? [[t.id, q] as const] : []; })) : undefined}
          defectProposals={w.detected.map((d) => d.ring)}
          leftover={step === 3 && w.leftover && !stale ? w.leftover.fragments.map((f) => f.outer) : undefined}
          dimPieces={step === 3 && !!w.leftover}
          outlineKind={outlineKind} guide={guide}
          selPlacement={w.selPlacement} onSelPlacement={w.setSelPlacement}
        />
      </div>
      <div className="ux-canvas__top">
        {tag}
        <span className="ux-spacer" />
        {hint && <span className="ux-tag" data-testid="canvas-hint">{hint}</span>}
        {step === 3 && result && result.problem.templates.length > 0 && !hint && <Legend w={w} />}
      </div>
      {step === 3 && w.selPlacement !== null && result && <PlacementPopover w={w} host={host} />}
      <ToastRegion toasts={w.toasts.toasts} onDismiss={w.toasts.dismiss} />
      {tools.length > 0 && <CanvasToolbar label={toolsLabel} tools={tools} />}
      <Popover open={w.detectOpen && step === 2} onClose={() => w.setDetectOpen(false)} anchorRef={detectBtn} role="dialog" label="Detectar defectos con IA" placement="up" align="start" width={320} className="ux-detect" testId="detect-popover">
        <div className="ux-pop-body">
          <span className="cs-pill cs-pill--ai ux-left">Detectar con IA</span>
          <label className="cs-field"><span className="cs-label">¿Qué buscar? (en inglés)</span>
            <input className="cs-input cs-mono" value={w.detectPhrases} data-testid="detect-phrases" onChange={(e) => w.setDetectPhrases(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !w.busy) w.detectDefects(); }} />
          </label>
          <p className="cs-hint">Hasta 4 frases separadas por comas. Nada se aplica hasta que lo aceptes.</p>
          {detectErr && <p className="cs-error" role="alert">{detectErr}</p>}
          <button type="button" className="cs-btn cs-btn--secondary" data-testid="detect-search" aria-busy={w.busy === 'detect' || undefined} disabled={!!w.busy} onClick={w.detectDefects}>{w.busy === 'detect' ? 'Buscando con SAM…' : 'Buscar con SAM'}</button>
        </div>
      </Popover>
    </div>
  );
}
