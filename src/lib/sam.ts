import type { Pt, Ring } from '../types';
import { loadImage, maskToPolygon } from './mask';
import { absArea, pointInRing, ringProblem } from './poly';
import { centroid, fmt, type ImageInfo } from '../state';

/** Cliente de /api/segment (SAM 3.1 vía nuestro servidor): contorno del material y zonas con defectos. */

export const SAM_MSG: Record<string, string> = {
  SAM_NOT_CONFIGURED: 'El servidor no tiene credenciales de SAM configuradas, así que la inferencia de Meta AI NO se ejecutó.',
  SAM_TIMEOUT: 'SAM tardó demasiado en responder.',
  NETWORK: 'No se pudo contactar con el servidor de segmentación.',
};

export const samErrorText = (e: unknown) => SAM_MSG[(e as { code?: string }).code ?? 'SAM_ERROR'] ?? (e as Error).message;

export async function downscale(src: string, maxSide: number) {
  const im = await loadImage(src);
  const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88);
}

interface Crop { crop: { w: number; h: number; data: string }; bounds: { left: number; top: number } }

/** El raster de SAM cubre solo su caja: se coloca en un lienzo del tamaño de la imagen enviada. */
function cropToRing(m: Crop, dims: { w: number; h: number }, img: ImageInfo) {
  const bin = atob(m.crop.data);
  const full = new Uint8Array(dims.w * dims.h);
  for (let y = 0; y < m.crop.h; y++) for (let x = 0; x < m.crop.w; x++) {
    const fx = m.bounds.left + x, fy = m.bounds.top + y;
    if (bin.charCodeAt(y * m.crop.w + x) && fx < dims.w && fy < dims.h) full[fy * dims.w + fx] = 1;
  }
  return maskToPolygon({ w: dims.w, h: dims.h, data: full }, img.w, img.h);
}

async function post(body: object, signal: AbortSignal) {
  try {
    return await fetch('/api/segment', { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify(body) });
  } catch (e) {
    throw Object.assign(new Error('network'), { code: (e as Error).name === 'TimeoutError' ? 'SAM_TIMEOUT' : (e as Error).name === 'AbortError' ? 'ABORTED' : 'NETWORK' });
  }
}

/** Contorno del material con SAM por frase o por puntos de guía. */
export async function segmentMaterial(img: ImageInfo, concept: string, points: { p: Pt; label: 0 | 1 }[], signal: AbortSignal) {
  const image = await downscale(img.src, 1024);
  const im = await loadImage(image);
  const dims = { w: im.naturalWidth, h: im.naturalHeight };
  const res = await post({
    image, width: dims.w, height: dims.h, concept, points: points.map((s) => ({ x: s.p[0] / img.w, y: s.p[1] / img.h, label: s.label })),
  }, AbortSignal.any([signal, AbortSignal.timeout(60_000)]));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.message ?? 'Error de SAM'), { code: body.code ?? 'SAM_ERROR' });
  const { polygon, holes } = cropToRing(body as Crop, dims, img);
  const info = `${body.model ?? 'SAM'} · ${body.latencyMs ?? '?'} ms${body.confidence != null ? ` · confianza ${fmt(body.confidence * 100, 0)} %` : ''} · prompt: ${points.length ? `${points.length} puntos` : `«${concept}»`}`;
  return { polygon, holes, info };
}

/** Zonas con defectos: SAM busca cada frase; se descartan ruido, objetos enteros y lo ya marcado. */
export async function detectDefectZones(img: ImageInfo, phrases: string[], contour: Ring, defects: Ring[]) {
  const image = await downscale(img.src, 1024);
  const im = await loadImage(image);
  const dims = { w: im.naturalWidth, h: im.naturalHeight };
  const matArea = absArea(contour);
  const found: { ring: Ring; phrase: string }[] = [];
  for (const phrase of phrases) {
    const res = await post({ image, width: dims.w, height: dims.h, concept: phrase, all: true }, AbortSignal.timeout(60_000));
    const body = await res.json().catch(() => ({}));
    if (res.status === 422) continue; // SAM no encontró nada para esa frase
    if (!res.ok) throw Object.assign(new Error(body.message ?? 'Error de SAM'), { code: body.code ?? 'SAM_ERROR' });
    for (const m of body.masks as Crop[]) {
      const ring = cropToRing(m, dims, img).polygon;
      if (ring.length < 3 || ringProblem(ring)) continue;
      const a = absArea(ring);
      if (a < matArea * 0.001 || a > matArea * 0.4) continue; // ruido o un objeto entero
      const c = centroid(ring);
      if (!pointInRing(c, contour) || defects.some((d) => pointInRing(c, d))) continue;
      found.push({ ring, phrase });
    }
  }
  return found;
}
