// Pure transforms from Grafana HTTP-API response shapes into canonical types.
// Lives in core (not in either adapter, nor in `@alert-whatif/ui`) so the
// plugin and demo adapters share one implementation and one bug surface.
//
// Decoupling boundary:
//   - This module DOES NOT issue network calls. Adapters do `fetch()` or
//     `getBackendSrv().fetch()` themselves, then hand the parsed JSON
//     here for shape-translation.
//   - This module DOES NOT depend on any runtime (no rxjs, no Grafana
//     scenes, no React). It compiles into both Vite (demo) and Webpack
//     (plugin) bundles without a transport edge.
//
// Three endpoint families are covered, one section per family:
//   1. `/api/v1/rules` — list-all / find-one parsers.
//   2. `/api/annotations?type=alert` — `newState` label → state mappers.
//   3. `/api/v1/provisioning/alert-rules/{uid}` — legacy provisioning
//      shape → v0alpha1 JSON the canonical `parseGrafanaAlertRule`
//      consumes.

import type { Result } from '../data/types';
import type { GrafanaAlertState, GrafanaRuleObservation, RuleSummary } from './runtime-state';

// ────────────────────────────────────────────────────────────────────
// 1. Rules list — /api/v1/rules
// ────────────────────────────────────────────────────────────────────

// Subset of the Prometheus-compatible `/api/v1/rules` response — only the
// fields we read. Grafana sends more (labels, annotations, query, etc.)
// which we ignore here.
export type GrafanaRulesResponse = {
  readonly status: 'success' | 'error';
  readonly error?: string;
  readonly errorType?: string;
  readonly data?: {
    readonly groups: ReadonlyArray<{
      // `file` is the folder/namespace name. Surfaced as RuleSummary.folder
      // so the RulePicker can group entries.
      readonly file?: string;
      readonly rules: ReadonlyArray<{
        readonly name: string;
        readonly state: string;
        // The rule's stable UID. Optional in Grafana's response (paused
        // Grafana-managed rules + Prometheus federation rules may lack
        // one); we skip those entries since fetchRuleByUid can't load
        // them anyway.
        readonly uid?: string;
        // RFC 3339 timestamp of the most recent eval. Used to recover
        // Grafana's eval-grid offset (`lastEvaluationMs % intervalMs`)
        // so our tick scheduler aligns with Grafana's grid.
        readonly lastEvaluation?: string;
      }>;
    }>;
  };
};

// Walk every group and return RuleSummary entries. Skips rules without
// a top-level `uid` — paused Grafana-managed rules and Prometheus
// federation rules are the common cases that lack one; `fetchRuleByUid`
// can't load them anyway.
export function parseRulesListResponse(
  json: GrafanaRulesResponse,
): Result<ReadonlyArray<RuleSummary>, string> {
  if (json.status !== 'success' || !json.data) {
    return {
      kind: 'Err',
      errors: [
        `Grafana rules API returned status=${json.status}${
          json.error ? `: ${json.error}` : ''
        }`,
      ],
    };
  }
  const out: RuleSummary[] = [];
  for (const group of json.data.groups) {
    const folder = typeof group.file === 'string' ? group.file : undefined;
    for (const rule of group.rules) {
      const uid = rule.uid;
      if (typeof uid !== 'string' || uid === '') continue;
      out.push({
        uid,
        title: rule.name,
        ...(folder !== undefined ? { folder } : {}),
        state: normaliseRuleState(rule.state),
      });
    }
  }
  return { kind: 'Ok', value: out };
}

// Walk to the matching rule by title; return state + lastEvaluation.
// Never throws — network errors are the caller's problem. Returns the
// `unknown` sentinel when the title isn't found (rule deleted, typo,
// or not yet evaluated since startup).
export function parseRuleStateResponse(
  json: GrafanaRulesResponse,
  ruleTitle: string,
): GrafanaRuleObservation {
  if (json.status !== 'success' || !json.data) {
    return { state: 'unknown', lastEvaluationMs: null };
  }
  for (const group of json.data.groups) {
    for (const rule of group.rules) {
      if (rule.name === ruleTitle) {
        const lastMs = rule.lastEvaluation ? Date.parse(rule.lastEvaluation) : NaN;
        return {
          state: normaliseRuleState(rule.state),
          lastEvaluationMs: Number.isFinite(lastMs) ? lastMs : null,
        };
      }
    }
  }
  return { state: 'unknown', lastEvaluationMs: null };
}

// Map Grafana's runtime rule-state string ('inactive' / 'pending' /
// 'firing') to our narrow union. Anything else — empty,
// future-Grafana additions — collapses to `unknown` so the caller
// sees ambiguity rather than guessing.
export function normaliseRuleState(raw: string): GrafanaAlertState {
  const s = raw.toLowerCase();
  if (s === 'inactive' || s === 'pending' || s === 'firing') return s;
  return 'unknown';
}

// ────────────────────────────────────────────────────────────────────
// 2. Alert annotations — /api/annotations?type=alert
// ────────────────────────────────────────────────────────────────────

// Subset of `/api/annotations` response — only fields we read.
//
// `tags` is `alertname:<title>,severity:<v>,...` strings. We filter on it
// client-side because Grafana 12's `?tag=` / `?tags=` query params are
// silently ignored for alert annotations.
export type AlertAnnotation = {
  readonly newState: string;
  readonly prevState: string;
  readonly time: number;
  readonly tags?: ReadonlyArray<string>;
};

// Map Grafana's annotation `newState` (e.g. "Alerting", "Normal",
// "Pending", "NoData") onto CORE's 3-value initial-state vocabulary
// — Pending* collapses to Normal here because Pending is the
// for-gate's transient phase, not a stable state worth carrying
// across windows; the classifier re-derives it from samples if
// appropriate.
export function mapAnnotationToInitialState(
  label: string,
): 'Normal' | 'Firing' | 'NoData' {
  const s = label.toLowerCase();
  if (s.startsWith('alerting')) return 'Firing';
  if (s.startsWith('nodata') || s.includes('(nodata)')) return 'NoData';
  return 'Normal';
}

// Map Grafana's annotation `newState` onto the GRAFANA bar's 4-value
// state vocabulary. Unlike `mapAnnotationToInitialState`, Pending
// stays Pending here — the bar's job is to show the transition story
// faithfully (the bar IS the Pending phase a viewer wants to see).
export function mapAnnotationToBarState(label: string): GrafanaAlertState {
  const s = label.toLowerCase();
  if (s.startsWith('alerting')) return 'firing';
  if (s.startsWith('pending')) return 'pending';
  if (s.startsWith('normal') || s.startsWith('ok')) return 'inactive';
  return 'unknown';
}

// ────────────────────────────────────────────────────────────────────
// 3. Legacy provisioning rule — /api/v1/provisioning/alert-rules/{uid}
// ────────────────────────────────────────────────────────────────────

// Shape Grafana returns from the legacy provisioning endpoint. The
// v0alpha1 API would emit the canonical shape directly but it's 404
// in Grafana 12.4.2, so we hit the legacy endpoint and translate.
export type LegacyRule = {
  readonly uid: string;
  readonly title: string;
  readonly condition: string;
  readonly folderUID: string;
  readonly ruleGroup: string;
  readonly noDataState: string;
  readonly execErrState: string;
  readonly for: string;
  readonly keep_firing_for?: string;
  readonly isPaused?: boolean;
  // ISO-8601 timestamp of the rule's last creation / modification. Used
  // by the UI to mark OverviewStrip bells that pre-date the rule (Grafana
  // wasn't monitoring then → drilling into those bells will show an empty
  // grafana state bar by structural necessity, not bug).
  readonly updated?: string;
  readonly annotations?: Readonly<Record<string, string>>;
  readonly labels?: Readonly<Record<string, string>>;
  readonly data: ReadonlyArray<{
    readonly refId: string;
    readonly datasourceUid?: string;
    readonly relativeTimeRange?: { readonly from: number; readonly to: number };
    readonly model: Readonly<Record<string, unknown>>;
  }>;
};

// Companion shape for the rule's group — used only to recover the
// eval `interval` (which lives on the group, not the rule).
export type LegacyGroup = {
  readonly title: string;
  readonly folderUid: string;
  readonly interval: number;
};

// Translate a `LegacyRule` (+ its group's interval in seconds) into
// the v0alpha1 JSON shape `parseGrafanaAlertRule` expects:
// `apiVersion` / `kind` / `metadata` / `spec`. Pure — no I/O.
export function legacyRuleToV0Alpha1(rule: LegacyRule, intervalSec: number): unknown {
  const expressions: Record<string, unknown> = {};
  for (const item of rule.data) {
    const isExpressionNode = item.datasourceUid === '__expr__';
    expressions[item.refId] = {
      ...(item.datasourceUid !== undefined ? { datasourceUID: item.datasourceUid } : {}),
      ...(item.relativeTimeRange !== undefined && !isExpressionNode
        ? {
            relativeTimeRange: {
              // parseRule expects Go-style durations as strings (e.g.
              // "4m0s") for relativeTimeRange.from. Translate `<n>` to
              // `<n>s`.
              from: `${item.relativeTimeRange.from}s`,
              to: `${item.relativeTimeRange.to}s`,
            },
          }
        : {}),
      model: item.model,
      ...(isExpressionNode ? { queryType: 'expression' } : {}),
    };
  }

  return {
    apiVersion: 'rules.alerting.grafana.app/v0alpha1',
    kind: 'AlertRule',
    metadata: {
      name: rule.uid,
      labels: rule.labels ?? {},
      annotations: rule.annotations ?? {},
      ...(rule.updated !== undefined ? { updated: rule.updated } : {}),
    },
    spec: {
      title: rule.title,
      noDataState: rule.noDataState,
      execErrState: rule.execErrState,
      for: rule.for,
      ...(rule.keep_firing_for ? { keep_firing_for: rule.keep_firing_for } : {}),
      paused: rule.isPaused === true,
      trigger: { interval: `${intervalSec}s` },
      expressions,
      annotations: rule.annotations ?? {},
      labels: rule.labels ?? {},
    },
  };
}
