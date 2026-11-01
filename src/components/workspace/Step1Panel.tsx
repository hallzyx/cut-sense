import { forwardRef, useRef, useState } from 'react';
import { fmt } from '../../state';
import { Icon } from './Icon';
import { MenuItem, MenuLabel, MenuSep, Popover } from './Menu';
import { Alert, Disclosure, PanelShell, Reason, UnitBadge } from './primitives';
import { SOURCE_LABEL, type WS } from './useWorkspace';

/** Paso 1 · Digitalizar: pedir (F1) → propuesta (F2) → listo / inválido (F3). Una acción principal por estado. */

const PILL: Record<string, { cls: string; text: string }> = {
  sam: { cls: 'cs-pill--ai', text: 'Propuesta IA · SAM 3.1' },
  example: { cls: 'cs-pill--computed', text: 'Máscara guardada del ejemplo' },
  local: { cls: 'cs-pill--computed', text: 'Contraste local · no es Meta AI' },
  manual: { cls: 'cs-pill--human', text: 'Trazado manual' },
  leftover: { cls: 'cs-pill--computed', text: 'Sobrante del plan anterior' },
};

export function originPill(source: string | null, edited: boolean) {
  if (!source) return { cls: 'cs-pill--human', text: 'Trazado manual' };
  if (edited) return { cls: 'cs-pill--human', text: source === 'sam' ? 'IA + corregido por ti' : `${PILL[source].text} + corregido por ti` };
  return source === 'sam' ? { cls: 'cs-pill--ai', text: 'Propuesta IA · SAM 3.1' } : PILL[source];
}

function OtherWaysMenu({ w }: { w: WS }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const n = w.samPoints.length;
  return (
    <>
      <button ref={btn} type="button" className="cs-btn cs-btn--sm cs-btn--ghost" aria-haspopup="menu" aria-expanded={open} data-testid="otherways" disabled={!!w.busy} onClick={() => setOpen((o) => !o)}>
        Otras formas<Icon name={open ? 'caretUp' : 'caret'} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} label="Otras formas de digitalizar" placement="up" width={330} className="ux-otherways">
        <MenuLabel>Guiar a la IA</MenuLabel>
        <MenuItem icon="target" label={w.mode === 'points' ? 'Terminar de marcar puntos' : 'Marcar puntos de guía'} hint="Clic incluye · Shift+clic excluye" trailing={<span className="cs-badge cs-badge--count">{n}</span>} onSelect={w.togglePoints} testId="ow-points" />
        {n > 0 && <MenuItem icon="x" label="Quitar puntos de guía" onSelect={() => w.setSamPoints([])} testId="ow-clear-points" />}
        <MenuSep />
        <MenuLabel>Sin IA de Meta</MenuLabel>
        <MenuItem icon="contrast" label="Segmentar por contraste" hint="Local, en tu navegador" onSelect={w.runLocal} testId="ow-local" />
        {w.img.exampleId && <MenuItem icon="file" label="Usar máscara guardada" hint="Solo imágenes de ejemplo" onSelect={w.useCached} testId="ow-cached" />}
        <MenuItem icon="hand" label="Trazar a mano" hint="Clic por punto · clic en el primero para cerrar" onSelect={w.startManualTrace} testId="ow-trace" />
      </Popover>
    </>
  );
}

export const Step1Panel = forwardRef<HTMLHeadingElement, { w: WS; edited: boolean; source: string | null; samInfo: string | null; vertexCount: number; area: number | null }>(
  function Step1Panel({ w, edited, source, samInfo, vertexCount, area }, titleRef) {
    const hasContour = vertexCount > 0;
    const phase = w.proposal ? 'proposal' : hasContour && !w.redetect && !(w.draft && w.drawTarget === 'contour') ? (w.contourErr ? 'invalid' : 'ready') : 'prompt';
    const err = w.errAt === 'step1' ? w.err : null;

    if (phase === 'proposal' && w.proposal) {
      const pr = w.proposal;
      const pill = PILL[pr.source];
      const holes = pr.holes.length;
      return (
        <PanelShell ref={titleRef} step={1} label="Panel del paso 1" title="Digitalizar" status={<span className={`cs-pill ${pill.cls}`} data-testid="proposal-source">{pill.text}</span>}
          footer={<div className="ux-foot-row">
            <button type="button" className="cs-btn cs-btn--primary" data-testid="primary-action" onClick={w.acceptProposal}>Aceptar contorno</button>
            <button type="button" className="cs-btn cs-btn--ghost" data-testid="discard-proposal" onClick={() => w.setProposal(null)}>Descartar</button>
          </div>}>
          <p className="ux-question">¿Este es el borde de tu material?</p>
          <p className="cs-body-sm">La IA propone; tú tienes la última palabra.{holes > 0 && <> Encontramos <b>{holes === 1 ? '1 hueco' : `${holes} huecos`}</b>: {holes === 1 ? 'lo marcaremos como zona excluida' : 'los marcaremos como zonas excluidas'}.</>}</p>
          <Disclosure summary="Detalles técnicos" value={`${pr.polygon.length} vértices`}>
            <p className="cs-caption cs-mono">{SOURCE_LABEL[pr.source]} · {pr.info}</p>
          </Disclosure>
        </PanelShell>
      );
    }

    if (phase === 'ready' || phase === 'invalid') {
      const pill = originPill(source, edited);
      return (
        <PanelShell ref={titleRef} step={1} label="Panel del paso 1" title="Contorno listo" lead="Si algo no coincide con el borde real, corrígelo sobre la foto."
          footer={<>
            <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" disabled={phase === 'invalid' || !!w.busy} aria-describedby={phase === 'invalid' ? 'r1' : undefined} onClick={() => w.goStep(2)}>Continuar a Preparar</button>
            {phase === 'invalid' && <Reason id="r1">Corrige el contorno para continuar.</Reason>}
          </>}>
          {phase === 'invalid' && (
            <Alert tone="danger" role="alert" title="El contorno se cruza consigo mismo" testId="invalid-outline"
              actions={<button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" disabled={!w.canRevert} onClick={w.revertContour}><Icon name="undo" />Volver al último válido</button>}>
              {w.contourErr} Mueve el vértice marcado o vuelve al último válido. Optimizar queda bloqueado mientras tanto.
            </Alert>
          )}
          {err && <Alert tone="danger" role="alert">{err}</Alert>}
          <dl className="ux-facts">
            <div><dt>Origen</dt><dd><span className={`cs-pill ${pill.cls}`} data-testid="contour-origin">{pill.text}</span></dd></div>
            <div><dt>Área digitalizada</dt><dd className="cs-measure">{area !== null ? <>{fmt(area)} <small>{w.unit}²</small></> : '—'}</dd></div>
            <div><dt>Escala</dt><dd><UnitBadge calibrated={w.calibrated} unit={w.unit} /></dd></div>
          </dl>
          <Disclosure summary="Detalles técnicos" value={`${vertexCount} vértices`}>
            <p className="cs-caption cs-mono">{source ? SOURCE_LABEL[source as keyof typeof SOURCE_LABEL] : '—'}{edited ? ' + corrección humana' : ''}{samInfo ? ` · ${samInfo}` : ''}</p>
          </Disclosure>
        </PanelShell>
      );
    }

    // prompt (F1) — también tras un fallo de SAM (G5) o al «Detectar de nuevo».
    const busySam = w.busy === 'sam';
    const tracing = !!w.draft && w.drawTarget === 'contour';
    return (
      <PanelShell ref={titleRef} step={1} label="Panel del paso 1" title="Digitalizar" lead="La IA encuentra el borde de tu material; tú lo confirmas."
        footer={<>
          {busySam ? (
            <div role="status" className="ux-busy">
              <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" aria-busy="true" disabled>Leyendo el borde…</button>
              <div className="cs-progress cs-progress--indeterminate cs-progress--ai"><div className="cs-progress__bar" /></div>
              <button type="button" className="cs-link ux-cancel" onClick={w.cancelSam}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" disabled={!!w.busy || tracing || (!w.concept.trim() && !w.samPoints.length)} onClick={w.runSam}>
              <Icon name="spark" />{w.samFailed ? 'Reintentar SAM 3.1' : 'Detectar borde con IA'}
            </button>
          )}
          <div className="ux-foot-row ux-foot-row--split">
            <p className="cs-caption">Tu foto viaja a SAM 3.1 por nuestro servidor y no se guarda.</p>
            <OtherWaysMenu w={w} />
          </div>
        </>}>
        {w.samFailed && err ? (
          <Alert tone="danger" role="alert" title="La IA no pudo leer el borde esta vez" testId="sam-failed"
            actions={<>
              <button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" disabled={!!w.busy} onClick={w.runSam}>Reintentar</button>
              <button type="button" className="cs-btn cs-btn--sm" disabled={!!w.busy} onClick={w.runLocal}>{w.busy === 'local' ? 'Calculando…' : 'Por contraste'}</button>
              <button type="button" className="cs-btn cs-btn--sm" disabled={!!w.busy} onClick={w.startManualTrace}>Trazar a mano</button>
              {w.img.exampleId && <button type="button" className="cs-btn cs-btn--sm" disabled={!!w.busy} onClick={w.useCached}>Máscara guardada</button>}
            </>}>
            {err}
          </Alert>
        ) : err && <Alert tone="danger" role="alert">{err}</Alert>}
        {tracing ? (
          <p className="cs-body-sm">Trazando a mano: haz clic alrededor del material y cierra la forma en el primer punto. <button type="button" className="cs-link" onClick={() => w.setDraft(null)}>Cancelar trazado</button></p>
        ) : (
          <label className="cs-field"><span className="cs-label">¿Qué material buscar?</span>
            <input className="cs-input cs-mono" value={w.concept} onChange={(e) => w.setConcept(e.target.value)} disabled={w.samPoints.length > 0 || busySam} aria-describedby="concept-hint" data-testid="concept" />
            <span className="cs-hint" id="concept-hint">{w.samPoints.length > 0 ? 'Con puntos de guía no se usa la frase.' : 'Frase corta en inglés, así busca SAM 3.1 (p. ej. «brown leather»).'}</span>
          </label>
        )}
        {w.busy === 'local' && <p className="cs-caption" role="status">Segmentando por contraste…</p>}
        {w.redetect && hasContour && <button type="button" className="cs-link ux-left" onClick={() => w.setRedetect(false)}>Conservar el contorno actual</button>}
      </PanelShell>
    );
  },
);
