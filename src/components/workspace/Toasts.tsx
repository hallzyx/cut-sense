import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Transient notices (they replace the panel “flash”). At most 2 at a time; they close on their own after 8 s
 * except those that change user data (sticky). The countdown pauses while hovered or focused.
 */
export interface Toast { id: number; text: string; sticky?: boolean; tone?: 'ok' | 'warn' | 'human' }

export function useToasts(initial?: string | null) {
  const seq = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>(() => (initial ? [{ id: ++seq.current, text: initial, sticky: true }] : []));
  const push = useCallback((text: string, opts: Omit<Toast, 'id' | 'text'> = {}) => {
    setToasts((t) => [...t.filter((x) => x.text !== text), { id: ++seq.current, text, ...opts }].slice(-2));
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const clear = useCallback(() => setToasts([]), []);
  return { toasts, push, dismiss, clear };
}

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (t.sticky || paused) return;
    const h = setTimeout(() => onDismiss(t.id), 8000);
    return () => clearTimeout(h);
  }, [t, paused, onDismiss]);
  return (
    <div
      className={`cs-toast ${t.tone ? `cs-toast--${t.tone}` : ''}`} data-testid="toast"
      onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    >
      <span className="cs-toast__mark" aria-hidden="true" />
      <span>{t.text}</span>
      <button type="button" className="cs-link" onClick={() => onDismiss(t.id)}>Close</button>
    </div>
  );
}

export function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="ux-toasts" role="status" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => <ToastItem key={t.id} t={t} onDismiss={onDismiss} />)}
    </div>
  );
}
