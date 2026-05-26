import type { Threshold } from '../../../../data/types';

// Evaluates whether `value` satisfies the threshold predicate. Mirrors the 10 predicates
// in Grafana's `pkg/expr/threshold.go` one-for-one. NaN follows IEEE 754:
//   - Gt / Lt / GtEq / LtEq / Eq vs NaN → false (all comparisons against NaN are false)
//   - Ne vs NaN → true (NaN is unequal to everything, including itself; matches Grafana)
//   - Range ops vs NaN → false (rely on Gt/Lt comparisons which are false for NaN)
// Don't special-case NaN here — Grafana doesn't. Mappers upstream (dropNN / replaceNN)
// are responsible for keeping NaN out of the threshold input when that's the desired
// policy. See spec doc §7 "beware NaN" and §8.
export function passes(value: number, threshold: Threshold): boolean {
  switch (threshold.op) {
    case 'Gt':
      return value > threshold.value;
    case 'Lt':
      return value < threshold.value;
    case 'GtEq':
      return value >= threshold.value;
    case 'LtEq':
      return value <= threshold.value;
    case 'Eq':
      return value === threshold.value;
    case 'Ne':
      return value !== threshold.value;
    case 'WithinRange':
      return value > threshold.left && value < threshold.right;
    case 'OutsideRange':
      return value < threshold.left || value > threshold.right;
    case 'WithinRangeIncluded':
      return value >= threshold.left && value <= threshold.right;
    case 'OutsideRangeIncluded':
      return value <= threshold.left || value >= threshold.right;
  }
}
