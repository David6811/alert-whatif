import { describe, expect, it } from 'vitest';
import { passes } from './threshold';

describe('passes', () => {
  describe('Gt', () => {
    it('is true when value strictly exceeds the threshold', () => {
      expect(passes(11, { op: 'Gt', value: 10 })).toBe(true);
    });
    it('is false when value equals the threshold', () => {
      expect(passes(10, { op: 'Gt', value: 10 })).toBe(false);
    });
    it('is false when value is below the threshold', () => {
      expect(passes(9, { op: 'Gt', value: 10 })).toBe(false);
    });
  });

  describe('Lt', () => {
    it('is true when value is strictly below the threshold', () => {
      expect(passes(9, { op: 'Lt', value: 10 })).toBe(true);
    });
    it('is false when value equals the threshold', () => {
      expect(passes(10, { op: 'Lt', value: 10 })).toBe(false);
    });
    it('is false when value exceeds the threshold', () => {
      expect(passes(11, { op: 'Lt', value: 10 })).toBe(false);
    });
  });

  describe('GtEq', () => {
    it('is true when value equals the threshold', () => {
      expect(passes(10, { op: 'GtEq', value: 10 })).toBe(true);
    });
    it('is true when value exceeds the threshold', () => {
      expect(passes(11, { op: 'GtEq', value: 10 })).toBe(true);
    });
    it('is false when value is below the threshold', () => {
      expect(passes(9, { op: 'GtEq', value: 10 })).toBe(false);
    });
  });

  describe('LtEq', () => {
    it('is true when value equals the threshold', () => {
      expect(passes(10, { op: 'LtEq', value: 10 })).toBe(true);
    });
    it('is true when value is below the threshold', () => {
      expect(passes(9, { op: 'LtEq', value: 10 })).toBe(true);
    });
    it('is false when value exceeds the threshold', () => {
      expect(passes(11, { op: 'LtEq', value: 10 })).toBe(false);
    });
  });

  describe('Eq', () => {
    it('is true when value exactly equals the threshold (IEEE 754 ===)', () => {
      expect(passes(10, { op: 'Eq', value: 10 })).toBe(true);
    });
    it('is false when value differs by any amount', () => {
      expect(passes(10.0000001, { op: 'Eq', value: 10 })).toBe(false);
      expect(passes(9.9999999, { op: 'Eq', value: 10 })).toBe(false);
    });
    it('is false when value is NaN (NaN === NaN is false in IEEE 754)', () => {
      expect(passes(Number.NaN, { op: 'Eq', value: Number.NaN })).toBe(false);
      expect(passes(Number.NaN, { op: 'Eq', value: 0 })).toBe(false);
    });
  });

  describe('Ne', () => {
    it('is true when value differs from the threshold', () => {
      expect(passes(11, { op: 'Ne', value: 10 })).toBe(true);
      expect(passes(9, { op: 'Ne', value: 10 })).toBe(true);
    });
    it('is false when value exactly equals the threshold', () => {
      expect(passes(10, { op: 'Ne', value: 10 })).toBe(false);
    });
    it('is true when value is NaN (NaN !== anything per IEEE 754, matches Grafana)', () => {
      // Note: this diverges from the other comparison operators where NaN → false.
      // Grafana's `pkg/expr/threshold.go` uses raw `!=` which makes NaN match every Ne
      // threshold. Spec doc §7: "beware NaN". A configured mapper (dropNN / replaceNN)
      // is the right way to keep NaN out of the threshold input.
      expect(passes(Number.NaN, { op: 'Ne', value: 0 })).toBe(true);
      expect(passes(Number.NaN, { op: 'Ne', value: Number.NaN })).toBe(true);
    });
  });

  describe('WithinRange (open interval — strict on both sides)', () => {
    it('is true when value is strictly inside [left, right]', () => {
      expect(passes(5, { op: 'WithinRange', left: 0, right: 10 })).toBe(true);
    });
    it('is false on the left boundary (strict)', () => {
      expect(passes(0, { op: 'WithinRange', left: 0, right: 10 })).toBe(false);
    });
    it('is false on the right boundary (strict)', () => {
      expect(passes(10, { op: 'WithinRange', left: 0, right: 10 })).toBe(false);
    });
    it('is false when value is outside the range', () => {
      expect(passes(-1, { op: 'WithinRange', left: 0, right: 10 })).toBe(false);
      expect(passes(11, { op: 'WithinRange', left: 0, right: 10 })).toBe(false);
    });
  });

  describe('OutsideRange (open complement)', () => {
    it('is true when value is strictly outside [left, right]', () => {
      expect(passes(-1, { op: 'OutsideRange', left: 0, right: 10 })).toBe(true);
      expect(passes(11, { op: 'OutsideRange', left: 0, right: 10 })).toBe(true);
    });
    it('is false on the left boundary (strict; boundary is neither in nor out)', () => {
      expect(passes(0, { op: 'OutsideRange', left: 0, right: 10 })).toBe(false);
    });
    it('is false on the right boundary (strict)', () => {
      expect(passes(10, { op: 'OutsideRange', left: 0, right: 10 })).toBe(false);
    });
    it('is false when value is inside the range', () => {
      expect(passes(5, { op: 'OutsideRange', left: 0, right: 10 })).toBe(false);
    });
  });

  describe('WithinRangeIncluded (closed interval — inclusive on both sides)', () => {
    it('is true when value is strictly inside', () => {
      expect(passes(5, { op: 'WithinRangeIncluded', left: 0, right: 10 })).toBe(true);
    });
    it('is true on the left boundary (inclusive)', () => {
      expect(passes(0, { op: 'WithinRangeIncluded', left: 0, right: 10 })).toBe(true);
    });
    it('is true on the right boundary (inclusive)', () => {
      expect(passes(10, { op: 'WithinRangeIncluded', left: 0, right: 10 })).toBe(true);
    });
    it('is false when value is outside the range', () => {
      expect(passes(-1, { op: 'WithinRangeIncluded', left: 0, right: 10 })).toBe(false);
      expect(passes(11, { op: 'WithinRangeIncluded', left: 0, right: 10 })).toBe(false);
    });
  });

  describe('OutsideRangeIncluded (closed complement)', () => {
    it('is true when value is strictly outside', () => {
      expect(passes(-1, { op: 'OutsideRangeIncluded', left: 0, right: 10 })).toBe(true);
      expect(passes(11, { op: 'OutsideRangeIncluded', left: 0, right: 10 })).toBe(true);
    });
    it('is true on the left boundary (inclusive)', () => {
      expect(passes(0, { op: 'OutsideRangeIncluded', left: 0, right: 10 })).toBe(true);
    });
    it('is true on the right boundary (inclusive)', () => {
      expect(passes(10, { op: 'OutsideRangeIncluded', left: 0, right: 10 })).toBe(true);
    });
    it('is false when value is strictly inside the range', () => {
      expect(passes(5, { op: 'OutsideRangeIncluded', left: 0, right: 10 })).toBe(false);
    });
  });

  describe('NaN value', () => {
    it('is false for every comparison operator except Ne', () => {
      expect(passes(Number.NaN, { op: 'Gt', value: 0 })).toBe(false);
      expect(passes(Number.NaN, { op: 'Lt', value: 0 })).toBe(false);
      expect(passes(Number.NaN, { op: 'GtEq', value: 0 })).toBe(false);
      expect(passes(Number.NaN, { op: 'LtEq', value: 0 })).toBe(false);
      expect(passes(Number.NaN, { op: 'Eq', value: 0 })).toBe(false);
      // Ne is intentionally excluded — see the Ne describe block for the IEEE 754 rationale.
    });
    it('is false for every range operator (all comparisons against NaN are false)', () => {
      expect(passes(Number.NaN, { op: 'WithinRange', left: 0, right: 10 })).toBe(false);
      expect(passes(Number.NaN, { op: 'OutsideRange', left: 0, right: 10 })).toBe(false);
      expect(passes(Number.NaN, { op: 'WithinRangeIncluded', left: 0, right: 10 })).toBe(false);
      expect(passes(Number.NaN, { op: 'OutsideRangeIncluded', left: 0, right: 10 })).toBe(false);
    });
  });
});
