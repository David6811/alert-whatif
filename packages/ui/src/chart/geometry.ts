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

// Instant rules compare the raw value against a threshold, and that value can
// have a wide dynamic range (e.g. queue lag 28s normal → 600s stuck). Scaling
// the Y axis to [0, niceCeil(max)] buries the threshold near the bottom, hiding
// what happens below it. Instead anchor the domain on the (constant) threshold
// so it sits at the vertical centre — symmetric headroom both ways, and the
// axis stays stable across ticks because it no longer tracks the data peak.
function thresholdCenteredDomain(
  rawMin: number,
  rawMax: number,
  thresholdYs: number[],
): { yMin: number; yMax: number } {
  const finite = thresholdYs.filter((t) => Number.isFinite(t));
  if (finite.length === 0 || !Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
    return padDomain(rawMin, niceCeil(rawMax));
  }
  const center = finite.reduce((sum, t) => sum + t, 0) / finite.length;
  const reach = Math.max(
    rawMax - center,
    center - rawMin,
    ...finite.map((t) => Math.abs(t - center)),
    Math.max(Math.abs(center), 1) * 0.1, // guard against a zero-span domain
  );
  const half = niceCeil(reach * 1.15);
  // Clamp the floor to 0 for non-negative data (the threshold then sits
  // slightly above centre, still with ample room below).
  const yMin = rawMin >= 0 ? Math.max(0, center - half) : center - half;
  return { yMin, yMax: center + half };
}

export { thresholdYValues, padDomain, niceCeil, thresholdCenteredDomain };
