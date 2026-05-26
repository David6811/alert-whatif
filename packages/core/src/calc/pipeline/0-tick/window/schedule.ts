/*
```mermaid
graph TD
  inputs([samples, evaluationInterval, hints?]) --> A[resolveFirstTick<br/>where the grid STARTS]
  inputs --> B[resolveStopAt<br/>where the grid STOPS]
  A -->|firstTick| C[emitTickSequence<br/>fill in, stepping by evaluationInterval]
  B -->|stopAt| C
  C --> output([tick timestamps])
```
*/

import type { Duration, EvaluatorHints, Sample, Timestamp } from '../../../../data/types';

export function scheduleTickTimes(
  samples: ReadonlyArray<Sample>,
  evaluationInterval: Duration,
  hints?: EvaluatorHints,
): ReadonlyArray<Timestamp> {
  const firstSample = samples[0]!.t;
  const lastSample = samples[samples.length - 1]!.t;
  const gridAnchor = resolveGridAnchor(firstSample, hints?.startTime);
  const firstTick = resolveFirstTick(gridAnchor, evaluationInterval, hints?.evalGridOffsetMs);
  const stopAt = resolveStopAt(lastSample, hints?.endTime);
  return emitTickSequence(firstTick, stopAt, evaluationInterval);
}

// `startTime` (when provided) IS the grid anchor — the tick grid starts
// exactly there, regardless of firstSample:
//   - startTime EARLIER than firstSample → grid extends left with NoData
//     lead-in ticks (drill "how did we get here" view).
//   - startTime LATER than firstSample → the samples before startTime are
//     over-fetched WARM-UP: they complete the leftmost ticks' reduce
//     windows (`[t − windowDuration, t]`) but produce NO ticks of their
//     own, so the for-gate is never advanced by them (no eaten Pending).
// When no startTime is given, anchor to the first sample (legacy default).
function resolveGridAnchor(
  firstSample: Timestamp,
  startTime: Timestamp | undefined,
): Timestamp {
  return startTime ?? firstSample;
}

function resolveFirstTick(
  firstSample: Timestamp,
  evaluationInterval: Duration,
  evalGridOffsetMs: Duration | undefined,
): Timestamp {
  if (evalGridOffsetMs === undefined) return firstSample;
  const targetPhase = mathMod(evalGridOffsetMs, evaluationInterval);
  const currentPhase = mathMod(firstSample, evaluationInterval);
  const advance = mathMod(targetPhase - currentPhase, evaluationInterval);
  return firstSample + advance;
}

function resolveStopAt(lastSample: Timestamp, endTime: Timestamp | undefined): Timestamp {
  if (endTime === undefined) return lastSample;
  return Math.max(lastSample, endTime);
}

function emitTickSequence(
  firstTick: Timestamp,
  stopAt: Timestamp,
  evaluationInterval: Duration,
): ReadonlyArray<Timestamp> {
  if (firstTick > stopAt) return [];
  const tickCount = Math.floor((stopAt - firstTick) / evaluationInterval) + 1;
  return Array.from({ length: tickCount }, (_, i) => firstTick + i * evaluationInterval);
}

function mathMod(value: number, modulus: number): number {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}
