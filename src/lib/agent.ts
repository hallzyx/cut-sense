import type { AgentProposal, AgentTurn } from './agentSchema';
import type { Kit } from './kits';

/** Una intervención de la conversación. Las del agente guardan el turno ya validado. */
export type ChatEntry = { role: 'user'; text: string } | { role: 'assistant'; text: string; turn: AgentTurn };

const ERROR_TEXT: Record<string, string> = {
  AGENT_NOT_CONFIGURED: 'El servidor no tiene credenciales para el agente de IA.',
  AGENT_RATE_LIMIT: 'Demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.',
  AGENT_TIMEOUT: 'El agente tardó demasiado en responder. Reintenta.',
  NETWORK: 'No se pudo contactar con el servidor.',
};

/** Historial que se envía al servidor: la memoria de la sesión vive aquí, en el cliente. */
export const toApiMessages = (entries: ChatEntry[]) =>
  entries.map((e) => ({ role: e.role, content: e.role === 'assistant' ? JSON.stringify(e.turn) : e.text }));

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

/** La propuesta aprobada entra al pedido como un kit más (medidas en cm). */
export function proposalToKit(p: AgentProposal): Kit {
  return {
    id: 'ai', name: p.name, blurb: 'Propuesta del agente de IA', kind: 'kit',
    pieces: p.pieces.map((x) => ({ name: x.name, kind: x.kind, w: x.width_cm, h: x.height_cm, qty: x.qty_per_set, rotations: x.rotations })),
  };
}
