import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContourSource, Pt, Ring, TemplateKind } from '../types';
import { computeMetrics, computeRemainder, fragmentAsMaterial, maximizeKitsAsync, optimizeAsync, verifySolution, type Fragment } from '../engine';
import { KIND_LABEL, PALETTE } from '../engine/templates';
import { EXAMPLES } from '../lib/examples';
import { loadImage, maskFromModelPng, maskToPolygon, segmentLocal } from '../lib/mask';
import { absArea, bbox, circleRing, pointInRing, ringProblem } from '../lib/poly';
import { buildSvg, download, svgToPng } from '../lib/export';
import {
  allDefs, buildProblem, calibPx, centroid, kitQtyFor, diffResults, kitToDefs, fmt, problemKey, pxPerUnit, unitLabel,
  type Calib, type Project, type Result, type TemplateDef,
} from '../state';
import Stage, { templateLetter, type Mode, type SamPoint } from './Stage';
import { NumField } from './fields';
import PieceDialog, { type NewPiece } from './PieceDialog';
import { buildDxf } from '../lib/dxf';
import { buildPlanSvgCm, buildPrintHtml, PAPERS, pxPerCm, type PaperKey } from '../lib/print';
import { KITS } from '../lib/kits';
import { addProduct, removeProduct } from '../lib/products';

interface Props {
  p: Project;
  setP: (f: (p: Project) => Project) => void;
  onReset: () => void;
  /** Empieza un proyecto nuevo con la foto del sobrante, conservando el pedido. */
  onLeftoverPhoto: (f: File, defs: TemplateDef[], spacing: number) => void;
}

interface Proposal { polygon: Ring; source: ContourSource; info: string; holes: Ring[] }

const STEPS = ['Digitalizar', 'Preparar', 'Resultado'];
const SOURCE_LABEL: Record<ContourSource, string> = {
  sam: 'IA — SAM 3.1 (inferencia en vivo)',
  example: 'Máscara guardada del ejemplo (no es inferencia en vivo)',
  local: 'Segmentación local por contraste (no es Meta AI)',
  manual: 'Trazado manual',
  leftover: 'Sobrante del plan anterior',
};

async function downscale(src: string, maxSide: number) {
  const im = await loadImage(src);
  const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88);
}

const SAM_MSG: Record<string, string> = {
  SAM_NOT_CONFIGURED: 'El servidor no tiene credenciales de SAM configuradas, así que la inferencia de Meta AI NO se ejecutó.',
  SAM_TIMEOUT: 'SAM tardó demasiado en responder.',
  NETWORK: 'No se pudo contactar con el servidor de segmentación.',
};

export default function Workspace({ p, setP, onReset, onLeftoverPhoto }: Props) {
  const img = p.image!;
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<Mode>(p.contour.length ? 'contour' : 'view');
  const [draft, setDraft] = useState<Pt[] | null>(null);
  const [drawTarget, setDrawTarget] = useState<'contour' | 'defect'>('defect');
  const [selDefect, setSelDefect] = useState<number | null>(null);
  const [calibPts, setCalibPts] = useState<Pt[]>([]);
  const [calibDist, setCalibDist] = useState('');
  const [calibUnit, setCalibUnit] = useState('cm');
  const [widthCm, setWidthCm] = useState('');
  const [leftover, setLeftover] = useState<{ fragments: Fragment[]; area: number; materialArea: number } | null>(null);
  const [detectPhrases, setDetectPhrases] = useState('scar, stain, hole');
  const [detected, setDetected] = useState<{ ring: Ring; phrase: string }[]>([]);
  const [productId, setProductId] = useState('');
  const [dxfRef, setDxfRef] = useState(false);
  const [paper, setPaper] = useState<PaperKey>('A4');
  const [pieceDialog, setPieceDialog] = useState<'draw' | 'svg' | null>(null);
  const [samPoints, setSamPoints] = useState<SamPoint[]>([]);
  const [concept, setConcept] = useState(img.exampleId === 'cuero' ? 'brown shape' : img.exampleId === 'fieltro' ? 'teal shape' : 'fabric');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<'sam' | 'local' | 'opt' | 'detect' | null>(null);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [samFailed, setSamFailed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [prev, setPrev] = useState<Result | null>(null);
  const [selPlacement, setSelPlacement] = useState<number | null>(null);
  const [showImage, setShowImage] = useState(true);
  const [withPhoto, setWithPhoto] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const ppu = pxPerUnit(p.calib, img.w);
  const unit = unitLabel(p.calib);
  const contourErr = p.contour.length ? ringProblem(p.contour) : 'Aún no hay contorno.';
  const problem = useMemo(() => (contourErr ? null : buildProblem(p)), [p, contourErr]);
  const key = useMemo(() => problemKey(problem, p.calib) + p.fill, [problem, p.calib, p.fill]);
  const stale = !!result && result.problemKey !== key;
  const live = useMemo(() => (problem ? computeMetrics(problem, []) : null), [problem]);

  useEffect(() => {
    if (!p.contour.length) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [p.contour.length]);

  const goStep = (s: number) => {
    setStep(s); setDraft(null); setCalibPts([]); setErr(null); setSelPlacement(null);
    setMode(s === 1 && p.contour.length ? 'contour' : 'view');
    if (s !== 2) setSelDefect(null);
  };

  /* ---------- contorno ---------- */
  const setContour = (r: Ring) =>
    setP((q) => ({ ...q, contour: r, lastValid: ringProblem(r) ? q.lastValid : r, edited: q.source ? true : q.edited, source: q.source ?? 'manual' }));

  const propose = (polygon: Ring, source: ContourSource, info: string, holes: Ring[] = []) => {
    const bad = polygon.length < 3 ? 'No se obtuvo ninguna región de material.' : ringProblem(polygon);
    if (bad) { setErr(`La máscara no produjo un contorno válido: ${bad} Puedes reintentar, usar otro método o trazarlo manualmente.`); return; }
    setProposal({ polygon, source, info, holes }); setMode('view'); setErr(null);
  };

  const runSam = async () => {
    setBusy('sam'); setErr(null); setProposal(null); setSamFailed(false);
    abort.current = new AbortController();
    try {
      const image = await downscale(img.src, 1024);
      const dims = await loadImage(image);
      let res: Response;
      try {
        res = await fetch('/api/segment', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.any([abort.current.signal, AbortSignal.timeout(60_000)]),
          body: JSON.stringify({ image, width: dims.naturalWidth, height: dims.naturalHeight, concept, points: samPoints.map((s) => ({ x: s.p[0] / img.w, y: s.p[1] / img.h, label: s.label })) }),
        });
      } catch (e) {
        throw Object.assign(new Error('network'), { code: (e as Error).name === 'TimeoutError' ? 'SAM_TIMEOUT' : 'NETWORK' });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.message ?? 'Error de SAM'), { code: body.code ?? 'SAM_ERROR' });
      // El raster de SAM cubre solo su caja: se coloca en un lienzo del tamaño de la imagen enviada.
      const bin = atob(body.crop.data);
      const full = new Uint8Array(dims.naturalWidth * dims.naturalHeight);
      for (let y = 0; y < body.crop.h; y++) for (let x = 0; x < body.crop.w; x++) {
        const fx = body.bounds.left + x, fy = body.bounds.top + y;
        if (bin.charCodeAt(y * body.crop.w + x) && fx < dims.naturalWidth && fy < dims.naturalHeight) full[fy * dims.naturalWidth + fx] = 1;
      }
      const { polygon, holes } = maskToPolygon({ w: dims.naturalWidth, h: dims.naturalHeight, data: full }, img.w, img.h);
      propose(polygon, 'sam', `${body.model ?? 'SAM'} · ${body.latencyMs ?? '?'} ms${body.confidence != null ? ` · confianza ${fmt(body.confidence * 100, 0)} %` : ''} · prompt: ${samPoints.length ? `${samPoints.length} puntos` : `«${concept}»`}`, holes);
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'SAM_ERROR';
      setSamFailed(true);
      setErr(`${SAM_MSG[code] ?? (e as Error).message} Puedes reintentar, usar una alternativa o trazar el contorno a mano.`);
    } finally { setBusy(null); }
  };

  const runLocal = async () => {
    setBusy('local'); setErr(null); setProposal(null);
    try {
      const m = await segmentLocal(img.src);
      const mp = maskToPolygon(m, img.w, img.h);
      propose(mp.polygon, 'local', 'umbral de color contra el fondo', mp.holes);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  const useCached = () => {
    const ex = EXAMPLES.find((x) => x.id === img.exampleId);
    if (ex) propose(ex.cachedPolygon, 'example', 'resultado precalculado');
  };

  const acceptProposal = () => {
    if (!proposal) return;
    setP((q) => ({ ...q, contour: proposal.polygon, lastValid: proposal.polygon, source: proposal.source, edited: false, samInfo: proposal.info, defects: proposal.holes.length ? proposal.holes : q.defects }));
    if (proposal.holes.length) setFlash(`Se añadieron ${proposal.holes.length} zona(s) excluida(s) a partir de huecos de la máscara. Revísalas en el paso 2 (puedes editarlas o eliminarlas).`);
    setProposal(null); setMode('contour');
  };

  const startManualTrace = () => { setDrawTarget('contour'); setDraft([]); setMode('view'); setProposal(null); setErr(null); };

  const closeDraft = () => {
    if (!draft) return;
    const bad = ringProblem(draft);
    if (bad) { setErr(`${bad} Corrige los puntos o cancela el trazado.`); return; }
    setErr(null);
    if (drawTarget === 'contour') {
      setP((q) => ({ ...q, contour: draft, lastValid: draft, source: 'manual', edited: false, samInfo: null }));
      setMode('contour');
    } else {
      setP((q) => ({ ...q, defects: [...q.defects, draft] }));
      setSelDefect(p.defects.length);
    }
    setDraft(null);
  };

  /* ---------- defectos y calibración ---------- */
  const startDefect = () => { setDrawTarget('defect'); setDraft([]); setMode('defects'); setSelDefect(null); setErr(null); };
  const quickDefect = () => {
    const b = bbox(p.contour);
    const r = Math.max(8, b.w * 0.06);
    setP((q) => ({ ...q, defects: [...q.defects, circleRing(b.x0 + b.w * 0.5, b.y0 + b.h * 0.5, r)] }));
    setSelDefect(p.defects.length); setMode('defects');
  };
  const delDefect = (i: number) => { setP((q) => ({ ...q, defects: q.defects.filter((_, j) => j !== i) })); setSelDefect(null); };
  const defectOutside = (d: Ring) => !d.some((v) => pointInRing(v, p.contour)) && !p.contour.some((v) => pointInRing(v, d));

  const applyCalib = (c: Calib | null) => {
    const old = pxPerUnit(p.calib, img.w), nu = pxPerUnit(c, img.w);
    setP((q) => ({
      ...q, calib: c,
      defs: q.defs.map((d) => ({ ...d, w: Math.max(0.1, Math.round((d.w * old / nu) * 10) / 10), h: Math.max(0.1, Math.round((d.h * old / nu) * 10) / 10) })),
      spacing: Math.round((q.spacing * old / nu) * 100) / 100,
    }));
  };
  /** Calibración rápida: el ancho del material (caja del contorno) mide `widthCm` cm. */
  const calibByWidth = () => {
    const d = Number(widthCm);
    if (!(d > 0)) { setErr('Escribe el ancho real del material en cm (mayor que 0).'); return; }
    const b = bbox(p.contour), y = b.y0 + b.h / 2;
    applyCalib({ a: [b.x0, y], b: [b.x1, y], dist: d, unit: 'cm' });
    setErr(null); setFlash(`Calibrado: el ancho del material (${fmt(b.w)} px) mide ${fmt(d)} cm. Si el material es irregular, mide su parte más ancha.`);
  };
  const confirmCalib = () => {
    const d = Number(calibDist);
    if (calibPts.length !== 2 || !(d > 0)) { setErr('Marca dos puntos y escribe una distancia real mayor que 0.'); return; }
    if (Math.hypot(calibPts[0][0] - calibPts[1][0], calibPts[0][1] - calibPts[1][1]) < 4) { setErr('Los dos puntos están demasiado cerca.'); return; }
    applyCalib({ a: calibPts[0], b: calibPts[1], dist: d, unit: calibUnit.trim() || 'cm' });
    setCalibPts([]); setMode('view'); setErr(null);
    setFlash('Calibración aplicada. Las dimensiones de las piezas se convirtieron conservando su tamaño en la foto.');
  };

  /* ---------- plantillas ---------- */
  const setDef = (id: string, patch: Partial<TemplateDef>) => setP((q) => ({ ...q, defs: q.defs.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const addDef = () => setP((q) => {
    if (q.defs.length >= 6) return q;
    let n = 0; while (q.defs.some((d) => d.id === `t${n}`)) n++;
    return { ...q, defs: [...q.defs, { id: `t${n}`, name: `Pieza ${templateLetter(q.defs.length)}`, color: PALETTE[n % PALETTE.length], kind: 'rect' as TemplateKind, w: 15, h: 10, qty: 1, rotations: [0, 180] }] };
  });
  const addCustom = (np: NewPiece) => {
    setP((q) => {
      if (q.defs.length >= 6) return q;
      let n = 0; while (q.defs.some((d) => d.id === `t${n}`)) n++;
      return { ...q, defs: [...q.defs, { id: `t${n}`, name: np.name, color: PALETTE[n % PALETTE.length], kind: 'custom' as TemplateKind, w: np.w, h: np.h, qty: 1, rotations: [0, 180], custom: np.shape }] };
    });
    setPieceDialog(null);
    setFlash(`Pieza «${np.name}» añadida con cantidad 1. Ajusta la cantidad y los giros permitidos.`);
  };
  /** Milímetros → unidad actual, si la foto está calibrada en cm o mm. */
  const mmToCurrent = (mm: number) => {
    const unitName = p.calib?.unit.trim().toLowerCase();
    return unitName === 'cm' ? mm / 10 : unitName === 'mm' ? mm : null;
  };
  const applyKit = (id: string) => {
    const kit = KITS.find((k) => k.id === id);
    if (!kit) return;
    if (!p.calib || p.calib.unit.trim().toLowerCase() !== 'cm') {
      setErr(`«${kit.name}» usa medidas reales en cm. Calibra primero la foto en cm (p. ej. con una regla, o una tarjeta bancaria = 8,56 cm de largo) y vuelve a elegir el kit.`);
      return;
    }
    setErr(null);
    setP((q) => ({ ...q, defs: kitToDefs(kit), spacing: Math.max(q.spacing, 0.2), fill: 'maxKits' }));
    setFlash(`Kit «${kit.name}» cargado (${kit.pieces.reduce((s, x) => s + x.qty, 0)} piezas por juego, medidas en cm). Al optimizar, la app buscará cuántos juegos completos caben.`);
  };
  const toggleRot = (d: TemplateDef, r: number) => {
    const has = d.rotations.includes(r);
    if (has && d.rotations.length === 1) return;
    setDef(d.id, { rotations: has ? d.rotations.filter((x) => x !== r) : [...d.rotations, r].sort((a, b) => a - b) });
  };

  /* ---------- optimización ---------- */
  const optimize = async () => {
    if (!problem) { setErr(contourErr ?? 'Contorno inválido.'); return; }
    if (!live || live.usableArea <= 0) { setErr('Las zonas excluidas cubren todo el material: no hay área utilizable para acomodar piezas.'); return; }
    if (problem.templates.every((t) => t.qty === 0)) { setErr('El pedido está vacío: indica al menos una pieza.'); return; }
    setErr(null); setBusy('opt'); setProgress(0); setStep(3); setMode('view'); setSelPlacement(null);
    await new Promise((r) => setTimeout(r, 30));
    setLeftover(null);
    try {
      if (p.fill === 'maxKits') {
        const mk = await maximizeKitsAsync(problem, (f: number) => setProgress(f));
        const n = Math.max(mk.kits, 1);
        const expanded = { ...problem, templates: problem.templates.map((t) => ({ ...t, qty: t.qty * n })) };
        const verify = verifySolution(expanded, mk.solution.placements);
        setPrev(result);
        setResult({ solution: mk.solution, verify, problemKey: key, kits: { n: mk.kits, perKit: mk.perKit }, ppu, unit, calibrated: !!p.calib, problem: expanded });
      } else {
        const solution = await optimizeAsync(problem, (f: number) => setProgress(f));
        const verify = verifySolution(problem, solution.placements);
        setPrev(result);
        setResult({ solution, verify, problemKey: key, ppu, unit, calibrated: !!p.calib, problem });
      }
    } catch (e) { setErr(`La optimización falló: ${(e as Error).message}`); } finally { setBusy(null); }
  };

  /* ---------- sobrante ---------- */
  const showLeftover = () => { if (result) setLeftover(computeRemainder(result.problem, result.solution.placements)); };
  const tryProduct = async () => {
    const kit = KITS.find((k) => k.id === productId);
    if (!kit || !result) return;
    setErr(null); setBusy('opt'); setProgress(0);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const out = await addProduct(p, result, kit, (f) => setProgress(f));
      if (out.added === 0) setFlash(`En el sobrante no cabe ni un juego completo de «${kit.name}». El plan anterior no cambió.`);
      else {
        setResult(out.result); setLeftover(null);
        setFlash(`Se añadieron ${out.added} ${kit.kind === 'piece' ? 'pieza(s)' : 'juego(s) completo(s)'} de «${kit.name}» con lo que sobró.`);
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const dropProduct = (id: string) => { if (result) { setResult(removeProduct(result, id)); setLeftover(null); } };
  const useFragment = (i: number) => {
    const f = leftover?.fragments[i];
    if (!f) return;
    const { material, defects } = fragmentAsMaterial(f);
    setP((q) => ({ ...q, contour: material, lastValid: material, defects, source: 'leftover', edited: false, samInfo: null }));
    setResult(null); setPrev(null); setLeftover(null); setStep(2); setMode('view'); setSelPlacement(null);
    setFlash(`Sobrante cargado como nuevo material (${fmt(f.area / ppu ** 2)} ${unit}²). Sus huecos pasaron a ser zonas excluidas.`);
  };

  /* ---------- defectos con IA ---------- */
  const detectDefects = async () => {
    const phrases = detectPhrases.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    if (!phrases.length) { setErr('Escribe qué buscar: frases cortas en inglés separadas por comas.'); return; }
    setBusy('detect'); setErr(null); setDetected([]);
    try {
      const image = await downscale(img.src, 1024);
      const dims = await loadImage(image);
      const matArea = absArea(p.contour);
      const found: { ring: Ring; phrase: string }[] = [];
      for (const phrase of phrases) {
        let res: Response;
        try {
          res = await fetch('/api/segment', {
            method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(60_000),
            body: JSON.stringify({ image, width: dims.naturalWidth, height: dims.naturalHeight, concept: phrase, all: true }),
          });
        } catch (e) { throw Object.assign(new Error('network'), { code: (e as Error).name === 'TimeoutError' ? 'SAM_TIMEOUT' : 'NETWORK' }); }
        const body = await res.json().catch(() => ({}));
        if (res.status === 422) continue; // SAM no encontró nada para esa frase
        if (!res.ok) throw Object.assign(new Error(body.message ?? 'Error de SAM'), { code: body.code ?? 'SAM_ERROR' });
        for (const m of body.masks as { crop: { w: number; h: number; data: string }; bounds: { left: number; top: number } }[]) {
          const bin = atob(m.crop.data);
          const full = new Uint8Array(dims.naturalWidth * dims.naturalHeight);
          for (let y = 0; y < m.crop.h; y++) for (let x = 0; x < m.crop.w; x++) {
            const fx = m.bounds.left + x, fy = m.bounds.top + y;
            if (bin.charCodeAt(y * m.crop.w + x) && fx < dims.naturalWidth && fy < dims.naturalHeight) full[fy * dims.naturalWidth + fx] = 1;
          }
          const ring = maskToPolygon({ w: dims.naturalWidth, h: dims.naturalHeight, data: full }, img.w, img.h).polygon;
          if (ring.length < 3 || ringProblem(ring)) continue;
          const a = absArea(ring);
          if (a < matArea * 0.001 || a > matArea * 0.4) continue; // ruido o un objeto entero
          const c = centroid(ring);
          if (!pointInRing(c, p.contour) || p.defects.some((d) => pointInRing(c, d))) continue;
          found.push({ ring, phrase });
        }
      }
      setDetected(found);
      if (!found.length) setFlash('SAM no encontró defectos con esas frases. Prueba otras (por ejemplo «dark spot», «crack») o márcalos a mano.');
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'SAM_ERROR';
      setErr(`${SAM_MSG[code] ?? (e as Error).message} Puedes marcar los defectos a mano.`);
    } finally { setBusy(null); }
  };
  const acceptDetected = () => {
    setP((q) => ({ ...q, defects: [...q.defects, ...detected.map((d) => d.ring)] }));
    setFlash(`Se añadieron ${detected.length} zona(s) propuestas por SAM. Revísalas: puedes editarlas o eliminarlas.`);
    setDetected([]);
  };

  const change = useMemo(() => (result && prev && prev.problemKey !== result.problemKey ? diffResults(prev, result) : null), [result, prev]);

  /* ---------- exportación ---------- */
  const exportable = !!result && !stale && result.verify.valid && result.solution.placements.length > 0;
  const doExport = async (kind: 'svg' | 'png') => {
    if (!exportable || !result) return;
    const { svg, w, h } = buildSvg(p, result, withPhoto);
    try {
      if (kind === 'svg') download('cutsense-plano.svg', new Blob([svg], { type: 'image/svg+xml' }));
      else download('cutsense-plano.png', await svgToPng(svg, w, h));
    } catch (e) { setErr((e as Error).message); }
  };
  const physical = !!result && pxPerCm(result) !== null;
  const exportReal = () => {
    if (!exportable || !result) return;
    try { const { svg } = buildPlanSvgCm(p, result); download('cutsense-plano-1a1.svg', new Blob([svg], { type: 'image/svg+xml' })); }
    catch (e) { setErr((e as Error).message); }
  };
  const exportDxf = () => {
    if (!exportable || !result) return;
    try { download('cutsense-piezas.dxf', new Blob([buildDxf(p, result, { reference: dxfRef })], { type: 'application/dxf' })); }
    catch (e) { setErr((e as Error).message); }
  };
  const printReal = () => {
    if (!exportable || !result) return;
    try {
      const url = URL.createObjectURL(new Blob([buildPrintHtml(p, result, paper)], { type: 'text/html' }));
      if (!window.open(url, '_blank')) setErr('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setErr((e as Error).message); }
  };
  const downloadJson = () => result && download('cutsense-problema.json', new Blob([JSON.stringify({ problem: result.problem, solution: result.solution, verify: result.verify }, null, 2)], { type: 'application/json' }));

  const m = result?.solution.metrics;
  const sel = selPlacement !== null && result ? result.solution.placements[selPlacement] : null;
  const resultDefs = allDefs(p, result);
  const extraPieces = m ? (result?.extras ?? []).reduce((t, e) => t + e.defs.reduce((a, d) => a + (m.placed[d.id] ?? 0), 0), 0) : 0;
  const selDef = sel ? resultDefs.find((d) => d.id === sel.templateId) : null;
  const canNext1 = !contourErr;
  const stageMode: Mode = draft ? 'view' : mode;

  return (
    <section className="band mint workspace">
      <div className="container">
        <nav className="stepper" aria-label="Pasos">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const locked = (n >= 2 && !canNext1) || (n === 3 && !result && busy !== 'opt');
            return (
              <button key={s} className={`step ${step === n ? 'on' : ''}`} aria-current={step === n ? 'step' : undefined} disabled={locked} onClick={() => goStep(n)}>
                <b>{n}</b> {s}
              </button>
            );
          })}
        </nav>

        <div className="work-grid">
          <div className="stage-card">
            <div className="stage-bar">
              <span className="chip">{img.exampleId ? 'Imagen de ejemplo' : img.name}</span>
              {step === 3 && <label className="check"><input type="checkbox" checked={showImage} onChange={(e) => setShowImage(e.target.checked)} /> Mostrar fotografía</label>}
              {mode === 'points' && <span className="chip dark">Clic = incluir · Shift+clic o clic derecho = excluir</span>}
              {mode === 'calib' && <span className="chip dark">Marca 2 puntos de longitud conocida</span>}
              {draft && <span className="chip dark">Clic para añadir puntos · clic en el primero para cerrar</span>}
            </div>
            <Stage
              src={img.src} w={img.w} h={img.h} showImage={step !== 3 || showImage} mode={stageMode}
              contour={p.contour} onContour={setContour} proposal={proposal?.polygon}
              defects={p.defects} onDefects={(d) => setP((q) => ({ ...q, defects: d }))} selDefect={selDefect} onSelDefect={setSelDefect}
              draft={draft} onDraft={setDraft} onCloseDraft={closeDraft}
              calibPts={calibPts} onCalibPts={setCalibPts} samPoints={samPoints} onSamPoints={setSamPoints}
              placements={step === 3 && result ? result.solution.placements : []} templates={result ? result.problem.templates : []} stale={stale}
              kitQty={result ? Object.fromEntries(result.problem.templates.flatMap((t) => { const q = kitQtyFor(result, t.id); return q ? [[t.id, q] as const] : []; })) : undefined}
              defectProposals={detected.map((d) => d.ring)}
              leftover={step === 3 && leftover && !stale ? leftover.fragments.map((f) => f.outer) : undefined} outlineKind={step === 3 && result?.verify.valid && !stale ? 'verified' : p.edited || p.source === 'manual' ? 'human' : 'ai'}
              selPlacement={selPlacement} onSelPlacement={setSelPlacement}
            />
            {step === 3 && result && result.problem.templates.length > 0 && (
              <ul className="legend" aria-label="Leyenda">
                {resultDefs.map((d, i) => <li key={d.id}><i style={{ background: d.color }} />{templateLetter(i)} · {d.name}</li>)}
                <li><i className="hatch" />Zona excluida</li>
              </ul>
            )}
          </div>

          <aside className="panel feature-card" aria-live="polite">
            {flash && <p className="alert ok" role="status">{flash} <button className="link" onClick={() => setFlash(null)}>Cerrar</button></p>}
            {err && <p className="alert error" role="alert">{err}</p>}

            {step === 1 && (
              <>
                <h2 className="h4">1 · Digitalizar el material</h2>
                <p className="caption">Tu imagen se envía a un servicio de inferencia (SAM 3.1) a través de nuestro servidor; no se guarda.</p>

                {!proposal && (
                  <div className="stack">
                    <label className="field"><span>¿Qué material segmentar? (frase corta en inglés)</span>
                      <span className="input-wrap"><input value={concept} onChange={(e) => setConcept(e.target.value)} disabled={samPoints.length > 0} /></span>
                    </label>
                    <button className="btn primary" disabled={!!busy || (!concept.trim() && !samPoints.length)} onClick={runSam}>{busy === 'sam' ? 'Ejecutando SAM 3.1…' : samFailed ? 'Reintentar SAM 3.1' : 'Segmentar con SAM 3.1'}</button>
                    <button className="btn ghost sm" aria-pressed={mode === 'points'} onClick={() => { setMode(mode === 'points' ? 'view' : 'points'); setDraft(null); }}>
                      {mode === 'points' ? 'Terminar de marcar puntos' : `Marcar puntos de guía (${samPoints.length})`}
                    </button>
                    {samPoints.length > 0 && <button className="link" onClick={() => setSamPoints([])}>Quitar puntos de guía</button>}
                    {samFailed && (
                      <div className="alt-box">
                      <p className="caption">Alternativas (no usan Meta AI):</p>
                      {img.exampleId && <button className="btn ghost sm" disabled={!!busy} onClick={useCached}>Cargar máscara guardada del ejemplo</button>}
                      <button className="btn ghost sm" disabled={!!busy} onClick={runLocal}>{busy === 'local' ? 'Calculando…' : 'Segmentar por contraste (local)'}</button>
                      <button className="btn ghost sm" disabled={!!busy} onClick={startManualTrace}>Trazar a mano</button>
                    </div>
                    )}
                  </div>
                )}

                {proposal && (
                  <div className="stack">
                    <div className="alert info"><b>Propuesta:</b> {SOURCE_LABEL[proposal.source]}<br /><span className="caption">{proposal.info}</span></div>
                    <p className="caption">La zona punteada es la máscara convertida a polígono ({proposal.polygon.length} vértices).{proposal.holes.length > 0 && ` Se detectaron ${proposal.holes.length} hueco(s) en el material; al aceptar se propondrán como zonas excluidas.`}</p>
                    <button className="btn primary" onClick={acceptProposal}>Aceptar contorno</button>
                    <button className="btn ghost sm" onClick={() => setProposal(null)}>Rechazar</button>
                  </div>
                )}

                {p.contour.length > 0 && !proposal && (
                  <div className="stack mt">
                    <div className="stat">
                      <span className="caption">Origen del contorno</span>
                      <b>{p.source ? SOURCE_LABEL[p.source] : '—'}{p.edited ? ' + corrección humana' : ''}</b>
                    </div>
                    <p className="caption">Arrastra los vértices; clic en un borde añade uno; doble clic (o Supr) lo elimina.</p>
                    {contourErr ? <p className="alert error" role="alert">{contourErr} Mueve los puntos o revierte al último contorno válido.</p> : live && <p className="caption">Área digitalizada: <b>{fmt(live.totalArea / (ppu * ppu))} {unit}²</b></p>}
                    <button className="btn ghost sm" disabled={!p.lastValid.length || JSON.stringify(p.lastValid) === JSON.stringify(p.contour)} onClick={() => setP((q) => ({ ...q, contour: q.lastValid }))}>Revertir al último contorno válido</button>
                  </div>
                )}

                <div className="panel-foot">
                  <button className="btn primary" disabled={!canNext1 || !!busy} onClick={() => goStep(2)}>Continuar</button>
                  {contourErr && p.contour.length > 0 && <p className="caption">La optimización está bloqueada hasta corregir el contorno.</p>}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="h4">2 · Calibrar, excluir y definir piezas</h2>

                <section className="sect">
                  <h3 className="h5">Escala</h3>
                  {p.calib ? (
                    <div className="stack">
                      <p className="caption"><b>Calibrado:</b> {fmt(calibPx(p.calib))} px = {fmt(p.calib.dist)} {p.calib.unit}. Las medidas son físicas solo si la foto es casi cenital.</p>
                      <button className="btn ghost sm" onClick={() => { applyCalib(null); setFlash('Calibración eliminada: ahora se usan unidades relativas (u).'); }}>Quitar calibración</button>
                    </div>
                  ) : (
                    <div className="stack">
                      <p className="caption"><b>Sin calibración.</b> Medidas relativas: 1 u = 1 % del ancho de la imagen. No son centímetros.</p>
                      {mode !== 'calib' && (
                        <div className="row">
                          <input aria-label="Ancho real del material en cm" className="mini" inputMode="decimal" placeholder="Ancho cm" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') calibByWidth(); }} />
                          <button className="btn dark sm" onClick={calibByWidth}>Calibrar por ancho</button>
                        </div>
                      )}
                      {mode !== 'calib' && img.exampleId && <button className="btn ghost sm" onClick={() => applyCalib(EXAMPLES.find((x) => x.id === img.exampleId)?.calib ?? { a: [100, 565], b: [240, 565], dist: 10, unit: 'cm' })}>Usar escala de demostración (14 px = 1 cm)</button>}
                      {mode !== 'calib'
                        ? <button className="btn ghost sm" onClick={() => { setMode('calib'); setCalibPts([]); setDraft(null); }}>Calibrar con una referencia</button>
                        : (
                          <div className="row">
                            <input aria-label="Distancia real" className="mini" inputMode="decimal" placeholder="Distancia" value={calibDist} onChange={(e) => setCalibDist(e.target.value)} />
                            <input aria-label="Unidad" className="mini" value={calibUnit} onChange={(e) => setCalibUnit(e.target.value)} />
                            <button className="btn dark sm" disabled={calibPts.length !== 2} onClick={confirmCalib}>Aplicar</button>
                            <button className="link" onClick={() => { setMode('view'); setCalibPts([]); }}>Cancelar</button>
                          </div>
                        )}
                    </div>
                  )}
                </section>

                <DefectTools
                  p={p} sel={selDefect} drawing={!!draft && drawTarget === 'defect'} onStart={startDefect} onQuick={quickDefect}
                  onDelete={delDefect} onSelect={(i) => { setSelDefect(i); setMode('defects'); }} outside={defectOutside} onCancel={() => { setDraft(null); }}
                />

                <section className="sect">
                  <h3 className="h5">Detectar defectos con IA</h3>
                  <p className="caption">SAM busca por frase corta en inglés (por ejemplo «scar, stain, hole»). Las zonas propuestas no se aplican hasta que las aceptes.</p>
                  <label className="field"><span>¿Qué buscar?</span>
                    <span className="input-wrap"><input value={detectPhrases} onChange={(e) => setDetectPhrases(e.target.value)} /></span>
                  </label>
                  <button className="btn ghost sm" disabled={!!busy} onClick={detectDefects}>{busy === 'detect' ? 'Buscando con SAM…' : 'Detectar con SAM'}</button>
                  {detected.length > 0 && (
                    <div className="alert info">
                      SAM propone <b>{detected.length}</b> zona(s) ({[...new Set(detected.map((d) => d.phrase))].join(', ')}), punteadas en azul sobre el lienzo.
                      <div className="row wrap" style={{ marginTop: 8 }}>
                        <button className="btn dark sm" onClick={acceptDetected}>Añadir las {detected.length}</button>
                        <button className="btn ghost sm" onClick={() => setDetected([])}>Descartar</button>
                      </div>
                    </div>
                  )}
                </section>

                <section className="sect">
                  <h3 className="h5">Piezas y pedido</h3>
                  {!p.calib && <p className="caption">Dimensiones en unidades relativas (u).</p>}
                  <label className="field"><span>Kit de producto (medidas reales en cm)</span>
                    <select aria-label="Kit de producto" value="" onChange={(e) => applyKit(e.target.value)}>
                      <option value="">Elegir kit…</option>
                      {KITS.map((k) => <option key={k.id} value={k.id}>{k.name} — {k.blurb}</option>)}
                    </select>
                  </label>
                  <label className="check"><input type="checkbox" checked={p.fill === 'maxKits'} onChange={(e) => setP((q) => ({ ...q, fill: e.target.checked ? 'maxKits' : 'fixed' }))} /> Maximizar juegos completos del pedido</label>
                  <p className="caption">{p.fill === 'maxKits' ? 'Las cantidades de abajo son las piezas de UN juego (por ejemplo, una cartera). La app busca cuántos juegos completos caben en el material.' : 'Se colocan exactamente las cantidades pedidas.'}</p>
                  {p.defs.map((d) => (
                    <div className="tpl" key={d.id}>
                      <div className="tpl-head">
                        <i style={{ background: d.color }} />
                        <input aria-label="Nombre de la pieza" className="name" value={d.name} onChange={(e) => setDef(d.id, { name: e.target.value })} />
                        <button className="link" aria-label={`Eliminar ${d.name}`} onClick={() => setP((q) => ({ ...q, defs: q.defs.filter((x) => x.id !== d.id) }))}>Quitar</button>
                      </div>
                      <select aria-label="Forma" value={d.kind} onChange={(e) => setDef(d.id, { kind: e.target.value as TemplateKind })}>
                        {(Object.keys(KIND_LABEL) as TemplateKind[]).filter((k) => k !== 'custom' || d.kind === 'custom').map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                      <div className="row3">
                        <NumField label="Ancho" value={d.w} min={0} exclusive suffix={unit} onCommit={(n) => setDef(d.id, { w: n })} />
                        <NumField label="Alto" value={d.h} min={0} exclusive suffix={unit} onCommit={(n) => setDef(d.id, { h: n })} />
                        <NumField label="Cantidad" value={d.qty} min={0} int step={1} onCommit={(n) => setDef(d.id, { qty: n })} />
                      </div>
                      <div className="rots" role="group" aria-label="Rotaciones permitidas">
                        {[0, 90, 180, 270].map((r) => <label key={r} className="check"><input type="checkbox" checked={d.rotations.includes(r)} onChange={() => toggleRot(d, r)} />{r}°</label>)}
                      </div>
                    </div>
                  ))}
                  <div className="row wrap">
                    <button className="btn ghost sm" disabled={p.defs.length >= 6} onClick={addDef}>+ Añadir pieza</button>
                    <button className="btn ghost sm" disabled={p.defs.length >= 6} onClick={() => setPieceDialog('draw')}>✎ Dibujar pieza</button>
                    <button className="btn ghost sm" disabled={p.defs.length >= 6} onClick={() => setPieceDialog('svg')}>⇪ Importar SVG</button>
                  </div>
                  <NumField label="Separación mínima" value={p.spacing} min={0} suffix={unit} onCommit={(n) => setP((q) => ({ ...q, spacing: n }))} />
                </section>

                {live && (
                  <dl className="metrics compact">
                    <div><dt>Área digitalizada</dt><dd>{fmt(live.totalArea / ppu ** 2)} {unit}²</dd></div>
                    <div><dt>Excluida (unión)</dt><dd>{fmt(live.excludedArea / ppu ** 2)} {unit}²</dd></div>
                    <div><dt>Utilizable</dt><dd>{fmt(live.usableArea / ppu ** 2)} {unit}²</dd></div>
                  </dl>
                )}

                <div className="panel-foot">
                  <button className="btn primary" disabled={!problem || !!busy} onClick={optimize}>Optimizar distribución</button>
                  <button className="link" onClick={() => goStep(1)}>← Volver al contorno</button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="h4">3 · Resultado</h2>

                {busy === 'opt' && (
                  <div className="alert info" role="status">
                    Buscando la mejor distribución… <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
                  </div>
                )}

                {result && !busy && (
                  <>
                    {!result.verify.valid ? (
                      <div className="alert error" role="alert"><b>Verificación fallida.</b> El plan no se muestra como válido ni se exporta.
                        <ul>{result.verify.violations.slice(0, 4).map((v, i) => <li key={i}>{v.message}</li>)}</ul></div>
                    ) : stale ? (
                      <div className="alert warn" role="status"><b>Resultado desactualizado.</b> Cambiaste el problema después de optimizar; las piezas mostradas ya no corresponden a las restricciones actuales.</div>
                    ) : result.solution.placements.length === 0 ? (
                      <div className="alert error" role="status"><b>No se encontró una colocación válida.</b> Posibles causas: piezas más grandes que el material, separación demasiado alta, o zonas excluidas que cubren casi todo.</div>
                    ) : (
                      <div className="alert ok" role="status"><b>Plano válido y verificado.</b> {result.kits ? (result.kits.n === 0 ? 'Se muestra el mejor plan parcial de un solo juego.' : `Caben ${result.kits.n} juego${result.kits.n > 1 ? 's' : ''} completo${result.kits.n > 1 ? 's' : ''} (${m!.placedCount - extraPieces} piezas)${extraPieces ? ` y ${extraPieces} pieza(s) de otros productos` : ''}. Cada pieza lleva su número de juego («A1·2»).`) : m!.placedCount < m!.requestedCount ? 'Solución parcial: algunas piezas quedaron pendientes.' : 'Se colocó todo el pedido.'}</div>
                    )}

                    <div className="score-row">
                      <span className="score-ring big" aria-label={`Aprovechamiento ${fmt(m!.usableUtilization)} por ciento del área utilizable`}>{fmt(m!.usableUtilization, 0)}%</span>
                      <div>
                        <b>{result.kits ? (result.kits.n === 0 ? 'Ni un juego completo cabe' : `${result.kits.n} juego${result.kits.n > 1 ? 's' : ''} completo${result.kits.n > 1 ? 's' : ''}`) : `${m!.placedCount} de ${m!.requestedCount} piezas colocadas`}</b>
                        <p className="caption">Mejor solución encontrada por la búsqueda ({result.solution.optimizerVersion}); no es un óptimo demostrado.</p>
                      </div>
                    </div>

                    <dl className="metrics">
                      <div><dt>Área total digitalizada</dt><dd>{fmt(m!.totalArea / result.ppu ** 2)} {result.unit}²</dd></div>
                      <div><dt>Área excluida (sin doble conteo)</dt><dd>{fmt(m!.excludedArea / result.ppu ** 2)} {result.unit}²</dd></div>
                      <div><dt>Área utilizable (total − excluida)</dt><dd>{fmt(m!.usableArea / result.ppu ** 2)} {result.unit}²</dd></div>
                      <div><dt>Área ocupada</dt><dd>{fmt(m!.occupiedArea / result.ppu ** 2)} {result.unit}²</dd></div>
                      <div><dt>Ocupada ÷ utilizable</dt><dd>{fmt(m!.usableUtilization)} %</dd></div>
                      <div><dt>Ocupada ÷ total</dt><dd>{fmt(m!.materialUtilization)} %</dd></div>
                    </dl>
                    <p className="caption">{result.calibrated ? 'Medidas con escala física (calibración manual).' : 'Sin calibración: unidades relativas (u), no medidas físicas.'}</p>

                    <table className="tbl">
                      <thead><tr><th>Pieza</th><th>Colocadas</th><th>Pendientes</th></tr></thead>
                      <tbody>
                        {resultDefs.map((d, i) => (
                          <tr key={d.id}><td><i className="dot" style={{ background: d.color }} />{templateLetter(i)} · {d.name}</td><td>{m!.placed[d.id] ?? 0}/{m!.requested[d.id] ?? 0}</td><td>{m!.pending[d.id] ?? 0}</td></tr>
                        ))}
                      </tbody>
                    </table>

                    {result.verify.valid && !stale && (
                      <section className="sect">
                        <h3 className="h5">Sobrante</h3>
                        {!leftover ? (
                          <button className="btn ghost sm" onClick={showLeftover}>Ver sobrante</button>
                        ) : (
                          <>
                            <dl className="metrics">
                              <div><dt>Área sobrante</dt><dd>{fmt(leftover.area / result.ppu ** 2)} {result.unit}²</dd></div>
                              <div><dt>Del material total</dt><dd>{fmt((leftover.area / leftover.materialArea) * 100)} %</dd></div>
                              <div><dt>Fragmentos</dt><dd>{leftover.fragments.length}</dd></div>
                            </dl>
                            <p className="caption">Es una estimación digital: el sobrante real tendrá los bordes del corte. Para planificar con exactitud, fotografía el cuero que queda.</p>
                            {leftover.fragments.slice(0, 4).map((f, i) => (
                              <button key={i} className="btn ghost sm" onClick={() => useFragment(i)}>Planificar sobre el fragmento {i + 1} ({fmt(f.area / result.ppu ** 2)} {result.unit}²)</button>
                            ))}
                            <button className="link" onClick={() => setLeftover(null)}>Ocultar sobrante</button>
                          </>
                        )}
                        <div className="stack">
                          <p className="h5">Probar otro producto con lo que sobró</p>
                          <p className="caption">El plan actual queda fijo; la app busca cuántos juegos completos (o piezas sueltas) del nuevo producto caben en el sobrante.</p>
                          <select aria-label="Otro producto" value={productId} onChange={(e) => setProductId(e.target.value)}>
                            <option value="">Elegir producto…</option>
                            <optgroup label="Kits completos">{KITS.filter((k) => k.kind !== 'piece').map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</optgroup>
                            <optgroup label="Piezas sueltas">{KITS.filter((k) => k.kind === 'piece').map((k) => <option key={k.id} value={k.id}>{k.name} — {k.blurb}</option>)}</optgroup>
                          </select>
                          <button className="btn dark sm" disabled={!productId || !!busy || result.unit.trim().toLowerCase() !== 'cm'} onClick={tryProduct}>Calcular con el sobrante</button>
                          {result.unit.trim().toLowerCase() !== 'cm' && <p className="caption">Calibra la foto en cm para usar productos con medidas reales.</p>}
                          {(result.extras ?? []).map((e) => (
                            <div key={e.id} className="row wrap">
                              <span className="caption"><b>{e.name}:</b> {e.kind === 'piece' ? `${e.kits.n} pieza(s)` : `${e.kits.n} juego(s)`}</span>
                              <button className="link danger" onClick={() => dropProduct(e.id)}>Quitar</button>
                            </div>
                          ))}
                        </div>
                        <label className="btn ghost sm">
                          <input type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Foto del sobrante" onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f && confirm('¿Empezar un proyecto nuevo con la foto del sobrante? Se conserva el pedido; tendrás que calibrar la foto nueva.')) onLeftoverPhoto(f, p.defs, p.spacing);
                          }} />
                          Subir foto del sobrante
                        </label>
                      </section>
                    )}

                    {sel && selDef && (
                      <div className="alert info"><b>{selDef.name} #{sel.instance + 1}</b><br />Rotación {sel.rotation}° · {fmt(selDef.w)}×{fmt(selDef.h)} {unit} · {KIND_LABEL[selDef.kind]}</div>
                    )}

                    {change && (
                      <div className="alert info">
                        <b>Qué cambió desde la corrida anterior</b>
                        <ul>
                          {change.changes.map((c) => <li key={c.label}>{c.label}: {c.detail}</li>)}
                          <li>Piezas con posición o giro distinto: {change.moved}</li>
                        </ul>
                        <span className="caption">El problema cambió (denominadores distintos), por eso no se reporta un «% de mejora».</span>
                      </div>
                    )}
                  </>
                )}

                <DefectTools
                  p={p} sel={selDefect} drawing={!!draft && drawTarget === 'defect'} onStart={startDefect} onQuick={quickDefect}
                  onDelete={delDefect} onSelect={(i) => { setSelDefect(i); setMode('defects'); }} outside={defectOutside} onCancel={() => setDraft(null)}
                />

                <div className="panel-foot">
                  <button className={`btn ${stale ? 'green' : 'primary'}`} disabled={!!busy || !problem} onClick={optimize}>{result ? 'Reoptimizar' : 'Optimizar distribución'}</button>
                  <button className="link" onClick={() => goStep(2)}>← Editar pedido y restricciones</button>

                  <div className="export">
                    <label className="check"><input type="checkbox" checked={withPhoto} onChange={(e) => setWithPhoto(e.target.checked)} /> Incluir fotografía</label>
                    <div className="row">
                      <button className="btn dark sm" disabled={!exportable} onClick={() => doExport('svg')}>Exportar SVG</button>
                      <button className="btn dark sm" disabled={!exportable} onClick={() => doExport('png')}>Exportar PNG</button>
                    </div>
                    <div className="real-export">
                      <p className="h5">A escala real (1:1)</p>
                      <div className="row wrap">
                        <select aria-label="Tamaño de papel" className="paper" value={paper} onChange={(e) => setPaper(e.target.value as PaperKey)}>
                          {(Object.keys(PAPERS) as PaperKey[]).map((k) => <option key={k} value={k}>{PAPERS[k].label}</option>)}
                        </select>
                        <button className="btn dark sm" disabled={!exportable || !physical} onClick={printReal}>Imprimir 1:1</button>
                        <button className="btn ghost sm" disabled={!exportable || !physical} onClick={exportReal}>SVG en cm</button>
                        <button className="btn ghost sm" disabled={!exportable || !physical} onClick={exportDxf}>DXF (mm)</button>
                      </div>
                      <label className="check"><input type="checkbox" checked={dxfRef} onChange={(e) => setDxfRef(e.target.checked)} /> DXF: incluir borde y zonas excluidas como referencia</label>
                      <p className="caption">DXF R12 en mm, origen abajo-izquierda. Las piezas van en la capa CUT (rojo). Revisa una medida al abrirlo en el programa de tu máquina: ella decide kerf, velocidad y potencia.</p>
                      <p className="caption">{physical ? 'Reparte el plano en hojas con marcas de ensamblaje e incluye una plantilla de cada pieza. Imprime al 100 % y comprueba el cuadro de 5 cm.' : 'Calibra la foto en cm o mm (paso 2) para exportar a escala real.'}</p>
                    </div>
                    {!exportable && <p className="caption">{stale ? 'Reoptimiza para poder exportar un plano vigente.' : 'Se exporta solo un plano verificado y vigente.'}</p>}
                    {result && <button className="link" onClick={downloadJson}>Descargar problema + solución (JSON) · semilla {result.solution.seed} · {fmt(result.solution.elapsedMs, 0)} ms</button>}
                    <p className="caption">Los archivos son planos referenciales, no instrucciones certificadas para maquinaria.</p>
                  </div>
                </div>
              </>
            )}

            <button className="link danger" onClick={() => { if (confirm('¿Descartar este proyecto? Se perderán los cambios no guardados.')) onReset(); }}>Nuevo proyecto</button>
          </aside>
        </div>
      </div>
      {pieceDialog && (
        <PieceDialog
          mode={pieceDialog} unit={unit} defaultWidth={p.calib ? 8 : 15}
          mmToCurrent={mmToCurrent} onCancel={() => setPieceDialog(null)} onSave={addCustom}
        />
      )}
    </section>
  );
}

interface DTProps {
  p: Project;
  sel: number | null;
  drawing: boolean;
  onStart: () => void;
  onQuick: () => void;
  onDelete: (i: number) => void;
  onSelect: (i: number) => void;
  onCancel: () => void;
  outside: (d: Ring) => boolean;
}

function DefectTools({ p, sel, drawing, onStart, onQuick, onDelete, onSelect, onCancel, outside }: DTProps) {
  return (
    <section className="sect">
      <h3 className="h5">Zonas excluidas ({p.defects.length})</h3>
      <p className="caption">Ninguna pieza invadirá estas zonas (hatch rojo).</p>
      {p.defects.length === 0 && <p className="alert warn">No has marcado ninguna zona. Si el material tiene agujeros o manchas, márcalos antes de optimizar: las piezas podrían cubrirlos.</p>}
      <div className="row wrap">
        {drawing
          ? <button className="btn ghost sm" onClick={onCancel}>Cancelar trazado</button>
          : <><button className="btn ghost sm" onClick={onStart}>Dibujar polígono</button><button className="btn ghost sm" onClick={onQuick}>+ Círculo rápido</button></>}
      </div>
      <ul className="dlist">
        {p.defects.map((d, i) => (
          <li key={i} className={sel === i ? 'on' : ''}>
            <button className="link" onClick={() => onSelect(i)}>Zona {i + 1}{sel === i ? ' (editando)' : ''}</button>
            {outside(d) && <span className="caption warn"> · fuera del material, sin efecto</span>}
            <button className="link danger" aria-label={`Eliminar zona ${i + 1}`} onClick={() => onDelete(i)}>Eliminar</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
