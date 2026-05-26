import { describe, expect, it } from 'vitest';
import { deriveEvalGridOffsetMs } from './eval-grid-offset';

describe('deriveEvalGridOffsetMs', () => {
  const MINUTE = 60000;

  it('returns undefined when lastEvalMs is null', () => {
    expect(deriveEvalGridOffsetMs(null, MINUTE)).toBeUndefined();
  });

  it('returns the wallclock-modulo-interval offset (30s past the minute)', () => {
    const lastEval = Date.parse('2026-05-14T14:00:30Z');
    expect(deriveEvalGridOffsetMs(lastEval, MINUTE)).toBe(30000);
  });

  it('returns 0 when lastEvalMs lands exactly on the grid', () => {
    const lastEval = Date.parse('2026-05-14T14:00:00Z');
    expect(deriveEvalGridOffsetMs(lastEval, MINUTE)).toBe(0);
  });
});
