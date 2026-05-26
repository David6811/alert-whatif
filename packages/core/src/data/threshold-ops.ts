import type {
  Threshold,
  ThresholdComparisonOp,
  ThresholdOp,
  ThresholdRangeOp,
} from './types';

export const COMPARISON_OPS: readonly ThresholdComparisonOp[] = [
  'Gt',
  'Lt',
  'GtEq',
  'LtEq',
  'Eq',
  'Ne',
];

export const RANGE_OPS: readonly ThresholdRangeOp[] = [
  'WithinRange',
  'OutsideRange',
  'WithinRangeIncluded',
  'OutsideRangeIncluded',
];

export function isRangeOp(op: ThresholdOp): op is ThresholdRangeOp {
  return (RANGE_OPS as readonly string[]).includes(op);
}

export function changeThresholdOp(current: Threshold, nextOp: ThresholdOp): Threshold {
  if (isRangeOp(nextOp)) {
    if ('value' in current) {
      return { op: nextOp, left: current.value, right: current.value };
    }
    return { op: nextOp, left: current.left, right: current.right };
  }
  if ('value' in current) {
    return { op: nextOp, value: current.value };
  }
  return { op: nextOp, value: current.left };
}
