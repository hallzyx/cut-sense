import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { MenuItem, MenuSep, Popover } from './Menu';

const STEPS = ['Digitalizar', 'Preparar', 'Resultado'];

/** Pasos en la cabecera. Misma regla de bloqueo que antes; «!» en un paso que requiere atención. */
export function StepRail({ step, canGo, attention, onGo }: { step: number; canGo: (n: number) => boolean; attention?: number | null; onGo: (n: number) => void }) {
  return (
    <nav aria-label="Pasos" className="ux-rail">
      <ol className="cs-stepper">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const locked = !canGo(n);
          const cls = [n === step ? 'cs-step--current' : n < step && !locked ? 'cs-step--done' : '', locked ? 'cs-step--locked' : '', attention === n ? 'cs-step--attention' : ''].join(' ');
          return (
            <li key={s} className={`cs-step ${cls}`}>
              <button
                type="button" className="cs-step__btn" data-testid={`step-${n}`} aria-current={n === step ? 'step' : undefined} disabled={locked}
                aria-label={`${n} ${s}${attention === n ? ' (requiere atención)' : locked ? ' (bloqueado)' : n < step ? ' (hecho)' : ''}`}
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

/** «Proyecto ⋯»: guardar, tema y nuevo proyecto (salieron del panel y del botón verde de la cabecera). */
export function ProjectMenu({ onSave, onNew, isDark, onTheme }: { onSave: () => void; onNew: () => void; isDark: boolean; onTheme: () => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const mac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform);
  return (
    <div className="ux-top__right">
      <button ref={btn} type="button" className="ux-menubtn" aria-haspopup="menu" aria-expanded={open} data-testid="project-menu" onClick={() => setOpen((o) => !o)}>
        <span>Proyecto</span><Icon name="more" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} label="Proyecto" testId="project-menu-list">
        <MenuItem icon="save" label="Guardar proyecto" hint="Archivo .json con tu foto: trátalo como privado" trailing={<span className="ux-kbd">{mac ? '⌘ S' : 'Ctrl S'}</span>} onSelect={onSave} testId="project-save" />
        <MenuItem icon={isDark ? 'sun' : 'moon'} label={isDark ? 'Tema claro' : 'Tema oscuro'} onSelect={onTheme} testId="project-theme" />
        <MenuSep />
        <MenuItem icon="new" danger label="Nuevo proyecto…" hint="Pide confirmar si hay cambios sin guardar" onSelect={onNew} testId="project-new" />
      </Popover>
    </div>
  );
}
