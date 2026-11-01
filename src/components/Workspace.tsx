import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Project, TemplateDef } from '../state';
import PieceDialog from './PieceDialog';
import AgentDialog from './AgentDialog';
import type { LoadedProject } from '../lib/projectFile';
import { useWorkspace } from './workspace/useWorkspace';
import { ProjectMenu, StepRail } from './workspace/Header';
import { CanvasPane } from './workspace/CanvasPane';
import { Step1Panel } from './workspace/Step1Panel';
import { PreparePanel } from './workspace/PreparePanel';
import { ResultPanel } from './workspace/ResultPanel';

interface Props {
  p: Project;
  setP: (f: (p: Project) => Project) => void;
  onReset: () => void;
  /** Project opened from a file: already verified plan and the step it was saved at. */
  restored?: LoadedProject | null;
  /** Starts a new project with the photo of the leftover, keeping the order. */
  onLeftoverPhoto: (f: File, defs: TemplateDef[], spacing: number) => void;
  /** App header slot for the steps and the “Project” menu. */
  headerSlot: HTMLElement | null;
  isDark: boolean;
  onTheme: () => void;
}

const STEP_NAME = ['Digitize', 'Prepare', 'Result'];

/** Workspace: canvas + one panel. State and logic live in useWorkspace. */
export default function Workspace({ p, setP, onReset, onLeftoverPhoto, restored, headerSlot, isDark, onTheme }: Props) {
  const w = useWorkspace(p, setP, restored);
  const title = useRef<HTMLHeadingElement>(null);
  const [announce, setAnnounce] = useState('');
  const first = useRef(true);

  // On step change, focus moves to the panel title and the step is announced (without stealing focus on load).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    title.current?.focus({ preventScroll: true });
    setAnnounce(`Step ${w.step} of 3: ${STEP_NAME[w.step - 1]}`);
  }, [w.step]);

  const canGo = (n: number) => !((n >= 2 && !!w.contourErr) || (n === 3 && !w.result && w.busy !== 'opt'));
  const onNew = () => { if (confirm('Discard this project? Unsaved changes will be lost.')) onReset(); };

  return (
    <section className="ux-ws" data-step={w.step}>
      {headerSlot && createPortal(
        <>
          <StepRail step={w.step} canGo={canGo} attention={w.stale && w.busy !== 'opt' ? 3 : null} onGo={(n) => { if (n !== w.step) w.goStep(n); }} />
          <ProjectMenu onSave={w.saveProject} onNew={onNew} isDark={isDark} onTheme={onTheme} />
        </>,
        headerSlot,
      )}
      <p className="ux-sr" aria-live="polite">{announce}</p>
      <div className="ux-work">
        <CanvasPane w={w} p={p} />
        {w.step === 1 && (
          <Step1Panel ref={title} w={w} edited={p.edited} source={p.source} samInfo={p.samInfo} vertexCount={p.contour.length}
            area={w.live ? w.live.totalArea / w.ppu ** 2 : null} />
        )}
        {w.step === 2 && <PreparePanel ref={title} w={w} p={p} />}
        {w.step === 3 && <ResultPanel ref={title} w={w} p={p} onLeftoverPhoto={(f) => onLeftoverPhoto(f, p.defs, p.spacing)} />}
      </div>
      {w.agentOpen && (
        <AgentDialog entries={w.agentChat} setEntries={w.setAgentChat} context={w.agentContext} seed={w.agentSeed} approveBlocked={w.agentBlocked} onApprove={w.approveAgent} approveLabel={w.agentFor === 'leftover' ? 'Try it on the leftover' : undefined} onClose={() => w.setAgentOpen(false)} />
      )}
      {w.pieceDialog && (
        <PieceDialog
          mode={w.pieceDialog} unit={w.unit} defaultWidth={p.calib ? 8 : 15}
          mmToCurrent={w.mmToCurrent} onCancel={() => w.setPieceDialog(null)} onSave={w.addCustom}
        />
      )}
    </section>
  );
}
