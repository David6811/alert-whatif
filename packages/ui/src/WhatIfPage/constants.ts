import type { AlertConfig } from '@alert-whatif/core';

export const MIN_AUTOPLAY_WAIT_MS = 1000;
export const AUTO_REPLAY_SPEEDUP = 5;

export const PLACEHOLDER_CONFIG: AlertConfig = {
  threshold: { op: 'Gt', value: 0 },
  forDuration: 0,
  keepFiringFor: 0,
  evaluationInterval: 60000,
  intervalMs: 1000,
  maxDataPoints: 1,
  noDataState: 'Ok',
  execErrState: 'Error',
  instant: true,
};

export const LIVE_INTERVAL_SEC = 15;
export const OVERVIEW_RANGE_OPTIONS = [
  { label: 'Current', lookbackSec: 0, stepSec: 0 },
  { label: 'Last 1h', lookbackSec: 60 * 60, stepSec: 30 },
  { label: 'Last 6h', lookbackSec: 6 * 60 * 60, stepSec: 60 },
  { label: 'Last 24h', lookbackSec: 24 * 60 * 60, stepSec: 60 },
  { label: 'Last 48h', lookbackSec: 48 * 60 * 60, stepSec: 120 },
] as const;
export const OVERVIEW_DEFAULT_LOOKBACK_SEC = 0;
export const LIVE_LOOKBACK_SEC = 1800;
export const LIVE_SCRUB_MAX_MS = LIVE_LOOKBACK_SEC * 1000 - 12 * 60 * 1000;
// Drill focal lands at the 2nd tick from the left ('leading') or 3rd from
// the right ('trailing'); both edges stay inside the ±15-min drill fetch.
export const DRILL_FOCAL_LEADING_OFFSET_MS = 12 * 60 * 1000;
export const DRILL_FOCAL_TRAILING_OFFSET_MS = 2 * 60 * 1000;
