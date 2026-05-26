// Pure aggregation over an evaluator's events. The output is what any UI (plugin or
// demo) needs to show "your alert would have fired N times for a total of X minutes,
// with K near-misses." Deliberately a separate function from `evaluate()` so callers
// can opt in only when they need the stats.

import type { Duration, EvalEvent, EvalSummary } from '../../data/types';

// Walk events once, accumulating per-kind counts/durations plus the derived fields.
// Per-kind summaries are zeroed when no events of that kind exist.
export function summarize(events: ReadonlyArray<EvalEvent>): EvalSummary {
  let pendingCount = 0;
  let pendingTotalDuration: Duration = 0;
  let firingCount = 0;
  let firingTotalDuration: Duration = 0;
  let noDataCount = 0;
  let noDataTotalDuration: Duration = 0;
  let recoveringCount = 0;
  let recoveringTotalDuration: Duration = 0;
  let resolvedCount = 0;

  let firstFiringAt: number | null = null;
  let longestFiringSpan: Duration | null = null;
  let cancelledPendingCount = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;
    switch (event.kind) {
      case 'Pending': {
        pendingCount++;
        pendingTotalDuration += event.until - event.from;
        // Cancelled iff the next event is `Resolved` (no Firing/NoData/Recovering between).
        // Open Pending events at end-of-array are not cancelled — they're unresolved.
        const next = events[i + 1];
        if (next !== undefined && next.kind === 'Resolved') {
          cancelledPendingCount++;
        }
        break;
      }
      case 'Firing': {
        firingCount++;
        const span = event.until - event.from;
        firingTotalDuration += span;
        if (firstFiringAt === null) firstFiringAt = event.from;
        if (longestFiringSpan === null || span > longestFiringSpan) longestFiringSpan = span;
        break;
      }
      case 'NoData':
        noDataCount++;
        noDataTotalDuration += event.until - event.from;
        break;
      case 'Recovering':
        recoveringCount++;
        recoveringTotalDuration += event.until - event.from;
        break;
      case 'Resolved':
        resolvedCount++;
        break;
    }
  }

  return {
    pending: { count: pendingCount, totalDuration: pendingTotalDuration },
    firing: { count: firingCount, totalDuration: firingTotalDuration },
    noData: { count: noDataCount, totalDuration: noDataTotalDuration },
    recovering: { count: recoveringCount, totalDuration: recoveringTotalDuration },
    resolvedCount,
    firstFiringAt,
    longestFiringSpan,
    cancelledPendingCount,
  };
}
