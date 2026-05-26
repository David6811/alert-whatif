import { describe, expect, it } from 'vitest';
import type { Sample } from '../../../../data/types';
import type { InstantTickConfig } from '../types';
import { computeInstantTickValues } from './instant';

const cfg = (over: Partial<InstantTickConfig> = {}): InstantTickConfig => ({
  evaluationInterval: 1000,
  instant: true,
  ...over,
});

describe('computeInstantTickValues', () => {
  it('returns Data at each tick that has a sample with matching t', () => {
    // Tick grid (samples drive `scheduleTickTimes` start = samples[0].t,
    // step = evaluationInterval, stop = samples[last].t). Three samples
    // at every tick → three Data ticks.
    const samples: ReadonlyArray<Sample> = [
      { t: 1000, v: 1 },
      { t: 2000, v: 2 },
      { t: 3000, v: 3 },
    ];
    expect(computeInstantTickValues(samples, cfg())).toEqual([
      { kind: 'Data', t: 1000, v: 1 },
      { kind: 'Data', t: 2000, v: 2 },
      { kind: 'Data', t: 3000, v: 3 },
    ]);
  });

  it('returns NoData at ticks where no sample matches exactly', () => {
    // Samples at 1000 and 5000; ticks fire at every 1000ms from 1000..5000.
    // Ticks at 2000, 3000, 4000 have no matching sample → NoData (Prom
    // would also return no value at those instants, e.g. because
    // `rate(m[2m])` had an empty window).
    const samples: ReadonlyArray<Sample> = [
      { t: 1000, v: 10 },
      { t: 5000, v: 50 },
    ];
    expect(computeInstantTickValues(samples, cfg())).toEqual([
      { kind: 'Data', t: 1000, v: 10 },
      { kind: 'NoData', t: 2000 },
      { kind: 'NoData', t: 3000 },
      { kind: 'NoData', t: 4000 },
      { kind: 'Data', t: 5000, v: 50 },
    ]);
  });

  it('handles a single sample', () => {
    const samples: ReadonlyArray<Sample> = [{ t: 5000, v: 42 }];
    expect(computeInstantTickValues(samples, cfg())).toEqual([
      { kind: 'Data', t: 5000, v: 42 },
    ]);
  });

  it('honors endTime hint to extend ticks past the last sample, emitting NoData for the tail', () => {
    // Samples up to t=2000; endTime=5000 extends ticks to 3000, 4000, 5000.
    // None of those tick times have matching samples → NoData. Mirrors the
    // Live-mode case where Prom stops returning samples once the rate
    // window has gone empty.
    const samples: ReadonlyArray<Sample> = [
      { t: 1000, v: 10 },
      { t: 2000, v: 20 },
    ];
    expect(
      computeInstantTickValues(samples, cfg({ evaluationInterval: 1000 }), { endTime: 5000 }),
    ).toEqual([
      { kind: 'Data', t: 1000, v: 10 },
      { kind: 'Data', t: 2000, v: 20 },
      { kind: 'NoData', t: 3000 },
      { kind: 'NoData', t: 4000 },
      { kind: 'NoData', t: 5000 },
    ]);
  });

  it('respects evalGridOffsetMs phase-locking; ticks land on phase, samples must too', () => {
    // Phase-lock the tick grid at offset 500ms. With evalInterval=1000ms,
    // ticks fall at 1500, 2500, 3500. Samples here are also at those
    // phase-aligned times — match → all Data.
    const samples: ReadonlyArray<Sample> = [
      { t: 1500, v: 1.5 },
      { t: 2500, v: 2.5 },
      { t: 3500, v: 3.5 },
    ];
    expect(
      computeInstantTickValues(samples, cfg({ evaluationInterval: 1000 }), {
        evalGridOffsetMs: 500,
      }),
    ).toEqual([
      { kind: 'Data', t: 1500, v: 1.5 },
      { kind: 'Data', t: 2500, v: 2.5 },
      { kind: 'Data', t: 3500, v: 3.5 },
    ]);
  });

  // The pre-exact-t implementation used `lookbackDelta` to carry an older
  // sample forward; that misrepresented Grafana's instant query semantics
  // (verified empirically — Prom doesn't carry forward across the
  // `rate(m[2m])` boundary). The new algorithm has no such notion, so the
  // "ignores reducer" and "stale within lookback" tests from the old
  // suite are gone: the type system + exact-t lookup make both obsolete.
});
