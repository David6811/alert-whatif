import { describe, it, expect } from 'vitest';
import type { Sample, Threshold } from '@alert-whatif/core';
import { findThresholdCrossings } from './crossings';

const sample = (t: number, v: number): Sample => ({ t, v });

describe('findThresholdCrossings', () => {
  it('tags an upward crossing of a Gt threshold as ignition', () => {
    const threshold: Threshold = { op: 'Gt', value: 5 };
    const crossings = findThresholdCrossings([sample(0, 0), sample(10, 10)], threshold);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.direction).toBe('ignition');
    expect(crossings[0]!.t).toBe(5);
  });

  it('tags a downward crossing of a Gt threshold as resolution', () => {
    const threshold: Threshold = { op: 'Gt', value: 5 };
    const crossings = findThresholdCrossings([sample(0, 10), sample(10, 0)], threshold);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]!.direction).toBe('resolution');
  });

  it('returns [] for a range threshold', () => {
    const threshold: Threshold = { op: 'WithinRange', left: 1, right: 9 };
    expect(findThresholdCrossings([sample(0, 0), sample(10, 10)], threshold)).toEqual([]);
  });

  it('returns [] when the samples never cross the threshold', () => {
    const threshold: Threshold = { op: 'Gt', value: 100 };
    expect(findThresholdCrossings([sample(0, 1), sample(10, 2)], threshold)).toEqual([]);
  });
});
