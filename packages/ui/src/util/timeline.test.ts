import { describe, it, expect } from 'vitest';
import type { EvalEvent, Sample } from '@alert-whatif/core';
import { buildTimeline } from './timeline';

const T0 = 1_700_000_000_000; // fixed epoch ms

// lag ramps 0 → 130 at +1/s, sampled every 5s.
const samples: ReadonlyArray<Sample> = Array.from({ length: 27 }, (_, i) => ({
  t: T0 + i * 5_000,
  v: i * 5,
}));

const events: ReadonlyArray<EvalEvent> = [
  { kind: 'Pending', from: T0 + 60_000, until: T0 + 120_000 },
  { kind: 'Firing', from: T0 + 120_000, until: T0 + 130_000 },
  { kind: 'Resolved', at: T0 + 130_000 },
];

describe('buildTimeline', () => {
  it('produces the enqueue → threshold → pending → fire timeline with latency', () => {
    const out = buildTimeline({
      ruleTitle: 'queue_lag-jobs_stuck',
      events,
      samples,
      threshold: { op: 'Gt', value: 60 },
      evalIntervalMs: 60_000,
      forMs: 60_000,
    });
    expect(out).toContain('Case: queue_lag-jobs_stuck');
    expect(out).toContain('job created & enqueued (lag = 0)');
    expect(out).toContain('threshold reached (lag > 60s)');
    expect(out).toContain('evaluate → trigger Pending');
    expect(out).toContain('Pending held 1min 0s → FIRING → email sent');
    expect(out).toContain('recovered → Resolved');
    // crossing sample is v=65 @ T0+65s; enqueue = cross.t − cross.v = T0+65s − 65s = T0.
    // latency = fire(T0+120s) − enqueue(T0) = 2min 0s.
    expect(out).toContain('total detection latency = fire − enqueue = 2min 0s');
  });

  it('anchors on the most recent episode when several are present', () => {
    const twoEpisodes: ReadonlyArray<EvalEvent> = [
      { kind: 'Pending', from: T0 + 60_000, until: T0 + 120_000 },
      { kind: 'Firing', from: T0 + 120_000, until: T0 + 130_000 },
      { kind: 'Resolved', at: T0 + 130_000 },
      { kind: 'Pending', from: T0 + 600_000, until: T0 + 660_000 },
      { kind: 'Firing', from: T0 + 660_000, until: T0 + 670_000 },
      { kind: 'Resolved', at: T0 + 670_000 },
    ];
    // First ramp, drop to 0, then a SECOND ramp crossing 60 at T0+600s.
    const s2: ReadonlyArray<Sample> = [
      ...samples,
      { t: T0 + 200_000, v: 0 },
      { t: T0 + 595_000, v: 60 },
      { t: T0 + 600_000, v: 65 },
      { t: T0 + 660_000, v: 125 },
    ];
    const out = buildTimeline({
      ruleTitle: 'r',
      events: twoEpisodes,
      samples: s2,
      threshold: { op: 'Gt', value: 60 },
      evalIntervalMs: 60_000,
      forMs: 60_000,
    });
    // 2nd cross @ T0+600s, v=65 → enqueue = T0+600s − 65s = T0+535s;
    // latency = fire(T0+660s) − T0+535s = 2min 5s.
    expect(out).toContain('total detection latency = fire − enqueue = 2min 5s');
  });

  it('notes when the rule reached Pending but never fired', () => {
    const out = buildTimeline({
      ruleTitle: 'r',
      events: [{ kind: 'Pending', from: T0 + 60_000, until: T0 + 90_000 }],
      samples,
      threshold: { op: 'Gt', value: 60 },
      evalIntervalMs: 60_000,
      forMs: 60_000,
    });
    expect(out).toContain('reached Pending but never fired');
  });

  it('notes when the rule never crossed the threshold', () => {
    const out = buildTimeline({
      ruleTitle: 'r',
      events: [],
      samples: [{ t: T0, v: 10 }],
      threshold: { op: 'Gt', value: 60 },
      evalIntervalMs: 60_000,
      forMs: 60_000,
    });
    expect(out).toContain('never crossed the threshold');
  });
});
