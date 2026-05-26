// Stage 1 of the evaluation pipeline. Maps each Tick to one of three alert states,
// applying noDataState policy via a stateful fold (KeepLast reads the prior state).
// See docs/internals/evaluator.md for the full picture.

import type { NoDataState, Threshold, Timestamp } from '../../../data/types';
import type { Tick } from '../0-tick/types';
import { passes } from './threshold/threshold';

type TickState = 'Firing' | 'Normal' | 'NoData';

export type ClassifiedTick = {
  readonly t: Timestamp;
  readonly state: TickState;
};

// The two AlertConfig fields Stage 1 consumes. Grouped because they're always passed together
// and conceptually describe one thing — "how to classify a tick."
export type ClassifyConfig = {
  readonly threshold: Threshold;
  readonly noDataState: NoDataState;
};

// Pure per-tick decision. Stateful sequencing (KeepLast) lives in classifyTicks's fold below.
function tickStateOf(
  tick: Tick,
  config: ClassifyConfig,
  previousState: TickState,
): TickState {
  if (tick.kind === 'Data') {
    return passes(tick.v, config.threshold) ? 'Firing' : 'Normal';
  }
  switch (config.noDataState) {
    case 'Alerting':
      return 'Firing';
    case 'Ok':
      return 'Normal';
    case 'NoData':
      return 'NoData';
    case 'KeepLast':
      return previousState;
  }
}

// Fold over ticks, threading the prior state forward for KeepLast.
// `initialState` is the state the classifier assumes held immediately
// BEFORE the first tick. Callers who can determine the truth (e.g. by
// querying Grafana's annotations API for the rule's last transition)
// pass it; everyone else gets the legacy 'Normal' default which matches
// Grafana's "alert starts in Normal" cold-boot assumption.
// Written as an explicit for-loop rather than `.map` so the fold pattern is visible:
// `.map`'s API suggests pure mapping, but per-tick state lookup requires sequential state.
export function classifyTicks(
  ticks: ReadonlyArray<Tick>,
  config: ClassifyConfig,
  initialState: TickState = 'Normal',
): ReadonlyArray<ClassifiedTick> {
  const classified: ClassifiedTick[] = [];
  let previousState: TickState = initialState;
  for (const tick of ticks) {
    const state = tickStateOf(tick, config, previousState);
    classified.push({ t: tick.t, state });
    previousState = state;
  }
  return classified;
}
