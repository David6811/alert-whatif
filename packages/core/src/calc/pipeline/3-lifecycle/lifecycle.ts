// Bundles consecutive unresolved episodes into a "lifecycle" — one
// continuous non-Normal run ending at a Normal tick. The for-gate counts
// from the lifecycle's first tick, so Pending.StartsAt carries forward
// across Firing ↔ NoData transitions until Normal arrives (Grafana spec
// doc §3 fact 3). Known divergence: post-promotion re-entry to Pending
// (e.g., Alerting → NoData triggers a fresh SetPending in real Grafana)
// isn't modeled here; emit.ts emits the post-gate segments directly.
// See spec doc §10.

import type { Timestamp } from '../../../data/types';
import type { StateEpisode } from '../2-group/group';

export type LifecycleSegment = {
  readonly state: 'Firing' | 'NoData';
  readonly from: Timestamp;
  readonly until: Timestamp;
};

export type Lifecycle = {
  readonly segments: ReadonlyArray<LifecycleSegment>;
  // Null if the series ended mid-lifecycle (still open); a timestamp when
  // a Normal tick closed it.
  readonly resolvedAt: Timestamp | null;
  // True when this lifecycle was ALREADY in progress at the first sample —
  // the caller told the classifier so via `EvaluatorHints.initialState`.
  // emit.ts skips the leading Pending event and starts the lifecycle's
  // first Firing/NoData segment at its natural `from` (no for-gate
  // adjustment), since the for-gate fired before the visible window.
  readonly preExisted: boolean;
};

export function findLifecycles(
  episodes: ReadonlyArray<StateEpisode>,
  initialState: 'Normal' | 'Firing' | 'NoData' = 'Normal',
): ReadonlyArray<Lifecycle> {
  const lifecycles: Lifecycle[] = [];
  let currentSegments: LifecycleSegment[] = [];
  let isFirstLifecycle = true;
  for (const ep of episodes) {
    currentSegments.push({ state: ep.state, from: ep.from, until: ep.until });
    if (ep.resolvedAt !== null) {
      lifecycles.push({
        segments: currentSegments,
        resolvedAt: ep.resolvedAt,
        preExisted: isFirstLifecycle && initialState !== 'Normal',
      });
      currentSegments = [];
      isFirstLifecycle = false;
    }
  }
  if (currentSegments.length > 0) {
    lifecycles.push({
      segments: currentSegments,
      resolvedAt: null,
      preExisted: isFirstLifecycle && initialState !== 'Normal',
    });
  }
  return lifecycles;
}
