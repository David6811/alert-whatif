// Host-agnostic adapter port for WhatIfPage. Capability flags tell the Page
// which UI to surface. Live-polling orchestration lives in useLiveMode, not
// here — the adapter exposes only primitive fetchers. Each optional method
// MUST be present iff its matching capability is true (enforced at call sites).

import type { Result, Sample, MetricSeries, AlertConfig } from '@alert-whatif/core';
import type { RuleMetadata } from '../types';

import type {
  GrafanaAlertState,
  GrafanaRuleObservation,
  RuleSummary,
} from '@alert-whatif/core';
export type { GrafanaAlertState, GrafanaRuleObservation, RuleSummary };

export type WhatIfDataSourceCapabilities = {
  // Bundled / captured datasets via `listFixtures()`.
  readonly fixtures: boolean;
  // `fetchRuleState` + live polling via `fetchSamples`.
  readonly live: boolean;
  // Resolve a rule UID into the JSON `parseGrafanaAlertRule` accepts.
  readonly fetchRuleByUid: boolean;
  // Enumerate rules via `listRules()` for the RulePicker.
  readonly fetchRuleList: boolean;
  // Poll `fetchRuleState` for the GRAFANA-vs-ours comparison bar. Plugin
  // disables it (dev-only); when false, useLiveMode skips the rule-state poll.
  readonly grafanaStateOracle: boolean;
  // "What state was this rule in just before T?" — seeds the evaluator's
  // initialState to drop the phantom Pending at the window's left edge.
  readonly initialStateOracle: boolean;
  // "What transitions did this rule have in [fromMs, toMs]?" — drill-down's
  // GRAFANA bar, independent of this session's Live-polling history.
  readonly alertHistoryOracle: boolean;
  // Freeze a Live moment into a Mock fixture (demo's snapshot button).
  readonly snapshot: boolean;
};

// `startSec`/`endSec` are absolute Unix seconds; `datasourceUid` selects the
// proxy target in plugin and is ignored in demo.
export type SampleRequest = {
  readonly datasourceUid: string;
  readonly expr: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly stepSec: number;
};

// Mock-mode scenario. Lifted from demo's types to avoid a ui → demo edge.
export type Dataset = {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly source: string;
  readonly samples: ReadonlyArray<Sample>;
  // All series the query returned (capped at 10); `samples` mirrors the
  // selected one. Absent for single-series queries.
  readonly seriesList?: ReadonlyArray<MetricSeries>;
  readonly defaultAlertConfig: AlertConfig;
  // `rate(metric[Nm])` inner window (ms) for the chart's nested band.
  readonly rateInnerWindow?: number;
  // `lastEvaluation % evaluationInterval`; without it the evaluator anchors
  // to samples[0].t (off-grid by up to one interval).
  readonly evalGridOffsetMs?: number;
  // Wallclock the evaluator + chart extend through past the last sample, so
  // the drill view shows the post-data tail (e.g. a Resolved transition).
  readonly endTimeMs?: number;
  // Mirror of endTimeMs for the left edge.
  readonly startTimeMs?: number;
  // Drilled moment + which side gets the room: 'leading' shows what came
  // AFTER (🔔/⚠️/🌫️), 'trailing' shows what led up to it (🔕).
  readonly drillFocalMs?: number;
  readonly drillFocalSide?: 'leading' | 'trailing';
  // Drill-range state history from the annotations API, independent of this
  // session's Live-polling history.
  readonly grafanaHistory?: ReadonlyArray<{ readonly t: number; readonly state: GrafanaAlertState }>;
  readonly ruleMetadata?: RuleMetadata;
};

export interface WhatIfDataSource {
  readonly capabilities: WhatIfDataSourceCapabilities;

  // Required of every adapter. Returns one or more series (capped at 10);
  // empty array = honest no-data. WhatIfPage picks which series to evaluate.
  fetchSamples(req: SampleRequest): Promise<Result<ReadonlyArray<MetricSeries>, string>>;

  // Required when `capabilities.live` — useLiveMode needs it for phase
  // discovery + the GRAFANA-vs-ours bar.
  fetchRuleState?(ruleTitle: string): Promise<GrafanaRuleObservation>;

  // Required when `capabilities.fixtures`. Treated as immutable.
  listFixtures?(): ReadonlyArray<Dataset>;

  // Required when `capabilities.fetchRuleByUid`. Returns null on fetch error.
  fetchRuleByUid?(uid: string): Promise<unknown | null>;

  // Required when `capabilities.fetchRuleList`. Treated as immutable.
  listRules?(): Promise<Result<ReadonlyArray<RuleSummary>, string>>;

  // Required when `capabilities.initialStateOracle`. Ok('Normal') when
  // indeterminate; Err = transport failure (caller omits the hint).
  fetchInitialAlertState?(
    ruleTitle: string,
    atTimeMs: number,
  ): Promise<Result<'Normal' | 'Firing' | 'NoData', string>>;

  // Required when `capabilities.alertHistoryOracle`. Ascending time order;
  // Err = transport failure (caller falls back to Live-polling history).
  fetchAlertHistory?(
    ruleTitle: string,
    fromMs: number,
    toMs: number,
  ): Promise<Result<ReadonlyArray<{ readonly t: number; readonly state: GrafanaAlertState }>, string>>;
}
