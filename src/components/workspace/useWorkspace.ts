import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContourSource, Pt, Ring, TemplateKind } from '../../types';
import { computeMetrics, computeRemainder, fragmentAsMaterial, maximizeKitsAsync, optimizeAsync, verifySolution } from '../../engine';
import { PALETTE } from '../../engine/templates';
import { EXAMPLES } from '../../lib/examples';
import { maskToPolygon, segmentLocal } from '../../lib/mask';
import { absArea, bbox, circleRing, pointInRing, ringProblem } from '../../lib/poly';
import { buildSvg, download, svgToPng } from '../../lib/export';
import {
  allDefs, buildProblem, diffResults, kitToDefs, fmt, problemKey, pxPerUnit, unitLabel,
  type Calib, type Project, type Result, type TemplateDef,
} from '../../state';
import { templateLetter, type Mode, type SamPoint } from '../Stage';
import type { NewPiece } from '../PieceDialog';
import { proposalToKit, type ChatEntry } from '../../lib/agent';
import type { AgentProposal } from '../../lib/agentSchema';
import { buildDxf } from '../../lib/dxf';
import { buildPlanSvgCm, buildPrintHtml } from '../../lib/print';
import { KITS, type Kit } from '../../lib/kits';
import { addProduct, removeProduct } from '../../lib/products';
import { serializeProject, type LoadedProject } from '../../lib/projectFile';
import { detectDefectZones, samErrorText, segmentMaterial } from '../../lib/sam';
import {
  calibratedInCm, defaultOpenItem, exportState, optimizeBlockReason, parseExportPrefs, piecesItem, scaleItem, zoneOutside, zonesItem,
  type CheckId, type ExportPrefs,
} from '../../lib/workspaceUi';
import { useToasts } from './Toasts';

/**
 * Controlador del espacio de trabajo: TODO el estado y los manejadores que antes vivían en
 * Workspace.tsx (misma lógica), más el estado de interfaz del rediseño (lista, pestañas, menús).
 * Los componentes de workspace/ solo presentan valores y llaman a estos manejadores.
 */

export interface Proposal { polygon: Ring; source: ContourSource; info: string; holes: Ring[] }
export type ErrAt = 'step1' | 'scale' | 'zones' | 'pieces' | 'optimize' | 'export' | 'leftover';
export type Busy = 'sam' | 'local' | 'opt' | 'detect' | null;

export const SOURCE_LABEL: Record<ContourSource, string> = {
  sam: 'IA — SAM 3.1 (inferencia en vivo)',
  example: 'Máscara guardada del ejemplo (no es inferencia en vivo)',
  local: 'Segmentación local por contraste (no es Meta AI)',
  manual: 'Trazado manual',
  leftover: 'Sobrante del plan anterior',
};

const PREFS_KEY = 'cs-export-prefs';

export function useWorkspace(p: Project, setP: (f: (p: Project) => Project) => void, restored: LoadedProject | null | undefined) {
  const img = p.image!;
  const [step, setStep] = useState<number>(restored?.step ?? 1);
  const [mode, setMode] = useState<Mode>(!restored?.step || restored.step === 1 ? (p.contour.length ? 'contour' : 'view') : 'view');
  const [draft, setDraft] = useState<Pt[] | null>(null);
  const [drawTarget, setDrawTarget] = useState<'contour' | 'defect'>('defect');
  const [selDefect, setSelDefect] = useState<number | null>(null);
  const [calibPts, setCalibPts] = useState<Pt[]>([]);
  const [calibDist, setCalibDist] = useState('');
  const [calibUnit, setCalibUnit] = useState('cm');
  const [widthCm, setWidthCm] = useState('');
  const [detectPhrases, setDetectPhrases] = useState('scar, stain, hole');
  const [detected, setDetected] = useState<{ ring: Ring; phrase: string }[]>([]);
  const [productId, setProductId] = useState('');
  /** Cantidad que la persona quiere del producto del sobrante; vacío = tantos como quepan. */
  const [productQty, setProductQty] = useState('');
  /** Desde dónde se abrió Hilo: define si lo aprobado reemplaza el pedido o se prueba en el sobrante. */
  const [agentFor, setAgentFor] = useState<'order' | 'leftover'>('order');
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentChat, setAgentChat] = useState<ChatEntry[]>([]);
  const [pieceDialog, setPieceDialog] = useState<'draw' | 'svg' | null>(null);
  const [samPoints, setSamPoints] = useState<SamPoint[]>([]);
  const [concept, setConcept] = useState(img.exampleId === 'cuero' ? 'brown shape' : img.exampleId === 'fieltro' ? 'teal shape' : 'fabric');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState(0);
  const [errState, setErrState] = useState<{ text: string; at: ErrAt } | null>(null);
  const [samFailed, setSamFailed] = useState(false);
  const [result, setResult] = useState<Result | null>(restored?.result ?? null);
  const [prev, setPrev] = useState<Result | null>(null);
  const [selPlacement, setSelPlacement] = useState<number | null>(null);
  const [showImage, setShowImage] = useState(true);
  const toasts = useToasts(restored ? (restored.notice ?? 'Proyecto abierto. El plan se volvió a verificar al cargarlo.') : null);
  const toast = toasts.push;
  const abort = useRef<AbortController | null>(null);

  /* ---------- estado de interfaz del rediseño ---------- */
  const [openItem, setOpenItem] = useState<CheckId | null>(null);
  const [zonesConfirmed, setZonesConfirmed] = useState(false);
  const [needsCm, setNeedsCm] = useState(false);
  const [scaleNotice, setScaleNotice] = useState<string | null>(null);
  const [scaleMethod, setScaleMethod] = useState<'width' | 'ref'>('width');
  const [tab, setTab] = useState<'plan' | 'leftover'>('plan');
  const [redetect, setRedetect] = useState(false);
  const [zoneTools, setZoneTools] = useState(false);
  const [detectOpen, setDetectOpen] = useState(false);
  const [changeSeen, setChangeSeen] = useState(false);
  const [zoneOrigins, setZoneOrigins] = useState<string[]>([]);
  const [editPiece, setEditPiece] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState<ExportPrefs>(() => {
    try { return parseExportPrefs(localStorage.getItem(PREFS_KEY)); } catch { return parseExportPrefs(null); }
  });
  const setPrefs = (patch: Partial<ExportPrefs>) => setPrefsState((cur) => {
    const next = { ...cur, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
    return next;
  });

  const err = errState?.text ?? null;
  const errAt = errState?.at ?? null;
  const setErr = (text: string | null, at: ErrAt = 'step1') => setErrState(text ? { text, at } : null);

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

  const outside = p.defects.map((d) => (p.contour.length > 2 ? zoneOutside(d, p.contour, pointInRing) : false));
  const items = {
    scale: scaleItem(p.calib, needsCm),
    zones: zonesItem(p.defects.length, zonesConfirmed, outside.some(Boolean)),
    pieces: piecesItem(p.defs, p.fill),
  };

  const goStep = (s: number, open?: CheckId) => {
    setStep(s); setDraft(null); setCalibPts([]); setErr(null); setSelPlacement(null);
    setMode(s === 1 && p.contour.length ? 'contour' : 'view');
    if (s !== 2) setSelDefect(null);
    setTab('plan'); setZoneTools(false); setDetectOpen(false); setEditPiece(null); setRedetect(false); setScaleMethod('width');
    if (s === 2) setOpenItem(open ?? defaultOpenItem({ scale: items.scale.state, zones: items.zones.state, pieces: items.pieces.state }));
  };

  // Paso inicial 2 (proyecto restaurado): abrir el primer ítem pendiente.
  useEffect(() => { if (step === 2 && openItem === null) setOpenItem(defaultOpenItem({ scale: items.scale.state, zones: items.zones.state, pieces: items.pieces.state })); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Abre un ítem de la lista (uno a la vez) y prepara el lienzo para él. */
  const openCheck = (id: CheckId | null) => {
    setOpenItem(id);
    setDraft(null); setDetectOpen(false);
    if (id !== 'scale' && mode === 'calib') { setMode('view'); setCalibPts([]); }
    if (id === 'scale' && scaleMethod === 'ref') { setMode('calib'); setCalibPts([]); }
    if (id !== 'zones' && mode === 'defects') { setMode('view'); setSelDefect(null); }
  };

  const setDefects = (defects: Ring[], origins: string[]) => { setP((q) => ({ ...q, defects })); setZoneOrigins(origins); };
  /** Edición de vértices desde el lienzo: misma cantidad de zonas, misma procedencia. */
  const setDefectsGeom = (defects: Ring[]) => setP((q) => ({ ...q, defects }));

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
    if (mode === 'points') setMode('view');
    abort.current = new AbortController();
    try {
      const { polygon, holes, info } = await segmentMaterial(img, concept, samPoints, abort.current.signal);
      propose(polygon, 'sam', info, holes);
    } catch (e) {
      if ((e as { code?: string }).code === 'ABORTED') return;
      setSamFailed(true);
      setErr(`${samErrorText(e)} Tu foto sigue aquí: puedes reintentar, usar una alternativa o trazar el contorno a mano.`);
    } finally { setBusy(null); }
  };
  const cancelSam = () => abort.current?.abort();

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
    if (proposal.holes.length) {
      setZoneOrigins(proposal.holes.map(() => 'del hueco de la máscara'));
      toast(`${proposal.holes.length === 1 ? '1 hueco pasó a ser zona excluida' : `${proposal.holes.length} huecos pasaron a ser zonas excluidas`}. Revísalo en Preparar.`, { sticky: true });
    }
    setProposal(null); setMode('contour'); setRedetect(false); setSamFailed(false);
  };

  const startManualTrace = () => { setDrawTarget('contour'); setDraft([]); setMode('view'); setProposal(null); setErr(null); };
  const togglePoints = () => { setMode(mode === 'points' ? 'view' : 'points'); setDraft(null); };

  const closeDraft = () => {
    if (!draft) return;
    const bad = ringProblem(draft);
    if (bad) { setErr(`${bad} Corrige los puntos o cancela el trazado.`, drawTarget === 'contour' ? 'step1' : 'zones'); return; }
    setErr(null);
    if (drawTarget === 'contour') {
      setP((q) => ({ ...q, contour: draft, lastValid: draft, source: 'manual', edited: false, samInfo: null }));
      setMode('contour'); setRedetect(false); setSamFailed(false);
    } else {
      setDefects([...p.defects, draft], [...zoneOrigins.slice(0, p.defects.length), 'dibujada']);
      setSelDefect(p.defects.length); setMode('defects');
    }
    setDraft(null);
  };
  const revertContour = () => setP((q) => ({ ...q, contour: q.lastValid }));
  const canRevert = !!p.lastValid.length && JSON.stringify(p.lastValid) !== JSON.stringify(p.contour);

  /* ---------- zonas excluidas y calibración ---------- */
  const startDefect = () => { setDrawTarget('defect'); setDraft([]); setMode('defects'); setSelDefect(null); setErr(null); };
  const quickDefect = () => {
    const b = bbox(p.contour);
    const r = Math.max(8, b.w * 0.06);
    setDefects([...p.defects, circleRing(b.x0 + b.w * 0.5, b.y0 + b.h * 0.5, r)], [...zoneOrigins.slice(0, p.defects.length), 'círculo']);
    setSelDefect(p.defects.length); setMode('defects');
  };
  const delDefect = (i: number) => { setDefects(p.defects.filter((_, j) => j !== i), zoneOrigins.filter((_, j) => j !== i)); setSelDefect(null); };
  const selectDefect = (i: number) => { setSelDefect(i); setMode('defects'); };

  const applyCalib = (c: Calib | null) => {
    const old = pxPerUnit(p.calib, img.w), nu = pxPerUnit(c, img.w);
    setP((q) => ({
      ...q, calib: c,
      defs: q.defs.map((d) => ({ ...d, w: Math.max(0.1, Math.round((d.w * old / nu) * 10) / 10), h: Math.max(0.1, Math.round((d.h * old / nu) * 10) / 10) })),
      spacing: Math.round((q.spacing * old / nu) * 100) / 100,
    }));
    if (c && c.unit.trim().toLowerCase() === 'cm') { setNeedsCm(false); setScaleNotice(null); }
  };
  /** Calibración rápida: el ancho del material (caja del contorno) mide `widthCm` cm. */
  const calibByWidth = () => {
    const d = Number(widthCm.replace(',', '.'));
    if (!(d > 0)) { setErr('Escribe el ancho real del material en cm (mayor que 0).', 'scale'); return; }
    const b = bbox(p.contour), y = b.y0 + b.h / 2;
    applyCalib({ a: [b.x0, y], b: [b.x1, y], dist: d, unit: 'cm' });
    setErr(null); toast(`Calibrado: el ancho del material (${fmt(b.w)} px) mide ${fmt(d)} cm. Las piezas se convirtieron conservando su tamaño en la foto.`, { sticky: true });
  };
  const calibExample = () => {
    applyCalib(EXAMPLES.find((x) => x.id === img.exampleId)?.calib ?? { a: [100, 565], b: [240, 565], dist: 10, unit: 'cm' });
    setErr(null); toast('Escala del ejemplo aplicada (14 px = 1 cm). Las piezas se convirtieron conservando su tamaño en la foto.', { sticky: true });
  };
  const setCalibMethod = (m: 'width' | 'ref') => {
    setScaleMethod(m); setErr(null); setDraft(null);
    if (m === 'ref') { setMode('calib'); setCalibPts([]); } else if (mode === 'calib') { setMode('view'); setCalibPts([]); }
  };
  const confirmCalib = () => {
    const d = Number(calibDist.replace(',', '.'));
    if (calibPts.length !== 2 || !(d > 0)) { setErr('Marca dos puntos y escribe una distancia real mayor que 0.', 'scale'); return; }
    if (Math.hypot(calibPts[0][0] - calibPts[1][0], calibPts[0][1] - calibPts[1][1]) < 4) { setErr('Los dos puntos están demasiado cerca.', 'scale'); return; }
    applyCalib({ a: calibPts[0], b: calibPts[1], dist: d, unit: calibUnit.trim() || 'cm' });
    setCalibPts([]); setMode('view'); setErr(null); setScaleMethod('width');
    toast('Calibración aplicada. Las dimensiones de las piezas se convirtieron conservando su tamaño en la foto.', { sticky: true });
  };
  const cancelCalib = () => { setMode('view'); setCalibPts([]); setScaleMethod('width'); setErr(null); };
  const removeCalib = () => { applyCalib(null); toast('Calibración eliminada: ahora se usan unidades relativas (u).', { sticky: true }); };

  /* ---------- plantillas ---------- */
  const setDef = (id: string, patch: Partial<TemplateDef>) => setP((q) => ({ ...q, defs: q.defs.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  const removeDef = (id: string) => { setP((q) => ({ ...q, defs: q.defs.filter((x) => x.id !== id) })); setEditPiece(null); };
  const addDef = () => {
    if (p.defs.length >= 6) return;
    let n = 0; while (p.defs.some((d) => d.id === `t${n}`)) n++;
    const id = `t${n}`;
    setP((q) => (q.defs.length >= 6 ? q : { ...q, defs: [...q.defs, { id, name: `Pieza ${templateLetter(q.defs.length)}`, color: PALETTE[n % PALETTE.length], kind: 'rect' as TemplateKind, w: 15, h: 10, qty: 1, rotations: [0, 180] }] }));
    setEditPiece(id); setOpenItem('pieces');
  };
  const addCustom = (np: NewPiece) => {
    setP((q) => {
      if (q.defs.length >= 6) return q;
      let n = 0; while (q.defs.some((d) => d.id === `t${n}`)) n++;
      return { ...q, defs: [...q.defs, { id: `t${n}`, name: np.name, color: PALETTE[n % PALETTE.length], kind: 'custom' as TemplateKind, w: np.w, h: np.h, qty: 1, rotations: [0, 180], custom: np.shape }] };
    });
    setPieceDialog(null); setOpenItem('pieces');
    toast(`Pieza «${np.name}» añadida con cantidad 1. Ajusta la cantidad y los giros permitidos.`);
  };
  /** Milímetros → unidad actual, si la foto está calibrada en cm o mm. */
  const mmToCurrent = (mm: number) => {
    const unitName = p.calib?.unit.trim().toLowerCase();
    return unitName === 'cm' ? mm / 10 : unitName === 'mm' ? mm : null;
  };
  /** Dato para el agente: el material disponible, solo si la foto está calibrada en cm. */
  const agentContext = (() => {
    if (!calibratedInCm(p.calib) || !live || contourErr) return '';
    const b = bbox(p.contour);
    return `Material disponible: unos ${fmt(b.w / ppu)} x ${fmt(b.h / ppu)} cm (caja), área utilizable aprox. ${fmt(live.usableArea / ppu ** 2, 0)} cm2`;
  })();
  const agentBlocked = calibratedInCm(p.calib) ? null : 'Para usar las piezas necesitas la foto calibrada en cm (paso 2, «Escala»). Cierra esta ventana, calibra y vuelve: la conversación se conserva.';
  const openAgent = () => { setAgentFor('order'); setAgentOpen(true); if (agentBlocked) setNeedsCm(true); };
  const openAgentForLeftover = () => { setAgentFor('leftover'); setAgentOpen(true); };
  const approveAgent = (proposal: AgentProposal) => {
    const kit = proposalToKit(proposal);
    if (agentFor === 'leftover') { setAgentOpen(false); void tryProduct(kit); return; }
    setP((q) => ({ ...q, defs: kitToDefs(kit), spacing: Math.max(q.spacing, 0.2), fill: 'maxKits' }));
    setAgentOpen(false); setOpenItem('pieces'); setEditPiece(null);
    toast(`Piezas de «${kit.name}» añadidas al pedido (${kit.pieces.reduce((s, x) => s + x.qty, 0)} piezas por juego). Revisa medidas y cantidades; al optimizar se buscará cuántos juegos caben.`, { sticky: true });
  };
  const applyKit = (id: string) => {
    const kit = KITS.find((k) => k.id === id);
    if (!kit) return;
    if (!calibratedInCm(p.calib)) {
      // Misma regla que antes: un producto con medidas reales exige calibrar en cm. Se abre ① con el motivo.
      setNeedsCm(true); setOpenItem('scale'); setScaleNotice(`«${kit.name}» usa medidas reales en cm. Calibra primero la foto y vuelve a elegirlo.`);
      return;
    }
    setErr(null); setScaleNotice(null); setEditPiece(null);
    setP((q) => ({ ...q, defs: kitToDefs(kit), spacing: Math.max(q.spacing, 0.2), fill: 'maxKits' }));
    toast(`Kit «${kit.name}» cargado (${kit.pieces.reduce((s, x) => s + x.qty, 0)} piezas por juego). Al optimizar se buscará cuántos juegos completos caben.`, { sticky: true });
  };
  const toggleRot = (d: TemplateDef, r: number) => {
    const has = d.rotations.includes(r);
    if (has && d.rotations.length === 1) return;
    setDef(d.id, { rotations: has ? d.rotations.filter((x) => x !== r) : [...d.rotations, r].sort((a, b) => a - b) });
  };
  const setFill = (fill: 'fixed' | 'maxKits') => setP((q) => ({ ...q, fill }));
  const setSpacing = (n: number) => setP((q) => ({ ...q, spacing: n }));

  /* ---------- optimización ---------- */
  const blockReason = optimizeBlockReason({ contourErr, usableArea: live ? live.usableArea : null, defs: p.defs });
  const optimize = async () => {
    if (!problem) { setErr(contourErr ?? 'Contorno inválido.', 'optimize'); return; }
    if (!live || live.usableArea <= 0) { setErr('Las zonas excluidas cubren todo el material: no hay área utilizable para acomodar piezas.', 'optimize'); return; }
    if (problem.templates.every((t) => t.qty === 0)) { setErr('El pedido está vacío: indica al menos una pieza.', 'optimize'); return; }
    setErr(null); setBusy('opt'); setProgress(0); setStep(3); setMode('view'); setSelPlacement(null);
    setTab('plan'); setZoneTools(false); setDraft(null); setChangeSeen(false); setOpenItem(null);
    toasts.clear(); // los avisos de la preparación ya quedaron atrás: el resultado es lo nuevo
    await new Promise((r) => setTimeout(r, 30));
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
    } catch (e) { setErr(`La optimización falló: ${(e as Error).message}`, 'optimize'); } finally { setBusy(null); }
  };

  /* ---------- sobrante (se calcula al abrir la pestaña) ---------- */
  const leftoverOk = !!result && result.verify.valid && !stale && result.solution.placements.length > 0;
  const leftover = useMemo(
    () => (tab === 'leftover' && leftoverOk && result ? computeRemainder(result.problem, result.solution.placements) : null),
    [tab, leftoverOk, result],
  );
  useEffect(() => { if (tab === 'leftover' && !leftoverOk) setTab('plan'); }, [tab, leftoverOk]);
  /** Para Hilo desde el sobrante: lo disponible es el retazo, no la foto entera. */
  const hiloContext = agentFor === 'leftover' && leftover && unit.trim().toLowerCase() === 'cm'
    ? `Material disponible: el sobrante de un corte anterior, en ${leftover.fragments.length} ${leftover.fragments.length === 1 ? 'fragmento' : 'fragmentos'}, `
      + `área total aprox. ${fmt(leftover.area / ppu ** 2, 0)} cm2; el fragmento más grande tiene ${fmt(Math.max(0, ...leftover.fragments.map((f) => f.area)) / ppu ** 2, 0)} cm2`
    : agentContext;
  const tryProduct = async (custom?: Kit) => {
    const kit = custom ?? KITS.find((k) => k.id === productId);
    if (!kit || !result) return;
    const wanted = Math.floor(Number(productQty));
    const target = wanted >= 1 ? wanted : undefined;
    const single = kit.kind === 'piece';
    const unitWord = (n: number) => (single ? (n === 1 ? 'pieza' : 'piezas') : n === 1 ? 'producto completo' : 'productos completos');
    setTab('leftover'); setErr(null); setBusy('opt'); setProgress(0);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const out = await addProduct(p, result, kit, (f) => setProgress(f), target);
      if (out.added === 0) toast(`En el sobrante no cabe ni ${single ? 'una pieza' : 'un producto completo'} de «${kit.name}»${target ? ` (pediste ${target})` : ''}. El plan anterior no cambió.`, { tone: 'warn', sticky: true });
      else {
        setResult(out.result); setProductId('');
        if (out.requested && out.added < out.requested) {
          toast(`Solo se pudieron hacer ${out.added} de los ${out.requested} ${unitWord(out.requested)} de «${kit.name}» que pediste. Es lo máximo que cabe en el sobrante.`, { tone: 'warn', sticky: true });
        } else toast(`Se añadieron ${out.added} ${unitWord(out.added)} de «${kit.name}» con lo que sobró.`);
      }
    } catch (e) { setErr((e as Error).message, 'leftover'); } finally { setBusy(null); }
  };
  const dropProduct = (id: string) => { if (result) setResult(removeProduct(result, id)); };
  const useFragment = (i: number) => {
    const f = leftover?.fragments[i];
    if (!f) return;
    const { material, defects } = fragmentAsMaterial(f);
    setP((q) => ({ ...q, contour: material, lastValid: material, defects, source: 'leftover', edited: false, samInfo: null }));
    setZoneOrigins(defects.map(() => 'hueco del sobrante'));
    setResult(null); setPrev(null); setTab('plan'); setStep(2); setMode('view'); setSelPlacement(null);
    setOpenItem(defects.length ? 'zones' : 'pieces');
    toast(`Sobrante cargado como nuevo material (${fmt(f.area / ppu ** 2)} ${unit}²). Sus huecos pasaron a ser zonas excluidas.`, { sticky: true });
  };

  /* ---------- zonas con IA ---------- */
  const detectDefects = async () => {
    const phrases = detectPhrases.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    if (!phrases.length) { setErr('Escribe qué buscar: frases cortas en inglés separadas por comas.', 'zones'); return; }
    setBusy('detect'); setErr(null); setDetected([]);
    try {
      const found = await detectDefectZones(img, phrases, p.contour, p.defects);
      setDetected(found); setDetectOpen(false);
      if (!found.length) toast('SAM no encontró defectos con esas frases. Prueba otras (p. ej. «dark spot», «crack») o márcalos a mano.', { tone: 'warn' });
    } catch (e) {
      setErr(`${samErrorText(e)} Puedes marcar los defectos a mano.`, 'zones');
    } finally { setBusy(null); }
  };
  const acceptDetected = () => {
    setDefects([...p.defects, ...detected.map((d) => d.ring)], [...zoneOrigins.slice(0, p.defects.length), ...detected.map(() => 'propuesta por la IA')]);
    toast(`Se añadieron ${detected.length} zona(s) propuestas por SAM. Revísalas: puedes editarlas o eliminarlas.`, { sticky: true });
    setDetected([]);
  };

  const change = useMemo(() => (result && prev && prev.problemKey !== result.problemKey ? diffResults(prev, result) : null), [result, prev]);

  /* ---------- exportación ---------- */
  const ex = exportState(result, stale);
  const doExport = async (kind: 'svg' | 'png') => {
    if (!ex.exportable || !result) return;
    const { svg, w, h } = buildSvg(p, result, prefs.withPhoto);
    try {
      if (kind === 'svg') download('cutsense-plano.svg', new Blob([svg], { type: 'image/svg+xml' }));
      else download('cutsense-plano.png', await svgToPng(svg, w, h));
    } catch (e) { setErr((e as Error).message, 'export'); }
  };
  const exportReal = () => {
    if (!ex.physical || !result) return;
    try { const { svg } = buildPlanSvgCm(p, result); download('cutsense-plano-1a1.svg', new Blob([svg], { type: 'image/svg+xml' })); }
    catch (e) { setErr((e as Error).message, 'export'); }
  };
  const exportDxf = () => {
    if (!ex.physical || !result) return;
    try { download('cutsense-piezas.dxf', new Blob([buildDxf(p, result, { reference: prefs.dxfRef })], { type: 'application/dxf' })); }
    catch (e) { setErr((e as Error).message, 'export'); }
  };
  const printReal = () => {
    if (!ex.physical || !result) return;
    try {
      const url = URL.createObjectURL(new Blob([buildPrintHtml(p, result, prefs.paper)], { type: 'text/html' }));
      if (!window.open(url, '_blank')) setErr('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.', 'export');
      else setErr(null);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setErr((e as Error).message, 'export'); }
  };
  const saveProject = () => download('cutsense-proyecto.json', new Blob([serializeProject(p, result, step)], { type: 'application/json' }));
  const downloadJson = () => result && download('cutsense-problema.json', new Blob([JSON.stringify({ problem: result.problem, solution: result.solution, verify: result.verify }, null, 2)], { type: 'application/json' }));

  // Ctrl/Cmd+S guarda el proyecto (también desde el menú «Proyecto»).
  const saveRef = useRef(saveProject);
  saveRef.current = saveProject;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const resultDefs = allDefs(p, result);
  const m = result?.solution.metrics;
  const extraPieces = m ? (result?.extras ?? []).reduce((t, e) => t + e.defs.reduce((a, d) => a + (m.placed[d.id] ?? 0), 0), 0) : 0;
  const zoneAreas = p.defects.map((d) => absArea(d) / ppu ** 2);

  return {
    img, step, goStep, mode, setMode, draft, setDraft, drawTarget, selDefect, setSelDefect, calibPts, setCalibPts, calibDist, setCalibDist, calibUnit, setCalibUnit,
    widthCm, setWidthCm, detectPhrases, setDetectPhrases, detected, setDetected, productId, setProductId, agentOpen, setAgentOpen, agentChat, setAgentChat,
    pieceDialog, setPieceDialog, samPoints, setSamPoints, concept, setConcept, proposal, setProposal, busy, progress, err, errAt, setErr, samFailed,
    result, prev, selPlacement, setSelPlacement, showImage, setShowImage, toasts,
    openItem, openCheck, zonesConfirmed, setZonesConfirmed, needsCm, scaleNotice, scaleMethod, setCalibMethod, tab, setTab, redetect, setRedetect,
    zoneTools, setZoneTools, detectOpen, setDetectOpen, changeSeen, setChangeSeen, zoneOrigins, editPiece, setEditPiece, prefs, setPrefs,
    ppu, unit, calibrated: !!p.calib, contourErr, problem, stale, live, items, outside, zoneAreas,
    setContour, runSam, cancelSam, runLocal, useCached, acceptProposal, startManualTrace, togglePoints, closeDraft, revertContour, canRevert,
    startDefect, quickDefect, delDefect, selectDefect, setDefectsGeom, calibByWidth, calibExample, confirmCalib, cancelCalib, removeCalib,
    productQty, setProductQty, agentFor, openAgentForLeftover,
    setDef, removeDef, addDef, addCustom, mmToCurrent, agentContext: hiloContext, agentBlocked, openAgent, approveAgent, applyKit, toggleRot, setFill, setSpacing,
    blockReason, optimize, leftover, leftoverOk, tryProduct, dropProduct, useFragment, detectDefects, acceptDetected, change,
    ex, doExport, exportReal, exportDxf, printReal, saveProject, downloadJson, resultDefs, extraPieces,
  };
}

export type WS = ReturnType<typeof useWorkspace>;
