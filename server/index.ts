/**
 * Proxy de segmentación. Las credenciales de SAM viven SOLO aquí (nunca en el navegador).
 *
 * Variables de entorno:
 *   SAM_API_URL   https://api.meta.ai/v1 (se completa a /v1/responses)
 *   SAM_API_KEY   credencial (Bearer)
 *   SAM_MODEL     identificador de modelo opcional (por defecto "sam-3.1")
 *   PORT          puerto (8787)
 *
 * Contrato con el cliente:
 *   POST /api/segment { image: dataURL, width, height, concept?, points?: [{x,y,label}] (normalizados 0..1) }
 *   → 200 { crop:{w,h,data(b64 0/1)}, bounds, confidence, model, latencyMs }   (mask de mayor área)
 *   con `all: true` → 200 { masks: [{crop, bounds, confidence}], model, latencyMs } (todas las instancias)
 *   → 503 { code: "SAM_NOT_CONFIGURED" } si no hay credenciales
 *   → 502/504 { code, message } si el servicio falla o agota el tiempo
 *
 * Formato según https://dev.meta.ai/docs/sam (Responses API, stream, mask_encoding one_bit).
 */
import express from 'express';
import { buildObjectPrompt, decodeMaskToRaster, parseImageStream, recordsOfKind, type ResponsesEvent } from '@meta-sam/parser';

const PORT = Number(process.env.PORT ?? 8787);
const SAM_API_URL = (process.env.SAM_API_URL ?? '').replace(/\/+$/, '').replace(/\/v1$/, '/v1/responses') || undefined;
const SAM_API_KEY = process.env.SAM_API_KEY;
const SAM_MODEL = process.env.SAM_MODEL ?? 'sam-3.1';
const TIMEOUT_MS = 45_000;

interface Prompt { x: number; y: number; label: 0 | 1 }

interface SamOut {
  crop: { w: number; h: number; data: string };
  bounds: { left: number; top: number; right: number; bottom: number };
  confidence?: number;
  candidates: number;
}

/** Eventos SSE del endpoint /v1/responses como AsyncIterable para @meta-sam/parser. */
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
      try { yield JSON.parse(data) as ResponsesEvent; } catch { /* línea no JSON */ }
    }
  }
}

/** Llama a SAM 3.1 (Meta Model API, Responses API). Prompt de concepto (texto) o de puntos. */
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
    throw Object.assign(new Error(`SAM respondió ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`), { status: res.status });
  }
  const parsed = parseImageStream(sseEvents(res.body));
  const result = await parsed.finalResult;
  if (result.outcome.status !== 'completed') throw new Error(`SAM terminó de forma anormal (${result.outcome.status}).`);
  const masks = recordsOfKind(result.records, 'mask');
  if (!masks.length) throw Object.assign(new Error('SAM no encontró ningún objeto para ese prompt.'), { code: 'SAM_EMPTY' });
  const area = (m: (typeof masks)[number]) => (m.bounds.right - m.bounds.left) * (m.bounds.bottom - m.bounds.top);
  return [...masks].sort((a, b) => area(b) - area(a)).map((m) => ({
    crop: { w: m.mask.width, h: m.mask.height, data: Buffer.from(decodeMaskToRaster(m.mask)).toString('base64') },
    bounds: m.bounds, confidence: m.confidence, candidates: masks.length,
  }));
}

const app = express();
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sam: Boolean(SAM_API_URL && SAM_API_KEY), model: SAM_MODEL });
});

app.post('/api/segment', async (req, res) => {
  if (!SAM_API_URL || !SAM_API_KEY) {
    res.status(503).json({ code: 'SAM_NOT_CONFIGURED', message: 'El servidor no tiene credenciales de SAM configuradas.' });
    return;
  }
  const { image, points, width, height, concept, all } = req.body ?? {};
  if (typeof image !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(image) || !(width > 0) || !(height > 0)) {
    res.status(400).json({ code: 'BAD_IMAGE', message: 'Imagen o dimensiones inválidas.' });
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
    res.status(aborted ? 504 : code === 'SAM_EMPTY' ? 422 : 502).json({ code, message: aborted ? 'SAM tardó demasiado en responder.' : (e as Error).message });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, () => console.log(`CutSense API en http://localhost:${PORT} (SAM ${SAM_API_URL ? 'configurado' : 'sin configurar'})`));
