export const CORE_VERSION = '0.1.0';

export type {
  AlertConfig,
  Duration,
  EvalEvent,
  EvalResult,
  EvalSummary,
  EvaluatorHints,
  EventKindSummary,
  ExecErrState,
  InstantAlertConfig,
  MetricSeries,
  NanMode,
  NoDataState,
  RangeAlertConfig,
  ReducerKind,
  Result,
  Sample,
  Threshold,
  ThresholdOp,
  Tick,
  Timestamp,
} from './data/types';

export { evaluate } from './calc/evaluate';
export { passes } from './calc/pipeline/1-classify/threshold/threshold';
export { changeThresholdOp, isRangeOp, COMPARISON_OPS, RANGE_OPS } from './data/threshold-ops';
export { scheduleTickTimes } from './calc/pipeline/0-tick/window/schedule';

export { parseGrafanaAlertRule } from './grafana/parseRule';
export { computeEffectiveStepMs } from './grafana/effective-step';
export { downsampleToStep } from './grafana/downsample';
export { deriveEvalGridOffsetMs } from './grafana/eval-grid-offset';
export { planFetch, type FetchRange, type FetchPlan, type PlanFetchInput } from './grafana/plan-fetch';
export type {
  GrafanaAlertState,
  GrafanaRuleObservation,
  RuleSummary,
} from './grafana/runtime-state';
export {
  parseRulesListResponse,
  parseRuleStateResponse,
  normaliseRuleState,
  mapAnnotationToInitialState,
  mapAnnotationToBarState,
  legacyRuleToV0Alpha1,
  type GrafanaRulesResponse,
  type AlertAnnotation,
  type LegacyRule,
  type LegacyGroup,
} from './grafana/parse-api';
export {
  detectStateBarDivergence,
  type Divergence,
  type DivergenceKind,
  type StateTransition,
} from './grafana/state-bar-diff';
