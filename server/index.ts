/**
 * Segmentation proxy. The SAM credentials live ONLY here (never in the browser).
 *
 * Environment variables:
 *   SAM_API_URL   https://api.meta.ai/v1 (completed to /v1/responses)
 *   SAM_API_KEY   credential (Bearer)
 *   SAM_MODEL     optional model id (defaults to "sam-3.1")
 *   PORT          port (8787)
 *
 * Client contract:
 *   POST /api/segment { image: dataURL, width, height, concept?, points?: [{x,y,label}] (normalized 0..1) }
 *   → 200 { crop:{w,h,data(b64 0/1)}, bounds, confidence, model, latencyMs }   (largest-area mask)
 *   with `all: true` → 200 { masks: [{crop, bounds, confidence}], model, latencyMs } (every instance)
 *   → 503 { code: "SAM_NOT_CONFIGURED" } when there are no credentials
 *   → 502/504 { code, message } when the service fails or times out
 *
 * Format per https://dev.meta.ai/docs/sam (Responses API, stream, mask_encoding one_bit).
 */
import express from 'express';
import { agentTurn, AgentError } from './agent';
import { registerAssemblyRoutes } from './assembly';
import { buildObjectPrompt, decodeMaskToRaster, parseImageStream, recordsOfKind, type ResponsesEvent } from '@meta-sam/parser';

const PORT = Number(process.env.PORT ?? 8787);
const SAM_API_URL = (process.env.SAM_API_URL ?? '').replace(/\/+$/, '').replace(/\/v1$/, '/v1/responses') || undefined;
const SAM_API_KEY = process.env.SAM_API_KEY;
const SAM_MODEL = process.env.SAM_MODEL ?? 'sam-3.1';
const TIMEOUT_MS = 45_000;
const AGENT_MODEL = process.env.AGENT_MODEL ?? 'muse-spark-1.3';
const API_BASE = (process.env.SAM_API_URL ?? '').replace(/\/+$/, '').replace(/\/responses$/, '');

/** Simple per-IP limit: 20 agent turns per minute. */
const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

interface Prompt { x: number; y: number; label: 0 | 1 }

interface SamOut {
  crop: { w: number; h: number; data: string };
  bounds: { left: number; top: number; right: number; bottom: number };
  confidence?: number;
  candidates: number;
}

/** SSE events from the /v1/responses endpoint as an AsyncIterable for @meta-sam/parser. */
async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncIterable<ResponsesEvent> {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data || data === '[DONE]') continue;
      try { yield JSON.parse(data) as ResponsesEvent; } catch { /* non-JSON line */ }
    }
  }
}

/** Calls SAM 3.1 (Meta Model API, Responses API). Concept (text) or point prompt. */
async function callSam(image: string, w: number, h: number, concept: string, points: Prompt[], signal: AbortSignal): Promise<SamOut[]> {
  const text = points.length
    ? buildObjectPrompt({
        size: { width: w, height: h },
        objects: [{ id: 1, prompts: [{ points: points.map((p) => ({ x: Math.round(p.x * w), y: Math.round(p.y * h), label: p.label ? 'positive' as const : 'negative' as const })) }] }],
      })
    : concept;
  const res = await fetch(SAM_API_URL!, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SAM_API_KEY}` },
    body: JSON.stringify({
      model: SAM_MODEL,
      stream: true,
      metadata: { mask_encoding: 'one_bit' },
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }, { type: 'input_image', image_url: image }] }],
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw Object.assign(new Error(`SAM answered ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`), { status: res.status });
  }
  const parsed = parseImageStream(sseEvents(res.body));
  const result = await parsed.finalResult;
  if (result.outcome.status !== 'completed') throw new Error(`SAM ended abnormally (${result.outcome.status}).`);
  const masks = recordsOfKind(result.records, 'mask');
  if (!masks.length) throw Object.assign(new Error('SAM found no object for that prompt.'), { code: 'SAM_EMPTY' });
  const area = (m: (typeof masks)[number]) => (m.bounds.right - m.bounds.left) * (m.bounds.bottom - m.bounds.top);
  return [...masks].sort((a, b) => area(b) - area(a)).map((m) => ({
    crop: { w: m.mask.width, h: m.mask.height, data: Buffer.from(decodeMaskToRaster(m.mask)).toString('base64') },
    bounds: m.bounds, confidence: m.confidence, candidates: masks.length,
  }));
}

const app = express();
app.use(express.json({ limit: '12mb' }));
registerAssemblyRoutes(app, { base: API_BASE || undefined, key: SAM_API_KEY, model: AGENT_MODEL });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sam: Boolean(SAM_API_URL && SAM_API_KEY), model: SAM_MODEL, agent: Boolean(API_BASE && SAM_API_KEY), agentModel: AGENT_MODEL });
});

/** Design agent (Muse Spark): the key lives only here. */
app.post('/api/agent', async (req, res) => {
  if (!API_BASE || !SAM_API_KEY) {
    res.status(503).json({ code: 'AGENT_NOT_CONFIGURED', message: 'The server has no credentials for the agent.' });
    return;
  }
  if (rateLimited(req.ip ?? 'local')) {
    res.status(429).json({ code: 'AGENT_RATE_LIMIT', message: 'Too many requests in a row. Wait a moment.' });
    return;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60_000);
  try {
    const turn = await agentTurn({ messages: req.body?.messages, context: req.body?.context }, { base: API_BASE, key: SAM_API_KEY, model: AGENT_MODEL, signal: ctl.signal });
    res.json({ turn, model: AGENT_MODEL });
  } catch (e) {
    const err = e instanceof AgentError ? e : new AgentError('AGENT_UPSTREAM', 'Unexpected agent error.');
    res.status(err.status).json({ code: err.code, message: err.message });
  } finally {
    clearTimeout(timer);
  }
});

app.post('/api/segment', async (req, res) => {
  if (!SAM_API_URL || !SAM_API_KEY) {
    res.status(503).json({ code: 'SAM_NOT_CONFIGURED', message: 'The server has no SAM credentials configured.' });
    return;
  }
  const { image, points, width, height, concept, all } = req.body ?? {};
  if (typeof image !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(image) || !(width > 0) || !(height > 0)) {
    res.status(400).json({ code: 'BAD_IMAGE', message: 'Invalid image or dimensions.' });
    return;
  }
  const prompts: Prompt[] = Array.isArray(points)
    ? points.filter((p: Prompt) => Number.isFinite(p?.x) && Number.isFinite(p?.y)).slice(0, 16)
    : [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const outs = await callSam(image, Math.round(width), Math.round(height), String(concept || 'material').slice(0, 80), prompts, ctl.signal);
    if (all === true) res.json({ masks: outs.slice(0, 20), model: SAM_MODEL, latencyMs: Date.now() - t0 });
    else res.json({ ...outs[0], model: SAM_MODEL, latencyMs: Date.now() - t0 });
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    const code = aborted ? 'SAM_TIMEOUT' : (e as { code?: string }).code ?? 'SAM_ERROR';
    res.status(aborted ? 504 : code === 'SAM_EMPTY' ? 422 : 502).json({ code, message: aborted ? 'SAM took too long to answer.' : (e as Error).message });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, () => console.log(`CutSense API on http://localhost:${PORT} (SAM ${SAM_API_URL ? 'configured' : 'not configured'})`));
