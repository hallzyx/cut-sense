import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { MenuItem, MenuSep, Popover } from './Menu';

const STEPS = ['Digitize', 'Prepare', 'Result'];

/** Steps in the header. Same locking rule as before; “!” on a step that needs attention. */
export function StepRail({ step, canGo, attention, onGo }: { step: number; canGo: (n: number) => boolean; attention?: number | null; onGo: (n: number) => void }) {
  return (
    <nav aria-label="Steps" className="ux-rail">
      <ol className="cs-stepper">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const locked = !canGo(n);
          const cls = [n === step ? 'cs-step--current' : n < step && !locked ? 'cs-step--done' : '', locked ? 'cs-step--locked' : '', attention === n ? 'cs-step--attention' : ''].join(' ');
          return (
            <li key={s} className={`cs-step ${cls}`}>
              <button
                type="button" className="cs-step__btn" data-testid={`step-${n}`} aria-current={n === step ? 'step' : undefined} disabled={locked}
                aria-label={`${n} ${s}${attention === n ? ' (needs attention)' : locked ? ' (locked)' : n < step ? ' (done)' : ''}`}
                onClick={() => onGo(n)}
              >
                <span className="cs-step__dot" aria-hidden="true" /><span className="cs-step__label">{s}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** “Project ⋯”: save, theme and new project (moved out of the panel and the green header button). */
export function ProjectMenu({ onSave, onNew, isDark, onTheme }: { onSave: () => void; onNew: () => void; isDark: boolean; onTheme: () => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const mac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform);
  return (
    <div className="ux-top__right">
      <button ref={btn} type="button" className="ux-menubtn" aria-haspopup="menu" aria-expanded={open} data-testid="project-menu" onClick={() => setOpen((o) => !o)}>
        <span>Project</span><Icon name="more" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} label="Project" testId="project-menu-list">
        <MenuItem icon="save" label="Save project" hint="A .json file with your photo: treat it as private" trailing={<span className="ux-kbd">{mac ? '⌘ S' : 'Ctrl S'}</span>} onSelect={onSave} testId="project-save" />
        <MenuItem icon={isDark ? 'sun' : 'moon'} label={isDark ? 'Light theme' : 'Dark theme'} onSelect={onTheme} testId="project-theme" />
        <MenuSep />
        <MenuItem icon="new" danger label="New project…" hint="Asks for confirmation if there are unsaved changes" onSelect={onNew} testId="project-new" />
      </Popover>
    </div>
  );
}
