import { forwardRef, useEffect, useRef, type ReactNode } from 'react';
import { calibPx, fmt, type Project } from '../../state';
import type { CheckId, CheckState } from '../../lib/workspaceUi';
import { Alert, PanelShell, Reason, UnitBadge } from './primitives';
import { PiecesStep } from './PiecesStep';
import type { WS } from './useWorkspace';

/** Paso 2 · Preparar: lista de tres ítems (Escala, Zonas, Piezas); uno abierto a la vez. */

const ORDER: CheckId[] = ['scale', 'zones', 'pieces'];

function ChecklistStep({ id, n, title, state, summary, open, onToggle, children }: { id: CheckId; n: number; title: string; state: CheckState; summary: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const heads = [...(e.currentTarget.closest('.ux-checklist')?.querySelectorAll<HTMLButtonElement>('.ux-check__head') ?? [])];
    const i = heads.indexOf(e.currentTarget);
    heads[(i + (e.key === 'ArrowDown' ? 1 : -1) + heads.length) % heads.length]?.focus();
  };
  const mark = state === 'done' ? 'hecho' : state === 'attention' ? 'requiere atención' : 'pendiente';
  return (
    <section className={`ux-check ux-check--${state === 'attention' ? 'attn' : state}`} data-open={open}>
      <button type="button" className="ux-check__head" id={`ch-${id}`} aria-expanded={open} aria-controls={`cb-${id}`} data-testid={`check-${id}`} data-state={state} onClick={onToggle} onKeyDown={onKey}>
        <span className="ux-check__mark" data-n={n} aria-hidden="true" />
        <span className="ux-check__title">{title}<span className="ux-sr"> ({mark})</span></span>
        <span className="ux-check__summary">{summary}</span>
        <span className="ux-check__chev" aria-hidden="true" />
      </button>
      {open && <div className="ux-check__body" id={`cb-${id}`} role="region" aria-labelledby={`ch-${id}`}>{children}</div>}
    </section>
  );
}

function ScaleStep({ w, p }: { w: WS; p: Project }) {
  const err = w.errAt === 'scale' ? w.err : null;
  const inputRef = useRef<HTMLInputElement>(null);
  if (p.calib) {
    return (
      <>
        {w.scaleNotice && w.items.scale.state === 'attention' && <Alert tone="warn">{w.scaleNotice} Esta escala está en {p.calib.unit}, no en cm.</Alert>}
        <p className="cs-measure" data-testid="calib-value">{fmt(calibPx(p.calib))} px = {fmt(p.calib.dist)} {p.calib.unit}</p>
        <p className="cs-hint">Medidas físicas solo si la foto es casi cenital.</p>
        <button type="button" className="cs-link ux-left" data-testid="remove-calib" onClick={w.removeCalib}>Quitar calibración</button>
      </>
    );
  }
  const ref = w.scaleMethod === 'ref';
  return (
    <>
      {w.scaleNotice && <Alert tone="warn" testId="scale-notice">{w.scaleNotice}</Alert>}
      <div className="cs-segmented ux-seg" role="group" aria-label="Método de calibración">
        <button type="button" aria-pressed={!ref} data-testid="calib-width" onClick={() => w.setCalibMethod('width')}>Por ancho</button>
        <button type="button" aria-pressed={ref} data-testid="calib-ref" onClick={() => w.setCalibMethod('ref')}>Con una referencia</button>
      </div>
      {!ref ? (
        <>
          <div className="ux-foot-row ux-foot-row--end">
            <label className="cs-field ux-grow"><span className="cs-label">Ancho real del material</span>
              <span className="cs-number"><input ref={inputRef} className="cs-input" inputMode="decimal" placeholder="36,5" value={w.widthCm} aria-invalid={!!err || undefined} aria-describedby="w-hint" data-testid="width-cm"
                onChange={(e) => w.setWidthCm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') w.calibByWidth(); }} /><span className="cs-number__unit">cm</span></span>
            </label>
            <button type="button" className="cs-btn cs-btn--secondary" data-testid="calib-apply" onClick={w.calibByWidth}>Calibrar</button>
          </div>
          {err && <p className="cs-error" role="alert">{err}</p>}
          <p className="cs-hint" id="w-hint">Mide la parte más ancha. ¿Sin regla? Una tarjeta bancaria mide 8,56 cm.</p>
          {w.img.exampleId && <button type="button" className="cs-link ux-left" data-testid="calib-example" onClick={w.calibExample}>Usar escala del ejemplo</button>}
        </>
      ) : (
        <>
          <p className="cs-hint" data-testid="calib-ref-hint"><b>Marca 2 puntos</b> de longitud conocida sobre la foto ({w.calibPts.length} de 2).</p>
          <div className="ux-foot-row ux-foot-row--end">
            <label className="cs-field ux-grow"><span className="cs-label">Distancia</span>
              <input className="cs-input cs-mono" inputMode="decimal" value={w.calibDist} aria-invalid={!!err || undefined} data-testid="calib-dist" onChange={(e) => w.setCalibDist(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && w.calibPts.length === 2) w.confirmCalib(); }} />
            </label>
            <label className="cs-field ux-unit"><span className="cs-label">Unidad</span>
              <input className="cs-input cs-mono" value={w.calibUnit} onChange={(e) => w.setCalibUnit(e.target.value)} />
            </label>
          </div>
          {err && <p className="cs-error" role="alert">{err}</p>}
          <div className="ux-foot-row">
            <button type="button" className="cs-btn cs-btn--secondary" disabled={w.calibPts.length !== 2} data-testid="calib-ref-apply" onClick={w.confirmCalib}>Aplicar</button>
            <button type="button" className="cs-btn cs-btn--ghost" onClick={w.cancelCalib}>Cancelar</button>
          </div>
        </>
      )}
      <p className="cs-caption">Sin calibrar, las medidas son relativas (1 u = 1 % del ancho de la foto), no centímetros.</p>
    </>
  );
}

function ZonesStep({ w, p }: { w: WS; p: Project }) {
  const err = w.errAt === 'zones' && !w.detectOpen ? w.err : null;
  const cardRef = useRef<HTMLDivElement>(null);
  // Al llegar propuestas de la IA, el foco pasa a la tarjeta de revisión.
  useEffect(() => { if (w.detected.length) cardRef.current?.focus(); }, [w.detected]);
  return (
    <>
      <p className="cs-hint">Ninguna pieza caerá sobre estas zonas. Usa las herramientas sobre la foto.</p>
      {err && <p className="cs-error" role="alert">{err}</p>}
      {p.defects.length === 0 && (
        <div className="ux-empty-note">
          <p className="cs-body-sm">¿Tu retazo tiene agujeros, manchas o costuras? Márcalos para que ninguna pieza caiga encima.</p>
          {!w.zonesConfirmed
            ? <button type="button" className="cs-link ux-left" data-testid="zones-none" onClick={() => w.setZonesConfirmed(true)}>No tiene defectos</button>
            : <p className="cs-caption">Marcado como sin defectos.</p>}
        </div>
      )}
      {p.defects.length > 0 && (
        <ul className="ux-zones" aria-label="Zonas excluidas">
          {p.defects.map((_, i) => (
            <li key={i} className="ux-zone" data-on={w.selDefect === i} data-testid={`zone-row-${i}`}>
              <span className="cs-swatch cs-swatch--defect" aria-hidden="true" />
              <button type="button" className="ux-zone__main" aria-pressed={w.selDefect === i} onClick={() => w.selectDefect(i)}>
                <span className="ux-zone__name">Zona {i + 1}{w.selDefect === i && <span className="ux-zone__tag"> · editando</span>}</span>
                {(w.outside[i] || w.zoneOrigins[i]) && <span className={`cs-caption ${w.outside[i] ? 'ux-warn-text' : ''}`}>{w.outside[i] ? '! fuera del material, sin efecto' : w.zoneOrigins[i]}</span>}
              </button>
              <span className="cs-measure ux-zone__area">{fmt(w.zoneAreas[i])} <small>{w.unit}²</small></span>
              <button type="button" className="ux-iconbtn" aria-label={`Eliminar zona ${i + 1}`} data-testid={`zone-del-${i}`} onClick={() => w.delDefect(i)}>
                <svg className="ux-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {w.live && p.defects.length > 0 && <div className="ux-sum"><span>Excluida (sin doble conteo)</span><b>{fmt(w.live.excludedArea / w.ppu ** 2)} {w.unit}²</b></div>}
      {w.detected.length > 0 && (
        <Alert tone="ai" title={`La IA propone ${w.detected.length === 1 ? '1 zona' : `${w.detected.length} zonas`}`} testId="detect-review" focusRef={cardRef}
          actions={<>
            <button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" data-testid="detect-accept" onClick={w.acceptDetected}>Añadir {w.detected.length === 1 ? 'la zona' : `las ${w.detected.length}`}</button>
            <button type="button" className="cs-btn cs-btn--sm cs-btn--ghost" data-testid="detect-discard" onClick={() => w.setDetected([])}>Descartar</button>
          </>}>
          {[...new Set(w.detected.map((d) => `«${d.phrase}»`))].join(', ')} · punteadas en azul sobre la foto. Nada se aplica hasta que lo aceptes.
        </Alert>
      )}
    </>
  );
}

export const PreparePanel = forwardRef<HTMLHeadingElement, { w: WS; p: Project }>(function PreparePanel({ w, p }, titleRef) {
  const { items } = w;
  const err = w.errAt === 'optimize' ? w.err : null;
  const toggle = (id: CheckId) => w.openCheck(w.openItem === id ? null : id);
  const titles: Record<CheckId, string> = { scale: 'Escala', zones: 'Zonas excluidas', pieces: 'Piezas' };
  const summaries: Record<CheckId, ReactNode> = {
    scale: <UnitBadge calibrated={!!p.calib} unit={p.calib?.unit ?? 'u'} />,
    zones: items.zones.label,
    pieces: items.pieces.label,
  };
  const body: Record<CheckId, ReactNode> = {
    scale: <ScaleStep w={w} p={p} />,
    zones: <ZonesStep w={w} p={p} />,
    pieces: <PiecesStep w={w} p={p} />,
  };
  const usable = w.live ? w.live.usableArea / w.ppu ** 2 : null;
  return (
    <PanelShell ref={titleRef} step={2} label="Panel del paso 2" title="Preparar"
      footer={<>
        {usable !== null && <div className="ux-sum" data-testid="usable-area"><span>Área útil</span><b>{p.calib ? '' : '≈ '}{fmt(usable)} {w.unit}²</b></div>}
        <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" disabled={!!w.blockReason || !!w.busy} aria-describedby={w.blockReason ? 'r2' : undefined} onClick={w.optimize}>Optimizar distribución</button>
        {w.blockReason && <Reason id="r2">{w.blockReason}</Reason>}
        {err && <p className="cs-error" role="alert">{err}</p>}
      </>}>
      <div className="ux-checklist">
        {ORDER.map((id, i) => (
          <ChecklistStep key={id} id={id} n={i + 1} title={titles[id]} state={items[id].state} summary={summaries[id]} open={w.openItem === id} onToggle={() => toggle(id)}>
            {body[id]}
          </ChecklistStep>
        ))}
      </div>
    </PanelShell>
  );
});
