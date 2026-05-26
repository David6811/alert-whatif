import type {
  AlertConfig,
  EvalResult,
  EvaluatorHints,
  MetricSeries,
  Result,
} from '../data/types';
import { pipe } from '../util/pipe';
import { evaluateAtTicks } from './pipeline/0-tick/tick';
import { validateAlertConfig } from './validate/validate';
import { classifyTicks } from './pipeline/1-classify/classify';
import { lifecycleToEvents } from './pipeline/4-emit/emit';
import { findStateEpisodes } from './pipeline/2-group/group';
import { findLifecycles, type Lifecycle } from './pipeline/3-lifecycle/lifecycle';

export function evaluate(
  config: AlertConfig,
  series: MetricSeries,
  hints?: EvaluatorHints,
): Result<EvalResult> {
  const validation = validateAlertConfig(config);
  if (validation.kind === 'Err') return validation;

  const emit = (lifecycles: ReadonlyArray<Lifecycle>) =>
    lifecycles.flatMap((lifecycle) => lifecycleToEvents(lifecycle, config));

  const evaluatedTicks = evaluateAtTicks(series.samples, config, hints);
  const events = pipe(
    evaluatedTicks,
    (ticks) => classifyTicks(ticks, config, hints?.initialState),
    findStateEpisodes,
    (episodes) => findLifecycles(episodes, hints?.initialState),
    emit,
  );
  return { kind: 'Ok', value: { events, ticks: evaluatedTicks } };
}
