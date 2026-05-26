/*
```mermaid
graph TD
  inputs([samples, config, hints?]) --> A[scheduleTickTimes<br/>tick grid phase-locked to samples]
  A -->|tickTimes| B[lookup sample at exact t]
  B -->|found| D[Data tick]
  B -->|missing| E[NoData tick]
```

Instant strategy: at each scheduled tick `t`, look up the sample at exactly
`s.t === t`. Present → Data; absent → NoData. No staleness, no
carry-forward, no reducer.

Why exact-match works: PromQL's `query_range` already returns one sample per
step at which the expression was defined and *omits* steps where it wasn't —
e.g. `rate(metric[2m])` over an empty window simply produces no sample. So
"value at T" is exactly "the sample whose `t` is T, if any." Carrying an
older sample forward would diverge from Grafana's instant query semantics
(verified empirically: see the [INSTANT] divergence trace dated 2026-05-17).

Why we can rely on `tick.t ∈ {sample.t}`: callers feed
`EvaluatorHints.evalGridOffsetMs` so `scheduleTickTimes` phase-locks the tick
grid to Grafana's eval grid, and Live-mode polling phase-aligns its
`query_range` start to the same anchor — every tick necessarily lands on a
step boundary, so a sample either exists there or PromQL was undefined
there (NoData).

Maps to Grafana rules where the query node has `model.instant: true`
(2-node DAG: query → threshold). NOTE: `relativeTimeRange.from` on the rule
is IGNORED for instant queries — it's range-query metadata.
*/

import type { EvaluatorHints, Sample } from '../../../../data/types';
import { scheduleTickTimes } from '../window/schedule';
import type { InstantTickConfig, Tick } from '../types';

export function computeInstantTickValues(
  samples: ReadonlyArray<Sample>,
  config: InstantTickConfig,
  hints?: EvaluatorHints,
): ReadonlyArray<Tick> {
  const tickTimes = scheduleTickTimes(samples, config.evaluationInterval, hints);
  const byT = new Map<number, Sample>();
  for (const s of samples) byT.set(s.t, s);
  return tickTimes.map((t) => {
    const sample = byT.get(t);
    return sample ? { kind: 'Data', t, v: sample.v } : { kind: 'NoData', t };
  });
}
