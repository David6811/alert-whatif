// Stage 3 of the evaluation pipeline. Translates one Lifecycle into a sequence of EvalEvents.
//
// The lifecycle abstraction (`./lifecycle.ts`) is what enables the for-gate to count from
// the FIRST non-Normal tick across Firing↔NoData transitions, matching Grafana's "Pending
// StartsAt is preserved across mid-lifecycle state changes" (spec doc §3 fact 3 + §4).
//
// What this does NOT yet do:
//   - Re-enter Pending after the for-gate has fired. Grafana's full state machine does
//     this — e.g., Alerting → NoData triggers SetPending(reason=NoData) with a fresh
//     StartsAt at the moment NoData arrived. We emit the post-gate segments directly
//     without an intervening Pending. Pinned by `Firing→NoData after promotion` test.
//   - Merge consecutive lifecycles separated by a Normal gap shorter than
//     `keepFiringFor`. Grafana treats the re-fire as continuation of the same Alerting
//     state (skip Pending — see spec doc §3 fact 4); we emit them as two lifecycles.
//     Pinned by `re-fire during KFF window` test (Step 14d.7).
//
// Cancelled-pending (Pending then Resolved with no Firing/NoData event between) is
// intentional, for UI visibility — matches `docs/02-architecture.md`.

import type { Duration, EvalEvent } from '../../../data/types';
import type { Lifecycle } from '../3-lifecycle/lifecycle';

// Stage 3 config — the three timing fields `lifecycleToEvents` actually reads
// from the full `AlertConfig`. Declaring it explicitly here means the function
// signature reveals its exact dependency set instead of accepting an entire
// `AlertConfig`. Structurally compatible with `AlertConfig`, so callers can
// pass `config` directly (TypeScript's structural subtyping handles the rest).
//
// Companion to `TickConfig` / `ClassifyConfig` — same encapsulation pattern,
// one record per pipeline stage.
export type EmitConfig = {
  readonly forDuration: Duration;
  readonly keepFiringFor: Duration;
  readonly evaluationInterval: Duration;
};

export function lifecycleToEvents(
  lifecycle: Lifecycle,
  config: EmitConfig,
): ReadonlyArray<EvalEvent> {
  const { forDuration, keepFiringFor, evaluationInterval } = config;
  const events: EvalEvent[] = [];
  // `lifecycle.segments` is guaranteed non-empty by `findLifecycles` — a lifecycle is only
  // created when at least one non-Normal episode exists.
  const firstSegment = lifecycle.segments[0]!;
  const lastSegment = lifecycle.segments[lifecycle.segments.length - 1]!;
  const lifecycleStart = firstSegment.from;
  // Open vs closed lifecycle, and what `until` means for the last emitted event:
  //
  //   Closed (resolvedAt != null):
  //     `lastSegment.until` is the resolution timestamp (see `findStateEpisodes`'
  //     Normal-tick branch — Firing.until extends to the Normal tick). The half-
  //     open `[from, until)` interval is correct as-is: at `until`, the alert
  //     has already transitioned to Normal.
  //
  //   Open (resolvedAt === null):
  //     `lastSegment.until` is the LAST tick where the state was confirmed
  //     holding (no Normal yet). If we used that as the emitted event's `until`,
  //     consumers checking `tick.t < event.until` at the current (last) tick
  //     would say "no event covers this tick" — even though the alert IS still
  //     active. UI readers (chip, Compute trace) would diverge from the state
  //     bar's geometric rect at the right boundary.
  //
  //     Extend `until` by one `evaluationInterval`: the event reads as "this
  //     state holds until at least the next scheduled eval." If the next eval
  //     never happens (series ends here), consumers still see the current tick
  //     inside the interval. If the next eval transitions to a different state,
  //     subsequent re-evaluation overwrites the event boundary anyway.
  //
  //     One eval interval is the right amount: it's the cadence at which Grafana
  //     promises to confirm or change the state. Anything less leaves the same
  //     boundary problem at a smaller scale; anything more would falsely claim
  //     the state holds beyond Grafana's own commitment.
  //
  // Note: `reachedForGate` is computed against the NATURAL (unextended) value
  // so we don't promote a still-Pending alert to Firing on hypothetical future
  // ticks. The extension only affects the `until` we EMIT on the last event,
  // not the for-gate decision itself.
  const naturalLastUntil = lastSegment.until;
  const lastSegmentUntil =
    lifecycle.resolvedAt === null
      ? naturalLastUntil + evaluationInterval
      : naturalLastUntil;
  const lifecycleLastUntil = lastSegmentUntil;

  const forGateFiresAt = lifecycleStart + forDuration;
  // A lifecycle that was already in progress at series-start passed the
  // for-gate before any of our visible samples — treat it as if forDuration=0
  // for emission so we DON'T fabricate a phantom Pending at windowStart and
  // DON'T clip the first segment to forGateFiresAt.
  const reachedForGate = lifecycle.preExisted || forGateFiresAt <= naturalLastUntil;
  const effectiveGate = lifecycle.preExisted ? lifecycleStart : forGateFiresAt;

  if (forDuration > 0 && !lifecycle.preExisted) {
    const pendingUntil = reachedForGate ? forGateFiresAt : lifecycleLastUntil;
    events.push({ kind: 'Pending', from: lifecycleStart, until: pendingUntil });
  }

  if (reachedForGate) {
    // Walk segments and emit one event per segment portion that lies after the for-gate.
    // For-gate may fire in the middle of a segment — clip that segment's start to the gate.
    // The LAST segment's `until` uses the open-lifecycle extension if applicable;
    // earlier segments keep their natural boundaries (they ended via state transition,
    // not because of lifecycle open-end).
    const lastIdx = lifecycle.segments.length - 1;
    lifecycle.segments.forEach((segment, idx) => {
      if (segment.until < effectiveGate) return;
      const eventFrom = Math.max(segment.from, effectiveGate);
      const eventUntil = idx === lastIdx ? lastSegmentUntil : segment.until;
      events.push({ kind: segment.state, from: eventFrom, until: eventUntil });
    });
  }

  // `Recovering` only applies when the alert actually reached the Alerting state (passed
  // the for-gate) AND `keepFiringFor > 0`. Grafana's `resultNormal` case is explicit:
  // `state.State == eval.Alerting && rule.KeepFiringFor > 0` ⇒ SetRecovering.
  // Cancelled-Pending lifecycles never reached Alerting, so they don't enter Recovering.
  if (reachedForGate && keepFiringFor > 0 && lifecycle.resolvedAt !== null) {
    const recoveringEnd = lifecycleLastUntil + keepFiringFor;
    events.push({ kind: 'Recovering', from: lifecycleLastUntil, until: recoveringEnd });
    events.push({ kind: 'Resolved', at: recoveringEnd });
  } else if (lifecycle.resolvedAt !== null) {
    events.push({ kind: 'Resolved', at: lifecycle.resolvedAt });
  }

  return events;
}
