import type { Sample, Threshold } from '@alert-whatif/core';
import { passes } from '@alert-whatif/core';

export type CrossingDirection = 'ignition' | 'resolution';
export type ThresholdCrossing = {
  readonly t: number;
  readonly v: number;
  readonly direction: CrossingDirection;
};

// Geometric crossings of the mean line with the threshold, tagged ignition vs
// resolution by alert-state (an `Lt 5` threshold ignites on a falling value).
// [] for range thresholds (no single intersection point).
export function findThresholdCrossings(
  samples: ReadonlyArray<Sample>,
  threshold: Threshold,
): ReadonlyArray<ThresholdCrossing> {
  if (!('value' in threshold)) return [];

  const finite: Sample[] = [];
  for (const s of samples) {
    if (Number.isFinite(s.v)) finite.push(s);
  }
  if (finite.length < 2) return [];

  const thresholdValue = threshold.value;
  const out: ThresholdCrossing[] = [];
  for (let i = 0; i < finite.length - 1; i++) {
    const a = finite[i]!;
    const b = finite[i + 1]!;
    const aPasses = passes(a.v, threshold);
    const bPasses = passes(b.v, threshold);
    if (aPasses === bPasses) continue;
    // Intersection of segment a→b with the threshold; on samples (not ticks)
    // so the marker lands on the exact visual crossing.
    const denom = b.v - a.v;
    const t =
      denom === 0
        ? (a.t + b.t) / 2
        : a.t + ((thresholdValue - a.v) / denom) * (b.t - a.t);
    out.push({
      t,
      v: thresholdValue,
      direction: bPasses ? 'ignition' : 'resolution',
    });
  }
  return out;
}
