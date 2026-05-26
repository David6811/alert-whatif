import { describe, expect, it } from 'vitest';
import type { Sample } from '../../../data/types';
import { evaluateAtTicks } from './tick';

describe('evaluateAtTicks', () => {
  describe('opt-out cases', () => {
    it('maps each raw sample to a Data tick when evaluationInterval is 0', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 5 },
        { t: 2000, v: 10 },
        { t: 3000, v: 15 },
      ];
      // windowDuration is irrelevant in the opt-out path.
      expect(evaluateAtTicks(samples, { evaluationInterval: 0, windowDuration: 0, reducer: 'Mean', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 5 },
        { kind: 'Data', t: 2000, v: 10 },
        { kind: 'Data', t: 3000, v: 15 },
      ]);
    });

    it('maps each raw sample to a Data tick when evaluationInterval is negative', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 5 },
        { t: 2000, v: 10 },
      ];
      expect(evaluateAtTicks(samples, { evaluationInterval: -1, windowDuration: 0, reducer: 'Mean', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 5 },
        { kind: 'Data', t: 2000, v: 10 },
      ]);
    });

    it('returns empty array for empty samples regardless of interval', () => {
      expect(evaluateAtTicks([], { evaluationInterval: 1000, windowDuration: 1000, reducer: 'Mean', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([]);
      expect(evaluateAtTicks([], { evaluationInterval: 0, windowDuration: 0, reducer: 'Mean', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([]);
    });
  });

  describe('tiled windows (window = interval)', () => {
    it('produces one Data tick per interval, reducing the window ending at each tick', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 2 },
        { t: 2000, v: 4 },
        { t: 3000, v: 6 },
        { t: 4000, v: 8 },
        { t: 5000, v: 10 },
        { t: 6000, v: 12 },
      ];
      // Ticks at 1000, 4000 (anchored to samples[0].t, step=3000).
      // Closed window `[t-3000, t]`:
      //   t=1000: [-2000, 1000] → {v=2}, mean=2.
      //   t=4000: [1000, 4000]  → {v=2, v=4, v=6, v=8}, mean=5.
      expect(evaluateAtTicks(samples, { evaluationInterval: 3000, windowDuration: 3000, reducer: 'Mean', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 2 },
        { kind: 'Data', t: 4000, v: 5 },
      ]);
    });

    it('applies Max reducer correctly over each window', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 1 },
        { t: 2000, v: 9 },
        { t: 3000, v: 3 },
        { t: 4000, v: 7 },
        { t: 5000, v: 2 },
        { t: 6000, v: 5 },
      ];
      expect(evaluateAtTicks(samples, { evaluationInterval: 2000, windowDuration: 2000, reducer: 'Max', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 1 },
        { kind: 'Data', t: 3000, v: 9 },
        { kind: 'Data', t: 5000, v: 7 },
      ]);
    });

    it('applies Count reducer correctly', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 1 },
        { t: 2000, v: 1 },
        { t: 3000, v: 1 },
        { t: 4000, v: 1 },
      ];
      // Closed window `[t-2000, t]`:
      //   t=1000: [-1000, 1000] → {t=1000}. Count=1.
      //   t=3000: [1000, 3000]  → {t=1000, t=2000, t=3000}. Count=3.
      expect(evaluateAtTicks(samples, { evaluationInterval: 2000, windowDuration: 2000, reducer: 'Count', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 1 },
        { kind: 'Data', t: 3000, v: 3 },
      ]);
    });
  });

  describe('overlapping windows (window > interval)', () => {
    it('lets adjacent ticks see overlapping samples (Grafana 1m interval / 4m window pattern)', () => {
      // Samples every 1s for 6 seconds.
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 1 },
        { t: 2000, v: 2 },
        { t: 3000, v: 3 },
        { t: 4000, v: 4 },
        { t: 5000, v: 5 },
        { t: 6000, v: 6 },
      ];
      // interval = 2000, window = 4000. Ticks at 1000, 3000, 5000.
      // Closed window `[t-4000, t]`:
      //   Tick 1000: [-3000, 1000] → {v:1}. Mean = 1.
      //   Tick 3000: [-1000, 3000] → {v:1, v:2, v:3}. Mean = 2.
      //   Tick 5000: [1000, 5000]  → {v:1, v:2, v:3, v:4, v:5}. Mean = 3.
      // Tick 7000 > 6000, stop.
      expect(evaluateAtTicks(samples, { evaluationInterval: 2000, windowDuration: 4000, reducer: 'Mean', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 1 },
        { kind: 'Data', t: 3000, v: 2 },
        { kind: 'Data', t: 5000, v: 3 },
      ]);
    });

    it('emits NoData for ticks whose larger window still has no samples', () => {
      // Sparse samples — even a wide window may be empty between data clusters.
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 5 },
        { t: 20000, v: 5 },
      ];
      // interval = 5000, window = 5000. Ticks at 1000, 6000, 11000, 16000.
      // Closed window `[t-5000, t]`:
      //   Tick 1000:  [-4000, 1000]  → {v:5 at t=1000}. Data.
      //   Tick 6000:  [1000, 6000]   → {v:5 at t=1000} (boundary included). Data.
      //   Tick 11000: [6000, 11000]  → empty. NoData.
      //   Tick 16000: [11000, 16000] → empty. NoData.
      // Tick 21000 > 20000, stop.
      expect(evaluateAtTicks(samples, { evaluationInterval: 5000, windowDuration: 5000, reducer: 'Mean', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 5 },
        { kind: 'Data', t: 6000, v: 5 },
        { kind: 'NoData', t: 11000 },
        { kind: 'NoData', t: 16000 },
      ]);
    });
  });

  describe('empty windows', () => {
    it('emits a NoData tick for each empty window — does NOT apply noDataState policy here', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 5 },
        { t: 10000, v: 5 },
      ];
      // Closed window `[t-2000, t]`:
      //   t=1000: [-1000, 1000] → {v:5}. Data.
      //   t=3000: [1000, 3000]  → {v:5 at t=1000} (boundary). Data.
      //   t=5000..9000: empty windows. NoData.
      expect(evaluateAtTicks(samples, { evaluationInterval: 2000, windowDuration: 2000, reducer: 'Mean', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 5 },
        { kind: 'Data', t: 3000, v: 5 },
        { kind: 'NoData', t: 5000 },
        { kind: 'NoData', t: 7000 },
        { kind: 'NoData', t: 9000 },
      ]);
    });

    it('interleaves Data and NoData ticks for partial gaps', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 5 },
        { t: 2000, v: 7 },
        { t: 6000, v: 9 },
      ];
      // Closed window `[t-1000, t]` with Last reducer:
      //   t=1000: [0, 1000]    → {v:5}. Last=5.
      //   t=2000: [1000, 2000] → {v:5, v:7}. Last=7.
      //   t=3000: [2000, 3000] → {v:7 at t=2000} (boundary). Last=7.
      //   t=4000..5000: empty windows. NoData.
      //   t=6000: [5000, 6000] → {v:9}. Last=9.
      expect(evaluateAtTicks(samples, { evaluationInterval: 1000, windowDuration: 1000, reducer: 'Last', nanMode: { kind: 'DropNN' }, instant: false })).toEqual([
        { kind: 'Data', t: 1000, v: 5 },
        { kind: 'Data', t: 2000, v: 7 },
        { kind: 'Data', t: 3000, v: 7 },
        { kind: 'NoData', t: 4000 },
        { kind: 'NoData', t: 5000 },
        { kind: 'Data', t: 6000, v: 9 },
      ]);
    });
  });

  describe('endTime extension (Live mode "Grafana keeps evaluating after push stopped")', () => {
    it('emits additional ticks past the last sample when endTime > samples[-1].t', () => {
      // Samples end at t=3000. With endTime=6000 we expect ticks at 1000, 2000,
      // 3000, 4000, 5000, 6000.
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 5 },
        { t: 2000, v: 5 },
        { t: 3000, v: 5 },
      ];
      // Closed window `[t-1000, t]`:
      //   t=1000..3000: each window straddles one sample. Data.
      //   t=4000: [3000, 4000] → {v:5 at t=3000} (boundary inclusive). Data.
      //   t=5000: [4000, 5000] → empty. NoData.
      //   t=6000: [5000, 6000] → empty. NoData.
      expect(
        evaluateAtTicks(
          samples,
          { evaluationInterval: 1000, windowDuration: 1000, reducer: 'Last', nanMode: { kind: 'DropNN' }, instant: false },
          { endTime: 6000 },
        ),
      ).toEqual([
        { kind: 'Data', t: 1000, v: 5 },
        { kind: 'Data', t: 2000, v: 5 },
        { kind: 'Data', t: 3000, v: 5 },
        { kind: 'Data', t: 4000, v: 5 },
        { kind: 'NoData', t: 5000 },
        { kind: 'NoData', t: 6000 },
      ]);
    });

    it('ignores endTime when it is ≤ the last sample (sample-bound is more restrictive)', () => {
      // endTime=2000 is BEFORE samples[-1].t=3000, so the legacy "stop at last
      // sample" path wins — endTime can only EXTEND, never truncate.
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 5 },
        { t: 2000, v: 5 },
        { t: 3000, v: 5 },
      ];
      expect(
        evaluateAtTicks(
          samples,
          { evaluationInterval: 1000, windowDuration: 1000, reducer: 'Last', nanMode: { kind: 'DropNN' }, instant: false },
          { endTime: 2000 },
        ),
      ).toEqual([
        { kind: 'Data', t: 1000, v: 5 },
        { kind: 'Data', t: 2000, v: 5 },
        { kind: 'Data', t: 3000, v: 5 },
      ]);
    });

    it('snaps extended ticks to the eval grid when evalGridOffsetMs is set', () => {
      // evalGridOffsetMs=500 → ticks on the `:500ms` phase. Samples end at t=2500;
      // endTime=4500 extends three more grid-aligned ticks.
      const samples: ReadonlyArray<Sample> = [
        { t: 500, v: 1 },
        { t: 1500, v: 2 },
        { t: 2500, v: 3 },
      ];
      // Closed window `[t-1000, t]`:
      //   t=500:  [-500, 500]   → {v:1 at t=500}. Last=1.
      //   t=1500: [500, 1500]   → {v:1, v:2}. Last=2.
      //   t=2500: [1500, 2500]  → {v:2, v:3}. Last=3.
      //   t=3500: [2500, 3500]  → {v:3 at t=2500} (boundary). Last=3.
      //   t=4500: [3500, 4500]  → empty. NoData.
      expect(
        evaluateAtTicks(
          samples,
          { evaluationInterval: 1000, windowDuration: 1000, reducer: 'Last', nanMode: { kind: 'DropNN' }, instant: false },
          { evalGridOffsetMs: 500, endTime: 4500 },
        ),
      ).toEqual([
        { kind: 'Data', t: 500, v: 1 },
        { kind: 'Data', t: 1500, v: 2 },
        { kind: 'Data', t: 2500, v: 3 },
        { kind: 'Data', t: 3500, v: 3 },
        { kind: 'NoData', t: 4500 },
      ]);
    });
  });
});
