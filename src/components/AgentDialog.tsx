import { useEffect, useRef, useState } from 'react';
import type { Ring } from '../types';
import { askAgent, CHAT_LIMITS, countSketches, countUserTurns, prepareSketch, type ChatEntry } from '../lib/agent';
import { AGENT_NAME, AGENT_ROLE, type AgentProposal, type AgentTurn } from '../lib/agentSchema';
import { buildShape, KIND_LABEL } from '../engine/templates';
import { bbox, ringPath } from '../lib/poly';
import Markdown from './Markdown';
import { AssemblyPreview } from './AssemblyPreview';
import '../agent.css';

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
const WELCOME = `Hola, soy **${AGENT_NAME}**, ${AGENT_ROLE}.\n\nCuéntame qué quieres fabricar o **sube un boceto** y lo uso como referencia.\n\nTe haré **una pregunta a la vez**; cuando todo esté claro te propondré las piezas para cortar.`;

function HiloAvatar({ size = 32 }: { size?: number }) {
  return (
    <svg className="hilo-avatar" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="16" fill="var(--cs-primary)" />
      <path d="M8.5 21.5C12 8.5 20 24 23.5 10.5" fill="none" stroke="var(--cs-accent)" strokeWidth="2.3" strokeLinecap="round" strokeDasharray="3.2 2.6" />
      <circle cx="23.5" cy="10.5" r="2.1" fill="#fff" />
    </svg>
  );
}

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
    <div className="hilo-proposal">
      <p className="hilo-proposal__title">Propuesta · {p.name}</p>
      <ul className="hilo-pieces">
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
      <AssemblyPreview productName={p.name} pieces={p.pieces} assumptions={p.assumptions} />
      {p.assumptions.length > 0 && (
        <details className="hilo-assume">
          <summary>Suposiciones de {AGENT_NAME} ({p.assumptions.length})</summary>
          <ul>{p.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}
      <p className="caption">Son medidas propuestas por una IA: revísalas antes de cortar. Las posiciones las calcula el motor y las verifica el verificador.</p>
      {approveBlocked && <p className="alert warn" role="alert">{approveBlocked}</p>}
      <div className="row wrap">
        <button className="btn primary sm" disabled={disabled || !!approveBlocked} onClick={onApprove}>Aprobar y usar estas piezas</button>
        <span className="caption">¿Algo que cambiar? Díselo a {AGENT_NAME} abajo.</span>
      </div>
    </div>
  );
}

function phaseOf(entries: ChatEntry[], busy: boolean): { label: string; tone: 'idle' | 'ask' | 'ready' | 'out' } {
  const last = [...entries].reverse().find((e) => e.role === 'assistant');
  if (busy) return { label: `${AGENT_NAME} está pensando`, tone: 'ask' };
  if (!last || last.role !== 'assistant') return { label: 'Cuéntame tu idea', tone: 'idle' };
  if (last.turn.type === 'proposal') return { label: 'Propuesta lista · revísala', tone: 'ready' };
  if (last.turn.type === 'redirect') return { label: 'Fuera de mi alcance', tone: 'out' };
  return { label: `Aclarando · pregunta ${entries.filter((e) => e.role === 'assistant' && e.turn.type === 'question').length}`, tone: 'ask' };
}

export default function AgentDialog({ entries, setEntries, context, approveBlocked, onApprove, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const [sketch, setSketch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sketchErr, setSketchErr] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const userTurns = countUserTurns(entries);
  const sketches = countSketches(entries);
  const tooLong = userTurns >= CHAT_LIMITS.maxUserTurns;
  const sketchesLeft = sketches < CHAT_LIMITS.maxSketches;

  const send = async (text: string, image: string | null = sketch, base: ChatEntry[] = entries) => {
    const t = text.trim();
    if ((!t && !image) || busy || tooLong) return;
    const entry: ChatEntry = { role: 'user', text: t || 'Te comparto un boceto de lo que imagino.', ...(image ? { image } : {}) };
    const next: ChatEntry[] = [...base, entry];
    setEntries(() => next); setDraft(''); setSketch(null); setErr(null); setSketchErr(null); setBusy(true);
    ctl.current = new AbortController();
    try {
      const turn = await askAgent(next, context, ctl.current.signal);
      setEntries((cur) => [...cur, { role: 'assistant', text: turn.message, turn }]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') setErr(`Detuviste la respuesta de ${AGENT_NAME}.`);
      else setErr((e as Error).message);
    } finally { setBusy(false); inputRef.current?.focus(); }
  };

  const retry = () => {
    const last = entries[entries.length - 1];
    if (last?.role === 'user') send(last.text, last.image ?? null, entries.slice(0, -1));
  };

  const onPickFile = async (f?: File) => {
    if (!f) return;
    setSketchErr(null);
    try { setSketch(await prepareSketch(f)); } catch (e) { setSketchErr((e as Error).message); }
  };

  const phase = phaseOf(entries, busy);
  const lastIdx = entries.length - 1;
  const lastEntry = entries[lastIdx];
  const replies = !busy && lastEntry?.role === 'assistant' ? lastEntry.turn.quick_replies : [];

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal agent feature-card hilo" role="dialog" aria-modal="true" aria-label={`Diseñar con IA · ${AGENT_NAME}`}>
        <header className="hilo-head">
          <HiloAvatar size={40} />
          <div className="hilo-id">
            <h2 className="hilo-name">{AGENT_NAME} <span className="hilo-badge">IA</span></h2>
            <p className="caption">{AGENT_ROLE[0].toUpperCase() + AGENT_ROLE.slice(1)} · Muse Spark de Meta</p>
          </div>
          <div className="hilo-actions">
            {entries.length > 0 && <button className="link" onClick={() => { ctl.current?.abort(); setEntries(() => []); setErr(null); setBusy(false); setSketch(null); }}>Nueva conversación</button>}
            <button className="link" onClick={onClose}>Cerrar</button>
          </div>
        </header>

        <div className={`hilo-phase hilo-phase--${phase.tone}`} role="status"><i aria-hidden="true" />{phase.label}</div>

        <div className="hilo-chat" role="log" aria-live="polite" aria-label={`Conversación con ${AGENT_NAME}`}>
          {entries.length === 0 && (
            <div className="hilo-row">
              <HiloAvatar />
              <div className="hilo-bubble hilo-bubble--assistant"><Markdown text={WELCOME} /></div>
            </div>
          )}
          {entries.length === 0 && (
            <div className="hilo-replies" role="group" aria-label="Ideas para empezar">
              {STARTERS.map((s) => <button key={s} className="chip" onClick={() => send(s, null)}>{s}</button>)}
            </div>
          )}
          {entries.map((e, i) => (
            e.role === 'user' ? (
              <div key={i} className="hilo-row hilo-row--user">
                <div className="hilo-bubble hilo-bubble--user">
                  {e.image && <img className="hilo-sketch" src={e.image} alt="Boceto que compartiste" />}
                  <p>{e.text}</p>
                </div>
              </div>
            ) : (
              <div key={i} className="hilo-row">
                <HiloAvatar />
                <div className={`hilo-bubble hilo-bubble--assistant${e.turn.type === 'redirect' ? ' hilo-bubble--redirect' : ''}`}>
                  <span className="hilo-who">{AGENT_NAME}</span>
                  <Markdown text={e.text} />
                  {e.turn.type === 'proposal' && i === lastIdx && (
                    <ProposalCard turn={e.turn} approveBlocked={approveBlocked} disabled={busy} onApprove={() => onApprove(e.turn.proposal)} />
                  )}
                </div>
              </div>
            )
          ))}
          {busy && (
            <div className="hilo-row" role="status">
              <HiloAvatar />
              <div className="hilo-bubble hilo-bubble--assistant"><span className="hilo-typing" aria-label={`${AGENT_NAME} está pensando`}><i /><i /><i /></span></div>
            </div>
          )}
          {replies.length > 0 && (
            <div className="hilo-replies hilo-replies--answers" role="group" aria-label="Respuestas rápidas">
              {replies.map((r) => <button key={r} className="chip" onClick={() => send(r, null)}>{r}</button>)}
            </div>
          )}
          {err && <p className="alert error" role="alert">{err} {lastEntry?.role === 'user' && <button className="link" onClick={retry}>Reintentar</button>}</p>}
          <div ref={endRef} />
        </div>

        {tooLong && <p className="alert warn" role="alert">Esta conversación ya es larga. Empieza una nueva para seguir; tu pedido actual no se pierde.</p>}
        {sketchErr && <p className="alert error" role="alert">{sketchErr}</p>}
        {sketch && (
          <div className="hilo-pending">
            <img src={sketch} alt="Boceto listo para enviar" />
            <span className="caption">Boceto listo para enviar</span>
            <button className="link danger" onClick={() => setSketch(null)}>Quitar</button>
          </div>
        )}

        <form className="hilo-composer" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Adjuntar boceto" onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button
            type="button" className="hilo-attach" disabled={busy || !sketchesLeft || tooLong} aria-label="Adjuntar un boceto"
            title={sketchesLeft ? 'Adjuntar un boceto (PNG, JPG o WebP)' : `Máximo ${CHAT_LIMITS.maxSketches} bocetos por conversación`}
            onClick={() => fileRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M21 12.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.9-8.9a3.4 3.4 0 0 1 4.8 4.8l-8.9 8.9a1.8 1.8 0 0 1-2.5-2.5l8-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <textarea
            ref={inputRef} rows={2} value={draft} maxLength={CHAT_LIMITS.maxInput} aria-label={`Mensaje para ${AGENT_NAME}`} disabled={tooLong}
            placeholder={`Escríbele a ${AGENT_NAME}…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          />
          {busy
            ? <button className="btn ghost sm" type="button" onClick={() => ctl.current?.abort()}>Detener</button>
            : <button className="btn primary sm" type="submit" disabled={(!draft.trim() && !sketch) || tooLong}>Enviar</button>}
        </form>

        <details className="hilo-about">
          <summary>Cómo funciona {AGENT_NAME}</summary>
          <ul>
            <li>{AGENT_NAME} es una IA (Muse Spark, de Meta): puede equivocarse. Revisa siempre las medidas.</li>
            <li>Solo diseña objetos hechos con piezas planas (cuero, fieltro, tela, cartón). Con otras peticiones te lo dirá.</li>
            <li>Con un boceto estima formas y proporciones, no medidas exactas: te preguntará el tamaño.</li>
            <li>Tus mensajes y bocetos se envían a Meta; no incluyas datos personales. Nada se aplica sin tu aprobación.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
