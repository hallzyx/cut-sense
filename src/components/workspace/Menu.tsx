import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

/**
 * Menú / popover anclado a su botón (UX-REDESIGN.md §10): abre con foco en el primer elemento,
 * ↑/↓/Inicio/Fin mueven, Esc, Tab o clic fuera cierran y devuelven el foco al botón.
 * En pantallas < 1000 px se muestra como hoja inferior con velo.
 */

const MOBILE = '(max-width: 999px)';
const isMobile = () => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE).matches;

const CloseCtx = createContext<() => void>(() => {});

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  role?: 'menu' | 'dialog';
  /** Título visible (cabecera con ✕); en móvil siempre se muestra. */
  title?: string;
  className?: string;
  /** Hacia dónde abre en escritorio. */
  placement?: 'up' | 'down';
  align?: 'start' | 'end';
  width?: number;
  testId?: string;
  children: ReactNode;
}

export function Popover({ open, onClose, anchorRef, label, role = 'menu', title, className = '', placement = 'down', align = 'end', width, testId, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });
  const [sheet, setSheet] = useState(isMobile);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const close = () => { closeRef.current(); anchorRef.current?.focus(); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const m = isMobile();
      setSheet(m);
      const a = anchorRef.current?.getBoundingClientRect();
      if (m || !a) { setStyle({}); return; }
      const h = ref.current?.offsetHeight ?? 0;
      const w = width ?? ref.current?.offsetWidth ?? 280;
      const up = placement === 'up' ? a.top - h - 8 > 8 || window.innerHeight - a.bottom < h + 16 : window.innerHeight - a.bottom < h + 16 && a.top > h + 16;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, align === 'end' ? a.right - w : a.left));
      setStyle({ position: 'fixed', left, width, top: up ? Math.max(8, a.top - h - 8) : a.bottom + 6 });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchorRef, placement, align, width]);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    // Tras colocarlo (primer cuadro oculto mientras se mide), el foco va al primer elemento.
    const raf = requestAnimationFrame(() => {
      el?.querySelector<HTMLElement>(role === 'menu' ? '[role^="menuitem"]:not([aria-disabled="true"])' : 'input, select, textarea, button:not(.ux-pop__close)')?.focus();
    });
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el?.contains(t) || anchorRef.current?.contains(t)) return;
      closeRef.current();
    };
    // Esc cierra aunque el foco no esté dentro (p. ej. sigue en el botón que lo abrió).
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !el?.contains(e.target as Node)) { closeRef.current(); anchorRef.current?.focus(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', esc);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', esc); };
  }, [open, role, anchorRef]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (role !== 'menu') return;
    if (e.key === 'Tab') { e.preventDefault(); close(); return; }
    if ((e.target as HTMLElement).tagName === 'SELECT') return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? items.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
  };

  return createPortal(
    <CloseCtx.Provider value={close}>
      {sheet && <div className="ux-scrim" onPointerDown={close} aria-hidden="true" />}
      <div
        ref={ref} role={role} aria-label={label} data-testid={testId}
        className={`ux-menu ${sheet ? 'ux-menu--sheet' : ''} ${className}`} style={sheet ? undefined : style}
        onKeyDown={onKey}
      >
        {(title || sheet) && (
          <div className="ux-menu__head">
            <span className="ux-menu__title">{title ?? label}</span>
            <button type="button" className="ux-iconbtn ux-pop__close" aria-label="Cerrar" onClick={close}><Icon name="x" /></button>
          </div>
        )}
        {children}
      </div>
    </CloseCtx.Provider>,
    document.body,
  );
}

export const useCloseMenu = () => useContext(CloseCtx);

interface ItemProps {
  icon?: IconName;
  label: ReactNode;
  hint?: ReactNode;
  trailing?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** No cerrar el menú al activar. */
  keepOpen?: boolean;
  testId?: string;
  iconClass?: string;
}

export function MenuItem({ icon, label, hint, trailing, onSelect, disabled, danger, keepOpen, testId, iconClass }: ItemProps) {
  const close = useCloseMenu();
  return (
    <button
      type="button" role="menuitem" aria-disabled={disabled || undefined} data-testid={testId}
      className={`ux-menu__item ${danger ? 'ux-menu__item--danger' : ''}`}
      onClick={() => { if (disabled) return; if (!keepOpen) close(); onSelect(); }}
    >
      {icon ? <span className={iconClass}><Icon name={icon} /></span> : <span />}
      <span>{label}{hint && <small>{hint}</small>}</span>
      {trailing ?? <span />}
    </button>
  );
}

export function MenuSwitch({ label, checked, onToggle, disabled, testId }: { label: string; checked: boolean; onToggle: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button" role="menuitemcheckbox" aria-checked={checked} aria-disabled={disabled || undefined} data-testid={testId}
      className="ux-switch" onClick={() => { if (!disabled) onToggle(); }}
    >
      <span>{label}</span>
      <span className="ux-switch__ctl"><span className="ux-switch__state">{checked ? 'SÍ' : 'NO'}</span><span className="ux-switch__track" /></span>
    </button>
  );
}

export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="ux-menu__label" role="presentation">{children}</div>;
export const MenuSep = () => <div className="ux-menu__sep" role="separator" />;
