/** Public API of the CutSense geometry engine (no DOM: Node and browser). */
export * from './geometry';
export { verifySolution, verifyTolerances, shapeMatches, type VerifyTolerances } from './verify';
export { computeMetrics } from './metrics';
export {
  optimize, optimizeAsync, optimizeSteps, repairPlacements, mulberry32,
  OPTIMIZER_VERSION, DEFAULT_TIME_LIMIT_MS, DEFAULT_MAX_ITERATIONS, DEFAULT_SEED, OPT_MARGIN_REL,
  type OptimizeOptions, type OptimizeProgress, type ProgressCallback,
} from './optimize';
export {
  maximizeKits, maximizeKitsAsync, maximizeKitsSteps, expandKits, DEFAULT_KITS_TIME_LIMIT_MS, DEFAULT_MAX_KITS,
  type MaxKitsResult, type MaxKitsOptions, type MaxKitsAttempt,
} from './maxkits';
export { computeRemainder, fragmentAsMaterial, DEFAULT_MIN_AREA_FRACTION, type Fragment, type RemainderResult } from './remainder';
export { buildShape, makeTemplate, KIND_LABEL, PALETTE, PATTERNS } from './templates';
