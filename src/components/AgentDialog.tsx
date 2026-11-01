import { useEffect, useRef, useState } from 'react';
import type { Ring } from '../types';
import { askAgent, type ChatEntry } from '../lib/agent';
import type { AgentProposal, AgentTurn } from '../lib/agentSchema';
import { buildShape, KIND_LABEL } from '../engine/templates';
import { bbox, ringPath } from '../lib/poly';

interface Props {
  entries: ChatEntry[];
  setEntries: (f: (e: ChatEntry[]) => ChatEntry[]) => void;
  /** Dato de contexto para el agente (material disponible), si se conoce. */
  context: string;
  /** Mensaje si no se puede aprobar todavía (por ejemplo, falta calibrar en cm). */
  approveBlocked: string | null;
  onApprove: (p: AgentProposal) => void;
  onClose: () => void;
}

const STARTERS = ['Quiero una billetera para 6 tarjetas', 'Un portatarjetas minimalista', 'Un estuche pequeño para audífonos'];

function Preview({ kind, w, h }: { kind: Parameters<typeof buildShape>[0]; w: number; h: number }) {
  const ring: Ring = buildShape(kind, w, h);
  const b = bbox(ring);
  const k = Math.min(70 / b.w, 46 / b.h);
  const pts = ring.map(([x, y]) => [(x - b.x0) * k + 5, (y - b.y0) * k + 5] as [number, number]);
  return (
    <svg viewBox="0 0 80 56" width="80" height="56" aria-hidden="true">
      <path d={ringPath(pts)} fill="var(--cs-piece-a)" fillOpacity=".85" stroke="var(--cs-ov-casing)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function ProposalCard({ turn, approveBlocked, onApprove, disabled }: { turn: AgentTurn; approveBlocked: string | null; onApprove: () => void; disabled: boolean }) {
  const p = turn.proposal;
  return (
    <div className="agent-proposal">
      <p className="h5">Propuesta: {p.name}</p>
      <ul className="agent-pieces">
        {p.pieces.map((x, i) => (
          <li key={i}>
            <Preview kind={x.kind} w={x.width_cm} h={x.height_cm} />
            <div>
              <b>{x.name}</b> × {x.qty_per_set}
              <div className="caption">{KIND_LABEL[x.kind]} · {x.width_cm} × {x.height_cm} cm · giros {x.rotations.join('°, ')}°</div>
              {x.notes && <div className="caption">{x.notes}</div>}
            </div>
          </li>
        ))}
      </ul>
      {p.assumptions.length > 0 && (
        <>
          <p className="caption"><b>Suposiciones del agente</b></p>
          <ul className="caption agent-assume">{p.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </>
      )}
      <p className="caption">Son medidas propuestas por una IA: revísalas antes de cortar. Las posiciones las calcula el motor y las verifica el verificador.</p>
      {approveBlocked && <p className="alert warn" role="alert">{approveBlocked}</p>}
      <div className="row wrap">
        <button className="btn primary sm" disabled={disabled || !!approveBlocked} onClick={onApprove}>Aprobar y usar estas piezas</button>
        <span className="caption">¿Algo que cambiar? Escríbelo abajo.</span>
      </div>
    </div>
  );
}

export default function AgentDialog({ entries, setEntries, context, approveBlocked, onApprove, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // onClose cambia en cada render del padre: se guarda en una ref para que el efecto no se reinicie
  // (reiniciarlo cancelaría la petición en curso).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    inputRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); ctl.current?.abort(); };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [entries, busy]);

  const send = async (text: string, base: ChatEntry[] = entries) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: ChatEntry[] = [...base, { role: 'user', text: t }];
    setEntries(() => next); setDraft(''); setErr(null); setBusy(true);
    ctl.current = new AbortController();
    try {
      const turn = await askAgent(next, context, ctl.current.signal);
      setEntries((cur) => [...cur, { role: 'assistant', text: turn.message, turn }]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  const retry = () => {
    const last = entries[entries.length - 1];
    if (last?.role === 'user') { const base = entries.slice(0, -1); send(last.text, base); }
  };

  const lastIdx = entries.length - 1;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal agent feature-card" role="dialog" aria-modal="true" aria-label="Diseñar con IA">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="h4" style={{ margin: 0 }}>Diseñar con IA</h2>
          <div className="row">
            {entries.length > 0 && <button className="link" onClick={() => { ctl.current?.abort(); setEntries(() => []); setErr(null); setBusy(false); }}>Nueva conversación</button>}
            <button className="link" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <p className="caption">Cuéntale al agente (Muse Spark, de Meta) qué quieres fabricar. Te hará preguntas y, cuando lo apruebes, convertirá la propuesta en piezas a cortar. Tus mensajes se envían a Meta; no escribas datos personales. La conversación se recuerda mientras no la reinicies.</p>

        <div className="agent-chat" role="log" aria-live="polite">
          {entries.length === 0 && (
            <div className="agent-starters">
              {STARTERS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
          {entries.map((e, i) => (
            <div key={i} className={`bubble ${e.role}`}>
              <span className="caption">{e.role === 'user' ? 'Tú' : 'Agente'}</span>
              <p>{e.text}</p>
              {e.role === 'assistant' && e.turn.type === 'proposal' && i === lastIdx && (
                <ProposalCard turn={e.turn} approveBlocked={approveBlocked} disabled={busy} onApprove={() => onApprove(e.turn.proposal)} />
              )}
            </div>
          ))}
          {busy && <div className="bubble assistant"><span className="caption">Agente</span><p>Pensando…</p></div>}
          {err && <p className="alert error" role="alert">{err} <button className="link" onClick={retry}>Reintentar</button></p>}
          <div ref={endRef} />
        </div>

        <form className="agent-input" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <textarea
            ref={inputRef} rows={2} value={draft} maxLength={1500} aria-label="Mensaje para el agente"
            placeholder="Describe el objeto, o responde a la pregunta del agente…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          />
          <button className="btn primary sm" type="submit" disabled={busy || !draft.trim()}>Enviar</button>
        </form>
      </div>
    </div>
  );
}
