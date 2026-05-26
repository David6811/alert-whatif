import { describe, expect, it } from 'vitest';
import type { AlertConfig, MetricSeries, Result } from '../data/types';
import { evaluate } from './evaluate';

const labels: Readonly<Record<string, string>> = { __name__: 'cpu_usage', host: 'web-1' };

// Inline helper: unwrap Result<T>, asserting Ok. Lets each test body stay terse without
// losing the Result distinction at the call site.
function expectOk<T>(r: Result<T>): T {
  expect(r.kind).toBe('Ok');
  if (r.kind !== 'Ok') throw new Error(`expected Ok, got Err: ${JSON.stringify(r)}`);
  return r.value;
}


const config0: AlertConfig = {
  threshold: { op: 'Gt', value: 10 },
  forDuration: 0,
  keepFiringFor: 0,
  evaluationInterval: 0,
  windowDuration: 0,
  reducer: 'Last',
  nanMode: { kind: 'DropNN' },
  noDataState: 'Ok',
  execErrState: 'Error',
  instant: false,
  intervalMs: 1,
  maxDataPoints: Number.MAX_SAFE_INTEGER,
};

const config2: AlertConfig = {
  threshold: { op: 'Gt', value: 10 },
  forDuration: 2000,
  keepFiringFor: 0,
  evaluationInterval: 0,
  windowDuration: 0,
  reducer: 'Last',
  nanMode: { kind: 'DropNN' },
  noDataState: 'Ok',
  execErrState: 'Error',
  instant: false,
  intervalMs: 1,
  maxDataPoints: Number.MAX_SAFE_INTEGER,
};

const config5: AlertConfig = {
  threshold: { op: 'Gt', value: 10 },
  forDuration: 5000,
  keepFiringFor: 0,
  evaluationInterval: 0,
  windowDuration: 0,
  reducer: 'Last',
  nanMode: { kind: 'DropNN' },
  noDataState: 'Ok',
  execErrState: 'Error',
  instant: false,
  intervalMs: 1,
  maxDataPoints: Number.MAX_SAFE_INTEGER,
};

describe('evaluate', () => {
  describe('forDuration: 0, evaluationInterval: 0 (immediate firing, per-sample)', () => {
    it('emits no events when no sample crosses the threshold', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 1 },
          { t: 2000, v: 5 },
          { t: 3000, v: 9 },
        ],
      };
      expect(expectOk(evaluate(config0, series))).toMatchObject({ events: [] });
    });

    it('emits no events for an empty series', () => {
      const series: MetricSeries = { labels, samples: [] };
      expect(expectOk(evaluate(config0, series))).toMatchObject({ events: [] });
    });

    it('emits a single open Firing event when samples stay above threshold to end of series', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 15 },
          { t: 2000, v: 20 },
          { t: 3000, v: 25 },
        ],
      };
      expect(expectOk(evaluate(config0, series))).toMatchObject({
        events: [{ kind: 'Firing', from: 1000, until: 3000 }],
      });
    });

    // Grafana boundary convention: when a lifecycle resolves, the Firing
    // event's `until` is at the same instant as the Resolved event's `at`
    // — there is NO 1-eval-interval gap between them. Recorded in
    // packages/core/tests/grafana-fidelity/fixtures/.../expected.json,
    // verified live by hand-crafted series here so the boundary is
    // pinned even when no real-Grafana fixture covers a given config.
    it('Firing.until === Resolved.at (no gap between firing-end and resolved)', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 15 }, // firing
          { t: 2000, v: 20 }, // firing
          { t: 3000, v: 25 }, // firing
          { t: 4000, v: 1 },  // normal — resolves
        ],
      };
      const result = expectOk(evaluate(config0, series));
      const firing = result.events.find((e) => e.kind === 'Firing');
      const resolved = result.events.find((e) => e.kind === 'Resolved');
      expect(firing).toBeDefined();
      expect(resolved).toBeDefined();
      if (!firing || firing.kind !== 'Firing' || !resolved || resolved.kind !== 'Resolved') return;
      expect(firing.until).toBe(resolved.at);
    });

    // Open-lifecycle boundary: when the series ends mid-Firing (no Resolved
    // emitted), the Firing event's `until` extends one `evaluationInterval`
    // past the last firing tick. This guarantees the current tick falls
    // INSIDE the half-open [from, until) interval, so consumers checking
    // `tick.t < event.until` correctly identify the alert as still active
    // at the latest tick — matching the visible state-bar rect's right edge
    // and Grafana's "still active" reporting on open alerts.
    //
    // Without this extension, `tick.t === event.until` at the current tick
    // and strict-less-than excludes it: the chip would report "Normal"
    // while the state bar paints the event color, a visible divergence.
    it('open Firing extends until by evaluationInterval (current tick falls inside the interval)', () => {
      const config: AlertConfig = {
        threshold: { op: 'Gt', value: 10 },
        forDuration: 0,
        keepFiringFor: 0,
        evaluationInterval: 1000,
        windowDuration: 1000,
        reducer: 'Last',
        nanMode: { kind: 'DropNN' },
        noDataState: 'Ok',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      };
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 15 }, // firing
          { t: 2000, v: 20 }, // firing
          { t: 3000, v: 25 }, // firing, series ends mid-fire (no resolution)
        ],
      };
      const result = expectOk(evaluate(config, series));
      const firing = result.events.find((e) => e.kind === 'Firing');
      expect(firing).toBeDefined();
      if (!firing || firing.kind !== 'Firing') return;
      // until extended past last firing tick (3000) by evalInterval (1000) → 4000.
      expect(firing.until).toBe(4000);
      // No Resolved emitted — lifecycle is open.
      expect(result.events.find((e) => e.kind === 'Resolved')).toBeUndefined();
      // The current tick (3000) is strictly less than until (4000), so a
      // [from, until) check at the current tick finds the Firing event.
      const currentTick = 3000;
      expect(currentTick >= firing.from && currentTick < firing.until).toBe(true);
    });

    it('emits Firing + Resolved when the series crosses up then back down', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 5 },
          { t: 2000, v: 20 },
          { t: 3000, v: 18 },
          { t: 4000, v: 3 },
          { t: 5000, v: 1 },
        ],
      };
      expect(expectOk(evaluate(config0, series))).toMatchObject({
        events: [
          { kind: 'Firing', from: 2000, until: 4000 },
          { kind: 'Resolved', at: 4000 },
        ],
      });
    });

    it('emits multiple fire/resolve cycles when the series flaps', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 15 },
          { t: 2000, v: 5 },
          { t: 3000, v: 20 },
          { t: 4000, v: 1 },
        ],
      };
      expect(expectOk(evaluate(config0, series))).toMatchObject({
        events: [
          { kind: 'Firing', from: 1000, until: 2000 },
          { kind: 'Resolved', at: 2000 },
          { kind: 'Firing', from: 3000, until: 4000 },
          { kind: 'Resolved', at: 4000 },
        ],
      });
    });

    it('treats threshold-equal samples as not firing under Gt', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 10 },
          { t: 2000, v: 10 },
        ],
      };
      expect(expectOk(evaluate(config0, series))).toMatchObject({ events: [] });
    });
  });

  describe('forDuration > 0, evaluationInterval: 0 (pending phase gates firing)', () => {
    it('emits Pending + Firing + Resolved when the episode lasts at least forDuration', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 5 },
          { t: 2000, v: 15 },
          { t: 3000, v: 16 },
          { t: 4000, v: 17 },
          { t: 5000, v: 18 },
          { t: 6000, v: 19 },
          { t: 7000, v: 20 },
          { t: 8000, v: 21 },
          { t: 9000, v: 1 },
        ],
      };
      expect(expectOk(evaluate(config2, series))).toMatchObject({
        events: [
          { kind: 'Pending', from: 2000, until: 4000 },
          { kind: 'Firing', from: 4000, until: 9000 },
          { kind: 'Resolved', at: 9000 },
        ],
      });
    });

    it('emits Pending + Resolved (cancelled, no Firing) when episode is shorter than forDuration', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 5 },
          { t: 2000, v: 15 },
          { t: 3000, v: 18 },
          { t: 4000, v: 3 },
        ],
      };
      // Cancelled Pending: the underlying Firing episode now extends to the
      // Normal tick (4000) per the Firing.until == Resolved.at convention, so
      // lifecycleLastUntil = 4000 → Pending.until = 4000 as well.
      expect(expectOk(evaluate(config5, series))).toMatchObject({
        events: [
          { kind: 'Pending', from: 2000, until: 4000 },
          { kind: 'Resolved', at: 4000 },
        ],
      });
    });

    it('emits Pending only when the episode is shorter than forDuration AND still open at end', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 5 },
          { t: 2000, v: 15 },
          { t: 3000, v: 18 },
        ],
      };
      expect(expectOk(evaluate(config5, series))).toMatchObject({
        events: [{ kind: 'Pending', from: 2000, until: 3000 }],
      });
    });

    it('emits Pending + Firing (no Resolved) when episode reaches firing but stays open at end', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 5 },
          { t: 2000, v: 15 },
          { t: 3000, v: 16 },
          { t: 4000, v: 17 },
          { t: 5000, v: 18 },
        ],
      };
      expect(expectOk(evaluate(config2, series))).toMatchObject({
        events: [
          { kind: 'Pending', from: 2000, until: 4000 },
          { kind: 'Firing', from: 4000, until: 5000 },
        ],
      });
    });

    it('emits the same Pending + Firing split for each episode when the series flaps', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 15 },
          { t: 2000, v: 16 },
          { t: 3000, v: 17 },
          { t: 4000, v: 1 },
          { t: 5000, v: 15 },
          { t: 6000, v: 16 },
          { t: 7000, v: 17 },
          { t: 8000, v: 1 },
        ],
      };
      expect(expectOk(evaluate(config2, series))).toMatchObject({
        events: [
          { kind: 'Pending', from: 1000, until: 3000 },
          { kind: 'Firing', from: 3000, until: 4000 },
          { kind: 'Resolved', at: 4000 },
          { kind: 'Pending', from: 5000, until: 7000 },
          { kind: 'Firing', from: 7000, until: 8000 },
          { kind: 'Resolved', at: 8000 },
        ],
      });
    });

    it('handles the boundary case where episode width exactly equals forDuration', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 5 },
          { t: 2000, v: 15 },
          { t: 3000, v: 16 },
          { t: 4000, v: 17 },
          { t: 5000, v: 1 },
        ],
      };
      expect(expectOk(evaluate(config2, series))).toMatchObject({
        events: [
          { kind: 'Pending', from: 2000, until: 4000 },
          { kind: 'Firing', from: 4000, until: 5000 },
          { kind: 'Resolved', at: 5000 },
        ],
      });
    });
  });

  describe('initialState hint (continuation of pre-window state)', () => {
    it('default Normal: first above-threshold sample triggers Pending → Firing (legacy behaviour)', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 20 },
          { t: 2000, v: 21 },
          { t: 3000, v: 22 },
          { t: 4000, v: 23 },
        ],
      };
      expect(expectOk(evaluate(config2, series))).toMatchObject({
        events: [
          { kind: 'Pending', from: 1000, until: 3000 },
          { kind: 'Firing', from: 3000 },
        ],
      });
    });

    it("initialState='Firing': same samples emit ONLY Firing, no phantom Pending at window start", () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 20 },
          { t: 2000, v: 21 },
          { t: 3000, v: 22 },
          { t: 4000, v: 23 },
        ],
      };
      expect(expectOk(evaluate(config2, series, { initialState: 'Firing' }))).toMatchObject({
        events: [{ kind: 'Firing', from: 1000 }],
      });
    });

    it("initialState='Firing' + drop to Normal: emits Resolved at the transition, no leading Pending", () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 20 },
          { t: 2000, v: 21 },
          { t: 3000, v: 1 },
          { t: 4000, v: 1 },
        ],
      };
      expect(expectOk(evaluate(config2, series, { initialState: 'Firing' }))).toMatchObject({
        events: [
          { kind: 'Firing', from: 1000, until: 3000 },
          { kind: 'Resolved', at: 3000 },
        ],
      });
    });
  });

  describe('evaluationInterval > 0 (windowed reduce)', () => {
    it('smooths a noisy series with Mean — single spike does not trigger when window mean is below threshold', () => {
      const config: AlertConfig = {
        threshold: { op: 'Gt', value: 10 },
        forDuration: 0,
        keepFiringFor: 0,
        evaluationInterval: 3000,
        windowDuration: 3000,
        reducer: 'Mean',
        nanMode: { kind: 'DropNN' },
        noDataState: 'Ok',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      };
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 1 },
          { t: 2000, v: 1 },
          { t: 3000, v: 1 },
          { t: 4000, v: 30 },
          { t: 5000, v: 1 },
          { t: 6000, v: 1 },
        ],
      };
      const result = expectOk(evaluate(config, series));
      // Closed window `[t-3000, t]`, Mean reducer, threshold Gt 10:
      //   Tick 1000: [-2000, 1000] → {v=1}. Mean=1. fail.
      //   Tick 4000: [1000, 4000]  → {1, 1, 1, 30}. Mean=8.25. fail.
      // The spike at 4000 is averaged against three preceding low samples (the
      // closed-left boundary includes t=1000), so Mean stays under threshold.
      // No Firing event — exactly the smoothing behaviour the test name
      // promised.
      expect(result.events).toEqual([]);
    });

    it('Max reducer keeps any-spike-fires semantics — single spike triggers fire', () => {
      const config: AlertConfig = {
        threshold: { op: 'Gt', value: 10 },
        forDuration: 0,
        keepFiringFor: 0,
        evaluationInterval: 3000,
        windowDuration: 3000,
        reducer: 'Max',
        nanMode: { kind: 'DropNN' },
        noDataState: 'Ok',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      };
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 1 },
          { t: 2000, v: 1 },
          { t: 3000, v: 1 },
          { t: 4000, v: 30 },
          { t: 5000, v: 1 },
          { t: 6000, v: 1 },
        ],
      };
      expect(expectOk(evaluate(config, series))).toMatchObject({
        events: [{ kind: 'Firing', from: 4000, until: 7000 }],
      });
    });

    it('different reducer choices on the same series produce different fire counts', () => {
      const baseSeries: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 1 },
          { t: 2000, v: 100 },
          { t: 3000, v: 1 },
          { t: 4000, v: 1 },
          { t: 5000, v: 100 },
          { t: 6000, v: 1 },
        ],
      };
      const withReducer = (reducer: 'Mean' | 'Max'): AlertConfig => ({
        threshold: { op: 'Gt', value: 50 },
        forDuration: 0,
        keepFiringFor: 0,
        evaluationInterval: 2000,
        windowDuration: 2000,
        reducer,
        nanMode: { kind: 'DropNN' },
        noDataState: 'Ok',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      });
      const meanResult = expectOk(evaluate(withReducer('Mean'), baseSeries));
      const maxResult = expectOk(evaluate(withReducer('Max'), baseSeries));
      // Closed window `[t-2000, t]`, threshold Gt 50:
      //   Tick 1000: [-1000, 1000] → {1}.            Mean=1,     Max=1.   both fail
      //   Tick 3000: [1000, 3000]  → {1, 100, 1}.    Mean=34,    Max=100. Mean fails, Max PASS
      //   Tick 5000: [3000, 5000]  → {1, 1, 100}.    Mean=34,    Max=100. Mean fails, Max PASS
      // Mean never crosses 50 because the closed-left boundary always pulls a
      // low neighbour into the window. Max stays sensitive to the spike. This
      // is exactly the divergence the test name promises — half-open behaviour
      // had them coincidentally aligned, closed window separates them.
      expect(meanResult).toMatchObject({ events: [] });
      expect(maxResult).toMatchObject({
        events: [{ kind: 'Firing', from: 3000, until: 7000 }],
      });
    });

    it('forDuration interacts with evaluationInterval — pending phase counted in tick time', () => {
      const config: AlertConfig = {
        threshold: { op: 'Gt', value: 10 },
        forDuration: 2000,
        keepFiringFor: 0,
        evaluationInterval: 1000,
        windowDuration: 1000,
        reducer: 'Last',
        nanMode: { kind: 'DropNN' },
        noDataState: 'Ok',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      };
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 5 },
          { t: 2000, v: 15 },
          { t: 3000, v: 15 },
          { t: 4000, v: 15 },
          { t: 5000, v: 15 },
          { t: 6000, v: 1 },
        ],
      };
      expect(expectOk(evaluate(config, series))).toMatchObject({
        events: [
          { kind: 'Pending', from: 2000, until: 4000 },
          { kind: 'Firing', from: 4000, until: 6000 },
          { kind: 'Resolved', at: 6000 },
        ],
      });
    });
  });

  describe('noDataState (empty-window handling)', () => {
    // A series with two data clusters and a long gap.
    // Cluster 1: t=1000 (low). Cluster 2: t=11000 (low). Empty windows in between.
    const seriesWithGap: MetricSeries = {
      labels,
      samples: [
        { t: 1000, v: 1 },
        { t: 11000, v: 1 },
      ],
    };

    const baseGapConfig = {
      threshold: { op: 'Gt' as const, value: 10 },
      forDuration: 0,
      keepFiringFor: 0,
      evaluationInterval: 2000,
      windowDuration: 2000,
      reducer: 'Mean' as const,
      nanMode: { kind: 'DropNN' } as const,
      execErrState: 'Error' as const,
      intervalMs: 1,
      maxDataPoints: Number.MAX_SAFE_INTEGER,
      instant: false as const,
    };

    it('Alerting causes empty-window ticks to fire — gap becomes a Firing episode', () => {
      const config: AlertConfig = { ...baseGapConfig, noDataState: 'Alerting' };
      // Closed window `[t-2000, t]`. Ticks at 1000, 3000, 5000, 7000, 9000, 11000:
      //   t=1000:  [-1000, 1000]  → {v:1 at 1000}.   Normal (Mean=1 < 10).
      //   t=3000:  [1000, 3000]   → {v:1 at 1000}.   Normal (boundary sample).
      //   t=5000:  [3000, 5000]   → empty. NoData → Alerting policy → Firing.
      //   t=7000:  [5000, 7000]   → empty. Firing.
      //   t=9000:  [7000, 9000]   → empty. Firing.
      //   t=11000: [9000, 11000]  → {v:1 at 11000}.  Normal — resolves.
      // Episode 5000–9000 (closed window pulls the t=1000 sample into the 3000
      // window, so that tick is Normal not NoData/Firing). Firing.until
      // extends to the Normal tick (11000) per PR #70.
      expect(expectOk(evaluate(config, seriesWithGap))).toMatchObject({
        events: [
          { kind: 'Firing', from: 5000, until: 11000 },
          { kind: 'Resolved', at: 11000 },
        ],
      });
    });

    it('Ok causes empty-window ticks to NOT fire — gap produces no events', () => {
      const config: AlertConfig = { ...baseGapConfig, noDataState: 'Ok' };
      // Empty windows → -Infinity (does not fire under Gt 10). All ticks are not-firing.
      expect(expectOk(evaluate(config, seriesWithGap))).toMatchObject({ events: [] });
    });

    it('NoData emits a distinct NoData event over the gap, resolved when data returns', () => {
      const config: AlertConfig = { ...baseGapConfig, noDataState: 'NoData' };
      // Closed window `[t-2000, t]`:
      //   t=1000  Data v=1 (Normal).
      //   t=3000  Data v=1 (sample at t=1000 is on the closed-left boundary).
      //   t=5000..9000  empty → NoData → 'NoData' policy classifies as NoData.
      //   t=11000 Data v=1 (Normal) → resolves.
      // NoData episode spans 5000–9000, resolved at 11000. NoData.until is the
      // last NoData tick (no closed-Firing-style extension applies to NoData).
      expect(expectOk(evaluate(config, seriesWithGap))).toMatchObject({
        events: [
          { kind: 'NoData', from: 5000, until: 9000 },
          { kind: 'Resolved', at: 11000 },
        ],
      });
    });

    it('KeepLast preserves prior Firing state through the gap — Firing episode extends across NoData ticks', () => {
      const config: AlertConfig = { ...baseGapConfig, noDataState: 'KeepLast' };
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 100 },
          { t: 11000, v: 1 },
        ],
      };
      // Tick 1000 fires (v=100). Ticks 3000-9000 NoData ticks → KeepLast keeps Firing.
      // Tick 11000 has data v=1 → classified Normal → resolves the Firing episode.
      // The Firing episode covers t=1000..9000 (last tick classified Firing).
      expect(expectOk(evaluate(config, series))).toMatchObject({
        events: [
          { kind: 'Firing', from: 1000, until: 11000 },
          { kind: 'Resolved', at: 11000 },
        ],
      });
    });

    it('KeepLast with prior Normal state keeps Normal through the gap — no events for the gap', () => {
      const config: AlertConfig = { ...baseGapConfig, noDataState: 'KeepLast' };
      // Both data samples below threshold → Normal. Gap inherits Normal → still no events.
      expect(expectOk(evaluate(config, seriesWithGap))).toMatchObject({ events: [] });
    });

    it('Firing → NoData (KeepLast cannot bridge across modes) emits separate episodes with no Resolved between', () => {
      // Demonstrates the Firing ↔ NoData state-change case: closing the Firing episode without
      // emitting Resolved (because the alert didn't resolve — it just lost data).
      const config: AlertConfig = { ...baseGapConfig, noDataState: 'NoData' };
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 100 },
          { t: 11000, v: 1 },
        ],
      };
      // Closed window `[t-2000, t]`:
      //   t=1000  Data v=100 → Firing (Mean=100 > 10).
      //   t=3000  Data v=100 (closed-left includes t=1000) → Firing.
      //   t=5000..9000  empty → NoData (state-change, no Resolved between).
      //   t=11000 Data v=1 → Normal → resolves the NoData episode.
      // Firing episode 1000–3000. NoData episode 5000–9000. Resolved at 11000.
      expect(expectOk(evaluate(config, series))).toMatchObject({
        events: [
          { kind: 'Firing', from: 1000, until: 3000 },
          { kind: 'NoData', from: 5000, until: 9000 },
          { kind: 'Resolved', at: 11000 },
        ],
      });
    });

    it('Alerting under Lt operator — empty windows still classify as Firing regardless of operator', () => {
      const config: AlertConfig = {
        threshold: { op: 'Lt', value: 10 },
        forDuration: 0,
        keepFiringFor: 0,
        evaluationInterval: 2000,
        windowDuration: 2000,
        reducer: 'Mean',
        nanMode: { kind: 'DropNN' },
        noDataState: 'Alerting',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      };
      // Both data samples have v=1 (< 10, so fire). NoData ticks classified Firing under Alerting.
      // Result: continuous firing across all ticks, no resolution observed.
      expect(expectOk(evaluate(config, seriesWithGap))).toMatchObject({
        events: [{ kind: 'Firing', from: 1000, until: 13000 }],
      });
    });

    // Grafana spec §4: `Alerting` mode delegates to `resultAlerting` with `StateReason="NoData"`,
    // which goes through the full For-gate. A NoData run under `noDataState: Alerting` should sit
    // in Pending for the For-window before promoting to Firing. Spec doc §10 originally listed
    // this as a "For-gate bypass" gap; these tests verify the gate is actually applied (by
    // emit.ts's episode→event translation) and lock down the behaviour.
    describe('Alerting + forDuration > 0 (For-gate applies to NoData-induced Firing)', () => {
      const longGap: MetricSeries = {
        labels,
        samples: [
          { t: 0, v: 5 },
          { t: 6000, v: 5 },
        ],
      };
      const baseLongGapConfig: AlertConfig = {
        threshold: { op: 'Gt', value: 10 },
        forDuration: 2000,
        keepFiringFor: 0,
        evaluationInterval: 1000,
        windowDuration: 1000,
        reducer: 'Mean',
        nanMode: { kind: 'DropNN' },
        noDataState: 'Alerting',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      };

      it('long gap → Pending for the for-window, then Firing through the rest of the gap, resolved on data return', () => {
        // Closed window `[t-1000, t]`. Ticks at 0..6000:
        //   0:    {v:5 at 0} → Normal.
        //   1000: {v:5 at 0} (closed-left boundary) → Normal.
        //   2000-5000: empty → NoData → classified Firing under Alerting.
        //   6000: {v:5 at 6000} → Normal (resolves).
        // Firing episode 2000–5000 (closed window pulls the t=0 sample into
        // the 1000-window, so that tick is Normal not NoData). For-gate fires
        // at lifecycleStart+For = 2000+2000=4000.
        expect(expectOk(evaluate(baseLongGapConfig, longGap))).toMatchObject({
          events: [
            { kind: 'Pending', from: 2000, until: 4000 },
            { kind: 'Firing', from: 4000, until: 6000 },
            { kind: 'Resolved', at: 6000 },
          ],
        });
      });

      it('short gap (less than for-window) → no non-Normal ticks under closed window', () => {
        const shortGap: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 5 },
            { t: 2000, v: 5 }, // gap of only 1 NoData tick at t=1000
          ],
        };
        // Closed window `[t-1000, t]`. Ticks at 0, 1000, 2000:
        //   0:    {v:5 at 0}.    Normal.
        //   1000: {v:5 at 0}.    Normal (closed-left boundary catches t=0).
        //   2000: {v:5 at 2000}. Normal.
        // No non-Normal ticks → no episode, no Pending hop, no events.
        // The half-open-window version of this test triggered a brief NoData at
        // t=1000 that opened a (cancelled) Pending; closed-window bridges that
        // gap completely.
        expect(expectOk(evaluate(baseLongGapConfig, shortGap))).toMatchObject({
          events: [],
        });
      });

      it('data Firing → NoData under Alerting → continues the Pending → Firing as one episode', () => {
        // Series: data Firing at t=0, then NoData, then more data Firing at t=4000.
        const continuous: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 15 },
            { t: 4000, v: 15 }, // window (3000, 4000] catches this
          ],
        };
        // Ticks at 0, 1000, 2000, 3000, 4000.
        // 0:    Data v=15 (Gt 10) → Firing (episode opens)
        // 1000: NoData → Firing (Alerting, episode extends)
        // 2000: NoData → Firing
        // 3000: NoData → Firing
        // 4000: Data v=15 → Firing (extends to t=4000)
        // For-gate: firingFrom = 0+2000 = 2000.
        // Series ends in Firing — episode.resolvedAt = null.
        expect(expectOk(evaluate(baseLongGapConfig, continuous))).toMatchObject({
          events: [
            { kind: 'Pending', from: 0, until: 2000 },
            { kind: 'Firing', from: 2000, until: 5000 },
          ],
        });
      });
    });

    // Grafana spec §4: `NoData` mode's default switch arm SetPending(reason="NoData") when
    // previous state isn't NoData/Recovering AND For > 0. After the For-window, transitions
    // to NoData. Spec doc §10 row "noDataState: NoData first-occurrence" — Step 14d.5.
    describe('NoData + forDuration > 0 (first-occurrence Pending hop)', () => {
      const baseNoDataPendingConfig: AlertConfig = {
        threshold: { op: 'Gt', value: 10 },
        forDuration: 2000,
        keepFiringFor: 0,
        evaluationInterval: 1000,
        windowDuration: 1000,
        reducer: 'Mean',
        nanMode: { kind: 'DropNN' },
        noDataState: 'NoData',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      };

      it('fresh NoData gap (after Normal) → Pending for the for-window, then NoData, then Resolved', () => {
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 5 },
            { t: 6000, v: 5 }, // both Normal under Gt 10
          ],
        };
        // Closed window `[t-1000, t]`:
        //   0:    {v:5 at 0} → Normal.
        //   1000: {v:5 at 0} → Normal (closed-left boundary).
        //   2000-5000: empty → NoData.
        //   6000: {v:5 at 6000} → Normal — resolves.
        // NoData episode 2000–5000. For-gate at 2000+2000=4000.
        expect(expectOk(evaluate(baseNoDataPendingConfig, series))).toMatchObject({
          events: [
            { kind: 'Pending', from: 2000, until: 4000 },
            { kind: 'NoData', from: 4000, until: 5000 },
            { kind: 'Resolved', at: 6000 },
          ],
        });
      });

      it('short NoData gap (< for-window) → no non-Normal ticks under closed window', () => {
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 5 },
            { t: 2000, v: 5 }, // gap of one NoData tick at t=1000
          ],
        };
        // Closed window `[t-1000, t]`. Ticks at 0, 1000, 2000:
        //   0:    {v:5 at 0}.    Normal.
        //   1000: {v:5 at 0}.    Normal (closed-left boundary).
        //   2000: {v:5 at 2000}. Normal.
        // No NoData ticks under closed window — the t=0 sample bridges the
        // t=1000 evaluation. No events emitted.
        expect(expectOk(evaluate(baseNoDataPendingConfig, series))).toMatchObject({
          events: [],
        });
      });

      it('forDuration = 0 → no Pending hop, NoData emitted directly (matches Grafana ignorePending semantics)', () => {
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 5 },
            { t: 6000, v: 5 },
          ],
        };
        const noForConfig: AlertConfig = { ...baseNoDataPendingConfig, forDuration: 0 };
        // Closed window `[t-1000, t]`. Ticks at 0..6000:
        //   0:    {v:5 at 0} → Normal.
        //   1000: {v:5 at 0} → Normal (closed-left boundary).
        //   2000-5000: empty → NoData.
        //   6000: {v:5 at 6000} → Normal — resolves.
        expect(expectOk(evaluate(noForConfig, series))).toMatchObject({
          events: [
            { kind: 'NoData', from: 2000, until: 5000 },
            { kind: 'Resolved', at: 6000 },
          ],
        });
      });

      it('NoData at start of series (no predecessor) → Pending hop applies — series starts mid-gap', () => {
        // Series with samples only at the end — first ticks are all NoData.
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 5 }, // anchors firstTime=0
            { t: 5000, v: 5 },
          ],
        };
        const noFirstNormalConfig: AlertConfig = {
          ...baseNoDataPendingConfig,
          windowDuration: 100, // tiny window so only t=0 and t=5000 catch data
        };
        // Ticks at 0,1000,2000,3000,4000,5000 with windowDuration=100:
        //   0: window (-100, 0] catches v=5 → Normal
        //   1000-4000: empty → NoData
        //   5000: window (4900, 5000] catches v=5 → Normal (resolves)
        // Same shape as the long-gap test, included for symmetry.
        expect(expectOk(evaluate(noFirstNormalConfig, series))).toMatchObject({
          events: [
            { kind: 'Pending', from: 1000, until: 3000 },
            { kind: 'NoData', from: 3000, until: 4000 },
            { kind: 'Resolved', at: 5000 },
          ],
        });
      });

      // Firing → NoData transition (no resolution between). Step 14d.6 stitched the
      // Pending state across the boundary via the Lifecycle abstraction. Output now matches
      // Grafana: one Pending event spanning the for-window from Firing.from, then NoData
      // for the remaining post-gate ticks.
      it('Firing-then-NoData (no resolution) → Pending stitches across the boundary, then NoData (14d.6 closed)', () => {
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 15 },     // Firing
            { t: 5000, v: 5 },   // Normal resolves
          ],
        };
        // Ticks at 0..5000.
        //   0:    Firing
        //   1000-4000: NoData
        //   5000: Normal (resolves)
        // Episodes: Firing(0,0)→NoData(1000,4000) resolvedAt=5000. One lifecycle.
        // For-gate fires at lifecycleStart+For = 0+2000 = 2000. At t=2000, NoData segment is
        // active → NoData event from 2000 to 4000.
        // Grafana for the same scenario: Pending(0,2000) + NoData(2000,4000) + Resolved at 5000.
        expect(expectOk(evaluate(baseNoDataPendingConfig, series))).toMatchObject({
          events: [
            { kind: 'Pending', from: 0, until: 2000 },
            { kind: 'NoData', from: 2000, until: 4000 },
            { kind: 'Resolved', at: 5000 },
          ],
        });
      });
    });

    // Step 14d.6 — lifecycle stitching tests. These pin the new behaviour: the for-gate
    // counts from the FIRST non-Normal tick across mixed Firing/NoData runs, matching
    // Grafana's "Pending StartsAt is preserved across state changes until resolution"
    // (spec doc §3 fact 3 + §4 `resultNoData` Pending arm).
    describe('Lifecycle stitching across Firing↔NoData transitions (14d.6)', () => {
      const baseStitchConfig: AlertConfig = {
        threshold: { op: 'Gt', value: 10 },
        forDuration: 2000,
        keepFiringFor: 0,
        evaluationInterval: 1000,
        windowDuration: 1000,
        reducer: 'Mean',
        nanMode: { kind: 'DropNN' },
        noDataState: 'NoData',
        execErrState: 'Error',
  instant: false,
        intervalMs: 1,
        maxDataPoints: Number.MAX_SAFE_INTEGER,
      };

      it('Firing → NoData → Firing within one lifecycle — closed window bridges the gaps, single Firing episode', () => {
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 15 },    // Firing
            { t: 2000, v: 15 }, // Firing again (would be Firing→NoData→Firing under half-open)
            { t: 4000, v: 15 }, // last data Firing tick
            { t: 5000, v: 5 },  // resolves
          ],
        };
        // Closed window `[t-1000, t]` (Phase 2.0): each between-sample tick now
        // catches the previous data point on its closed-left boundary, so the
        // half-open NoData ticks vanish:
        //   0:    {v:15 at 0}. Firing.
        //   1000: {v:15 at 0} (closed-left). Firing.
        //   2000: {v:15 at 2000}. Firing.
        //   3000: {v:15 at 2000} (closed-left). Firing.
        //   4000: {v:15 at 4000}. Firing.
        //   5000: {v:5 at 5000}. Normal — resolves.
        // One single Firing episode 0–4000, extended to 5000 by PR #70.
        // forGateFiresAt = 0+2000 = 2000.
        expect(expectOk(evaluate(baseStitchConfig, series))).toMatchObject({
          events: [
            { kind: 'Pending', from: 0, until: 2000 },
            { kind: 'Firing', from: 2000, until: 5000 },
            { kind: 'Resolved', at: 5000 },
          ],
        });
      });

      it('NoData → Firing (no resolution) → Pending from first NoData, Firing after for-gate (matches Grafana NoData→Pending→Alerting transition)', () => {
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 5 },     // Normal — anchors firstTime
            { t: 2000, v: 15 }, // Firing
            { t: 4000, v: 15 }, // still Firing
            { t: 5000, v: 5 },  // resolves
          ],
        };
        // Closed window `[t-1000, t]`:
        //   0:    {v:5 at 0}.    Normal.
        //   1000: {v:5 at 0}.    Normal (closed-left).
        //   2000: {v:15 at 2000}. Firing.
        //   3000: {v:15 at 2000}. Firing (closed-left).
        //   4000: {v:15 at 4000}. Firing.
        //   5000: {v:5 at 5000}.  Normal — resolves.
        // Single Firing episode 2000–4000, extended to 5000. lifecycleStart=2000,
        // forGateFiresAt=2000+2000=4000.
        expect(expectOk(evaluate(baseStitchConfig, series))).toMatchObject({
          events: [
            { kind: 'Pending', from: 2000, until: 4000 },
            { kind: 'Firing', from: 4000, until: 5000 },
            { kind: 'Resolved', at: 5000 },
          ],
        });
      });

      // Phase 2.0 surfaced a latent edge case: when the closed-window Firing
      // episode reaches the Normal tick exactly at `lifecycleStart + forDuration`,
      // PR #70's extension of `lastSegment.until` to the Normal tick makes
      // `reachedForGate = forGateFiresAt <= naturalLastUntil` evaluate true —
      // we emit a zero-width Firing(forGate, forGate) event. Real Grafana
      // would NOT promote in this case (its `resultAlerting` guard only fires
      // when condition IS true at the eval, and at the resolution tick the
      // condition went false). Tracked as a Phase 3 divergence; documented
      // here so the test pins the current behaviour rather than silently
      // accepting any output.
      it('for-gate fires exactly at the resolution tick — zero-width Firing emitted (Phase 3 divergence vs Grafana)', () => {
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 15 },   // Firing for 1 sample tick
            { t: 2000, v: 5 }, // Normal — resolves
          ],
        };
        // Closed window `[t-1000, t]`:
        //   0:    {v:15 at 0}. Firing.
        //   1000: {v:15 at 0}. Firing (closed-left).
        //   2000: {v:5 at 2000}. Normal — resolves.
        // Firing episode 0–1000, extended by PR #70 to 2000. forGateFiresAt =
        // 0+2000=2000. reachedForGate = 2000 <= 2000 = true (Phase 3 quirk —
        // see comment above). Emits Pending(0,2000), zero-width
        // Firing(2000,2000), Resolved(2000).
        expect(expectOk(evaluate(baseStitchConfig, series))).toMatchObject({
          events: [
            { kind: 'Pending', from: 0, until: 2000 },
            { kind: 'Firing', from: 2000, until: 2000 },
            { kind: 'Resolved', at: 2000 },
          ],
        });
      });

      // Step 14d.7 — KeepFiringFor + Recovering. Grafana's `resultNormal` enters
      // Recovering instead of Normal when `state.State == Alerting && KeepFiringFor > 0`.
      // The alert continues notifying for KeepFiringFor after condition goes false. See
      // spec doc §2 + §3.
      describe('keepFiringFor / Recovering (14d.7)', () => {
        it('keepFiringFor > 0 + reached for-gate → Recovering event between Firing.until and Resolved', () => {
          const series: MetricSeries = {
            labels,
            samples: [
              { t: 0, v: 15 },    // Firing
              { t: 1000, v: 15 },
              { t: 2000, v: 15 }, // for-gate fires at 2000
              { t: 3000, v: 15 }, // last Firing tick
              { t: 4000, v: 5 },  // Normal — would resolve, KFF kicks in
            ],
          };
          const config: AlertConfig = { ...baseStitchConfig, keepFiringFor: 3000 };
          // Lifecycle: Firing(0,3000) resolvedAt=4000.
          // forGateFiresAt=2000, reachedForGate=true.
          // Pending(0,2000), Firing(2000,3000).
          // KFF=3000 + reachedForGate + resolvedAt: Recovering(3000, 6000), Resolved at 6000.
          expect(expectOk(evaluate(config, series))).toMatchObject({
            events: [
              { kind: 'Pending', from: 0, until: 2000 },
              { kind: 'Firing', from: 2000, until: 4000 },
              { kind: 'Recovering', from: 4000, until: 7000 },
              { kind: 'Resolved', at: 7000 },
            ],
          });
        });

        it('keepFiringFor = 0 (default) → no Recovering event, Resolved at the Normal tick', () => {
          const series: MetricSeries = {
            labels,
            samples: [
              { t: 0, v: 15 },
              { t: 1000, v: 15 },
              { t: 2000, v: 15 },
              { t: 3000, v: 15 },
              { t: 4000, v: 5 },
            ],
          };
          const config: AlertConfig = { ...baseStitchConfig, keepFiringFor: 0 };
          expect(expectOk(evaluate(config, series))).toMatchObject({
            events: [
              { kind: 'Pending', from: 0, until: 2000 },
              { kind: 'Firing', from: 2000, until: 4000 },
              { kind: 'Resolved', at: 4000 },
            ],
          });
        });

        it('cancelled-Pending with keepFiringFor > 0 → NO Recovering (Grafana only enters Recovering from Alerting, not Pending)', () => {
          const series: MetricSeries = {
            labels,
            samples: [
              { t: 0, v: 15 },
              { t: 1000, v: 5 },
            ],
          };
          const config: AlertConfig = { ...baseStitchConfig, keepFiringFor: 5000 };
          // For=2000, Firing episode {0,0} cancelled. No Recovering — `state.State` never
          // reached Alerting in Grafana terms.
          expect(expectOk(evaluate(config, series))).toMatchObject({
            events: [
              { kind: 'Pending', from: 0, until: 1000 },
              { kind: 'Resolved', at: 1000 },
            ],
          });
        });

        // Pinned divergence: re-fire during the Recovering window. Grafana keeps the same
        // alert in Alerting (skip Pending — spec §3 fact 4). Our model emits two separate
        // lifecycles. Closing this requires merging lifecycles separated by a Normal gap
        // shorter than keepFiringFor.
        it('re-fire during KFF window → CURRENT BEHAVIOUR: two separate lifecycles. Remaining divergence — see spec doc §10.', () => {
          const series: MetricSeries = {
            labels,
            samples: [
              { t: 0, v: 15 },
              { t: 1000, v: 15 },
              { t: 2000, v: 15 },
              { t: 3000, v: 5 },   // Normal — starts Recovering
              { t: 4000, v: 15 },  // Re-fire DURING KFF window
              { t: 5000, v: 15 },
              { t: 6000, v: 15 },
              { t: 7000, v: 5 },   // Final Normal
            ],
          };
          const config: AlertConfig = { ...baseStitchConfig, keepFiringFor: 5000 };
          // Closed window `[t-1000, t]`. Threshold Gt 10:
          //   0:    {v:15 at 0}. Firing.
          //   1000: {v:15 at 0, v:15 at 1000}. Mean=15. Firing.
          //   2000: {v:15 at 1000, v:15 at 2000}. Mean=15. Firing.
          //   3000: {v:15 at 2000, v:5 at 3000}. Mean=10. NOT firing → Normal,
          //          ends 1st lifecycle.
          //   4000: {v:5 at 3000, v:15 at 4000}. Mean=10. NOT firing → Normal.
          //   5000: {v:15 at 4000, v:15 at 5000}. Firing — new lifecycle.
          //   6000: {v:15 at 5000, v:15 at 6000}. Firing.
          //   7000: {v:15 at 6000, v:5 at 7000}. Mean=10. NOT firing → Normal,
          //          ends 2nd lifecycle.
          // Two lifecycles (same as before, just shifted by one tick each
          // because of the closed-window boundary). The 2nd lifecycle reaches
          // for-gate exactly at its resolution tick — same Phase 3 zero-width
          // Firing edge case as the previous test.
          // Still our model's two-lifecycle divergence from Grafana's single
          // continuous Alerting; that part of the test description still applies.
          expect(expectOk(evaluate(config, series))).toMatchObject({
            events: [
              { kind: 'Pending', from: 0, until: 2000 },
              { kind: 'Firing', from: 2000, until: 3000 },
              { kind: 'Recovering', from: 3000, until: 8000 },
              { kind: 'Resolved', at: 8000 },
              { kind: 'Pending', from: 5000, until: 7000 },
              { kind: 'Firing', from: 7000, until: 7000 },
              { kind: 'Recovering', from: 7000, until: 12000 },
              { kind: 'Resolved', at: 12000 },
            ],
          });
        });
      });

      // Pinned divergence: post-promotion fresh Pending hop is NOT modeled. When the
      // for-gate has already fired (lifecycle in Firing/NoData state), a state change in
      // Grafana triggers a fresh SetPending; we just emit the new segment directly. Closing
      // this requires a full per-tick state-machine simulation; documented in spec doc §10.
      it('post-promotion state change → CURRENT BEHAVIOUR (segment direct, no fresh Pending). Remaining divergence — see spec doc §10.', () => {
        const series: MetricSeries = {
          labels,
          samples: [
            { t: 0, v: 15 },    // Firing
            { t: 1000, v: 15 }, // Firing
            { t: 2000, v: 15 }, // Firing — for-gate fires here in our model AND Grafana
            { t: 3000, v: 15 }, // Firing
            { t: 4000, v: 15 }, // Firing (still promoted)
            { t: 7000, v: 5 },  // Normal — resolves
          ],
        };
        // Closed window `[t-1000, t]`:
        //   0..4000: Firing (data at each tick).
        //   5000: {v:15 at 4000} (closed-left boundary). Firing.
        //   6000: empty. NoData.
        //   7000: {v:5 at 7000}. Normal — resolves.
        // Episodes: Firing(0,5000), NoData(6000,6000) resolvedAt=7000. One lifecycle.
        // forGateFiresAt = 2000. Walk after 2000:
        //   Firing segment ends at 5000 → emit Firing(2000, 5000).
        //   NoData segment 6000 → emit NoData(6000, 6000).
        //
        // Grafana for the same scenario would emit:
        //   Pending(0,2000) + Firing(2000,6000) + Pending(6000,...) + NoData(...) ...
        // — because Alerting→NoData triggers SetPending(NoData) and a fresh
        // For-gate. We emit the NoData segment directly. Still the remaining
        // 14d.6 gap; closed window just shifts the segment boundaries.
        expect(expectOk(evaluate(baseStitchConfig, series))).toMatchObject({
          events: [
            { kind: 'Pending', from: 0, until: 2000 },
            { kind: 'Firing', from: 2000, until: 5000 },
            { kind: 'NoData', from: 6000, until: 6000 },
            { kind: 'Resolved', at: 7000 },
          ],
        });
      });
    });
  });

  describe('windowDuration ≠ evaluationInterval (overlapping windows)', () => {
    // Mirrors the canonical Grafana shape: rule evaluates every 1m (cadence) but each
    // evaluation looks at the last 4m of data (lookback). Adjacent ticks see overlapping samples.
    const overlapConfig: AlertConfig = {
      threshold: { op: 'Gt', value: 5 },
      forDuration: 0,
      keepFiringFor: 0,
      evaluationInterval: 1000, // tick every 1s
      windowDuration: 4000, // each tick looks at last 4s
      reducer: 'Mean',
      nanMode: { kind: 'DropNN' },
      noDataState: 'Ok',
      execErrState: 'Error',
  instant: false,
      intervalMs: 1,
      maxDataPoints: Number.MAX_SAFE_INTEGER,
    };

    it('one brief spike contaminates several adjacent tick windows under Mean', () => {
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 0 },
          { t: 2000, v: 0 },
          { t: 3000, v: 0 },
          { t: 4000, v: 24 }, // spike
          { t: 5000, v: 0 },
          { t: 6000, v: 0 },
          { t: 7000, v: 0 },
        ],
      };
      // Closed window `[t-4000, t]`. The closed-left boundary adds one extra
      // sample to each window, diluting the spike's average:
      //   Tick 1000: [-3000, 1000] → {0}. Mean=0. fail.
      //   Tick 2000: [-2000, 2000] → {0, 0}. Mean=0. fail.
      //   Tick 3000: [-1000, 3000] → {0, 0, 0}. Mean=0. fail.
      //   Tick 4000: [0, 4000]     → {0, 0, 0, 24}. Mean=6 > 5. PASS.
      //   Tick 5000: [1000, 5000]  → {0, 0, 0, 24, 0}. Mean=4.8. fail.
      //   Tick 6000: [2000, 6000]  → {0, 0, 24, 0, 0}. Mean=4.8. fail.
      //   Tick 7000: [3000, 7000]  → {0, 24, 0, 0, 0}. Mean=4.8. fail.
      // Single-tick firing at 4000 only — the closed window's extra sample at
      // each left edge pulls the rolling mean below threshold for ticks 5000+.
      // Episode Firing(4000), extended to 5000 on Normal at 5000.
      expect(expectOk(evaluate(overlapConfig, series))).toMatchObject({
        events: [
          { kind: 'Firing', from: 4000, until: 5000 },
          { kind: 'Resolved', at: 5000 },
        ],
      });
    });

    it('with tiled windows (window = interval), the same spike fires for only one tick', () => {
      // Same series, same threshold, but window = interval = 1s. The spike is in exactly one window.
      const tiledConfig: AlertConfig = { ...overlapConfig, windowDuration: 1000, intervalMs: 1, maxDataPoints: Number.MAX_SAFE_INTEGER };
      const series: MetricSeries = {
        labels,
        samples: [
          { t: 1000, v: 0 },
          { t: 2000, v: 0 },
          { t: 3000, v: 0 },
          { t: 4000, v: 24 },
          { t: 5000, v: 0 },
          { t: 6000, v: 0 },
          { t: 7000, v: 0 },
        ],
      };
      // Closed window `[t-1000, t]`:
      //   Tick 1000: [0, 1000]    → {0}.        Mean=0.    fail.
      //   Tick 2000: [1000, 2000] → {0, 0}.     Mean=0.    fail.
      //   Tick 3000: [2000, 3000] → {0, 0}.     Mean=0.    fail.
      //   Tick 4000: [3000, 4000] → {0, 24}.    Mean=12.   PASS (Gt 5).
      //   Tick 5000: [4000, 5000] → {24, 0}.    Mean=12.   PASS — the
      //                              closed-left now catches the spike too.
      //   Tick 6000: [5000, 6000] → {0, 0}.     Mean=0.    fail — resolves.
      //   Tick 7000: [6000, 7000] → {0, 0}.     Mean=0.    fail.
      // Firing episode 4000–5000, extended to 6000 on Normal at 6000.
      expect(expectOk(evaluate(tiledConfig, series))).toMatchObject({
        events: [
          { kind: 'Firing', from: 4000, until: 6000 },
          { kind: 'Resolved', at: 6000 },
        ],
      });
    });
  });

  describe('intervalMs and maxDataPoints are accepted by AlertConfig but do NOT affect evaluation', () => {
    // Per docs/04-grafana-fidelity.md, these fields stay on AlertConfig for JSON round-trip
    // but are NOT acted on by core. The plugin layer is responsible for fetching samples
    // at the appropriate query step. Core trusts what it receives.
    const series: MetricSeries = {
      labels,
      samples: [
        { t: 0, v: 1 },
        { t: 1000, v: 5 },
        { t: 2000, v: 9 },
        { t: 3000, v: 10 },
        { t: 4000, v: 1 },
      ],
    };
    const withMaxDataPoints = (maxDataPoints: number): AlertConfig => ({
      threshold: { op: 'Gt', value: 7 },
      forDuration: 0,
      keepFiringFor: 0,
      evaluationInterval: 4000,
      windowDuration: 4000,
      intervalMs: 1,
      maxDataPoints,
      reducer: 'Mean',
      nanMode: { kind: 'DropNN' },
      noDataState: 'Ok',
      execErrState: 'Error',
  instant: false,
    });

    it('produces the same result regardless of maxDataPoints value', () => {
      // Window at t=4000 covers (0, 4000] with all 4 samples (v=5,9,10,1). Mean = 6.25.
      // 6.25 > 7 → false → no firing. Same answer for any maxDataPoints.
      const expected = { events: [] };
      expect(expectOk(evaluate(withMaxDataPoints(Number.MAX_SAFE_INTEGER), series))).toMatchObject(expected);
      expect(expectOk(evaluate(withMaxDataPoints(2), series))).toMatchObject(expected);
      expect(expectOk(evaluate(withMaxDataPoints(1), series))).toMatchObject(expected);
    });

    it('produces the same result regardless of intervalMs value', () => {
      const expected = { events: [] };
      expect(expectOk(evaluate({ ...withMaxDataPoints(43200), intervalMs: 1 }, series))).toMatchObject(expected);
      expect(expectOk(evaluate({ ...withMaxDataPoints(43200), intervalMs: 5000 }, series))).toMatchObject(expected);
      expect(expectOk(evaluate({ ...withMaxDataPoints(43200), intervalMs: 60000 }, series))).toMatchObject(expected);
    });
  });

  describe('invalid config returns Err (does not throw)', () => {
    const validSeries: MetricSeries = { labels, samples: [{ t: 1000, v: 1 }] };

    it('returns Err with validateAlertConfig errors when the threshold value is NaN', () => {
      const result = evaluate(
        { ...config0, threshold: { op: 'Gt', value: Number.NaN } },
        validSeries,
      );
      expect(result.kind).toBe('Err');
      if (result.kind === 'Err') {
        expect(result.errors[0]).toContain('threshold.value must be a finite number');
      }
    });

    it('returns Err with multiple errors when several fields are invalid', () => {
      const result = evaluate(
        { ...config0, forDuration: -1, maxDataPoints: 0 },
        validSeries,
      );
      expect(result.kind).toBe('Err');
      if (result.kind === 'Err') {
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});

describe('warm-up / left-edge reduce window (#177)', () => {
  const meanCfg: AlertConfig = {
    threshold: { op: 'Gt', value: 10 },
    forDuration: 0,
    keepFiringFor: 0,
    evaluationInterval: 1000,
    windowDuration: 4000,
    reducer: 'Mean',
    nanMode: { kind: 'DropNN' },
    noDataState: 'Ok',
    execErrState: 'Error',
    instant: false,
    intervalMs: 1000,
    maxDataPoints: Number.MAX_SAFE_INTEGER,
  };

  const withWarmup: MetricSeries = {
    labels,
    samples: [
      { t: 1000, v: 100 }, { t: 2000, v: 100 }, { t: 3000, v: 100 }, { t: 4000, v: 100 },
      { t: 5000, v: 0 }, { t: 6000, v: 0 }, { t: 7000, v: 0 }, { t: 8000, v: 0 }, { t: 9000, v: 0 },
    ],
  };
  const noWarmup: MetricSeries = {
    labels,
    samples: withWarmup.samples.filter((s) => s.t >= 5000),
  };

  it('grid clamps to startTime — pre-startTime warm-up samples produce no ticks', () => {
    const r = expectOk(evaluate(meanCfg, withWarmup, { startTime: 5000 }));
    expect(r.ticks[0]!.t).toBe(5000);
    expect(r.ticks.every((tk) => tk.t >= 5000)).toBe(true);
  });

  it('first tick reduces a COMPLETE window via warm-up samples; without them it is partial (#177)', () => {
    const full = expectOk(evaluate(meanCfg, withWarmup, { startTime: 5000 })).ticks[0]!;
    const partial = expectOk(evaluate(meanCfg, noWarmup, { startTime: 5000 })).ticks[0]!;
    expect(full.t).toBe(5000);
    expect(partial.t).toBe(5000);
    expect(full.kind).toBe('Data');
    if (full.kind === 'Data') expect(full.v).toBeGreaterThan(50);
    const partialIsLow = partial.kind === 'NoData' || (partial.kind === 'Data' && partial.v < 50);
    expect(partialIsLow).toBe(true);
  });
});
