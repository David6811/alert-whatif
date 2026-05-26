// Generic Result type used at every fallible boundary in `calc/`. Callers pattern-match on
// `kind` — no exceptions. `Ok` carries the produced value; `Err` carries one or more messages.
export type Result<T, E = string> =
  | { readonly kind: 'Ok'; readonly value: T }
  | { readonly kind: 'Err'; readonly errors: ReadonlyArray<E> };

export type Timestamp = number;
export type Duration = number;

export type Sample = {
  readonly t: Timestamp;
  readonly v: number;
};

export type MetricSeries = {
  readonly labels: Readonly<Record<string, string>>;
  readonly samples: ReadonlyArray<Sample>;
};

export type ReducerKind = 'Last' | 'Min' | 'Max' | 'Sum' | 'Mean' | 'Count' | 'Median';

// Comparison ops take a single `value`; range ops take `left` and `right`. Treat them as
// a discriminated union so each variant carries only the fields it needs — matches
// Grafana's `pkg/expr/threshold.go` where the predicates are concrete types per op.
export type ThresholdComparisonOp = 'Gt' | 'Lt' | 'GtEq' | 'LtEq' | 'Eq' | 'Ne';
export type ThresholdRangeOp =
  | 'WithinRange'
  | 'OutsideRange'
  | 'WithinRangeIncluded'
  | 'OutsideRangeIncluded';
export type ThresholdOp = ThresholdComparisonOp | ThresholdRangeOp;

export type Threshold =
  | { readonly op: ThresholdComparisonOp; readonly value: number }
  | { readonly op: ThresholdRangeOp; readonly left: number; readonly right: number };

export type NoDataState = 'Alerting' | 'NoData' | 'Ok' | 'KeepLast';

export type ExecErrState = 'Alerting' | 'Error' | 'Ok' | 'KeepLast';

// Per-rule NaN/Inf handling mode. Mirrors Grafana's `settings.mode` on the reduce
// expression node (`pkg/expr/mathexp/reduce.go`). Three variants:
//   - None: no mapper applied. NaN flows into the reducer naturally — any NaN in the
//     window taints Sum/Mean/Min/Max/Median's output (matching Go IEEE 754 semantics).
//     This is Grafana's default when `settings.mode` is absent from the JSON.
//   - DropNN: filter NaN/Inf out of the input before reducing; if the reducer's output
//     itself is NaN, treat the tick as NoData. **Input drops Inf, output does not** —
//     this asymmetry matches Grafana's `dropNN.MapOutput` exactly.
//   - ReplaceNN: substitute NaN/Inf inputs with `replaceWithValue` before reducing; if
//     the reducer's output is NaN, substitute it with `replaceWithValue` too. Same
//     input/output asymmetry: Inf is replaced on input only.
export type NanMode =
  | { readonly kind: 'None' }
  | { readonly kind: 'DropNN' }
  | { readonly kind: 'ReplaceNN'; readonly replaceWithValue: number };

// Fields shared by both query modes. Range and instant configs differ in:
//   - `windowDuration` vs `lookbackDelta` — range slices a window from
//     `relativeTimeRange.from`; instant has no window, only Prometheus's
//     `lookback_delta` staleness.
//   - `reducer` / `nanMode` — meaningful only for the range-mode reduce step.
type CommonAlertConfig = {
  readonly threshold: Threshold;
  readonly forDuration: Duration;
  // Hysteresis duration after the firing condition first goes false. While `keepFiringFor`
  // elapses, the alert stays in `Recovering` state (still notifying). A re-fire during this
  // window jumps straight back to `Alerting` (no Pending phase) — matches Grafana's
  // `KeepFiringFor` (`pkg/services/ngalert/models/alert_rule.go:366`). Set to 0 to disable.
  readonly keepFiringFor: Duration;
  // How often the rule is evaluated — the tick cadence.
  readonly evaluationInterval: Duration;
  // Minimum step at which samples are queried within a window (Grafana `intervalMs`).
  readonly intervalMs: Duration;
  // Cap on samples per evaluation window (Grafana `maxDataPoints`). Smaller values
  // force a coarser effective step → fewer samples enter the reducer.
  readonly maxDataPoints: number;
  readonly noDataState: NoDataState;
  // Honored when an error-input representation exists in MetricSeries. Currently no-op
  // in core — errors are a data-source layer concern. Carried for JSON round-trip fidelity.
  readonly execErrState: ExecErrState;
};

// Range-mode rule: query produces a slice of samples per tick, reducer collapses
// to a scalar, threshold checks the scalar. Three-node DAG (A query → B reduce
// → C threshold) on Grafana's side.
export type RangeAlertConfig = CommonAlertConfig & {
  readonly instant: false;
  // How far back each tick looks when reducing — Grafana's
  // `relativeTimeRange.from` on the query node.
  readonly windowDuration: Duration;
  // The reducer applied to the per-tick slice.
  readonly reducer: ReducerKind;
  // How to treat NaN / Inf samples both before reducing and on the reducer's
  // output. No default — every config must declare its mode explicitly.
  readonly nanMode: NanMode;
};

// Instant-mode rule: query returns one scalar per tick (Prometheus instant
// query). No reduce step — threshold checks the scalar directly. Two-node
// DAG (A query → B threshold). `reducer` and `nanMode` don't exist here
// because they have nothing to act on.
//
// No staleness/lookback field: Prometheus's `query_range` already gives us
// one sample per step at which PromQL was defined (and *skips* steps where
// it wasn't — `rate(m[2m])` over an empty window returns no sample at all).
// Since the phase-lock invariant aligns our tick grid to those step times
// (`EvaluatorHints.evalGridOffsetMs`), the evaluator just looks up the
// sample at `tick.t` — present → Data, absent → NoData. Same algorithm as
// Grafana's instant query path; no carry-forward magic.
export type InstantAlertConfig = CommonAlertConfig & {
  readonly instant: true;
};

export type AlertConfig = RangeAlertConfig | InstantAlertConfig;

// Optional runtime hints passed to `evaluate()` alongside the `AlertConfig`.
// These describe properties of the evaluation environment (Grafana scheduler,
// query-side step alignment, etc.) that are NOT part of the alert rule's
// JSON config but ARE needed to reproduce Grafana's exact event timestamps.
// All fields are optional; omitting a hint preserves the evaluator's default
// behaviour (sample-grid anchored, no extrapolation).
export type EvaluatorHints = {
  // Wallclock-modulo-evaluationInterval offset at which Grafana evaluates the
  // rule. For example, a rule with `trigger.interval: 1m` and
  // `lastEvaluation: 2026-05-14T14:00:30Z` has `evalGridOffsetMs = 30000`
  // (Grafana evaluates 30 s past every minute).
  //
  // When provided, `scheduleTickTimes` aligns the tick grid so that
  // `tick.t % evaluationInterval === evalGridOffsetMs % evaluationInterval`,
  // matching Grafana's eval cadence regardless of when the first sample
  // happened to land. When omitted, the tick grid anchors to `samples[0].t`
  // (sample-grid alignment, current default) — which can drift up to one
  // eval interval relative to Grafana for rules whose scheduler offset
  // doesn't happen to match the sample grid.
  //
  // Demo Live mode reads this from the rule's `lastEvaluation` field on
  // the first poll. Fidelity fixtures encode it in
  // `provenance.evalGridOffsetMs`.
  readonly evalGridOffsetMs?: Duration;

  // Wallclock at which to STOP scheduling ticks. When provided and greater
  // than the last sample's timestamp, the tick grid extends past the data —
  // each extra tick's window will be progressively emptier and eventually
  // produce a NoData tick, matching what Grafana does when its scheduled eval
  // fires after the underlying timeseries stops reporting (push paused,
  // exporter dropped off, etc.).
  //
  // When omitted, the schedule stops at `samples[-1].t` (legacy behaviour),
  // suitable for "given exactly these samples, what would Grafana have
  // decided?" framing where the sample range is itself the evaluation
  // boundary.
  //
  // Demo Live mode reads this from a 1 Hz wallclock ticker so the chart's
  // state-bar reflects "Grafana keeps evaluating even though our data is
  // stale" in real time. Mock-mode replays leave it unset — the recorded
  // sample range IS the universe of data.
  readonly endTime?: Timestamp;

  // Mirror of `endTime` for the LEFT edge. When provided and earlier
  // than `samples[0].t`, the tick grid starts here instead of at the
  // first sample — every tick before `samples[0].t` becomes a NoData
  // tick (window contains no data). Used by the drill-down path so the
  // user can see the Normal→Firing transition: without `startTime` the
  // grid begins at the first firing sample and the pre-data NoData
  // tail (and its for-gate / lifecycle boundary) is invisible.
  readonly startTime?: Timestamp;

  // Alert state at the moment just BEFORE the first input sample. When
  // omitted, `classifyTicks` falls back to 'Normal' — that's the legacy
  // assumption and remains correct whenever the visible window contains
  // an actual transition into the active state.
  //
  // For long-running alerts that are ALREADY in Firing/NoData at the
  // visible window's left edge, the legacy assumption produces a phantom
  // Normal → Pending → Firing transition right at windowStart that never
  // actually happened. Callers who can query the alert's true state
  // (e.g. the Grafana plugin reading the annotations API or the
  // ngalert state endpoint) pass it here so the classifier's first tick
  // continues the prior state instead of starting fresh from Normal.
  readonly initialState?: 'Normal' | 'Firing' | 'NoData';
};

export type EvalEvent =
  | { readonly kind: 'Pending'; readonly from: Timestamp; readonly until: Timestamp }
  | { readonly kind: 'Firing'; readonly from: Timestamp; readonly until: Timestamp }
  | { readonly kind: 'NoData'; readonly from: Timestamp; readonly until: Timestamp }
  // Hysteresis phase after a Firing run when `keepFiringFor > 0` — the alert still
  // notifies but the condition has gone false. Resolved fires only after the
  // Recovering window elapses without re-firing.
  | { readonly kind: 'Recovering'; readonly from: Timestamp; readonly until: Timestamp }
  | { readonly kind: 'Resolved'; readonly at: Timestamp };

// Output of Stage 0 of the evaluator — the per-tick reduced view. `Data` means the
// window had samples and the reducer produced `v`; `NoData` means the window was
// empty (or all samples were dropped by `nanMode`). Surfaced on `EvalResult` so
// callers can inspect what the threshold check actually saw at each tick. Defined
// here (not in calc/tick) because it's a result type of the evaluator's public API,
// and `EvalResult` references it.
export type Tick =
  | { readonly kind: 'Data'; readonly t: Timestamp; readonly v: number }
  | { readonly kind: 'NoData'; readonly t: Timestamp };

export type EvalResult = {
  readonly events: ReadonlyArray<EvalEvent>;
  // Per-tick reduced values — Stage 0's output, exposed for trace UI and debugging.
  // One entry per scheduled evaluation; same length as `scheduleTickTimes(...)` for
  // the rule's interval. Empty when samples are empty.
  readonly ticks: ReadonlyArray<Tick>;
};

// Aggregate counts + durations for one event kind. `totalDuration` is the sum of
// (until − from) across all events of that kind. For `Resolved` events (point events)
// `totalDuration` is always 0 — keep the kind out of the per-kind shape and use
// `resolvedCount` on `EvalSummary` instead.
export type EventKindSummary = {
  readonly count: number;
  readonly totalDuration: Duration;
};

// Output of `summarize(events)`. Pure function of events — the caller decides when to
// invoke (typically after `evaluate()` returns Ok). See `calc/summarize.ts`.
export type EvalSummary = {
  readonly pending: EventKindSummary;
  readonly firing: EventKindSummary;
  readonly noData: EventKindSummary;
  readonly recovering: EventKindSummary;
  // Resolved events are point events (one timestamp, not a range), so they don't carry a
  // duration. Counted separately.
  readonly resolvedCount: number;
  // Timestamp at which the first Firing event begins, or null if no Firing event occurred.
  // Callers can subtract a baseline (e.g., series start) to derive "time until first fire."
  readonly firstFiringAt: Timestamp | null;
  // The longest single Firing event's duration. Null when no Firing event occurred.
  readonly longestFiringSpan: Duration | null;
  // Pending events that ended without promoting to Firing/NoData/Recovering — useful for
  // UI as "near-misses." A Pending is counted as cancelled when it is immediately followed
  // by `Resolved`.
  readonly cancelledPendingCount: number;
};
