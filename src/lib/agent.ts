import type { AgentProposal, AgentTurn } from './agentSchema';
import type { Kit } from './kits';

/** One message of the conversation. The agent's keep the already validated turn; the person's keep their sketch, if any. */
export type ChatEntry = { role: 'user'; text: string; image?: string } | { role: 'assistant'; text: string; turn: AgentTurn };

/** Client-side limits (the server checks them again). */
export const CHAT_LIMITS = { maxUserTurns: 30, maxSketches: 3, maxInput: 1500, sketchMaxBytes: 8 * 1024 * 1024, sketchMaxSide: 1024 };

const ERROR_TEXT: Record<string, string> = {
  AGENT_NOT_CONFIGURED: 'The server has no credentials for the AI agent.',
  AGENT_RATE_LIMIT: 'Too many requests in a row. Wait a moment and try again.',
  AGENT_TIMEOUT: 'The agent took too long to answer. Try again.',
  NETWORK: 'Could not reach the server.',
};

/** History sent to the server: the session memory lives here, on the client. */
export const toApiMessages = (entries: ChatEntry[]) =>
  entries.map((e) =>
    e.role === 'assistant'
      ? { role: 'assistant' as const, content: JSON.stringify(e.turn) }
      : { role: 'user' as const, content: e.text, ...(e.image ? { images: [e.image] } : {}) });

export const countSketches = (entries: ChatEntry[]) => entries.filter((e) => e.role === 'user' && e.image).length;
export const countUserTurns = (entries: ChatEntry[]) => entries.filter((e) => e.role === 'user').length;

export async function askAgent(entries: ChatEntry[], context: string, signal?: AbortSignal): Promise<AgentTurn> {
  let res: Response;
  try {
    res = await fetch('/api/agent', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ messages: toApiMessages(entries), context }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error(ERROR_TEXT.NETWORK);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(ERROR_TEXT[body.code as string] ?? body.message ?? `Agent error (${res.status}).`);
  return body.turn as AgentTurn;
}

/** Validates a sketch (PNG/JPEG/WebP) and shrinks it to a ≤1024 px JPEG ready to send. Browser only. */
export async function prepareSketch(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('The sketch must be a PNG, JPG or WebP image.');
  if (file.size > CHAT_LIMITS.sketchMaxBytes) throw new Error(`The sketch is ${(file.size / 1048576).toFixed(1)} MB; the limit is 8 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not open the image.'));
      i.src = url;
    });
    const k = Math.min(1, CHAT_LIMITS.sketchMaxSide / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.naturalWidth * k));
    c.height = Math.max(1, Math.round(im.naturalHeight * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; // transparent PNGs (digital sketches) are flattened onto white
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The approved proposal joins the order as one more kit (measurements in cm). */
export function proposalToKit(p: AgentProposal): Kit {
  return {
    id: 'ai', name: p.name, blurb: 'AI agent proposal', kind: 'kit',
    pieces: p.pieces.map((x) => ({ name: x.name, kind: x.kind, w: x.width_cm, h: x.height_cm, qty: x.qty_per_set, rotations: x.rotations })),
  };
}
