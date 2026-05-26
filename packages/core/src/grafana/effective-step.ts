// Mirrors Grafana's rule-editor effective-step calculation (intervalv2.Calculate
// + gtime.RoundInterval). Layout is intentionally case-by-case identical to the
// Go switch in grafana-plugin-sdk-go/backend/gtime/gtime.go — do not refactor
// into a lookup table unless Grafana upstream does first.

const DEFAULT_RESOLUTION = 1500;

export function computeEffectiveStepMs({
  intervalMs,
  maxDataPoints,
  timeRangeMs,
}: {
  readonly intervalMs: number;
  readonly maxDataPoints: number;
  readonly timeRangeMs: number;
}): number {
  const resolution = maxDataPoints === 0 ? DEFAULT_RESOLUTION : maxDataPoints;
  const safe = timeRangeMs / resolution;
  if (safe < intervalMs) return intervalMs;
  return roundIntervalMs(safe);
}

export function roundIntervalMs(ms: number): number {
  if (ms <= 10) return 1;
  if (ms <= 15) return 10;
  if (ms <= 35) return 20;
  if (ms <= 75) return 50;
  if (ms <= 150) return 100;
  if (ms <= 350) return 200;
  if (ms <= 750) return 500;
  if (ms <= 1500) return 1000;
  if (ms <= 3500) return 2000;
  if (ms <= 7500) return 5000;
  if (ms <= 12500) return 10000;
  if (ms <= 17500) return 15000;
  if (ms <= 25000) return 20000;
  if (ms <= 45000) return 30000;
  if (ms <= 90000) return 60000;
  if (ms <= 210000) return 120000;
  if (ms <= 450000) return 300000;
  if (ms <= 750000) return 600000;
  if (ms <= 1050000) return 900000;
  if (ms <= 1500000) return 1200000;
  if (ms <= 2700000) return 1800000;
  if (ms <= 5400000) return 3600000;
  if (ms <= 9000000) return 7200000;
  if (ms <= 16200000) return 10800000;
  if (ms <= 32400000) return 21600000;
  if (ms <= 86400000) return 43200000;
  if (ms <= 172800000) return 86400000;
  if (ms <= 604800000) return 86400000;
  if (ms <= 1814400000) return 604800000;
  if (ms < 63072000000) return 2592000000;
  return 31536000000;
}
