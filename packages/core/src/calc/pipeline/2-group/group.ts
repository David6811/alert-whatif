import type { Timestamp } from '../../../data/types';
import type { ClassifiedTick } from '../1-classify/classify';

type OpenStateEpisode = {
  readonly state: 'Firing' | 'NoData';
  readonly from: Timestamp;
  readonly until: Timestamp;
};

export type StateEpisode = {
  readonly state: 'Firing' | 'NoData';
  readonly from: Timestamp;
  readonly until: Timestamp;
  // Set only when the next tick is Normal (true resolution); null when the episode ended
  // at end-of-series OR transitioned directly to another non-Normal state (Firing ↔ NoData).
  readonly resolvedAt: Timestamp | null;
};

function extendEpisode(
  open: OpenStateEpisode,
  tick: ClassifiedTick & { state: 'Firing' | 'NoData' },
): OpenStateEpisode {
  return { state: open.state, from: open.from, until: tick.t };
}

function startEpisode(
  tick: ClassifiedTick & { state: 'Firing' | 'NoData' },
): OpenStateEpisode {
  return { state: tick.state, from: tick.t, until: tick.t };
}

function finalizeEpisode(
  open: OpenStateEpisode,
  resolvedAt: Timestamp | null,
): StateEpisode {
  return { state: open.state, from: open.from, until: open.until, resolvedAt };
}

export function findStateEpisodes(
  classified: ReadonlyArray<ClassifiedTick>,
): ReadonlyArray<StateEpisode> {
  const episodes: StateEpisode[] = [];
  let open: OpenStateEpisode | null = null;

  for (const tick of classified) {
    if (tick.state === 'Normal') {
      if (open !== null) {
        // Extend Firing.until to the Normal tick's timestamp so the emitted
        // event boundary matches Grafana's `Firing.until === Resolved.at`
        // (verified by the qrc-demo-range-max__2026-05-09 fixture). NOT
        // applied to NoData→Normal / Firing↔NoData / Cancelled-Pending→Normal
        // — the same off-by-one likely exists there but isn't fixture-
        // verified, and `docs/04-grafana-fidelity.md` bans extrapolation.
        const extended = open.state === 'Firing' ? { ...open, until: tick.t } : open;
        episodes.push(finalizeEpisode(extended, tick.t));
        open = null;
      }
    } else if (open === null) {
      open = startEpisode(tick as ClassifiedTick & { state: 'Firing' | 'NoData' });
    } else if (open.state === tick.state) {
      open = extendEpisode(open, tick as ClassifiedTick & { state: 'Firing' | 'NoData' });
    } else {
      episodes.push(finalizeEpisode(open, null));
      open = startEpisode(tick as ClassifiedTick & { state: 'Firing' | 'NoData' });
    }
  }

  if (open !== null) {
    episodes.push(finalizeEpisode(open, null));
  }

  return episodes;
}
