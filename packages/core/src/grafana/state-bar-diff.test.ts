import { describe, it, expect } from 'vitest';
import {
  detectStateBarDivergence,
  type StateTransition,
} from './state-bar-diff';

// Anchor every test to a fixed wallclock so failures read as
// "01:27:30 vs 01:26:30" rather than abstract offsets.
const T = (h: number, m: number, s: number) =>
  Date.UTC(2026, 4, 21, h, m, s);

const MIN_GAP_60S = 60_000;

describe('detectStateBarDivergence', () => {
  it('returns empty when both lists match exactly', () => {
    const state: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
      { t: T(1, 28, 30), kind: 'Firing' },
      { t: T(1, 34, 30), kind: 'Resolved' },
    ];
    const grafana: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
      { t: T(1, 28, 30), kind: 'Firing' },
      { t: T(1, 34, 30), kind: 'Resolved' },
    ];
    expect(detectStateBarDivergence(state, grafana, MIN_GAP_60S)).toEqual([]);
  });

  it('flags the canonical Episode-A case (Grafana lags by 60s on every transition)', () => {
    const state: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
      { t: T(1, 28, 30), kind: 'Firing' },
      { t: T(1, 34, 30), kind: 'Resolved' },
    ];
    const grafana: ReadonlyArray<StateTransition> = [
      { t: T(1, 27, 30), kind: 'Pending' },
      { t: T(1, 29, 30), kind: 'Firing' },
      { t: T(1, 35, 30), kind: 'Resolved' },
    ];
    expect(detectStateBarDivergence(state, grafana, MIN_GAP_60S)).toEqual([
      { kind: 'Pending', stateAt: T(1, 26, 30), grafanaAt: T(1, 27, 30), gapMs: 60_000 },
      { kind: 'Firing', stateAt: T(1, 28, 30), grafanaAt: T(1, 29, 30), gapMs: 60_000 },
      { kind: 'Resolved', stateAt: T(1, 34, 30), grafanaAt: T(1, 35, 30), gapMs: 60_000 },
    ]);
  });

  it('returns empty when gaps are below the threshold (jitter, not divergence)', () => {
    const state: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
    ];
    const grafana: ReadonlyArray<StateTransition> = [
      // 30 seconds — sub-evalInterval jitter, not a real divergence.
      { t: T(1, 27, 0), kind: 'Pending' },
    ];
    expect(detectStateBarDivergence(state, grafana, MIN_GAP_60S)).toEqual([]);
  });

  it('skips a state-side transition that has no matching kind on the grafana side', () => {
    const state: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
      { t: T(1, 28, 30), kind: 'Firing' },
    ];
    const grafana: ReadonlyArray<StateTransition> = [
      // Grafana never saw Pending — only Firing. Skip Pending, pair Firing.
      { t: T(1, 29, 30), kind: 'Firing' },
    ];
    expect(detectStateBarDivergence(state, grafana, MIN_GAP_60S)).toEqual([
      { kind: 'Firing', stateAt: T(1, 28, 30), grafanaAt: T(1, 29, 30), gapMs: 60_000 },
    ]);
  });

  it('skips a grafana-side transition that has no matching kind on the state side', () => {
    const state: ReadonlyArray<StateTransition> = [
      { t: T(1, 28, 30), kind: 'Firing' },
    ];
    const grafana: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
      { t: T(1, 29, 30), kind: 'Firing' },
    ];
    expect(detectStateBarDivergence(state, grafana, MIN_GAP_60S)).toEqual([
      { kind: 'Firing', stateAt: T(1, 28, 30), grafanaAt: T(1, 29, 30), gapMs: 60_000 },
    ]);
  });

  it('reports negative gap when alert-whatif lags grafana (rare, but possible)', () => {
    const state: ReadonlyArray<StateTransition> = [
      { t: T(1, 27, 30), kind: 'Pending' },
    ];
    const grafana: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
    ];
    expect(detectStateBarDivergence(state, grafana, MIN_GAP_60S)).toEqual([
      { kind: 'Pending', stateAt: T(1, 27, 30), grafanaAt: T(1, 26, 30), gapMs: -60_000 },
    ]);
  });

  it('handles back-to-back episodes (Pending/Firing/Resolve repeated)', () => {
    const state: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
      { t: T(1, 28, 30), kind: 'Firing' },
      { t: T(1, 34, 30), kind: 'Resolved' },
      { t: T(2, 36, 30), kind: 'Pending' },
      { t: T(2, 38, 30), kind: 'Firing' },
      { t: T(2, 44, 30), kind: 'Resolved' },
    ];
    const grafana: ReadonlyArray<StateTransition> = [
      { t: T(1, 27, 30), kind: 'Pending' },
      { t: T(1, 29, 30), kind: 'Firing' },
      { t: T(1, 35, 30), kind: 'Resolved' },
      // Episode B — no lag (counter pre-existed).
      { t: T(2, 36, 30), kind: 'Pending' },
      { t: T(2, 38, 30), kind: 'Firing' },
      { t: T(2, 44, 30), kind: 'Resolved' },
    ];
    expect(detectStateBarDivergence(state, grafana, MIN_GAP_60S)).toEqual([
      { kind: 'Pending', stateAt: T(1, 26, 30), grafanaAt: T(1, 27, 30), gapMs: 60_000 },
      { kind: 'Firing', stateAt: T(1, 28, 30), grafanaAt: T(1, 29, 30), gapMs: 60_000 },
      { kind: 'Resolved', stateAt: T(1, 34, 30), grafanaAt: T(1, 35, 30), gapMs: 60_000 },
    ]);
  });

  it('returns empty when either list is empty', () => {
    expect(detectStateBarDivergence([], [{ t: T(1, 27, 30), kind: 'Pending' }], MIN_GAP_60S)).toEqual([]);
    expect(detectStateBarDivergence([{ t: T(1, 26, 30), kind: 'Pending' }], [], MIN_GAP_60S)).toEqual([]);
    expect(detectStateBarDivergence([], [], MIN_GAP_60S)).toEqual([]);
  });

  it('treats exactly minGapMs as a divergence (boundary)', () => {
    const state: ReadonlyArray<StateTransition> = [
      { t: T(1, 26, 30), kind: 'Pending' },
    ];
    const grafana: ReadonlyArray<StateTransition> = [
      // Exactly 60s — at the boundary, still a divergence.
      { t: T(1, 27, 30), kind: 'Pending' },
    ];
    expect(detectStateBarDivergence(state, grafana, MIN_GAP_60S)).toEqual([
      { kind: 'Pending', stateAt: T(1, 26, 30), grafanaAt: T(1, 27, 30), gapMs: 60_000 },
    ]);
  });
});
