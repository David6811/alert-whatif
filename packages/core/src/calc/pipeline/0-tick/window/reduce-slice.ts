// What value does a tick have? Pure per-slice reducer — given the samples
// inside one tick's window and the rule's reducer/NaN policy, produce one
// `Tick` (Data or NoData). Only range mode uses this; instant mode picks a
// single sample without reducing.

import type { Sample, Timestamp } from '../../../../data/types';
import { applyMapInput, applyMapOutput } from '../../../shared/nan-mode/nan-mode';
import { reduce } from '../../../shared/reduce/reduce';
import type { RangeTickConfig, Tick } from '../types';

// Empty slice → NoData. Empty after MapInput → NoData. MapOutput=null → NoData.
export function reduceSliceToTick(
  slice: ReadonlyArray<Sample>,
  tickTime: Timestamp,
  config: RangeTickConfig,
): Tick {
  if (slice.length === 0) return { kind: 'NoData', t: tickTime };
  const mapped = applyMapInput(slice, config.nanMode);
  if (mapped.length === 0) return { kind: 'NoData', t: tickTime };
  const reduced = reduce(mapped, config.reducer);
  const out = applyMapOutput(reduced, config.nanMode);
  return out === null
    ? { kind: 'NoData', t: tickTime }
    : { kind: 'Data', t: tickTime, v: out };
}
