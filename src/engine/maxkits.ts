/**
 * "Maximizar kits completos": dado un problema cuyas plantillas forman UN kit (qty = piezas por kit),
 * busca el mayor N tal que TODAS las piezas de N kits se colocan de forma válida.
 *
 * Técnica: para cada N candidato se construye un problema expandido (qty·N por plantilla) y se llama
 * al optimizador. Un intento tiene éxito si coloca todas las instancias (y, como todo plan de
 * `optimize`, pasa `verifySolution`). El kit k posee las instancias [k·qty, (k+1)·qty) de cada
 * plantilla; las instancias de una misma plantilla son intercambiables, así que la asignación es válida.
 *
 * Búsqueda (la heurística no es monótona en N): crecimiento exponencial 1, 2, 4, … hasta el primer
 * fallo o la cota superior, búsqueda binaria entre el último éxito y el primer fallo, y al final una
 * comprobación de N+1 y N+2 alrededor del mejor (reintentando con otra semilla derivada si ya se
 * habían probado). Después, AUMENTO: con el plan de N kits fijo (sus piezas como obstáculos con la misma
 * separación) se intenta colocar un kit más en el hueco libre; se acepta solo si caben todas sus piezas
 * y el plan combinado pasa `verifySolution` para N+1 kits; se repite hasta que falle. Cota superior: min(maxKits, ⌊área utilizable / área del kit⌋, ⌊400 / piezas por kit⌋).
 *
 * Presupuesto: `timeLimitMs` (8000 por defecto) se reparte entre los intentos restantes estimados.
 * Cada intento recibe la mitad de su porción como `timeLimitMs` porque la primera pasada del
 * optimizador puede usar hasta 2× su límite. Determinismo: mismo problema + seed ⇒ misma salida,
 * salvo que el presupuesto de tiempo corte algún intento o la búsqueda (con el reloj real, una
 * máquina más lenta podría explorar menos). Con un reloj inyectado que no avanza es determinista.
 */
import type { Problem, Solution } from '../types';
import { dedupeRing, difference, multiArea, ringArea } from './geometry';
import { computeMetrics } from './metrics';
import { OPTIMIZER_VERSION, optimizeSteps, type ProgressCallback } from './optimize';
import { verifySolution } from './verify';

export const DEFAULT_KITS_TIME_LIMIT_MS = 8000;
export const DEFAULT_MAX_KITS = 12;
const MAX_ENGINE_INSTANCES = 400;

export interface MaxKitsOptions {
  /** Tope de kits a buscar (por defecto 12). */
  maxKits?: number;
  /** Presupuesto total en ms (por defecto 8000). */
  timeLimitMs?: number;
  /** Reloj inyectable (ms). */
  now?: () => number;
  onProgress?: ProgressCallback;
}

export interface MaxKitsAttempt { kits: number; placed: number; requested: number }

export interface MaxKitsResult {
  /** Mayor nº de kits completos encontrado. */
  kits: number;
  /** templateId → piezas por kit. */
  perKit: Record<string, number>;
  /**
   * Plan para `kits` kits completos (métricas del problema expandido: requested = qty·kits).
   * Si kits === 0, el mejor plan parcial para UN kit. `elapsedMs` es el tiempo total de la búsqueda.
   */
  solution: Solution;
  /** Intentos en orden de ejecución. */
  attempts: MaxKitsAttempt[];
}

const defaultNow = (): number =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();

/** Problema expandido para N kits. */
export function expandKits(problem: Problem, kits: number): Problem {
  return {
    ...problem,
    templates: problem.templates.map((t) => ({ ...t, qty: Math.max(0, Math.floor(t.qty || 0)) * kits })),
  };
}

export function* maximizeKitsSteps(problem: Problem, options: MaxKitsOptions = {}): Generator<void, MaxKitsResult, void> {
  const now = options.now ?? defaultNow;
  const start = now();
  const budget = Math.max(0, options.timeLimitMs ?? DEFAULT_KITS_TIME_LIMIT_MS);
  const seed = (problem.seed ?? 1) >>> 0;

  const perKit: Record<string, number> = {};
  let perKitCount = 0, kitArea = 0;
  for (const t of problem.templates) {
    const q = Math.max(0, Math.floor(t.qty || 0));
    perKit[t.id] = q;
    perKitCount += q;
    kitArea += q * ringArea(dedupeRing(t.shape));
  }

  const material = dedupeRing(problem.material);
  let usable = material.length >= 3 ? ringArea(material) : 0;
  try {
    if (usable > 0) usable = multiArea(difference(material, ...problem.defects.map((d) => dedupeRing(d)).filter((d) => d.length >= 3)));
  } catch { /* cota: área del material */ }

  const cap = Math.max(0, Math.floor(options.maxKits ?? DEFAULT_MAX_KITS));
  let ub = perKitCount > 0 ? Math.min(cap, Math.floor(MAX_ENGINE_INSTANCES / perKitCount)) : 0;
  if (kitArea > 0) ub = Math.min(ub, Math.floor((usable * (1 + 1e-9)) / kitArea));
  ub = Math.max(ub, Math.min(1, cap)); // siempre se intenta 1 kit (para el plan parcial)

  const attempts: MaxKitsAttempt[] = [];
  const results = new Map<number, Solution>();
  const success = new Set<number>();
  const tried = new Set<number>();
  const estTotal = Math.max(1, 2 * Math.ceil(Math.log2(ub + 1)) + 3);

  const report = (fraction: number, bestKits: number) => {
    options.onProgress?.(fraction, {
      fraction, iteration: attempts.length, maxIterations: estTotal,
      bestPlaced: bestKits * perKitCount, requested: Math.max(1, bestKits) * perKitCount, elapsedMs: now() - start,
    });
  };

  let best = 0;
  const outOfTime = () => now() - start >= budget;

  /** Ejecuta un intento con N kits; `variant` > 0 deriva otra semilla. */
  function* attempt(n: number, variant = 0): Generator<void, boolean, void> {
    const remaining = Math.max(0, budget - (now() - start));
    const left = Math.max(1, estTotal - attempts.length);
    const slice = remaining / left;
    const p: Problem = {
      ...expandKits(problem, n),
      seed: (seed + variant * 0x9e3779b1) >>> 0,
      // 0.8: la reparación final del optimizador puede usar hasta 1.25× su límite
      timeLimitMs: Math.max(1, slice * 0.8),
    };
    const sol = yield* optimizeSteps(p, { now });
    const requested = n * perKitCount;
    const ok = requested > 0 && sol.placements.length === requested;
    attempts.push({ kits: n, placed: sol.placements.length, requested });
    tried.add(n);
    if (ok) { success.add(n); results.set(n, sol); if (n > best) best = n; }
    else if (!results.has(n)) results.set(n, sol);
    report(Math.min(0.99, Math.max(attempts.length / estTotal, budget > 0 ? (now() - start) / budget : 1)), best);
    return ok;
  }

  /** Intenta añadir un kit al plan de `best` kits sin mover sus piezas. */
  function* augment(): Generator<void, boolean, void> {
    const prev = results.get(best)!;
    const remaining = Math.max(0, budget - (now() - start));
    const slice = remaining / Math.max(1, estTotal - attempts.length);
    const p: Problem = {
      ...problem,
      defects: [...problem.defects, ...prev.placements.map((q) => q.polygon)],
      seed: (seed + (best + 1) * 0x85ebca6b) >>> 0,
      timeLimitMs: Math.max(1, slice * 0.8),
    };
    const sol = yield* optimizeSteps(p, { now });
    const n = best + 1;
    const requested = n * perKitCount;
    let ok = sol.placements.length === perKitCount;
    let combined = prev.placements;
    if (ok) {
      combined = [
        ...prev.placements,
        ...sol.placements.map((q) => ({ ...q, instance: q.instance + best * (perKit[q.templateId] ?? 0) })),
      ];
      ok = verifySolution(expandKits(problem, n), combined).valid;
    }
    attempts.push({ kits: n, placed: ok ? requested : prev.placements.length + sol.placements.length, requested });
    tried.add(n);
    if (ok) {
      success.add(n);
      results.set(n, { ...prev, placements: combined });
      best = n;
    }
    report(Math.min(0.99, Math.max(attempts.length / estTotal, budget > 0 ? (now() - start) / budget : 1)), best);
    return ok;
  }

  if (cap >= 1 && perKitCount > 0) {
    // 1) exponencial
    let lo = 0, hi = ub + 1;
    if (yield* attempt(1)) {
      lo = 1;
      let n = 2;
      while (n <= ub && !outOfTime()) {
        if (yield* attempt(n)) { lo = n; n *= 2; } else { hi = n; break; }
      }
      if (hi === ub + 1 && lo < ub && n > ub && !outOfTime()) {
        if (yield* attempt(ub)) lo = ub; else hi = ub;
      }
      // 2) binaria en (lo, hi)
      while (hi - lo > 1 && !outOfTime()) {
        const mid = Math.floor((lo + hi) / 2);
        if (yield* attempt(mid)) lo = mid; else hi = mid;
      }
      // 3) comprobación final de best+1 y best+2 (la heurística no es monótona)
      const base = best;
      for (const n of [base + 1, base + 2]) {
        if (n > ub || outOfTime()) break;
        if (success.has(n)) continue;
        yield* attempt(n, tried.has(n) ? 1 : 0);
      }
      // 4) aumento: con el plan de `best` kits fijo (sus piezas actúan como defectos con la misma
      //    separación), intentar colocar UN kit más en el espacio libre; repetir mientras funcione
      while (best >= 1 && best < ub && !outOfTime()) {
        if (!(yield* augment())) break;
      }
    }
  }

  const chosen = best > 0 ? results.get(best)! : results.get(1);
  let solution: Solution;
  if (chosen) {
    const expanded = expandKits(problem, best > 0 ? best : 1);
    solution = { ...chosen, metrics: computeMetrics(expanded, chosen.placements), elapsedMs: now() - start };
  } else {
    const expanded = expandKits(problem, 1);
    solution = {
      placements: [], metrics: computeMetrics(expanded, []), elapsedMs: now() - start,
      optimizerVersion: OPTIMIZER_VERSION, seed,
    };
  }
  report(1, best);
  return { kits: best, perKit, solution, attempts };
}

export function maximizeKits(problem: Problem, options: MaxKitsOptions = {}): MaxKitsResult {
  const gen = maximizeKitsSteps(problem, options);
  for (;;) {
    const r: IteratorResult<void, MaxKitsResult> = gen.next();
    if (r.done) return r.value;
  }
}

/** Igual que `maximizeKits` pero cede el event loop cada ~50 ms (como `optimizeAsync`). */
export async function maximizeKitsAsync(
  problem: Problem,
  onProgress?: ProgressCallback,
  options: MaxKitsOptions & { yieldEveryMs?: number } = {},
): Promise<MaxKitsResult> {
  const now = options.now ?? defaultNow;
  const every = options.yieldEveryMs ?? 50;
  const gen = maximizeKitsSteps(problem, { ...options, onProgress: onProgress ?? options.onProgress });
  let last = now();
  for (;;) {
    const r: IteratorResult<void, MaxKitsResult> = gen.next();
    if (r.done) return r.value;
    if (now() - last >= every) {
      await new Promise<void>((res) => setTimeout(res, 0));
      last = now();
    }
  }
}
