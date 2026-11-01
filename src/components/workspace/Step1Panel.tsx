import { forwardRef, useRef, useState } from 'react';
import { fmt } from '../../state';
import { Icon } from './Icon';
import { MenuItem, MenuLabel, MenuSep, Popover } from './Menu';
import { Alert, Disclosure, PanelShell, Reason, UnitBadge } from './primitives';
import { SOURCE_LABEL, type WS } from './useWorkspace';

/** Step 1 · Digitize: ask (F1) → proposal (F2) → ready / invalid (F3). One main action per state. */

const PILL: Record<string, { cls: string; text: string }> = {
  sam: { cls: 'cs-pill--ai', text: 'AI proposal · SAM 3.1' },
  example: { cls: 'cs-pill--computed', text: 'Saved example mask' },
  local: { cls: 'cs-pill--computed', text: 'Local contrast · not Meta AI' },
  manual: { cls: 'cs-pill--human', text: 'Manual trace' },
  leftover: { cls: 'cs-pill--computed', text: 'Leftover from the previous plan' },
};

export function originPill(source: string | null, edited: boolean) {
  if (!source) return { cls: 'cs-pill--human', text: 'Manual trace' };
  if (edited) return { cls: 'cs-pill--human', text: source === 'sam' ? 'AI + corrected by you' : `${PILL[source].text} + corrected by you` };
  return source === 'sam' ? { cls: 'cs-pill--ai', text: 'AI proposal · SAM 3.1' } : PILL[source];
}

function OtherWaysMenu({ w }: { w: WS }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const n = w.samPoints.length;
  return (
    <>
      <button ref={btn} type="button" className="cs-btn cs-btn--sm cs-btn--ghost" aria-haspopup="menu" aria-expanded={open} data-testid="otherways" disabled={!!w.busy} onClick={() => setOpen((o) => !o)}>
        Other ways<Icon name={open ? 'caretUp' : 'caret'} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} label="Other ways to digitize" placement="up" width={330} className="ux-otherways">
        <MenuLabel>Guide the AI</MenuLabel>
        <MenuItem icon="target" label={w.mode === 'points' ? 'Finish marking points' : 'Mark guide points'} hint="Click includes · Shift+click excludes" trailing={<span className="cs-badge cs-badge--count">{n}</span>} onSelect={w.togglePoints} testId="ow-points" />
        {n > 0 && <MenuItem icon="x" label="Remove guide points" onSelect={() => w.setSamPoints([])} testId="ow-clear-points" />}
        <MenuSep />
        <MenuLabel>Without Meta AI</MenuLabel>
        <MenuItem icon="contrast" label="Segment by contrast" hint="Local, in your browser" onSelect={w.runLocal} testId="ow-local" />
        {w.img.exampleId && <MenuItem icon="file" label="Use saved mask" hint="Example images only" onSelect={w.useCached} testId="ow-cached" />}
        <MenuItem icon="hand" label="Trace by hand" hint="Click per point · click the first one to close" onSelect={w.startManualTrace} testId="ow-trace" />
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
        <PanelShell ref={titleRef} step={1} label="Step 1 panel" title="Digitize" status={<span className={`cs-pill ${pill.cls}`} data-testid="proposal-source">{pill.text}</span>}
          footer={<div className="ux-foot-row">
            <button type="button" className="cs-btn cs-btn--primary" data-testid="primary-action" onClick={w.acceptProposal}>Accept outline</button>
            <button type="button" className="cs-btn cs-btn--ghost" data-testid="discard-proposal" onClick={() => w.setProposal(null)}>Discard</button>
          </div>}>
          <p className="ux-question">Is this the edge of your material?</p>
          <p className="cs-body-sm">AI proposes; you have the final say.{holes > 0 && <> We found <b>{holes === 1 ? '1 hole' : `${holes} holes`}</b>: {holes === 1 ? 'we will mark it as an excluded zone' : 'we will mark them as excluded zones'}.</>}</p>
          <Disclosure summary="Technical details" value={`${pr.polygon.length} vertices`}>
            <p className="cs-caption cs-mono">{SOURCE_LABEL[pr.source]} · {pr.info}</p>
          </Disclosure>
        </PanelShell>
      );
    }

    if (phase === 'ready' || phase === 'invalid') {
      const pill = originPill(source, edited);
      return (
        <PanelShell ref={titleRef} step={1} label="Step 1 panel" title="Outline ready" lead="If something does not match the real edge, correct it on the photo."
          footer={<>
            <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" disabled={phase === 'invalid' || !!w.busy} aria-describedby={phase === 'invalid' ? 'r1' : undefined} onClick={() => w.goStep(2)}>Continue to Prepare</button>
            {phase === 'invalid' && <Reason id="r1">Fix the outline to continue.</Reason>}
          </>}>
          {phase === 'invalid' && (
            <Alert tone="danger" role="alert" title="The outline crosses itself" testId="invalid-outline"
              actions={<button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" disabled={!w.canRevert} onClick={w.revertContour}><Icon name="undo" />Back to last valid</button>}>
              {w.contourErr} Move the marked vertex or go back to the last valid one. Optimize stays blocked meanwhile.
            </Alert>
          )}
          {err && <Alert tone="danger" role="alert">{err}</Alert>}
          <dl className="ux-facts">
            <div><dt>Origin</dt><dd><span className={`cs-pill ${pill.cls}`} data-testid="contour-origin">{pill.text}</span></dd></div>
            <div><dt>Digitized area</dt><dd className="cs-measure">{area !== null ? <>{fmt(area)} <small>{w.unit}²</small></> : '—'}</dd></div>
            <div><dt>Scale</dt><dd><UnitBadge calibrated={w.calibrated} unit={w.unit} /></dd></div>
          </dl>
          <Disclosure summary="Technical details" value={`${vertexCount} vertices`}>
            <p className="cs-caption cs-mono">{source ? SOURCE_LABEL[source as keyof typeof SOURCE_LABEL] : '—'}{edited ? ' + human correction' : ''}{samInfo ? ` · ${samInfo}` : ''}</p>
          </Disclosure>
        </PanelShell>
      );
    }

    // prompt (F1) — also after a SAM failure (G5) or on “Detect again”.
    const busySam = w.busy === 'sam';
    const tracing = !!w.draft && w.drawTarget === 'contour';
    return (
      <PanelShell ref={titleRef} step={1} label="Step 1 panel" title="Digitize" lead="AI finds the edge of your material; you confirm it."
        footer={<>
          {busySam ? (
            <div role="status" className="ux-busy">
              <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" aria-busy="true" disabled>Reading the edge…</button>
              <div className="cs-progress cs-progress--indeterminate cs-progress--ai"><div className="cs-progress__bar" /></div>
              <button type="button" className="cs-link ux-cancel" onClick={w.cancelSam}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" disabled={!!w.busy || tracing || (!w.concept.trim() && !w.samPoints.length)} onClick={w.runSam}>
              <Icon name="spark" />{w.samFailed ? 'Retry SAM 3.1' : 'Detect edge with AI'}
            </button>
          )}
          <div className="ux-foot-row ux-foot-row--split">
            <p className="cs-caption">Your photo goes to SAM 3.1 through our server and is not stored.</p>
            <OtherWaysMenu w={w} />
          </div>
        </>}>
        {w.samFailed && err ? (
          <Alert tone="danger" role="alert" title="AI could not read the edge this time" testId="sam-failed"
            actions={<>
              <button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" disabled={!!w.busy} onClick={w.runSam}>Retry</button>
              <button type="button" className="cs-btn cs-btn--sm" disabled={!!w.busy} onClick={w.runLocal}>{w.busy === 'local' ? 'Calculating…' : 'By contrast'}</button>
              <button type="button" className="cs-btn cs-btn--sm" disabled={!!w.busy} onClick={w.startManualTrace}>Trace by hand</button>
              {w.img.exampleId && <button type="button" className="cs-btn cs-btn--sm" disabled={!!w.busy} onClick={w.useCached}>Saved mask</button>}
            </>}>
            {err}
          </Alert>
        ) : err && <Alert tone="danger" role="alert">{err}</Alert>}
        {tracing ? (
          <p className="cs-body-sm">Tracing by hand: click around the material and close the shape on the first point. <button type="button" className="cs-link" onClick={() => w.setDraft(null)}>Cancel tracing</button></p>
        ) : (
          <label className="cs-field"><span className="cs-label">Which material to look for?</span>
            <input className="cs-input cs-mono" value={w.concept} onChange={(e) => w.setConcept(e.target.value)} disabled={w.samPoints.length > 0 || busySam} aria-describedby="concept-hint" data-testid="concept" />
            <span className="cs-hint" id="concept-hint">{w.samPoints.length > 0 ? 'With guide points the phrase is not used.' : 'A short phrase in English, which is how SAM 3.1 searches (e.g. “brown leather”).'}</span>
          </label>
        )}
        {w.busy === 'local' && <p className="cs-caption" role="status">Segmenting by contrast…</p>}
        {w.redetect && hasContour && <button type="button" className="cs-link ux-left" onClick={() => w.setRedetect(false)}>Keep the current outline</button>}
      </PanelShell>
    );
  },
);
