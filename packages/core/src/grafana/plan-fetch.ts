import type { AlertConfig } from '../data/types';

export type FetchRange =
  | { readonly kind: 'lookback'; readonly nowSec: number; readonly lookbackSec: number }
  | { readonly kind: 'centered'; readonly centerSec: number; readonly radiusSec: number };

export type PlanFetchInput = {
  readonly config: AlertConfig;
  readonly range: FetchRange;
  readonly stepSec: number;
  readonly warmup: boolean;
};

export type FetchPlan = {
  readonly fetchStartSec: number;
  readonly fetchEndSec: number;
  readonly stepSec: number;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
};

export function planFetch({ config, range, stepSec, warmup }: PlanFetchInput): FetchPlan {
  const { startSec, endSec } = resolveWindow(range);
  const warmupSec = warmup ? warmupSecFor(config) : 0;
  return {
    fetchStartSec: startSec - warmupSec,
    fetchEndSec: endSec,
    stepSec,
    startTimeMs: startSec * 1000,
    endTimeMs: endSec * 1000,
  };
}

function resolveWindow(range: FetchRange): { readonly startSec: number; readonly endSec: number } {
  switch (range.kind) {
    case 'lookback':
      return { startSec: range.nowSec - range.lookbackSec, endSec: range.nowSec };
    case 'centered':
      return {
        startSec: range.centerSec - range.radiusSec,
        endSec: range.centerSec + range.radiusSec,
      };
  }
}

function warmupSecFor(config: AlertConfig): number {
  return config.instant ? 0 : Math.ceil(config.windowDuration / 1000);
}
