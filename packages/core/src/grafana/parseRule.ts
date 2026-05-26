// Adapter from a Grafana v0alpha1 alert rule JSON
// (`apiVersion: rules.alerting.grafana.app/v0alpha1`) into our internal `AlertConfig`.
// One-way: Grafana → us. Returns `Result<AlertConfig>` — never throws, accumulates
// every problem it found so the caller sees all errors at once.
//
// The Grafana rule's expression DAG is expected to be the canonical 3-node shape used
// by the demo fixtures:
//   A — datasource query (Prometheus etc.), carries relativeTimeRange / intervalMs /
//       maxDataPoints
//   B — reduce expression, carries reducer + NaN mode
//   C — threshold expression, carries the operator + cutoffs
//
// Rules with a different DAG (e.g. an `instant` query feeding directly into a
// threshold, no reduce) return Err — adapt the parser when those shapes need to be
// supported.
//
// Source citation: every field-mapping decision in this file is based on the
// Grafana evaluation spec at `docs/internals/grafana-evaluation-spec.md`.

import type {
  AlertConfig,
  ExecErrState,
  NanMode,
  NoDataState,
  ReducerKind,
  Result,
  Threshold,
} from '../data/types';

export function parseGrafanaAlertRule(rule: unknown): Result<AlertConfig> {
  if (!isObject(rule)) return err('rule is not an object');
  const spec = (rule as { spec?: unknown }).spec;
  if (!isObject(spec)) return err('rule.spec is missing or not an object');

  const errors: string[] = [];
  const push = (e: string) => errors.push(e);

  // Locate the three expression nodes.
  const exprs = (spec as { expressions?: unknown }).expressions;
  if (!isObject(exprs)) {
    return err('rule.spec.expressions is missing or not an object');
  }
  const exprValues = Object.values(exprs as Record<string, unknown>).filter(isObject);

  const queryNode = exprValues.find(isQueryNode);
  const reduceNode = exprValues.find(isReduceNode);
  const thresholdNode = exprValues.find(isThresholdNode);

  const instant =
    queryNode !== undefined &&
    isObject((queryNode as { model?: unknown }).model) &&
    (queryNode as { model: Record<string, unknown> }).model.instant === true;

  if (!queryNode) push('no query expression found (an expression with a real datasourceUID and relativeTimeRange)');
  // Instant queries have no reduce node by design (2-node DAG: query → threshold).
  if (!reduceNode && !instant) push('no reduce expression found (an expression with model.type === "reduce")');
  if (!thresholdNode) push('no threshold expression found (an expression with model.type === "threshold")');

  // From query node: windowDuration (range only — instant queries don't use
  // `relativeTimeRange.from`), intervalMs, maxDataPoints.
  let windowDuration = 0;
  let intervalMs = 1;
  let maxDataPoints = 1;
  if (queryNode) {
    if (!instant) {
      const rtr = (queryNode as { relativeTimeRange?: unknown }).relativeTimeRange;
      if (isObject(rtr) && typeof (rtr as { from?: unknown }).from === 'string') {
        const parsed = parseGoDuration((rtr as { from: string }).from);
        if (parsed.kind === 'Ok') windowDuration = parsed.value;
        else push(`relativeTimeRange.from: ${parsed.errors[0]}`);
      } else {
        push('query expression missing relativeTimeRange.from');
      }
    }
    const model = (queryNode as { model?: unknown }).model;
    if (isObject(model)) {
      const im = (model as { intervalMs?: unknown }).intervalMs;
      if (typeof im === 'number') intervalMs = im;
      else push('query model.intervalMs is missing or not a number');
      const mdp = (model as { maxDataPoints?: unknown }).maxDataPoints;
      if (typeof mdp === 'number') maxDataPoints = mdp;
      else push('query model.maxDataPoints is missing or not a number');
    } else {
      push('query expression missing model object');
    }
  }

  // From reduce node: reducer, nanMode. Instant queries skip the reduce node
  // entirely — reducer defaults to 'Last' (cosmetic; never consulted on the
  // instant path) and nanMode to 'None'.
  let reducer: ReducerKind = 'Last';
  let nanMode: NanMode = { kind: 'None' };
  if (!instant && reduceNode) {
    const model = (reduceNode as { model?: unknown }).model;
    if (isObject(model)) {
      const r = parseGrafanaReducer((model as { reducer?: unknown }).reducer);
      if (r.kind === 'Ok') reducer = r.value;
      else r.errors.forEach(push);
      const settings = (model as { settings?: unknown }).settings;
      const n = parseGrafanaNanMode(settings);
      if (n.kind === 'Ok') nanMode = n.value;
      else n.errors.forEach(push);
    } else {
      push('reduce expression missing model object');
    }
  }

  // From threshold node: threshold operator + values.
  let threshold: Threshold = { op: 'Gt', value: 0 };
  if (thresholdNode) {
    const model = (thresholdNode as { model?: unknown }).model;
    const conditions = isObject(model)
      ? (model as { conditions?: unknown }).conditions
      : undefined;
    const firstCond = Array.isArray(conditions) ? conditions[0] : undefined;
    if (!isObject(firstCond)) {
      push('threshold expression missing conditions[0]');
    } else {
      const t = parseGrafanaThreshold(firstCond);
      if (t.kind === 'Ok') threshold = t.value;
      else t.errors.forEach(push);
    }
  }

  // From spec: forDuration, keepFiringFor, evaluationInterval, noDataState, execErrState.
  const forDur = parseDurationField(spec, 'for', /* optional */ false, push);
  const keepFiringFor = parseDurationField(spec, 'keep_firing_for', /* optional */ true, push);
  const evaluationInterval = parseDurationField(
    isObject((spec as { trigger?: unknown }).trigger) ? (spec as { trigger: unknown }).trigger : {},
    'interval',
    /* optional */ false,
    (e) => push(`spec.trigger.${e}`),
  );

  const ndsResult = parseNoDataState((spec as { noDataState?: unknown }).noDataState);
  let noDataState: NoDataState = 'NoData';
  if (ndsResult.kind === 'Ok') noDataState = ndsResult.value;
  else ndsResult.errors.forEach(push);

  const eesResult = parseExecErrState((spec as { execErrState?: unknown }).execErrState);
  let execErrState: ExecErrState = 'Error';
  if (eesResult.kind === 'Ok') execErrState = eesResult.value;
  else eesResult.errors.forEach(push);

  if (errors.length > 0) return { kind: 'Err', errors };

  const common = {
    threshold,
    forDuration: forDur,
    keepFiringFor,
    evaluationInterval,
    intervalMs,
    maxDataPoints,
    noDataState,
    execErrState,
  };
  return {
    kind: 'Ok',
    value: instant
      ? { ...common, instant: true }
      : { ...common, instant: false, windowDuration, reducer, nanMode },
  };
}

// ─── Threshold operator mapping ────────────────────────────────────────────────

function parseGrafanaThreshold(condition: Record<string, unknown>): Result<Threshold> {
  const evaluator = condition.evaluator;
  if (!isObject(evaluator)) return err('condition.evaluator missing');
  const type = (evaluator as { type?: unknown }).type;
  const params = (evaluator as { params?: unknown }).params;
  if (typeof type !== 'string') return err('condition.evaluator.type missing');
  if (!Array.isArray(params)) return err('condition.evaluator.params missing or not an array');
  const num = (i: number): number | null =>
    typeof params[i] === 'number' && Number.isFinite(params[i] as number)
      ? (params[i] as number)
      : null;

  switch (type) {
    case 'gt': {
      const v = num(0);
      return v === null ? err('threshold params[0] missing') : ok({ op: 'Gt', value: v });
    }
    case 'lt': {
      const v = num(0);
      return v === null ? err('threshold params[0] missing') : ok({ op: 'Lt', value: v });
    }
    case 'gte': {
      const v = num(0);
      return v === null ? err('threshold params[0] missing') : ok({ op: 'GtEq', value: v });
    }
    case 'lte': {
      const v = num(0);
      return v === null ? err('threshold params[0] missing') : ok({ op: 'LtEq', value: v });
    }
    case 'eq': {
      const v = num(0);
      return v === null ? err('threshold params[0] missing') : ok({ op: 'Eq', value: v });
    }
    case 'ne': {
      const v = num(0);
      return v === null ? err('threshold params[0] missing') : ok({ op: 'Ne', value: v });
    }
    case 'within_range': {
      const l = num(0), r = num(1);
      return l === null || r === null
        ? err('threshold params[0..1] missing for within_range')
        : ok({ op: 'WithinRange', left: l, right: r });
    }
    case 'outside_range': {
      const l = num(0), r = num(1);
      return l === null || r === null
        ? err('threshold params[0..1] missing for outside_range')
        : ok({ op: 'OutsideRange', left: l, right: r });
    }
    case 'within_range_included': {
      const l = num(0), r = num(1);
      return l === null || r === null
        ? err('threshold params[0..1] missing for within_range_included')
        : ok({ op: 'WithinRangeIncluded', left: l, right: r });
    }
    case 'outside_range_included': {
      const l = num(0), r = num(1);
      return l === null || r === null
        ? err('threshold params[0..1] missing for outside_range_included')
        : ok({ op: 'OutsideRangeIncluded', left: l, right: r });
    }
    default:
      return err(`unsupported threshold op "${type}"`);
  }
}

// ─── Reducer + NaN-mode mapping ────────────────────────────────────────────────

function parseGrafanaReducer(s: unknown): Result<ReducerKind> {
  if (typeof s !== 'string') return err('reducer is missing or not a string');
  switch (s.toLowerCase()) {
    case 'last': return ok('Last');
    case 'min': return ok('Min');
    case 'max': return ok('Max');
    case 'sum': return ok('Sum');
    case 'mean':
    case 'avg':
      return ok('Mean');
    case 'count': return ok('Count');
    case 'median': return ok('Median');
    default: return err(`unsupported reducer "${s}"`);
  }
}

function parseGrafanaNanMode(settings: unknown): Result<NanMode> {
  // Per spec doc §8: when `settings.mode` is absent, no mapper is applied — NaN
  // propagates. Our equivalent is `{ kind: 'None' }`.
  if (!isObject(settings)) return ok({ kind: 'None' });
  const mode = (settings as { mode?: unknown }).mode;
  if (mode === undefined || mode === null) return ok({ kind: 'None' });
  if (typeof mode !== 'string') return err('reduce settings.mode is not a string');
  switch (mode) {
    case 'dropNN': return ok({ kind: 'DropNN' });
    case 'replaceNN': {
      const v = (settings as { replaceWithValue?: unknown }).replaceWithValue;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return err('replaceNN mode requires settings.replaceWithValue (finite number)');
      }
      return ok({ kind: 'ReplaceNN', replaceWithValue: v });
    }
    default:
      return err(`unsupported reduce settings.mode "${mode}"`);
  }
}

// ─── NoDataState + ExecErrState mapping ────────────────────────────────────────

function parseNoDataState(s: unknown): Result<NoDataState> {
  if (typeof s !== 'string') return err('noDataState is missing or not a string');
  switch (s.toLowerCase()) {
    case 'alerting': return ok('Alerting');
    case 'nodata': return ok('NoData');
    case 'ok':       return ok('Ok');
    case 'keeplast': return ok('KeepLast');
    default: return err(`unsupported noDataState "${s}"`);
  }
}

function parseExecErrState(s: unknown): Result<ExecErrState> {
  if (typeof s !== 'string') return err('execErrState is missing or not a string');
  switch (s.toLowerCase()) {
    case 'alerting': return ok('Alerting');
    case 'error':    return ok('Error');
    case 'ok':       return ok('Ok');
    case 'keeplast': return ok('KeepLast');
    default: return err(`unsupported execErrState "${s}"`);
  }
}

// ─── Duration parsing (Go time.Duration format) ────────────────────────────────

// Accepts the subset of Go's duration syntax that Grafana rules actually use:
// units are `ms` / `s` / `m` / `h`, optionally combined ("1h30m", "4m0s").
// Returns total milliseconds. Empty string → 0 (Grafana uses this for "unset"
// keep_firing_for).
export function parseGoDuration(s: string): Result<number> {
  if (s === '' || s === '0') return ok(0);
  const re = /(\d+)(ms|s|m|h)/g;
  let total = 0;
  let consumedTo = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    if (match.index !== consumedTo) {
      return err(`duration "${s}" has unexpected characters before "${match[0]}"`);
    }
    consumedTo = match.index + match[0].length;
    const n = parseInt(match[1]!, 10);
    const unit = match[2]!;
    const mul = unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000;
    total += n * mul;
  }
  if (consumedTo !== s.length) {
    return err(`duration "${s}" has trailing unparsed characters`);
  }
  if (total === 0 && !/^0+(ms|s|m|h)?$/.test(s)) {
    return err(`duration "${s}" did not match any unit pattern`);
  }
  return ok(total);
}

function parseDurationField(
  source: unknown,
  field: string,
  optional: boolean,
  push: (e: string) => void,
): number {
  if (!isObject(source)) {
    if (!optional) push(`${field} parent is not an object`);
    return 0;
  }
  const v = (source as Record<string, unknown>)[field];
  if (v === undefined || v === null) {
    if (!optional) push(`${field} is missing`);
    return 0;
  }
  if (typeof v !== 'string') {
    push(`${field} is not a string`);
    return 0;
  }
  const parsed = parseGoDuration(v);
  if (parsed.kind === 'Ok') return parsed.value;
  parsed.errors.forEach((e) => push(`${field}: ${e}`));
  return 0;
}

// ─── Discriminators for expression-DAG nodes ───────────────────────────────────

function isQueryNode(node: Record<string, unknown>): boolean {
  const datasource = node.datasourceUID;
  if (typeof datasource !== 'string') return false;
  // Grafana uses `__expr__` as the datasource UID for expression (reduce/threshold)
  // nodes; anything else is a real query.
  return datasource !== '__expr__';
}

function isReduceNode(node: Record<string, unknown>): boolean {
  const model = node.model;
  return isObject(model) && (model as { type?: unknown }).type === 'reduce';
}

function isThresholdNode(node: Record<string, unknown>): boolean {
  const model = node.model;
  return isObject(model) && (model as { type?: unknown }).type === 'threshold';
}

// ─── Result helpers ────────────────────────────────────────────────────────────

function ok<T>(value: T): Result<T> {
  return { kind: 'Ok', value };
}

function err<T>(message: string): Result<T> {
  return { kind: 'Err', errors: [message] };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
