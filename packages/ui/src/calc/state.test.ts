import { describe, it, expect } from 'vitest';
import type { EvalEvent, Tick } from '@alert-whatif/core';
import {
  currentStateForTick,
  eventsToTransitions,
  grafanaHistoryToTransitions,
  statesMatch,
  mockPlayheadGrafanaState,
  computeNoDataRanges,
} from './state';

const firingEvent: EvalEvent = { kind: 'Firing', from: 1000, until: 2000 };
const pendingEvent: EvalEvent = { kind: 'Pending', from: 1000, until: 2000 };
const noDataEvent: EvalEvent = { kind: 'NoData', from: 1000, until: 2000 };
const recoveringEvent: EvalEvent = { kind: 'Recovering', from: 1000, until: 2000 };
const resolvedEvent: EvalEvent = { kind: 'Resolved', at: 1500 };

const dataTick = (t: number, v: number): Tick => ({ kind: 'Data', t, v });
const noDataTick = (t: number): Tick => ({ kind: 'NoData', t });

describe('currentStateForTick', () => {
  it('returns Normal for a null tick', () => {
    expect(currentStateForTick(null, [firingEvent])).toBe('Normal');
  });

  it('returns Firing when the tick falls inside a Firing window', () => {
    expect(currentStateForTick(dataTick(1500, 9), [firingEvent])).toBe('Firing');
  });

  it('returns Pending when the tick falls inside a Pending window', () => {
    expect(currentStateForTick(dataTick(1500, 9), [pendingEvent])).toBe('Pending');
  });

  it('returns NoData for an uncovered NoData tick', () => {
    expect(currentStateForTick(noDataTick(5000), [firingEvent])).toBe('NoData');
  });

  it('returns Normal for an uncovered Data tick', () => {
    expect(currentStateForTick(dataTick(5000, 9), [firingEvent])).toBe('Normal');
  });

  it('skips Resolved events when locating the covering window', () => {
    expect(currentStateForTick(dataTick(1500, 9), [resolvedEvent])).toBe('Normal');
  });
});

describe('eventsToTransitions', () => {
  it('maps Pending/Firing/Resolved to transitions and drops other kinds', () => {
    expect(
      eventsToTransitions([
        pendingEvent,
        firingEvent,
        resolvedEvent,
        noDataEvent,
        recoveringEvent,
      ]),
    ).toEqual([
      { t: 1000, kind: 'Pending' },
      { t: 1000, kind: 'Firing' },
      { t: 1500, kind: 'Resolved' },
    ]);
  });
});

describe('grafanaHistoryToTransitions', () => {
  it('maps pending/firing/inactive and skips unknown states', () => {
    expect(
      grafanaHistoryToTransitions([
        { t: 10, state: 'pending' },
        { t: 20, state: 'firing' },
        { t: 30, state: 'inactive' },
        { t: 40, state: 'mystery' },
      ]),
    ).toEqual([
      { t: 10, kind: 'Pending' },
      { t: 20, kind: 'Firing' },
      { t: 30, kind: 'Resolved' },
    ]);
  });
});

describe('statesMatch', () => {
  it('matches firing with Firing', () => {
    expect(statesMatch('firing', 'Firing')).toBe(true);
  });

  it('matches pending with Pending', () => {
    expect(statesMatch('pending', 'Pending')).toBe(true);
  });

  it('matches inactive with Normal', () => {
    expect(statesMatch('inactive', 'Normal')).toBe(true);
  });

  it('reports a mismatch as false', () => {
    expect(statesMatch('firing', 'Normal')).toBe(false);
  });

  it('treats unknown as matching anything', () => {
    expect(statesMatch('unknown', 'Firing')).toBe(true);
  });
});

describe('mockPlayheadGrafanaState', () => {
  const history = [
    { t: 100, state: 'pending' },
    { t: 200, state: 'firing' },
    { t: 300, state: 'inactive' },
  ];

  it('returns undefined for empty history', () => {
    expect(mockPlayheadGrafanaState([], 500, null)).toBeUndefined();
  });

  it('returns undefined for undefined history', () => {
    expect(mockPlayheadGrafanaState(undefined, 500, null)).toBeUndefined();
  });

  it('returns the latest entry whose t is at or before the playhead', () => {
    expect(mockPlayheadGrafanaState(history, 250, null)).toBe('firing');
  });

  it('falls back to firing from a Firing initialState before any entry', () => {
    expect(mockPlayheadGrafanaState(history, 50, 'Firing')).toBe('firing');
  });

  it('falls back to inactive for a non-Firing initialState before any entry', () => {
    expect(mockPlayheadGrafanaState(history, 50, 'Normal')).toBe('inactive');
  });
});

describe('computeNoDataRanges', () => {
  it('returns [] for a non-positive evaluation interval', () => {
    expect(computeNoDataRanges([noDataTick(0)], 0)).toEqual([]);
  });

  it('merges a run of consecutive NoData ticks into one range', () => {
    expect(
      computeNoDataRanges([noDataTick(0), noDataTick(60_000), noDataTick(120_000)], 60_000),
    ).toEqual([{ from: 0, until: 180_000 }]);
  });

  it('splits ranges separated by a Data tick', () => {
    expect(
      computeNoDataRanges([noDataTick(0), dataTick(60_000, 5), noDataTick(120_000)], 60_000),
    ).toEqual([
      { from: 0, until: 60_000 },
      { from: 120_000, until: 180_000 },
    ]);
  });
});
