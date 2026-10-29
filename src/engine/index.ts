/** API pública del motor geométrico de CutSense (sin DOM: Node y navegador). */
export * from './geometry';
export { verifySolution, verifyTolerances, shapeMatches, type VerifyTolerances } from './verify';
export { computeMetrics } from './metrics';
export {
  optimize, optimizeAsync, optimizeSteps, repairPlacements, mulberry32,
  OPTIMIZER_VERSION, DEFAULT_TIME_LIMIT_MS, DEFAULT_MAX_ITERATIONS, DEFAULT_SEED, OPT_MARGIN_REL,
  type OptimizeOptions, type OptimizeProgress, type ProgressCallback,
} from './optimize';
export { buildShape, makeTemplate, KIND_LABEL, PALETTE, PATTERNS } from './templates';
