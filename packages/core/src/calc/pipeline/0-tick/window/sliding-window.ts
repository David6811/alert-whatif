import type { Duration, Sample, Timestamp } from '../../../../data/types';

export type WindowCursor = {
  readonly leftIdx: number;
  readonly rightIdx: number;
};

export const INITIAL_CURSOR: WindowCursor = { leftIdx: 0, rightIdx: 0 };

//                                windowStart                       t
//                                     │                            │
//                                     ▼                            ▼
//   samples ─→    ●    ●    ●    ●    ●    ●    ●    ●    ●    ●  ●    ●
//                                     ↑                            ↑
//                                  leftIdx                      rightIdx
//                                  (inclusive — points AT the   (exclusive
//                                   first sample inside the      end of the
//                                   window)                      slice)
//                                     └──── returned slice ────┘
//
// Closed-both-ends `[t - windowDuration, t]` matches Grafana's
// `relativeTimeRange` semantics — verified against the
// for-gate-boundary__2026-05-14 fidelity fixture.
export function slideTo(
  samples: ReadonlyArray<Sample>,
  cursor: WindowCursor,
  t: Timestamp,
  windowDuration: Duration,
): { readonly cursor: WindowCursor; readonly slice: ReadonlyArray<Sample> } {
  const windowStart = t - windowDuration;
  let leftIdx = cursor.leftIdx;
  let rightIdx = cursor.rightIdx;
  while (leftIdx < samples.length && samples[leftIdx]!.t < windowStart) leftIdx++;
  while (rightIdx < samples.length && samples[rightIdx]!.t <= t) rightIdx++;
  return {
    cursor: { leftIdx, rightIdx },
    slice: samples.slice(leftIdx, rightIdx),
  };
}

export type TickedSlice = {
  readonly tickTime: Timestamp;
  readonly slice: ReadonlyArray<Sample>;
};

export function slidingWindows(
  samples: ReadonlyArray<Sample>,
  tickTimes: ReadonlyArray<Timestamp>,
  windowDuration: Duration,
): ReadonlyArray<TickedSlice> {
  const windowed: TickedSlice[] = [];
  let cursor: WindowCursor = INITIAL_CURSOR;
  for (const tickTime of tickTimes) {
    const { cursor: next, slice } = slideTo(samples, cursor, tickTime, windowDuration);
    cursor = next;
    windowed.push({ tickTime, slice });
  }
  return windowed;
}
