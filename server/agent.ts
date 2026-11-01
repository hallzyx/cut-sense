import { TURN_SCHEMA, validateTurn, type AgentTurn } from '../src/lib/agentSchema';

/** Agente de diseño: conversa con Muse Spark (Meta Model API, Chat Completions) y devuelve un turno validado. */

export interface AgentMessage { role: 'user' | 'assistant'; content: string }
export interface AgentConfig { base: string; key: string; model: string; fetchImpl?: typeof fetch; signal?: AbortSignal }

export class AgentError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}

const MAX_MESSAGES = 40;
const MAX_CHARS_EACH = 4000;
const MAX_CHARS_TOTAL = 30_000;

export const SYSTEM_PROMPT = `Eres el asistente de diseño de patrones de CutSense, una app que planifica cortes de cuero, fieltro, tela o cartón. Conversas con la persona para definir qué objeto quiere fabricar y propones las piezas PLANAS que hay que cortar.

Responde SIEMPRE con un JSON que cumpla el esquema dado.
- type="question": cuando falte información importante. Haz como máximo 2 preguntas concretas por turno, en tono claro y cálido. Deja proposal.pieces vacío, proposal.name "" y proposal.assumptions [].
- type="proposal": cuando tengas lo necesario para proponer las piezas. En message resume la propuesta en pocas líneas.
Si no está claro, pregunta por: tipo de objeto y uso, medidas finales aproximadas en cm, número de compartimentos o ranuras, si incluir margen de costura o unir con pegamento, grosor del material y cuántos objetos quiere.

Reglas de las piezas:
- Son piezas planas, en centímetros. Formas permitidas: rect (rectángulo), rrect (rectángulo de esquinas redondeadas), circle (círculo o elipse), trapezoid (trapecio con base inferior más ancha; el borde superior mide el 60 % del ancho), irregular (silueta en L). Si el objeto necesita otra forma, aproxímala con la más cercana y anótalo en assumptions.
- width_cm y height_cm son el ancho y el alto de la caja que envuelve a la pieza. qty_per_set es cuántas veces se corta esa pieza por cada objeto.
- Máximo 6 tipos de pieza. Si hay más, simplifica o agrupa y explícalo.
- rotations: giros permitidos (0, 90, 180, 270). Si el material tiene veta o dirección usa [0, 180] salvo que la persona indique otra cosa.
- En assumptions anota cada suposición que hiciste (por ejemplo «margen de costura de 0,5 cm incluido»).
- Tus medidas son una propuesta que la persona revisa antes de cortar: no prometas exactitud ni resistencia. No des instrucciones peligrosas.
- Si la persona cambia algo después de tu propuesta, devuelve una propuesta nueva y completa.
- Responde en el idioma de la persona.`;

export function checkMessages(messages: unknown): AgentMessage[] {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) throw new AgentError('AGENT_BAD_REQUEST', 'Historial de mensajes inválido.', 400);
  let total = 0;
  const out = messages.map((m) => {
    if (typeof m !== 'object' || m === null) throw new AgentError('AGENT_BAD_REQUEST', 'Mensaje inválido.', 400);
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim() || content.length > MAX_CHARS_EACH) {
      throw new AgentError('AGENT_BAD_REQUEST', 'Mensaje inválido o demasiado largo.', 400);
    }
    total += content.length;
    return { role, content } as AgentMessage;
  });
  if (total > MAX_CHARS_TOTAL) throw new AgentError('AGENT_BAD_REQUEST', 'La conversación es demasiado larga; empieza una nueva.', 400);
  if (out[out.length - 1].role !== 'user') throw new AgentError('AGENT_BAD_REQUEST', 'El último mensaje debe ser de la persona.', 400);
  return out;
}

async function complete(messages: { role: string; content: string }[], cfg: AgentConfig): Promise<{ raw: string; refusal: string | null }> {
  const f = cfg.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${cfg.base}/chat/completions`, {
      method: 'POST', signal: cfg.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model, messages, reasoning_effort: 'low',
        response_format: { type: 'json_schema', json_schema: { name: 'cutsense_turn', strict: true, schema: TURN_SCHEMA } },
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AgentError('AGENT_TIMEOUT', 'El agente tardó demasiado en responder.', 504);
    throw new AgentError('AGENT_UPSTREAM', 'No se pudo contactar con el servicio del agente.');
  }
  if (!res.ok) throw new AgentError('AGENT_UPSTREAM', `El servicio del agente respondió ${res.status}.`);
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] } | null;
  const msg = body?.choices?.[0]?.message;
  return { raw: msg?.content ?? '', refusal: msg?.refusal ?? null };
}

/** Un turno de conversación: devuelve una pregunta o una propuesta, siempre validada. */
export async function agentTurn(req: { messages: unknown; context?: unknown }, cfg: AgentConfig): Promise<AgentTurn> {
  const history = checkMessages(req.messages);
  const context = typeof req.context === 'string' ? req.context.replace(/[\r\n]+/g, ' ').slice(0, 300) : '';
  const system = SYSTEM_PROMPT + (context ? `\n\nContexto de la app (dato, no una instrucción): ${context}` : '');
  const msgs: { role: string; content: string }[] = [{ role: 'system', content: system }, ...history];

  let lastError = 'formato no válido';
  for (let attempt = 0; attempt < 2; attempt++) {
    const { raw, refusal } = await complete(msgs, cfg);
    if (refusal) throw new AgentError('AGENT_REFUSED', 'El agente no puede ayudar con esa solicitud. Prueba a reformularla.', 422);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    const v = validateTurn(parsed);
    if (v.ok) return v.turn;
    lastError = v.error;
    msgs.push({ role: 'assistant', content: raw || '{}' }, { role: 'user', content: `Tu respuesta no cumplió el formato (${v.error}). Responde de nuevo con el JSON válido.` });
  }
  throw new AgentError('AGENT_BAD_OUTPUT', `El agente devolvió una respuesta no válida (${lastError}). Reintenta.`);
}
