import { describe, expect, it } from 'vitest';
import type { AlertConfig } from '../data/types';
import { planFetch } from './plan-fetch';

const rangeConfig: AlertConfig = {
  threshold: { op: 'Gt', value: 10 },
  forDuration: 0,
  keepFiringFor: 0,
  evaluationInterval: 60000,
  windowDuration: 120000,
  reducer: 'Mean',
  nanMode: { kind: 'DropNN' },
  noDataState: 'Ok',
  execErrState: 'Error',
  instant: false,
  intervalMs: 1000,
  maxDataPoints: 100,
};

const instantConfig: AlertConfig = {
  threshold: { op: 'Gt', value: 10 },
  forDuration: 0,
  keepFiringFor: 0,
  evaluationInterval: 60000,
  noDataState: 'Ok',
  execErrState: 'Error',
  instant: true,
  intervalMs: 1000,
  maxDataPoints: 100,
};

describe('planFetch', () => {
  it('lookback range, no warm-up: fetch window equals display window', () => {
    expect(
      planFetch({
        config: rangeConfig,
        range: { kind: 'lookback', nowSec: 1000, lookbackSec: 600 },
        stepSec: 15,
        warmup: false,
      }),
    ).toEqual({
      fetchStartSec: 400,
      fetchEndSec: 1000,
      stepSec: 15,
      startTimeMs: 400000,
      endTimeMs: 1000000,
    });
  });

  it('centered range, no warm-up: spans center ± radius', () => {
    expect(
      planFetch({
        config: rangeConfig,
        range: { kind: 'centered', centerSec: 1000, radiusSec: 900 },
        stepSec: 30,
        warmup: false,
      }),
    ).toEqual({
      fetchStartSec: 100,
      fetchEndSec: 1900,
      stepSec: 30,
      startTimeMs: 100000,
      endTimeMs: 1900000,
    });
  });

  it('warm-up pulls fetchStartSec back by ceil(windowDuration/1000) but leaves startTimeMs at the display edge', () => {
    expect(
      planFetch({
        config: rangeConfig,
        range: { kind: 'centered', centerSec: 1000, radiusSec: 900 },
        stepSec: 30,
        warmup: true,
      }),
    ).toEqual({
      fetchStartSec: 100 - 120,
      fetchEndSec: 1900,
      stepSec: 30,
      startTimeMs: 100000,
      endTimeMs: 1900000,
    });
  });

  it('warm-up rounds sub-second windowDuration up', () => {
    const plan = planFetch({
      config: { ...rangeConfig, windowDuration: 2500 },
      range: { kind: 'lookback', nowSec: 1000, lookbackSec: 600 },
      stepSec: 15,
      warmup: true,
    });
    expect(plan.fetchStartSec).toBe(400 - 3);
    expect(plan.startTimeMs).toBe(400000);
  });

  it('instant config has no warm-up even when requested', () => {
    const plan = planFetch({
      config: instantConfig,
      range: { kind: 'lookback', nowSec: 1000, lookbackSec: 600 },
      stepSec: 60,
      warmup: true,
    });
    expect(plan.fetchStartSec).toBe(400);
  });
});
