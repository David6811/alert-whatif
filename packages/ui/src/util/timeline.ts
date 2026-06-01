import type { EvalEvent, Sample, Threshold } from '@alert-whatif/core';

// Builds the end-to-end "detection latency" timeline for an instant queue-lag
// rule, e.g.:
//
//   Case: queue_lag-jobs_stuck
//
//   t0  23:42:00   window start
//   t1  23:42:59   job created & enqueued        (lag = 0)
//   t2  23:48:59   threshold reached             (lag > 60s)
//   t3  23:49:00   evaluate → Pending
//   t5  23:50:00   evaluate → keep Pending
//   t4  23:51:00   Pending held for 2m → FIRING → email sent
//
//   total detection latency = t4 − t1 = 8min 1s
//
// The gauge value IS "seconds the oldest job has waited", so the enqueue time
// is `crossTime − thresholdSeconds` (lag equals the threshold at the crossing).

export interface TimelineInput {
  readonly ruleTitle: string;
  readonly events: ReadonlyArray<EvalEvent>;
  readonly samples: ReadonlyArray<Sample>;
  readonly threshold: Threshold;
  readonly evalIntervalMs: number;
  readonly forMs: number;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

type Pend = Extract<EvalEvent, { kind: 'Pending' }>;
type Fire = Extract<EvalEvent, { kind: 'Firing' }>;
type Res = Extract<EvalEvent, { kind: 'Resolved' }>;

export function buildTimeline(input: TimelineInput): string {
  const { ruleTitle, events, samples, threshold, evalIntervalMs, forMs } = input;
  const thr = 'value' in threshold ? threshold.value : null;

  // Multiple push runs accumulate in the series, so the events span several
  // episodes. Anchor on the MOST RECENT one (the episode the chart shows): the
  // last Firing, the Pending that LEADS INTO it (same episode), and the first
  // Resolved after it.
  let firing: Fire | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.kind === 'Firing') { firing = e; break; }
  }
  let pending: Pend | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.kind === 'Pending' && (firing === null || e.from <= firing.from)) {
      pending = e;
      break;
    }
  }
  const anchorT = firing?.from ?? pending?.from ?? null;
  let resolved: Res | null = null;
  if (firing) {
    for (const e of events) {
      if (e.kind === 'Resolved' && e.at >= firing.from) { resolved = e; break; }
    }
  }

  const finite = samples.filter((s) => Number.isFinite(s.v));
  // Threshold crossing = the last rising edge (prev ≤ thr, cur > thr) at/before
  // the anchor — i.e. where THIS episode's lag climbed past the threshold.
  let cross: Sample | null = null;
  if (thr !== null && anchorT !== null) {
    for (let i = 1; i < finite.length; i++) {
      const cur = finite[i]!;
      const prev = finite[i - 1]!;
      if (cur.t > anchorT) break;
      if (prev.v <= thr && cur.v > thr) cross = cur;
    }
  }

  const t0 = finite[0]?.t ?? null;
  // The crossing sample's value IS "seconds since enqueue", so enqueue =
  // cross.t − cross.v (exact). Using the threshold instead would be off by
  // (cross.v − threshold) — the 1 s the lag overshoots 60 between samples.
  const t2 = cross?.t ?? null;
  const t1 = cross !== null ? cross.t - cross.v * 1000 : t0;

  const lines: string[] = [`Case: ${ruleTitle}`, ''];
  const rows: Array<{ tag: string; t: number; label: string }> = [];

  if (t0 !== null) rows.push({ tag: 't0', t: t0, label: 'window start' });
  if (t1 !== null) {
    rows.push({ tag: 't1', t: t1, label: 'job created & enqueued (lag = 0)' });
  }
  if (t2 !== null && thr !== null) {
    rows.push({ tag: 't2', t: t2, label: `threshold reached (lag > ${thr}s)` });
  }

  if (pending) {
    const fireT = firing ? firing.from : pending.until;
    const step = evalIntervalMs > 0 ? evalIntervalMs : 60_000;
    let tick = pending.from;
    let isFirst = true;
    while (tick < fireT - 1_000) {
      rows.push({
        tag: 't',
        t: tick,
        label: isFirst ? 'evaluate → trigger Pending' : 'evaluate → keep Pending',
      });
      isFirst = false;
      tick += step;
    }
    if (isFirst) {
      rows.push({ tag: 't', t: pending.from, label: 'evaluate → trigger Pending' });
    }
  }

  if (firing) {
    const held = pending ? firing.from - pending.from : forMs;
    rows.push({
      tag: 't',
      t: firing.from,
      label: `Pending held ${duration(held)} → FIRING → email sent`,
    });
  }

  if (resolved) {
    rows.push({ tag: 't', t: resolved.at, label: 'recovered → Resolved' });
  }

  rows.sort((a, b) => a.t - b.t);
  for (const r of rows) {
    lines.push(`${r.tag.padEnd(3)} ${clock(r.t)}   ${r.label}`);
  }

  lines.push('');
  if (firing && t1 !== null) {
    lines.push(
      `total detection latency = fire − enqueue = ${duration(firing.from - t1)}`,
    );
  } else if (pending) {
    lines.push('(rule reached Pending but never fired)');
  } else {
    lines.push('(rule never crossed the threshold — no episode)');
  }

  return lines.join('\n');
}
