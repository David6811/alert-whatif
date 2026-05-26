// NaN / Inf handling for the reducer pipeline. Mirrors Grafana's mapper layer in
// `pkg/expr/mathexp/reduce.go` — see spec doc §8 for the source citation.
//
// Pipeline order:
//   1. `applyMapInput(samples, mode)` runs first, transforming raw window samples
//      according to the mode (drop, replace, or pass-through).
//   2. The reducer (`reduce(...)`) is called on the mapped samples.
//   3. `applyMapOutput(reduced, mode)` runs last on the reducer's scalar output.
//
// The input/output asymmetry is critical: `DropNN.MapInput` drops Inf, but
// `DropNN.MapOutput` does NOT. Same for `ReplaceNN`. Tests pin this — do not
// "fix" the asymmetry without first re-verifying against Grafana source.
//
// `applyMapOutput` returns `null` to signal "the value has been dropped" — the
// caller (`tick.ts`) interprets that as a NoData tick. Grafana's frame model
// achieves the same outcome by emitting a nil entry that downstream treats as
// missing data.

import type { NanMode, Sample } from '../../../data/types';

// True for NaN OR ±Infinity. The reducer's input filter cares about both;
// the output filter cares only about NaN (per Grafana's asymmetry).
function isNanOrInf(v: number): boolean {
  return Number.isNaN(v) || !Number.isFinite(v);
}

export function applyMapInput(
  samples: ReadonlyArray<Sample>,
  mode: NanMode,
): ReadonlyArray<Sample> {
  switch (mode.kind) {
    case 'None':
      return samples;
    case 'DropNN':
      return samples.filter((s) => !isNanOrInf(s.v));
    case 'ReplaceNN': {
      const r = mode.replaceWithValue;
      return samples.map((s) => (isNanOrInf(s.v) ? { t: s.t, v: r } : s));
    }
  }
}

// Returns the reducer's scalar output after the output-mapper step. Returns
// `null` to signal "drop this tick — emit NoData downstream."
// Asymmetry note: only NaN is mapped here. Inf passes through (matches
// Grafana's `MapOutput`).
export function applyMapOutput(value: number, mode: NanMode): number | null {
  switch (mode.kind) {
    case 'None':
      return value;
    case 'DropNN':
      return Number.isNaN(value) ? null : value;
    case 'ReplaceNN':
      return Number.isNaN(value) ? mode.replaceWithValue : value;
  }
}
