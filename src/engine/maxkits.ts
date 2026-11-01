/**
 * "Maximize complete sets": given a problem whose templates form ONE kit (qty = pieces per kit),
 * finds the largest N such that ALL the pieces of N kits are placed validly.
 *
 * Technique: for each candidate N an expanded problem is built (qty·N per template) and the optimizer
 * is called. An attempt succeeds if it places every instance (and, like any `optimize` plan,
 * passes `verifySolution`). Kit k owns instances [k·qty, (k+1)·qty) of each
 * template; instances of the same template are interchangeable, so the assignment is valid.
 *
 * Search (the heuristic is not monotonic in N): exponential growth 1, 2, 4, … up to the first
 * failure or the upper bound, binary search between the last success and the first failure, and finally a
 * check of N+1 and N+2 around the best (retrying with another derived seed if they had
 * already been tried). Then AUGMENTATION: with the N-kit plan fixed (its pieces as obstacles with the same
 * spacing) it tries to place one more kit in the free gap; it is accepted only if all its pieces fit
 * and the combined plan passes `verifySolution` for N+1 kits; repeated until it fails. Upper bound: min(maxKits, ⌊usable area / kit area⌋, ⌊400 / pieces per kit⌋).
 *
 * Budget: `timeLimitMs` (8000 by default) is split among the estimated remaining attempts.
 * Each attempt gets 80% of its share as `timeLimitMs` because the optimizer's first pass
 * can use up to 2× its limit. Determinism: same problem + seed ⇒ same output,
 * unless the time budget cuts an attempt or the search (with the real clock, a
 * slower machine might explore less). With an injected clock that does not advance it is deterministic.
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
  /** Cap on the number of kits to search for (default 12). */
  maxKits?: number;
  /** Total budget in ms (default 8000). */
  timeLimitMs?: number;
  /** Injectable clock (ms). */
  now?: () => number;
  onProgress?: ProgressCallback;
}

export interface MaxKitsAttempt { kits: number; placed: number; requested: number }

export interface MaxKitsResult {
  /** Largest number of complete sets found. */
  kits: number;
  /** templateId → pieces per kit. */
  perKit: Record<string, number>;
  /**
   * Plan for `kits` complete sets (metrics of the expanded problem: requested = qty·kits).
   * If kits === 0, the best partial plan for ONE kit. `elapsedMs` is the total search time.
   */
  solution: Solution;
  /** Attempts in execution order. */
  attempts: MaxKitsAttempt[];
}

const defaultNow = (): number =>
  typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();

/** Expanded problem for N kits. */
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
  } catch { /* bound: material area */ }

  const cap = Math.max(0, Math.floor(options.maxKits ?? DEFAULT_MAX_KITS));
  let ub = perKitCount > 0 ? Math.min(cap, Math.floor(MAX_ENGINE_INSTANCES / perKitCount)) : 0;
  if (kitArea > 0) ub = Math.min(ub, Math.floor((usable * (1 + 1e-9)) / kitArea));
  ub = Math.max(ub, Math.min(1, cap)); // always try 1 kit (for the partial plan)

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

  /** Runs an attempt with N kits; `variant` > 0 derives another seed. */
  function* attempt(n: number, variant = 0): Generator<void, boolean, void> {
    const remaining = Math.max(0, budget - (now() - start));
    const left = Math.max(1, estTotal - attempts.length);
    const slice = remaining / left;
    const p: Problem = {
      ...expandKits(problem, n),
      seed: (seed + variant * 0x9e3779b1) >>> 0,
      // 0.8: the optimizer's final repair can use up to 1.25× its limit
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

  /** Tries to add one kit to the plan of `best` kits without moving its pieces. */
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
    // 1) exponential
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
      // 2) binary in (lo, hi)
      while (hi - lo > 1 && !outOfTime()) {
        const mid = Math.floor((lo + hi) / 2);
        if (yield* attempt(mid)) lo = mid; else hi = mid;
      }
      // 3) final check of best+1 and best+2 (the heuristic is not monotonic)
      const base = best;
      for (const n of [base + 1, base + 2]) {
        if (n > ub || outOfTime()) break;
        if (success.has(n)) continue;
        yield* attempt(n, tried.has(n) ? 1 : 0);
      }
      // 4) augmentation: with the plan of `best` kits fixed (its pieces act as defects with the same
      //    spacing), try to place ONE more kit in the free space; repeat while it works
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

/** Same as `maximizeKits` but yields the event loop every ~50 ms (like `optimizeAsync`). */
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
