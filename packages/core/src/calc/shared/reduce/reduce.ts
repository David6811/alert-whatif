import type { ReducerKind, Sample } from '../../../data/types';

// Pure reducer over a window of samples. Operates on the input as-is — does NOT filter
// NaN or Inf. NaN handling is the mapper layer's job (`./nan-mode.ts`); apply mappers
// before and after calling this function. This matches Grafana's separation between
// `mathexp/reduce.go` (raw reducers) and the configurable mapper.
//
// Reducer-natural behaviour on NaN input (no mapper):
//   Last         — returns the last value, which may be NaN.
//   Min / Max    — Math.min/max with any NaN arg returns NaN.
//   Sum / Mean   — any NaN summand taints the result (NaN propagates).
//   Count        — counts every sample regardless of value (NaN inclusive).
//   Median       — sort with NaN is undefined; we detect NaN and return NaN.
//
// Empty-input behaviour: matches the "additive identity / undefined statistic" rule —
// Sum/Count → 0; Last/Min/Max/Mean/Median → NaN.
export function reduce(samples: ReadonlyArray<Sample>, kind: ReducerKind): number {
  switch (kind) {
    case 'Last':
      return samples.at(-1)?.v ?? Number.NaN;
    case 'Min':
      return samples.length === 0
        ? Number.NaN
        : samples.reduce((acc, s) => Math.min(acc, s.v), Number.POSITIVE_INFINITY);
    case 'Max':
      return samples.length === 0
        ? Number.NaN
        : samples.reduce((acc, s) => Math.max(acc, s.v), Number.NEGATIVE_INFINITY);
    case 'Sum':
      return samples.reduce((acc, s) => acc + s.v, 0);
    case 'Mean':
      return samples.length === 0
        ? Number.NaN
        : samples.reduce((acc, s) => acc + s.v, 0) / samples.length;
    case 'Count':
      return samples.length;
    case 'Median':
      // Standard median: sort, take middle for odd count, mean of two middles for even.
      // Empty → NaN, same pattern as Mean/Min/Max. NaN in input → NaN (sort with NaN is
      // implementation-defined in JS; explicit short-circuit avoids that).
      if (samples.length === 0) return Number.NaN;
      if (samples.some((s) => Number.isNaN(s.v))) return Number.NaN;
      {
        const sorted = samples.map((s) => s.v).sort((a, b) => a - b);
        const mid = sorted.length >> 1;
        return sorted.length % 2 === 1
          ? (sorted[mid] as number)
          : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
      }
  }
}
