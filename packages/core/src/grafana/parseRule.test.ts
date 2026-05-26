import { describe, expect, it } from 'vitest';
import { parseGoDuration, parseGrafanaAlertRule } from './parseRule';
import type { AlertConfig, ReducerKind } from '../data/types';

// Fixed inputs (per user preference for test code: prefer fixed data).
const canonicalRule = {
  apiVersion: 'rules.alerting.grafana.app/v0alpha1',
  kind: 'AlertRule',
  metadata: { name: 'qrc-demo-range-max' },
  spec: {
    execErrState: 'Error',
    expressions: {
      A: {
        datasourceUID: 'grafanacloud-prom',
        model: {
          intervalMs: 15000,
          maxDataPoints: 43200,
          refId: 'A',
        },
        relativeTimeRange: { from: '4m0s', to: '0s' },
      },
      B: {
        model: {
          datasource: { type: '__expr__', uid: '__expr__' },
          expression: 'A',
          reducer: 'mean',
          refId: 'B',
          settings: { mode: 'dropNN' },
          type: 'reduce',
        },
        queryType: 'expression',
      },
      C: {
        model: {
          conditions: [
            {
              evaluator: { params: [0.05], type: 'gt' },
              operator: { type: 'and' },
              type: 'query',
            },
          ],
          datasource: { type: '__expr__', uid: '__expr__' },
          expression: 'B',
          refId: 'C',
          type: 'threshold',
        },
        queryType: 'expression',
        source: true,
      },
    },
    for: '2m',
    noDataState: 'OK',
    trigger: { interval: '1m' },
  },
};

const expectedConfig: AlertConfig = {
  threshold: { op: 'Gt', value: 0.05 },
  forDuration: 120_000,
  keepFiringFor: 0,
  evaluationInterval: 60_000,
  windowDuration: 240_000,
  intervalMs: 15000,
  maxDataPoints: 43200,
  reducer: 'Mean',
  nanMode: { kind: 'DropNN' },
  noDataState: 'Ok',
  execErrState: 'Error',
  instant: false,
};

describe('parseGoDuration', () => {
  it.each<[string, number]>([
    ['0', 0],
    ['', 0],
    ['1m', 60_000],
    ['2m', 120_000],
    ['1h', 3_600_000],
    ['15s', 15_000],
    ['500ms', 500],
    ['4m0s', 240_000],
    ['1h30m', 90 * 60_000],
    ['1h30m15s', 90 * 60_000 + 15_000],
  ])('parses "%s" → %i ms', (input, expected) => {
    const r = parseGoDuration(input);
    expect(r.kind).toBe('Ok');
    if (r.kind === 'Ok') expect(r.value).toBe(expected);
  });

  it.each<string>(['abc', '4minutes', '4m abc', '4 m'])('rejects garbage "%s"', (input) => {
    expect(parseGoDuration(input).kind).toBe('Err');
  });
});

describe('parseGrafanaAlertRule — canonical 3-node DAG', () => {
  it('produces the expected AlertConfig from the canonical rule', () => {
    const result = parseGrafanaAlertRule(canonicalRule);
    expect(result.kind).toBe('Ok');
    if (result.kind === 'Ok') expect(result.value).toEqual(expectedConfig);
  });

  it('maps spec.keep_firing_for when present', () => {
    const withKeepFiring = {
      ...canonicalRule,
      spec: { ...canonicalRule.spec, keep_firing_for: '3m' },
    };
    const r = parseGrafanaAlertRule(withKeepFiring);
    expect(r.kind).toBe('Ok');
    if (r.kind === 'Ok') expect(r.value.keepFiringFor).toBe(180_000);
  });

  it('defaults nanMode to None when reduce settings.mode is absent', () => {
    const noMode = JSON.parse(JSON.stringify(canonicalRule));
    delete noMode.spec.expressions.B.model.settings;
    const r = parseGrafanaAlertRule(noMode);
    expect(r.kind).toBe('Ok');
    if (r.kind === 'Ok' && !r.value.instant) expect(r.value.nanMode).toEqual({ kind: 'None' });
  });

  it('maps replaceNN mode with replaceWithValue', () => {
    const replaceMode = JSON.parse(JSON.stringify(canonicalRule));
    replaceMode.spec.expressions.B.model.settings = { mode: 'replaceNN', replaceWithValue: 0 };
    const r = parseGrafanaAlertRule(replaceMode);
    expect(r.kind).toBe('Ok');
    if (r.kind === 'Ok' && !r.value.instant) {
      expect(r.value.nanMode).toEqual({ kind: 'ReplaceNN', replaceWithValue: 0 });
    }
  });

  it('maps range thresholds (within_range_included)', () => {
    const rangeRule = JSON.parse(JSON.stringify(canonicalRule));
    rangeRule.spec.expressions.C.model.conditions[0].evaluator = {
      type: 'within_range_included',
      params: [10, 100],
    };
    const r = parseGrafanaAlertRule(rangeRule);
    expect(r.kind).toBe('Ok');
    if (r.kind === 'Ok') {
      expect(r.value.threshold).toEqual({ op: 'WithinRangeIncluded', left: 10, right: 100 });
    }
  });

  it.each<[string, ReducerKind]>([
    ['mean', 'Mean'],
    ['avg', 'Mean'],
    ['last', 'Last'],
    ['min', 'Min'],
    ['max', 'Max'],
    ['sum', 'Sum'],
    ['median', 'Median'],
    ['count', 'Count'],
  ])('maps reducer "%s" → %s', (name, expected) => {
    const r = JSON.parse(JSON.stringify(canonicalRule));
    r.spec.expressions.B.model.reducer = name;
    const out = parseGrafanaAlertRule(r);
    expect(out.kind).toBe('Ok');
    if (out.kind === 'Ok' && !out.value.instant) expect(out.value.reducer).toBe(expected);
  });
});

describe('parseGrafanaAlertRule — error accumulation', () => {
  it('returns Err when rule.spec is missing', () => {
    expect(parseGrafanaAlertRule({}).kind).toBe('Err');
  });

  it('returns Err when expressions object is missing', () => {
    expect(parseGrafanaAlertRule({ spec: {} }).kind).toBe('Err');
  });

  it('accumulates multiple errors in a single Err', () => {
    const broken = {
      spec: {
        expressions: {
          A: { datasourceUID: 'grafanacloud-prom', relativeTimeRange: { from: 'nonsense' }, model: {} },
          B: { model: { type: 'reduce' } },
          C: { model: { type: 'threshold', conditions: [{ evaluator: { type: 'unknown_op', params: [] } }] } },
        },
        // for: missing
        noDataState: 'OK',
        execErrState: 'Error',
        trigger: { interval: '1m' },
      },
    };
    const r = parseGrafanaAlertRule(broken);
    expect(r.kind).toBe('Err');
    if (r.kind === 'Err') {
      // At least the four errors we expect: duration parse, intervalMs missing, mdp missing,
      // reducer missing, threshold op unknown, for missing.
      expect(r.errors.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('rejects unsupported threshold op with a clear message', () => {
    const r = JSON.parse(JSON.stringify(canonicalRule));
    r.spec.expressions.C.model.conditions[0].evaluator.type = 'banana';
    const out = parseGrafanaAlertRule(r);
    expect(out.kind).toBe('Err');
    if (out.kind === 'Err') {
      expect(out.errors.some((e) => e.includes('banana'))).toBe(true);
    }
  });
});
