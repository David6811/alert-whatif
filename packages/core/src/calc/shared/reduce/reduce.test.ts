import { describe, expect, it } from 'vitest';
import type { Sample } from '../../../data/types';
import { reduce } from './reduce';

const empty: ReadonlyArray<Sample> = [];
const single: ReadonlyArray<Sample> = [{ t: 1000, v: 7 }];
const triple: ReadonlyArray<Sample> = [
  { t: 1000, v: 2 },
  { t: 2000, v: 5 },
  { t: 3000, v: 8 },
];
const withNaN: ReadonlyArray<Sample> = [
  { t: 1000, v: 2 },
  { t: 2000, v: Number.NaN },
  { t: 3000, v: 8 },
];
const allNaN: ReadonlyArray<Sample> = [
  { t: 1000, v: Number.NaN },
  { t: 2000, v: Number.NaN },
];

describe('reduce', () => {
  describe('Last', () => {
    it('returns NaN on an empty series', () => {
      expect(reduce(empty, 'Last')).toBeNaN();
    });
    it('returns the single value when there is one sample', () => {
      expect(reduce(single, 'Last')).toBe(7);
    });
    it('returns the chronologically last value', () => {
      expect(reduce(triple, 'Last')).toBe(8);
    });
  });

  describe('Min', () => {
    it('returns NaN on an empty series', () => {
      expect(reduce(empty, 'Min')).toBeNaN();
    });
    it('returns the smallest value', () => {
      expect(reduce(triple, 'Min')).toBe(2);
    });
  });

  describe('Max', () => {
    it('returns NaN on an empty series', () => {
      expect(reduce(empty, 'Max')).toBeNaN();
    });
    it('returns the largest value', () => {
      expect(reduce(triple, 'Max')).toBe(8);
    });
  });

  describe('Sum', () => {
    it('returns 0 on an empty series (additive identity)', () => {
      expect(reduce(empty, 'Sum')).toBe(0);
    });
    it('returns the arithmetic sum of all sample values', () => {
      expect(reduce(triple, 'Sum')).toBe(15);
    });
  });

  describe('Mean', () => {
    it('returns NaN on an empty series', () => {
      expect(reduce(empty, 'Mean')).toBeNaN();
    });
    it('returns the arithmetic mean of all sample values', () => {
      expect(reduce(triple, 'Mean')).toBe(5);
    });
  });

  describe('Count', () => {
    it('returns 0 on an empty series', () => {
      expect(reduce(empty, 'Count')).toBe(0);
    });
    it('returns the number of samples regardless of their values', () => {
      expect(reduce(triple, 'Count')).toBe(3);
    });
  });

  describe('Median', () => {
    it('returns NaN on an empty series', () => {
      expect(reduce(empty, 'Median')).toBeNaN();
    });
    it('returns the only value when there is one sample', () => {
      expect(reduce(single, 'Median')).toBe(7);
    });
    it('returns the middle value for an odd-count series', () => {
      expect(reduce(triple, 'Median')).toBe(5);
    });
    it('returns the mean of the two middles for an even-count series', () => {
      const quad: ReadonlyArray<Sample> = [
        { t: 1000, v: 1 },
        { t: 2000, v: 2 },
        { t: 3000, v: 3 },
        { t: 4000, v: 4 },
      ];
      // [1, 2, 3, 4] → middles are 2 and 3 → median = 2.5
      expect(reduce(quad, 'Median')).toBe(2.5);
    });
    it('is order-independent (sorts before picking middle)', () => {
      const unsorted: ReadonlyArray<Sample> = [
        { t: 1000, v: 100 },
        { t: 2000, v: 1 },
        { t: 3000, v: 50 },
      ];
      // sorted = [1, 50, 100] → median = 50
      expect(reduce(unsorted, 'Median')).toBe(50);
    });
  });

  // Reducers operate on input as-is — they do NOT filter NaN. NaN handling is the mapper
  // layer's job (`./nan-mode.ts`). These tests pin the reducer's *natural* behaviour when
  // NaN is present in the input. See spec doc §8 "Default (no mode)".
  describe('NaN propagation (no mapper)', () => {
    it('Sum propagates NaN (any NaN summand taints the result)', () => {
      // [2, NaN, 8] → 0 + 2 + NaN + 8 = NaN
      expect(reduce(withNaN, 'Sum')).toBeNaN();
    });
    it('Mean propagates NaN', () => {
      expect(reduce(withNaN, 'Mean')).toBeNaN();
    });
    it('Count counts every sample including NaN', () => {
      // [2, NaN, 8] → length = 3 (NaN inclusive)
      expect(reduce(withNaN, 'Count')).toBe(3);
    });
    it('Min/Max return NaN when any sample is NaN (IEEE 754)', () => {
      expect(reduce(withNaN, 'Min')).toBeNaN();
      expect(reduce(withNaN, 'Max')).toBeNaN();
    });
    it('Last returns the chronologically last value (NaN if it happens to be NaN)', () => {
      // [2, NaN, 8] → 8 (NaN is in the middle, last sample is 8)
      expect(reduce(withNaN, 'Last')).toBe(8);
      // [2, 8, NaN] → NaN
      const trailingNaN: ReadonlyArray<Sample> = [
        { t: 1000, v: 2 },
        { t: 2000, v: 8 },
        { t: 3000, v: Number.NaN },
      ];
      expect(reduce(trailingNaN, 'Last')).toBeNaN();
    });
    it('Median returns NaN when any sample is NaN (sort with NaN is undefined; we short-circuit)', () => {
      expect(reduce(withNaN, 'Median')).toBeNaN();
    });
    it('all-NaN input — every statistic except Sum/Count is NaN', () => {
      expect(reduce(allNaN, 'Last')).toBeNaN();
      expect(reduce(allNaN, 'Min')).toBeNaN();
      expect(reduce(allNaN, 'Max')).toBeNaN();
      expect(reduce(allNaN, 'Mean')).toBeNaN();
      expect(reduce(allNaN, 'Median')).toBeNaN();
      // Sum: 0 + NaN + NaN = NaN (propagation, not "empty additive identity 0").
      expect(reduce(allNaN, 'Sum')).toBeNaN();
      // Count: counts every sample regardless of value.
      expect(reduce(allNaN, 'Count')).toBe(2);
    });
  });
});
