import { describe, expect, it } from 'vitest';
import { changeThresholdOp, isRangeOp } from './threshold-ops';

describe('isRangeOp', () => {
  it('is false for comparison ops', () => {
    expect(isRangeOp('Gt')).toBe(false);
  });

  it('is true for range ops', () => {
    expect(isRangeOp('WithinRange')).toBe(true);
    expect(isRangeOp('OutsideRangeIncluded')).toBe(true);
  });
});

describe('changeThresholdOp', () => {
  it('scalar → range: seeds both bounds from the scalar value', () => {
    expect(changeThresholdOp({ op: 'Gt', value: 5 }, 'WithinRange')).toEqual({
      op: 'WithinRange',
      left: 5,
      right: 5,
    });
  });

  it('range → scalar: takes the left bound as the scalar value', () => {
    expect(changeThresholdOp({ op: 'WithinRange', left: 3, right: 9 }, 'Gt')).toEqual({
      op: 'Gt',
      value: 3,
    });
  });

  it('scalar → scalar: preserves the value', () => {
    expect(changeThresholdOp({ op: 'Gt', value: 5 }, 'Lt')).toEqual({ op: 'Lt', value: 5 });
  });

  it('range → range: preserves both bounds', () => {
    expect(changeThresholdOp({ op: 'WithinRange', left: 3, right: 9 }, 'OutsideRange')).toEqual({
      op: 'OutsideRange',
      left: 3,
      right: 9,
    });
  });
});
