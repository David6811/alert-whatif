import { describe, expect, it } from 'vitest';
import type { Sample } from '../data/types';
import { downsampleToStep } from './downsample';

describe('downsampleToStep', () => {
  const fine: ReadonlyArray<Sample> = [
    { t: 0, v: 1 },
    { t: 1000, v: 2 },
    { t: 2000, v: 3 },
    { t: 3000, v: 4 },
    { t: 4000, v: 5 },
  ];

  it('is a no-op when stepMs equals the recording resolution', () => {
    expect(downsampleToStep(fine, 1000, 0)).toEqual(fine);
  });

  it('is a no-op when stepMs is not an integer multiple of the recording resolution', () => {
    expect(downsampleToStep(fine, 1500, 0)).toEqual(fine);
  });

  it('is a no-op for fewer than 2 samples', () => {
    const one: ReadonlyArray<Sample> = [{ t: 0, v: 1 }];
    expect(downsampleToStep(one, 2000, 0)).toEqual(one);
  });

  it('keeps samples on the step grid at phase 0', () => {
    expect(downsampleToStep(fine, 2000, 0)).toEqual([
      { t: 0, v: 1 },
      { t: 2000, v: 3 },
      { t: 4000, v: 5 },
    ]);
  });

  it('phase-aligns the kept samples to phaseMs', () => {
    expect(downsampleToStep(fine, 2000, 1000)).toEqual([
      { t: 1000, v: 2 },
      { t: 3000, v: 4 },
    ]);
  });
});
