/*
```mermaid
graph TD
  inputs([samples, config, hints?]) --> A[scheduleTickTimes<br/>when do ticks happen?]
  A -->|tickTimes| B[slidingWindows<br/>what samples in each tick's window?]
  B -->|tickTime + slice pairs| C[reduceSliceToTick<br/>mapped: what value for each tick?]
  C --> output([Tick array])
```
*/

import type { EvaluatorHints, Sample } from '../../../../data/types';
import { reduceSliceToTick } from '../window/reduce-slice';
import { scheduleTickTimes } from '../window/schedule';
import { slidingWindows } from '../window/sliding-window';
import type { RangeTickConfig, Tick } from '../types';

export function computeRangeTickValues(
  samples: ReadonlyArray<Sample>,
  config: RangeTickConfig,
  hints?: EvaluatorHints,
): ReadonlyArray<Tick> {
  const tickTimes = scheduleTickTimes(samples, config.evaluationInterval, hints);
  const windowed = slidingWindows(samples, tickTimes, config.windowDuration);
  return windowed.map(({ tickTime, slice }) => reduceSliceToTick(slice, tickTime, config));
}
