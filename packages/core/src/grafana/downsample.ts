import type { Sample } from '../data/types';

// Simulate a coarser query_range fetch on a frozen fixture: keep only the
// samples that land on the effective-step grid (phase-aligned to the rule's
// eval offset). When step === the recording resolution (the default), this is
// a no-op — every sample is kept, so non-coarsening demos are byte-identical.
// ILLUSTRATIVE: the exact step-grid phase Grafana/Prometheus use at a coarser
// step still needs validation against real Grafana (see docs); values are
// real recorded points, the selection is the open question.
export function downsampleToStep(
  samples: ReadonlyArray<Sample>,
  stepMs: number,
  phaseMs: number,
): ReadonlyArray<Sample> {
  if (samples.length < 2 || stepMs <= 0) return samples;
  const recStep = samples[1]!.t - samples[0]!.t;
  if (recStep <= 0 || stepMs <= recStep || stepMs % recStep !== 0) return samples;
  const targetPhase = ((phaseMs % stepMs) + stepMs) % stepMs;
  return samples.filter((s) => ((s.t % stepMs) + stepMs) % stepMs === targetPhase);
}
