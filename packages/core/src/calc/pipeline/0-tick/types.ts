import type { Duration, NanMode, ReducerKind } from '../../../data/types';

// Re-export `Tick` from data/types.ts so calc/tick/* importers keep working. The
// type itself moved out of this folder because `EvalResult` (in data/types) needs
// to reference it — keeping the canonical definition in data/types avoids a
// circular dependency.
export type { Tick } from '../../../data/types';

// Stage 0's view of the alert config — same range/instant split as
// `AlertConfig` but with only the fields Stage 0 actually reads. `intervalMs`
// and `maxDataPoints` from AlertConfig are deliberately absent (they describe
// query-side fetching, not how we evaluate the samples we received — see
// `docs/04-grafana-fidelity.md`).
type CommonTickConfig = {
  // How often to emit a tick. 0 short-circuits to "each raw sample is a Data tick."
  readonly evaluationInterval: Duration;
};

export type RangeTickConfig = CommonTickConfig & {
  readonly instant: false;
  // Closed window `[t - windowDuration, t]`ish slice the reducer takes from
  // (Grafana's `relativeTimeRange.from` on the query node).
  readonly windowDuration: Duration;
  readonly reducer: ReducerKind;
  // How NaN/Inf samples are mapped before the reducer and the reducer's output
  // after. See `../../../shared/nan-mode/nan-mode.ts` and spec doc §8.
  readonly nanMode: NanMode;
};

export type InstantTickConfig = CommonTickConfig & {
  readonly instant: true;
};

export type TickConfig = RangeTickConfig | InstantTickConfig;
