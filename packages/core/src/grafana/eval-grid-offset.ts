import type { Duration, Timestamp } from '../data/types';

export function deriveEvalGridOffsetMs(
  lastEvalMs: Timestamp | null,
  evaluationInterval: Duration,
): Duration | undefined {
  if (lastEvalMs === null) return undefined;
  return lastEvalMs % evaluationInterval;
}
