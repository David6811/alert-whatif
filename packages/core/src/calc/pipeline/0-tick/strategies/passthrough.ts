// Pass-through strategy: each raw sample becomes a Data tick at its own timestamp.
// Used when `evaluationInterval ≤ 0` (the opt-out path — no aggregation).

import type { Sample } from '../../../../data/types';
import type { Tick } from '../types';

export function passthroughTicks(samples: ReadonlyArray<Sample>): ReadonlyArray<Tick> {
  return samples.map((s) => ({ kind: 'Data', t: s.t, v: s.v }));
}
