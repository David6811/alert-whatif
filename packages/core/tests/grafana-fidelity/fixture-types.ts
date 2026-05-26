// Shape of a Grafana-fidelity fixture on disk + after assembly. Each fixture lives in
// its own sub-folder under `./fixtures/<name>/`:
//
//   alert.json    — VERBATIM Grafana v0alpha1 alert rule JSON (the source of truth)
//   samples.json  — `MetricSeries` shape: labels + samples, captured from a real run
//   expected.json — the observed Grafana lifecycle + the narrow assertions the test checks
//   fixture.json  — name, description, provenance, file pointers (this metadata file)
//
// `loadFixture` runs `parseGrafanaAlertRule` against `alert.json` to derive
// `alertConfig`. Authoring discipline: the rule JSON is the single source of truth for
// the rule's configuration — there is no separately-authored AlertConfig to drift out
// of sync. See `./README.md`.
//
// See `docs/04-grafana-fidelity.md` for the broader discipline: every fixture's
// `samples` and `expected` come from a real Grafana run — never authored, never
// extrapolated.

import type { AlertConfig, Duration, EvalEvent, MetricSeries } from '../../src/data/types';

// Where this fixture's data came from. Fields used to be all-required, but new
// fixtures (2026-05-14 onwards) capture additional context (rule UID, observed
// transitions, eval grid offset) that older fixtures didn't have. Optional fields
// are documented where they apply; the loader doesn't enforce field-level required-
// ness at runtime (only top-level keys), so older fixtures keep loading.
export type FixtureProvenance = {
  readonly sourceProject: string;
  readonly sourceReadme?: string;
  readonly scenarioId?: number;
  readonly scenarioName: string;
  readonly runDate: string;
  readonly runStartUtc?: string;
  readonly runStartEpochSec?: number;
  readonly samplesQuery: string;
  readonly samplesQueryStart: number;
  readonly samplesQueryEnd: number;
  readonly samplesQueryStepSec: number;
  readonly samplesCapturedVia: string;
  readonly expectedCapturedVia: string;
  readonly knownDivergencesNotAsserted: ReadonlyArray<string>;

  // Grafana eval-grid offset (ms past every `evaluationInterval` boundary at which
  // Grafana evaluates this rule). When present, the fidelity test passes it to
  // `evaluate()` as `EvaluatorHints.evalGridOffsetMs` and applies a tight
  // tolerance to the entry-time assertions. When absent (legacy fixtures), the
  // test falls back to ±60s tolerance and the evaluator uses sample-grid anchoring.
  // Compute from a captured `lastEvaluation` timestamp: ms % evaluationInterval.
  readonly evalGridOffsetMs?: Duration;
  // Optional new-style provenance fields (the 2026-05-14 fixture introduced these
  // for richer context — older fixtures don't have them).
  readonly ruleUid?: string;
  readonly ruleTitle?: string;
  readonly pushStartedAt?: string;
  readonly observedTransitions?: ReadonlyArray<{
    readonly at: string;
    readonly to: 'Pending' | 'Firing' | 'Normal' | 'NoData' | 'Recovering';
    readonly activeAt: string;
  }>;
};

// What the test should assert. Entry-time assertions tolerate Grafana's natural ±60s
// jitter (`trigger.interval=1m`). Anything documented as a "known divergence" in
// `provenance.knownDivergencesNotAsserted` is intentionally absent here.
export type FixtureAssertions = {
  readonly pendingEntryWithinMs: { readonly expected: number; readonly toleranceMs: number };
  readonly firingEntryWithinMs: { readonly expected: number; readonly toleranceMs: number };
  readonly firingEntryOffsetFromPending: { readonly expectedMs: number; readonly toleranceMs: number };
};

// `events` is the full observed Grafana lifecycle for documentation / regression context;
// `assertions` is the narrower subset the test actively checks today. The two are kept
// separate so future tightening (e.g. once keep_firing_for is modelled) lifts assertions
// onto events without re-recording.
export type FixtureExpected = {
  readonly events: ReadonlyArray<EvalEvent>;
  readonly assertions: FixtureAssertions;
};

// `fixture.json` shape — the metadata anchor for a fixture sub-folder.
export type FixtureMetaJson = {
  readonly name: string;
  readonly description: string;
  readonly files: {
    readonly alert: string;
    readonly samples: string;
    readonly expected: string;
  };
  readonly provenance: FixtureProvenance;
};

// Fully-assembled fixture as returned by `loadFixture`. `alertConfig` is derived from
// the rule JSON by `parseGrafanaAlertRule` at load time, not authored separately.
export type GrafanaFidelityFixture = {
  readonly name: string;
  readonly description: string;
  readonly provenance: FixtureProvenance;
  readonly alertConfig: AlertConfig;
  readonly series: MetricSeries;
  readonly expected: FixtureExpected;
};
