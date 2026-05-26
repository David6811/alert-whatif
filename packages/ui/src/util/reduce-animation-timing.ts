// Reduce-animation timing constants. MUST stay in sync with the CSS keyframes
// in index.css (.reduce-sample-dot / .reduce-result-dot), else auto-play
// pacing desyncs from the visual.

export const SWEEP_PER_DOT_MS = 500;
export const SWEEP_STAGGER_MS = 80;
export const FLASH_GAP_MS = 100;
export const FLASH_DURATION_MS = 500;
export const FADE_DURATION_MS = 400;
export const RESULT_POP_MS = 1200;

// Total duration for `n` samples, mirroring MetricChart's delay arithmetic.
// 0 for NoData ticks.
export function reduceAnimationDurationMs(n: number): number {
  if (n <= 0) return 0;
  const lastSweepEnd = (n - 1) * SWEEP_STAGGER_MS + SWEEP_PER_DOT_MS;
  const flashDelay = lastSweepEnd + FLASH_GAP_MS;
  const fadeDelay = flashDelay + FLASH_DURATION_MS;
  return fadeDelay + RESULT_POP_MS;
}
