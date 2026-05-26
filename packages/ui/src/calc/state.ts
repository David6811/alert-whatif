import type {
  EvalEvent,
  GrafanaAlertState,
  StateTransition,
  Tick,
} from '@alert-whatif/core';

export type OurState = 'Normal' | 'Pending' | 'Firing' | 'NoData' | 'Recovering';

// Adapt EvalEvent[] into the StateTransition[] core's divergence detector
// consumes; only Pending/Firing/Resolved are extracted.
export function eventsToTransitions(events: ReadonlyArray<EvalEvent>): ReadonlyArray<StateTransition> {
  const out: StateTransition[] = [];
  for (const e of events) {
    if (e.kind === 'Pending') out.push({ t: e.from, kind: 'Pending' });
    else if (e.kind === 'Firing') out.push({ t: e.from, kind: 'Firing' });
    else if (e.kind === 'Resolved') out.push({ t: e.at, kind: 'Resolved' });
  }
  return out;
}

// Each grafanaHistory entry is already a transition; map it directly,
// skipping `unknown`.
export function grafanaHistoryToTransitions(
  history: ReadonlyArray<{ readonly t: number; readonly state: string }>,
): ReadonlyArray<StateTransition> {
  const out: StateTransition[] = [];
  for (const entry of history) {
    if (entry.state === 'pending') out.push({ t: entry.t, kind: 'Pending' });
    else if (entry.state === 'firing') out.push({ t: entry.t, kind: 'Firing' });
    else if (entry.state === 'inactive') out.push({ t: entry.t, kind: 'Resolved' });
  }
  return out;
}

// One contiguous range per run of consecutive NoData ticks; each covers
// `[tick.t, tick.t + evaluationInterval)` so adjacent ticks merge.
export function computeNoDataRanges(
  ticks: ReadonlyArray<Tick>,
  evaluationInterval: number,
): ReadonlyArray<{ readonly from: number; readonly until: number }> {
  if (!Number.isFinite(evaluationInterval) || evaluationInterval <= 0) return [];
  const runs: Array<{ from: number; until: number }> = [];
  let current: { from: number; until: number } | null = null;
  for (const tick of ticks) {
    if (tick.kind !== 'NoData') {
      if (current !== null) {
        runs.push(current);
        current = null;
      }
      continue;
    }
    const tickUntil = tick.t + evaluationInterval;
    if (current === null) {
      current = { from: tick.t, until: tickUntil };
    } else {
      current.until = tickUntil;
    }
  }
  if (current !== null) runs.push(current);
  return runs;
}

// Grafana's recorded state at the playhead: the latest entry whose
// `t <= playheadMs`, falling back to initialState when before any annotation.
export function mockPlayheadGrafanaState(
  history: ReadonlyArray<{ readonly t: number; readonly state: string }> | undefined,
  playheadMs: number | undefined,
  initialState: 'Normal' | 'Firing' | 'NoData' | null,
): 'pending' | 'firing' | 'inactive' | undefined {
  if (history === undefined || history.length === 0 || playheadMs === undefined) {
    return undefined;
  }
  let latest: { t: number; state: string } | null = null;
  for (const entry of history) {
    if (entry.t <= playheadMs && (latest === null || entry.t > latest.t)) {
      latest = entry;
    }
  }
  if (latest === null) {
    if (initialState === 'Firing') return 'firing';
    if (initialState === 'NoData') return 'inactive';
    return 'inactive';
  }
  if (latest.state === 'pending' || latest.state === 'firing' || latest.state === 'inactive') {
    return latest.state;
  }
  return undefined;
}

export function currentStateForTick(
  tick: Tick | null,
  events: ReadonlyArray<EvalEvent>,
): OurState {
  if (tick === null) return 'Normal';
  for (const e of events) {
    if (e.kind === 'Resolved') continue;
    if (tick.t >= e.from && tick.t < e.until) return e.kind;
  }
  if (tick.kind === 'NoData') return 'NoData';
  return 'Normal';
}

export function statesMatch(g: GrafanaAlertState, ours: OurState): boolean {
  if (g === 'firing') return ours === 'Firing';
  if (g === 'pending') return ours === 'Pending';
  if (g === 'inactive') return ours === 'Normal';
  return true;
}
