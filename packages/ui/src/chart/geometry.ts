import type { Threshold } from '@alert-whatif/core';

function thresholdYValues(t: Threshold): number[] {
  if ('value' in t) return [t.value];
  return [t.left, t.right];
}

function padDomain(min: number, max: number): { yMin: number; yMax: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { yMin: 0, yMax: 1 };
  if (min === max) return { yMin: min - 0.5, yMax: max + 0.5 };
  const span = max - min;
  const yMin = min >= 0 && min < max * 0.3 ? 0 : min - span * 0.05;
  return { yMin, yMax: max + span * 0.05 };
}

// Round up to the next nice number (1, 2, 5, 10, …) to stabilise the Y ceiling.
function niceCeil(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const base = Math.pow(10, exp);
  const norm = x / base;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * base;
}

export { thresholdYValues, padDomain, niceCeil };
