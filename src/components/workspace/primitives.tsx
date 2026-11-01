import { forwardRef, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Icon, type IconName } from './Icon';

/* ---------- Disclosure: the summary always shows the hidden value (rule R5) ---------- */
export function Disclosure({ summary, value, children, storageKey, forceOpen, testId }: { summary: string; value: ReactNode; children: ReactNode; storageKey?: string; forceOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return false;
    try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  return (
    <details className="ux-disc" open={open} data-testid={testId} onToggle={(e) => {
      const o = (e.currentTarget as HTMLDetailsElement).open;
      setOpen(o);
      if (storageKey) try { sessionStorage.setItem(storageKey, o ? '1' : '0'); } catch { /* no storage */ }
    }}>
      <summary>{summary}<span className="ux-disc__val">{value}</span></summary>
      <div className="ux-disc__body">{children}</div>
    </details>
  );
}

/* ---------- Canvas toolbar: role=toolbar, roving focus with ←/→ ---------- */
export interface Tool {
  id: string;
  label: string;
  /** Part of the text hidden on mobile. */
  more?: string;
  icon: IconName;
  pressed?: boolean;
  expanded?: boolean;
  popup?: 'dialog' | 'menu';
  disabled?: boolean;
  ai?: boolean;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}

export function CanvasToolbar({ label, tools }: { label: string; tools: (Tool | 'sep')[] }) {
  const bar = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(0);
  const btns = tools.filter((t): t is Tool => t !== 'sep');
  if (!btns.length) return null;
  const idx = Math.min(focus, btns.length - 1);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (idx + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
    setFocus(n);
    bar.current?.querySelectorAll<HTMLButtonElement>('.ux-tool')[n]?.focus();
  };
  let k = -1;
  return (
    <div ref={bar} className="ux-tools" role="toolbar" aria-label={label} onKeyDown={onKey}>
      {tools.map((t, i) => {
        if (t === 'sep') return <span key={`s${i}`} className="ux-tools__sep" aria-hidden="true" />;
        k++;
        const me = k;
        return (
          <button
            key={t.id} ref={t.ref} type="button" data-testid={`tool-${t.id}`}
            className={`ux-tool ${t.ai ? 'ux-tool--ai' : ''}`} tabIndex={me === idx ? 0 : -1}
            aria-pressed={t.pressed} aria-expanded={t.expanded} aria-haspopup={t.popup} disabled={t.disabled}
            onFocus={() => setFocus(me)} onClick={t.onClick}
          >
            <Icon name={t.icon} /><span>{t.label}{t.more && <span className="ux-hide-m">{t.more}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Panel: header · body (the current decision) · footer with ONE main action ---------- */
interface ShellProps { step: number; title: string; lead?: ReactNode; status?: ReactNode; tabs?: ReactNode; children: ReactNode; footer: ReactNode; label: string }
export const PanelShell = forwardRef<HTMLHeadingElement, ShellProps>(function PanelShell({ step, title, lead, status, tabs, children, footer, label }, ref) {
  return (
    <aside className="ux-panel" aria-label={label}>
      <div className="ux-sheet-handle" aria-hidden="true" />
      <div className="ux-panel__head">
        <span className="ux-eyebrow">Step {step} of 3</span>
        <h2 className="cs-h3" ref={ref} tabIndex={-1} data-testid="panel-title">{title}</h2>
        {lead && <p className="ux-muted">{lead}</p>}
        {status && <div className="ux-status">{status}</div>}
        {tabs}
      </div>
      <div className="ux-panel__body">{children}</div>
      <div className="ux-panel__foot">{footer}</div>
    </aside>
  );
});

/** Line with the reason an action is disabled (never just a grey button). */
export const Reason = ({ id, children }: { id?: string; children: ReactNode }) => <p className="ux-reason" id={id} data-testid="disabled-reason">{children}</p>;

/** Units badge: calibrated (solid) or relative (dotted, ≈). */
export const UnitBadge = ({ calibrated, unit }: { calibrated: boolean; unit: string }) =>
  <span className={`cs-unit ${calibrated ? 'cs-unit--calibrated' : 'cs-unit--relative'}`}>{calibrated ? `Calibrated · ${unit}` : 'Not calibrated'}</span>;

export function Alert({ tone, icon, title, children, actions, role = 'status', testId, focusRef }: { tone: 'info' | 'ai' | 'warn' | 'danger' | 'success'; icon?: IconName; title?: ReactNode; children?: ReactNode; actions?: ReactNode; role?: 'status' | 'alert'; testId?: string; focusRef?: Ref<HTMLDivElement> }) {
  return (
    <div className={`cs-alert cs-alert--${tone}`} role={role} data-testid={testId} ref={focusRef} tabIndex={focusRef ? -1 : undefined}>
      <Icon name={icon ?? (tone === 'ai' ? 'spark' : 'warn')} className="cs-alert__icon" />
      <div>{title && <span className="cs-alert__title">{title}</span>}{title && children ? <br /> : null}{children}</div>
      {actions && <div className="cs-alert__actions">{actions}</div>}
    </div>
  );
}
