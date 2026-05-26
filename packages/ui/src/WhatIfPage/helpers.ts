import type { AlertConfig } from '@alert-whatif/core';
import type { ConfigOverrides } from './types';
import type { Dataset } from '../data/data-source';
import {
  DRILL_FOCAL_LEADING_OFFSET_MS,
  DRILL_FOCAL_TRAILING_OFFSET_MS,
} from './constants';

export function applyConfigOverrides(base: AlertConfig, overrides?: ConfigOverrides): AlertConfig {
  if (overrides === undefined) return base;
  return { ...base, ...overrides } as AlertConfig;
}

const PARAM_LABEL_BY_KEY: Record<string, string> = {
  forDuration: 'for',
  keepFiringFor: 'keepFiringFor',
  evaluationInterval: 'trigger.interval',
  intervalMs: 'intervalMs',
  maxDataPoints: 'maxDataPoints',
  windowDuration: 'relativeTimeRange.from',
  reducer: 'reducer',
  noDataState: 'noDataState',
  execErrState: 'execErrState',
};

export function changedParamLabels(cur: AlertConfig, base: AlertConfig | null): ReadonlySet<string> {
  const out = new Set<string>();
  if (base === null) return out;
  const c = cur as Record<string, unknown>;
  const b = base as Record<string, unknown>;
  for (const [key, label] of Object.entries(PARAM_LABEL_BY_KEY)) {
    if (c[key] !== b[key]) out.add(label);
  }
  if (JSON.stringify(c.nanMode) !== JSON.stringify(b.nanMode)) out.add('settings.mode');
  if (JSON.stringify(cur.threshold) !== JSON.stringify(base.threshold)) {
    out.add('conditions[0].evaluator.params');
    out.add('conditions[0].evaluator.params[0] (left)');
    out.add('conditions[0].evaluator.params[1] (right)');
  }
  return out;
}

export function mockRightAnchorT(dataset: Dataset): number | undefined {
  if (dataset.drillFocalMs !== undefined) {
    const offset =
      dataset.drillFocalSide === 'trailing'
        ? DRILL_FOCAL_TRAILING_OFFSET_MS
        : DRILL_FOCAL_LEADING_OFFSET_MS;
    return dataset.drillFocalMs + offset;
  }
  const last = dataset.samples[dataset.samples.length - 1];
  return last?.t;
}
