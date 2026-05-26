// Detect timing divergences between alert-whatif's evaluator output and the
// transitions Grafana actually wrote in its real-time annotations.
//
// Driven by issue #153 — see docs/06-ingestion-lag-feature.md. The motivating
// finding: Grafana's UI-built rules don't apply the `query_offset` that
// imported rules get (PR #102500 in grafana/grafana), so the first eval after
// a fresh-counter burst-start often runs against incompletely-ingested
// Prometheus data and the state transition is recorded one eval cycle late.
// alert-whatif's retroactive evaluator doesn't experience that lag, so its
// transitions land one tick earlier than Grafana's annotations.
//
// This function produces the input data for the chart's divergence indicator.
// Pure data-in / data-out; no UI concerns. Callers (in @alert-whatif/ui) adapt
// EvalEvent[] and grafanaHistory[] into the abstract StateTransition[] shape.

import type { Timestamp } from '../data/types';

export type DivergenceKind = 'Pending' | 'Firing' | 'Resolved';

export type StateTransition = {
  readonly t: Timestamp;
  readonly kind: DivergenceKind;
};

export type Divergence = {
  readonly kind: DivergenceKind;
  readonly stateAt: Timestamp;
  readonly grafanaAt: Timestamp;
  // `grafanaAt - stateAt`. Positive ⇒ Grafana lagged (the expected case
  // per issue #153); negative ⇒ alert-whatif lagged (unlikely outside
  // bugs / clock skew).
  readonly gapMs: number;
};

// Walk both transition lists in chronological order, pairing entries of the
// same kind. For each matched pair whose gap meets `minGapMs`, emit a
// Divergence. Unmatched entries are skipped silently — when one side has a
// transition the other doesn't, that's a different kind of divergence (full
// miss vs. timing mismatch) and is out of scope for this indicator.
//
// Two-pointer walk: O(n + m). For our typical chart (one episode, ≤4
// transitions on each side) this is trivial; the algorithm scales to busy
// dashboards without code changes.
export function detectStateBarDivergence(
  stateTransitions: ReadonlyArray<StateTransition>,
  grafanaTransitions: ReadonlyArray<StateTransition>,
  minGapMs: number,
): ReadonlyArray<Divergence> {
  const out: Divergence[] = [];
  let si = 0;
  let gi = 0;

  while (si < stateTransitions.length && gi < grafanaTransitions.length) {
    const s = stateTransitions[si]!;
    const g = grafanaTransitions[gi]!;

    if (s.kind === g.kind) {
      const gapMs = g.t - s.t;
      if (Math.abs(gapMs) >= minGapMs) {
        out.push({ kind: s.kind, stateAt: s.t, grafanaAt: g.t, gapMs });
      }
      si += 1;
      gi += 1;
      continue;
    }

    // Kinds differ → one side has a transition the other doesn't. Advance
    // whichever side is earlier in time; the later side may still pair with
    // a subsequent transition.
    if (s.t <= g.t) {
      si += 1;
    } else {
      gi += 1;
    }
  }

  return out;
}
