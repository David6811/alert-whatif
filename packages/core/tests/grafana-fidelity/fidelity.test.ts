// Grafana-fidelity test suite. Every fixture under `./fixtures/` is a recording of a
// real Grafana run; we feed our evaluator the same samples Grafana saw and assert that
// our state transitions match what Grafana actually did, within the tolerances each
// fixture explicitly declares.
//
// This file is the load-bearing test for the discipline documented in
// `docs/04-grafana-fidelity.md`: no calc/ change ships if it breaks a fixture here, and
// no fixture is admissible unless its `expected` came from real Grafana.
//
// A fixture passing today does NOT prove full parity — it only proves the subset the
// fixture chose to assert. The `provenance.knownDivergencesNotAsserted` field of each
// fixture is the list of things we deliberately don't check yet (e.g. Grafana's
// keep_firing_for hysteresis). Closing those is Step 14d's work.

import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/calc/evaluate';
import type { EvalEvent } from '../../src/data/types';
import { listFixtureFiles, loadFixture } from './loader';

const fixtureFiles = listFixtureFiles();

if (fixtureFiles.length === 0) {
  describe('grafana-fidelity', () => {
    it.fails('expects at least one fixture under tests/grafana-fidelity/fixtures/', () => {
      throw new Error('no fixtures found');
    });
  });
}

function firstEventOfKind(events: ReadonlyArray<EvalEvent>, kind: EvalEvent['kind']): EvalEvent | undefined {
  return events.find((e) => e.kind === kind);
}

// `from` is the entry timestamp for ranged events (Pending/Firing/NoData); `at` is the
// timestamp for the point event Resolved. Returns NaN if neither applies — tests will
// see NaN and fail loudly, which is what we want.
function entryTime(event: EvalEvent): number {
  if (event.kind === 'Resolved') return event.at;
  return event.from;
}

for (const path of fixtureFiles) {
  const fx = loadFixture(path);

  describe(`grafana-fidelity: ${fx.name}`, () => {
    // Pass the recorded `evalGridOffsetMs` to evaluate() when the fixture has
    // it. Without the hint, our tick grid anchors to samples[0].t and can drift
    // up to one eval interval relative to Grafana's eval grid (legacy fixtures
    // tolerate this via ±60s assertions). With the hint, ticks align to
    // Grafana's exact cadence and entry-time assertions can run at tight
    // tolerance.
    const hints =
      fx.provenance.evalGridOffsetMs !== undefined
        ? { evalGridOffsetMs: fx.provenance.evalGridOffsetMs }
        : undefined;
    const result = evaluate(fx.alertConfig, fx.series, hints);

    it('evaluate() returns Ok (config + samples are valid input)', () => {
      expect(result.kind).toBe('Ok');
    });

    if (result.kind !== 'Ok') return;
    const events = result.value.events;

    it('emits at least one Pending event', () => {
      expect(firstEventOfKind(events, 'Pending')).toBeDefined();
    });

    it('emits at least one Firing event', () => {
      expect(firstEventOfKind(events, 'Firing')).toBeDefined();
    });

    it(`first Pending entry is within ±${fx.expected.assertions.pendingEntryWithinMs.toleranceMs}ms of Grafana's observed time`, () => {
      const pending = firstEventOfKind(events, 'Pending');
      expect(pending).toBeDefined();
      if (!pending) return;
      const delta = Math.abs(entryTime(pending) - fx.expected.assertions.pendingEntryWithinMs.expected);
      expect(delta).toBeLessThanOrEqual(fx.expected.assertions.pendingEntryWithinMs.toleranceMs);
    });

    it(`first Firing entry is within ±${fx.expected.assertions.firingEntryWithinMs.toleranceMs}ms of Grafana's observed time`, () => {
      const firing = firstEventOfKind(events, 'Firing');
      expect(firing).toBeDefined();
      if (!firing) return;
      const delta = Math.abs(entryTime(firing) - fx.expected.assertions.firingEntryWithinMs.expected);
      expect(delta).toBeLessThanOrEqual(fx.expected.assertions.firingEntryWithinMs.toleranceMs);
    });

    it(`Firing entry is ~${fx.expected.assertions.firingEntryOffsetFromPending.expectedMs}ms after Pending entry (the for-window)`, () => {
      const pending = firstEventOfKind(events, 'Pending');
      const firing = firstEventOfKind(events, 'Firing');
      expect(pending).toBeDefined();
      expect(firing).toBeDefined();
      if (!pending || !firing) return;
      const observed = entryTime(firing) - entryTime(pending);
      const delta = Math.abs(observed - fx.expected.assertions.firingEntryOffsetFromPending.expectedMs);
      expect(delta).toBeLessThanOrEqual(fx.expected.assertions.firingEntryOffsetFromPending.toleranceMs);
    });

    // Records the boundary convention real Grafana uses for resolution:
    // `Firing.until === Resolved.at` at the same instant. The alert is
    // reported as Firing right up to the moment of resolution; there is no
    // 1-eval-interval gap between them.
    //
    // This locks down the FIXTURE'S recorded behaviour — if a future
    // re-recording somehow produces different timestamps for the two
    // events, this fails loudly. Verifying our own evaluator emits the
    // same boundary happens in `evaluate.test.ts` (hand-crafted series
    // with a resolution tick), because this fixture's samples don't
    // extend past the simulator's shutdown — Grafana resolved ~5 min
    // after our last recorded sample, so our evaluator produces an
    // open Firing for this fixture (no Resolved emitted).
    it('recorded fixture has Firing.until === Resolved.at (Grafana boundary convention)', () => {
      const expectedFiring = fx.expected.events.find((e) => e.kind === 'Firing');
      const expectedResolved = fx.expected.events.find((e) => e.kind === 'Resolved');
      if (!expectedFiring || !expectedResolved) return;
      const firingUntil = expectedFiring.kind === 'Firing' ? expectedFiring.until : undefined;
      const resolvedAt = expectedResolved.kind === 'Resolved' ? expectedResolved.at : undefined;
      expect(firingUntil).toBe(resolvedAt);
    });
  });
}
