import { describe, expect, it } from 'vitest';
import type { EvalEvent } from '../../data/types';
import { summarize } from './summarize';

const empty: ReadonlyArray<EvalEvent> = [];

const oneCleanFire: ReadonlyArray<EvalEvent> = [
  { kind: 'Pending', from: 0, until: 2000 },
  { kind: 'Firing', from: 2000, until: 5000 },
  { kind: 'Resolved', at: 6000 },
];

const oneCancelledPending: ReadonlyArray<EvalEvent> = [
  { kind: 'Pending', from: 0, until: 500 },
  { kind: 'Resolved', at: 1000 },
];

const twoFiringsWithRecovering: ReadonlyArray<EvalEvent> = [
  { kind: 'Pending', from: 0, until: 2000 },
  { kind: 'Firing', from: 2000, until: 3000 },
  { kind: 'Recovering', from: 3000, until: 6000 },
  { kind: 'Resolved', at: 6000 },
  { kind: 'Pending', from: 10000, until: 12000 },
  { kind: 'Firing', from: 12000, until: 18000 }, // longer firing span
  { kind: 'Resolved', at: 19000 },
];

const noDataMixed: ReadonlyArray<EvalEvent> = [
  { kind: 'Pending', from: 1000, until: 3000 },
  { kind: 'NoData', from: 3000, until: 5000 },
  { kind: 'Resolved', at: 6000 },
];

const openPendingAtEnd: ReadonlyArray<EvalEvent> = [
  { kind: 'Pending', from: 0, until: 1000 },
  // series ended — no Resolved. NOT cancelled, just unresolved.
];

describe('summarize', () => {
  it('returns all-zero summary for an empty events array', () => {
    expect(summarize(empty)).toEqual({
      pending: { count: 0, totalDuration: 0 },
      firing: { count: 0, totalDuration: 0 },
      noData: { count: 0, totalDuration: 0 },
      recovering: { count: 0, totalDuration: 0 },
      resolvedCount: 0,
      firstFiringAt: null,
      longestFiringSpan: null,
      cancelledPendingCount: 0,
    });
  });

  it('counts one Pending + one Firing + one Resolved for a clean single fire', () => {
    expect(summarize(oneCleanFire)).toEqual({
      pending: { count: 1, totalDuration: 2000 },
      firing: { count: 1, totalDuration: 3000 },
      noData: { count: 0, totalDuration: 0 },
      recovering: { count: 0, totalDuration: 0 },
      resolvedCount: 1,
      firstFiringAt: 2000,
      longestFiringSpan: 3000,
      cancelledPendingCount: 0,
    });
  });

  it('counts cancelled-Pending when Pending is immediately followed by Resolved', () => {
    const s = summarize(oneCancelledPending);
    expect(s.pending.count).toBe(1);
    expect(s.cancelledPendingCount).toBe(1);
    expect(s.firstFiringAt).toBeNull();
    expect(s.longestFiringSpan).toBeNull();
  });

  it('does NOT count an open Pending at end-of-array as cancelled (it is unresolved)', () => {
    const s = summarize(openPendingAtEnd);
    expect(s.pending.count).toBe(1);
    expect(s.cancelledPendingCount).toBe(0);
  });

  it('records the FIRST Firing event timestamp and the LONGEST single Firing span across multiple firings', () => {
    const s = summarize(twoFiringsWithRecovering);
    expect(s.firing.count).toBe(2);
    expect(s.firing.totalDuration).toBe(3000 - 2000 + 18000 - 12000); // 1000 + 6000 = 7000
    expect(s.firstFiringAt).toBe(2000);
    expect(s.longestFiringSpan).toBe(6000); // the second firing
    expect(s.recovering.count).toBe(1);
    expect(s.recovering.totalDuration).toBe(3000);
    expect(s.cancelledPendingCount).toBe(0);
  });

  it('aggregates NoData events separately from Firing/Recovering', () => {
    const s = summarize(noDataMixed);
    expect(s.pending.count).toBe(1);
    expect(s.pending.totalDuration).toBe(2000);
    expect(s.noData.count).toBe(1);
    expect(s.noData.totalDuration).toBe(2000);
    expect(s.firing.count).toBe(0);
    expect(s.firstFiringAt).toBeNull();
    // Pending was followed by NoData (not Resolved), so it's NOT cancelled — it promoted
    // through the for-gate.
    expect(s.cancelledPendingCount).toBe(0);
  });
});
