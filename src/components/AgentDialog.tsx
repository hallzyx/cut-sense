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
  /** Context data for the agent (available material), when known. */
  context: string;
  /** Message when the proposal cannot be approved yet (for example, the scale is not calibrated in cm). */
  approveBlocked: string | null;
  onApprove: (p: AgentProposal) => void;
  /** Approve button text (it changes when the proposal is tried on the leftover). */
  approveLabel?: string;
  /** Message sent automatically when an empty conversation opens (diagnosis of a plan where nothing fits). */
  seed?: string | null;
  onClose: () => void;
}

const STARTERS = ['I want a wallet for 6 cards', 'A minimalist cardholder', 'A small case for earbuds'];
const WELCOME = `Hi, I'm **${AGENT_NAME}**, ${AGENT_ROLE}.\n\nTell me what you want to make or **upload a sketch** and I'll use it as a reference.\n\nI'll ask **one question at a time**; once everything is clear I'll propose the pieces to cut.`;

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

function ProposalCard({ turn, approveBlocked, onApprove, disabled, approveLabel = 'Approve and use these pieces' }: { turn: AgentTurn; approveBlocked: string | null; onApprove: () => void; disabled: boolean; approveLabel?: string }) {
  const p = turn.proposal;
  return (
    <div className="hilo-proposal">
      <p className="hilo-proposal__title">Proposal · {p.name}</p>
      <ul className="hilo-pieces">
        {p.pieces.map((x, i) => (
          <li key={i}>
            <Preview kind={x.kind} w={x.width_cm} h={x.height_cm} />
            <div>
              <b>{x.name}</b> × {x.qty_per_set}
              <div className="caption">{KIND_LABEL[x.kind]} · {x.width_cm} × {x.height_cm} cm · rotations {x.rotations.join('°, ')}°</div>
              {x.notes && <div className="caption">{x.notes}</div>}
            </div>
          </li>
        ))}
      </ul>
      <AssemblyPreview productName={p.name} pieces={p.pieces} assumptions={p.assumptions} />
      {p.assumptions.length > 0 && (
        <details className="hilo-assume">
          <summary>{AGENT_NAME}'s assumptions ({p.assumptions.length})</summary>
          <ul>{p.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}
      <p className="caption">These measurements were proposed by an AI: review them before cutting. The engine computes the positions and the verifier checks them.</p>
      {approveBlocked && <p className="alert warn" role="alert">{approveBlocked}</p>}
      <div className="row wrap">
        <button className="btn primary sm" disabled={disabled || !!approveBlocked} onClick={onApprove}>{approveLabel}</button>
        <span className="caption">Anything to change? Tell {AGENT_NAME} below.</span>
      </div>
    </div>
  );
}

function phaseOf(entries: ChatEntry[], busy: boolean): { label: string; tone: 'idle' | 'ask' | 'ready' | 'out' } {
  const last = [...entries].reverse().find((e) => e.role === 'assistant');
  if (busy) return { label: `${AGENT_NAME} is thinking`, tone: 'ask' };
  if (!last || last.role !== 'assistant') return { label: 'Tell me your idea', tone: 'idle' };
  if (last.turn.type === 'proposal') return { label: 'Proposal ready · review it', tone: 'ready' };
  if (last.turn.type === 'redirect') return { label: 'Out of my scope', tone: 'out' };
  return { label: `Clarifying · question ${entries.filter((e) => e.role === 'assistant' && e.turn.type === 'question').length}`, tone: 'ask' };
}

export default function AgentDialog({ entries, setEntries, context, approveBlocked, onApprove, approveLabel, seed, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const [sketch, setSketch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sketchErr, setSketchErr] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // onClose changes on every parent render: keep it in a ref so the effect does not restart
  // (restarting it would cancel the request in flight).
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
    const entry: ChatEntry = { role: 'user', text: t || 'Here is a sketch of what I have in mind.', ...(image ? { image } : {}) };
    const next: ChatEntry[] = [...base, entry];
    setEntries(() => next); setDraft(''); setSketch(null); setErr(null); setSketchErr(null); setBusy(true);
    ctl.current = new AbortController();
    try {
      const turn = await askAgent(next, context, ctl.current.signal);
      setEntries((cur) => [...cur, { role: 'assistant', text: turn.message, turn }]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') setErr(`You stopped ${AGENT_NAME}'s answer.`);
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

  // The diagnosis is sent once, on open. With a timer, React strict mode's remount cancels it
  // and it fires only once (sending directly would abort it with the test unmount).
  useEffect(() => {
    if (!seed || entries.length > 0) return;
    const t = setTimeout(() => { void send(seed, null, []); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = phaseOf(entries, busy);
  const lastIdx = entries.length - 1;
  const lastEntry = entries[lastIdx];
  const replies = !busy && lastEntry?.role === 'assistant' ? lastEntry.turn.quick_replies : [];

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal agent feature-card hilo" role="dialog" aria-modal="true" aria-label={`Design with AI · ${AGENT_NAME}`}>
        <header className="hilo-head">
          <HiloAvatar size={40} />
          <div className="hilo-id">
            <h2 className="hilo-name">{AGENT_NAME} <span className="hilo-badge">AI</span></h2>
            <p className="caption">{AGENT_ROLE[0].toUpperCase() + AGENT_ROLE.slice(1)} · Muse Spark by Meta</p>
          </div>
          <div className="hilo-actions">
            {entries.length > 0 && <button className="link" onClick={() => { ctl.current?.abort(); setEntries(() => []); setErr(null); setBusy(false); setSketch(null); }}>New conversation</button>}
            <button className="link" onClick={onClose}>Close</button>
          </div>
        </header>

        <div className={`hilo-phase hilo-phase--${phase.tone}`} role="status"><i aria-hidden="true" />{phase.label}</div>

        <div className="hilo-chat" role="log" aria-live="polite" aria-label={`Conversation with ${AGENT_NAME}`}>
          {entries.length === 0 && (
            <div className="hilo-row">
              <HiloAvatar />
              <div className="hilo-bubble hilo-bubble--assistant"><Markdown text={WELCOME} /></div>
            </div>
          )}
          {entries.length === 0 && (
            <div className="hilo-replies" role="group" aria-label="Ideas to get started">
              {STARTERS.map((s) => <button key={s} className="chip" onClick={() => send(s, null)}>{s}</button>)}
            </div>
          )}
          {entries.map((e, i) => (
            e.role === 'user' ? (
              <div key={i} className="hilo-row hilo-row--user">
                <div className="hilo-bubble hilo-bubble--user">
                  {e.image && <img className="hilo-sketch" src={e.image} alt="Sketch you shared" />}
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
                    <ProposalCard turn={e.turn} approveBlocked={approveBlocked} approveLabel={approveLabel} disabled={busy} onApprove={() => onApprove(e.turn.proposal)} />
                  )}
                </div>
              </div>
            )
          ))}
          {busy && (
            <div className="hilo-row" role="status">
              <HiloAvatar />
              <div className="hilo-bubble hilo-bubble--assistant"><span className="hilo-typing" aria-label={`${AGENT_NAME} is thinking`}><i /><i /><i /></span></div>
            </div>
          )}
          {replies.length > 0 && (
            <div className="hilo-replies hilo-replies--answers" role="group" aria-label="Quick replies">
              {replies.map((r) => <button key={r} className="chip" onClick={() => send(r, null)}>{r}</button>)}
            </div>
          )}
          {err && <p className="alert error" role="alert">{err} {lastEntry?.role === 'user' && <button className="link" onClick={retry}>Retry</button>}</p>}
          <div ref={endRef} />
        </div>

        {tooLong && <p className="alert warn" role="alert">This conversation is already long. Start a new one to continue; your current order is not lost.</p>}
        {sketchErr && <p className="alert error" role="alert">{sketchErr}</p>}
        {sketch && (
          <div className="hilo-pending">
            <img src={sketch} alt="Sketch ready to send" />
            <span className="caption">Sketch ready to send</span>
            <button className="link danger" onClick={() => setSketch(null)}>Remove</button>
          </div>
        )}

        <form className="hilo-composer" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Attach sketch" onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button
            type="button" className="hilo-attach" disabled={busy || !sketchesLeft || tooLong} aria-label="Attach a sketch"
            title={sketchesLeft ? 'Attach a sketch (PNG, JPG or WebP)' : `At most ${CHAT_LIMITS.maxSketches} sketches per conversation`}
            onClick={() => fileRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M21 12.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.9-8.9a3.4 3.4 0 0 1 4.8 4.8l-8.9 8.9a1.8 1.8 0 0 1-2.5-2.5l8-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <textarea
            ref={inputRef} rows={2} value={draft} maxLength={CHAT_LIMITS.maxInput} aria-label={`Message for ${AGENT_NAME}`} disabled={tooLong}
            placeholder={`Write to ${AGENT_NAME}…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          />
          {busy
            ? <button className="btn ghost sm" type="button" onClick={() => ctl.current?.abort()}>Stop</button>
            : <button className="btn primary sm" type="submit" disabled={(!draft.trim() && !sketch) || tooLong}>Send</button>}
        </form>

        <details className="hilo-about">
          <summary>How {AGENT_NAME} works</summary>
          <ul>
            <li>{AGENT_NAME} is an AI (Muse Spark, by Meta): it can make mistakes. Always check the measurements.</li>
            <li>It only designs objects made of flat pieces (leather, felt, fabric, cardboard). It will tell you so for other requests.</li>
            <li>From a sketch it estimates shapes and proportions, not exact measurements: it will ask you for the size.</li>
            <li>Your messages and sketches are sent to Meta; do not include personal data. Nothing is applied without your approval.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
