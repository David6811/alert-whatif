// Stage 0 of the evaluator: samples → ticks. Core does not simulate
// Grafana's query-side downsampling — see docs/04-grafana-fidelity.md.

import type { EvaluatorHints, Sample } from '../../../data/types';
import { computeInstantTickValues } from './strategies/instant';
import { passthroughTicks } from './strategies/passthrough';
import { computeRangeTickValues } from './strategies/range';
import type { Tick, TickConfig } from './types';

export function evaluateAtTicks(
  samples: ReadonlyArray<Sample>,
  config: TickConfig,
  hints?: EvaluatorHints,
): ReadonlyArray<Tick> {
  if (samples.length === 0) return [];
  // Passthrough has no schedule — `hints.endTime` is ignored on this path.
  if (config.evaluationInterval <= 0) return passthroughTicks(samples);
  if (config.instant) return computeInstantTickValues(samples, config, hints);
  return computeRangeTickValues(samples, config, hints);
}
