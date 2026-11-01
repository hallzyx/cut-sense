import type { AgentProposal, AgentTurn } from './agentSchema';
import type { Kit } from './kits';

/** Una intervención de la conversación. Las del agente guardan el turno ya validado; las de la persona, su boceto si lo hay. */
export type ChatEntry = { role: 'user'; text: string; image?: string } | { role: 'assistant'; text: string; turn: AgentTurn };

/** Límites del lado del cliente (el servidor los vuelve a comprobar). */
export const CHAT_LIMITS = { maxUserTurns: 30, maxSketches: 3, maxInput: 1500, sketchMaxBytes: 8 * 1024 * 1024, sketchMaxSide: 1024 };

const ERROR_TEXT: Record<string, string> = {
  AGENT_NOT_CONFIGURED: 'El servidor no tiene credenciales para el agente de IA.',
  AGENT_RATE_LIMIT: 'Demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.',
  AGENT_TIMEOUT: 'El agente tardó demasiado en responder. Reintenta.',
  NETWORK: 'No se pudo contactar con el servidor.',
};

/** Historial que se envía al servidor: la memoria de la sesión vive aquí, en el cliente. */
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
  if (!res.ok) throw new Error(ERROR_TEXT[body.code as string] ?? body.message ?? `Error del agente (${res.status}).`);
  return body.turn as AgentTurn;
}

/** Valida y reduce un boceto (PNG/JPEG/WebP) a un JPEG de ≤1024 px listo para enviar. Solo navegador. */
export async function prepareSketch(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('El boceto debe ser una imagen PNG, JPG o WebP.');
  if (file.size > CHAT_LIMITS.sketchMaxBytes) throw new Error(`El boceto pesa ${(file.size / 1048576).toFixed(1)} MB; el límite es 8 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('No se pudo abrir la imagen.'));
      i.src = url;
    });
    const k = Math.min(1, CHAT_LIMITS.sketchMaxSide / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(im.naturalWidth * k));
    c.height = Math.max(1, Math.round(im.naturalHeight * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; // los PNG con transparencia (bocetos digitales) se aplanan sobre blanco
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** La propuesta aprobada entra al pedido como un kit más (medidas en cm). */
export function proposalToKit(p: AgentProposal): Kit {
  return {
    id: 'ai', name: p.name, blurb: 'Propuesta del agente de IA', kind: 'kit',
    pieces: p.pieces.map((x) => ({ name: x.name, kind: x.kind, w: x.width_cm, h: x.height_cm, qty: x.qty_per_set, rotations: x.rotations })),
  };
}
