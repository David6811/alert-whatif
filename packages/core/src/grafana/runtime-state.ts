// Grafana's own runtime view of a rule — the state vocabulary and observations
// the adapters read from Grafana's HTTP API, distinct from core's evaluator
// state machine. Lives in core so both the parsers here and the adapter
// contract in `@alert-whatif/ui` share one definition.

export type GrafanaAlertState = 'inactive' | 'pending' | 'firing' | 'unknown';

// Grafana's own decision for a rule + the wallclock of its most recent
// evaluation. `useLiveMode` uses `lastEvaluationMs` for two things:
//   (1) phase discovery — `lastEvaluationMs % evaluationIntervalMs` becomes
//       the `evalGridOffsetMs` hint passed to `evaluate()`, so our tick
//       grid matches Grafana's eval grid moment-for-moment.
//   (2) state-bar timestamping — entries in the GRAFANA state history are
//       stamped at Grafana's real transition moment rather than our poll
//       arrival, so the bar doesn't visually lag by ≤ pollInterval.
export type GrafanaRuleObservation = {
  readonly state: GrafanaAlertState;
  // `null` when Grafana hasn't evaluated this rule yet (just created, or
  // post-restart) or didn't return a parseable `lastEvaluation` field.
  readonly lastEvaluationMs: number | null;
};

export type RuleSummary = {
  readonly uid: string;
  readonly title: string;
  // Optional folder name (Grafana namespace) — helps the picker group rules
  // visually when there are many. Demo doesn't use this; plugin sources it
  // from the `/api/v1/rules` group's file field.
  readonly folder?: string;
  // Current alert state as Grafana sees it. Optional — adapters that
  // can't observe runtime state (e.g. file-only listings) just omit it.
  // RulePicker renders a state dot next to each entry when present.
  readonly state?: GrafanaAlertState;
};
