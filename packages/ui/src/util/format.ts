// Pure display helpers.

// "<ISO start> UTC (<dur> min total)".
export function formatRange(fromMs: number, toMs: number): string {
  const from = new Date(fromMs).toISOString().replace('T', ' ').slice(0, 19);
  const durMin = (toMs - fromMs) / 60_000;
  return `${from} UTC (${durMin.toFixed(1)} min total)`;
}

// Compact duration: "0" / "2m" / "30s" / "1.5s" / "500ms".
export function formatDurCompact(d: number): string {
  if (d === 0) return '0';
  if (d >= 60_000 && d % 60_000 === 0) return `${d / 60_000}m`;
  if (d >= 60_000) return `${(d / 60_000).toFixed(1)}m`;
  if (d >= 1000 && d % 1000 === 0) return `${d / 1000}s`;
  if (d >= 1000) return `${(d / 1000).toFixed(1)}s`;
  return `${d}ms`;
}

import type { AlertConfig, Threshold } from '@alert-whatif/core';

// Chart subtitle, e.g. "mean(samples) > 5 · for: 2m · eval: 1m".
export function formatAlertExpression(config: AlertConfig): string {
  const cond = config.instant
    ? `instant ${formatThresholdInline(config.threshold)}`
    : `${config.reducer.toLowerCase()}(samples) ${formatThresholdInline(config.threshold)}`;
  const parts = [
    cond,
    `for: ${formatDurCompact(config.forDuration)}`,
    `eval: ${formatDurCompact(config.evaluationInterval)}`,
  ];
  if (config.keepFiringFor > 0) {
    parts.push(`keepFiring: ${formatDurCompact(config.keepFiringFor)}`);
  }
  return parts.join(' · ');
}

// "> 0.05" / "∈ [0, 10]" / "∉ (0, 10)".
function formatThresholdInline(t: Threshold): string {
  if ('value' in t) {
    return `${OP_SYMBOL[t.op]} ${t.value}`;
  }
  const open = t.op === 'WithinRangeIncluded' || t.op === 'OutsideRangeIncluded' ? '[' : '(';
  const close = t.op === 'WithinRangeIncluded' || t.op === 'OutsideRangeIncluded' ? ']' : ')';
  const verb = t.op === 'WithinRange' || t.op === 'WithinRangeIncluded' ? '∈' : '∉';
  return `${verb} ${open}${t.left}, ${t.right}${close}`;
}

const OP_SYMBOL: Record<string, string> = {
  Gt: '>',
  Lt: '<',
  GtEq: '≥',
  LtEq: '≤',
  Eq: '=',
  Ne: '≠',
};
