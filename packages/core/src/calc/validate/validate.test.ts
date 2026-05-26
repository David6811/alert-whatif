import { describe, expect, it } from 'vitest';
import type { AlertConfig, Result } from '../../data/types';
import { validateAlertConfig } from './validate';

const valid: AlertConfig = {
  threshold: { op: 'Gt', value: 10 },
  forDuration: 0,
  keepFiringFor: 0,
  evaluationInterval: 60000,
  windowDuration: 240000,
  intervalMs: 15000,
  maxDataPoints: 43200,
  reducer: 'Mean',
  nanMode: { kind: 'DropNN' },
  noDataState: 'Ok',
  execErrState: 'Error',
  instant: false,
};

// Inline helper: extract the errors from a Result. Returns [] for Ok, the errors for Err.
// Lets the test bodies stay terse without losing the Result distinction.
function errs<T>(r: Result<T>): readonly string[] {
  return r.kind === 'Err' ? r.errors : [];
}

describe('validateAlertConfig', () => {
  it('returns Ok with the same config for a fully valid input', () => {
    expect(validateAlertConfig(valid)).toEqual({ kind: 'Ok', value: valid });
  });

  describe('threshold', () => {
    it('rejects NaN threshold value', () => {
      expect(errs(validateAlertConfig({
        ...valid,
        threshold: { op: 'Gt', value: Number.NaN },
      }))).toContain('threshold.value must be a finite number (got NaN)');
    });
    it('rejects Infinity threshold value', () => {
      expect(errs(validateAlertConfig({
        ...valid,
        threshold: { op: 'Gt', value: Number.POSITIVE_INFINITY },
      }))[0]).toContain('threshold.value must be a finite number');
    });
    it('rejects unknown threshold op', () => {
      const err = errs(validateAlertConfig({
        ...valid,
        threshold: { op: 'NotAnOp' as 'Gt', value: 10 },
      }))[0];
      expect(err).toContain('threshold.op must be one of');
      expect(err).toContain('NotAnOp');
    });
    it('accepts every comparison op (Gt, Lt, GtEq, LtEq, Eq, Ne)', () => {
      for (const op of ['Gt', 'Lt', 'GtEq', 'LtEq', 'Eq', 'Ne'] as const) {
        const r = validateAlertConfig({ ...valid, threshold: { op, value: 10 } });
        expect(r.kind).toBe('Ok');
      }
    });
    it('accepts every range op with left + right', () => {
      for (const op of ['WithinRange', 'OutsideRange', 'WithinRangeIncluded', 'OutsideRangeIncluded'] as const) {
        const r = validateAlertConfig({ ...valid, threshold: { op, left: 0, right: 10 } });
        expect(r.kind).toBe('Ok');
      }
    });
    it('rejects NaN left/right on a range op', () => {
      const e = errs(validateAlertConfig({
        ...valid,
        threshold: { op: 'WithinRange', left: Number.NaN, right: 10 },
      }));
      expect(e[0]).toContain('threshold.left must be a finite number');
    });
    it('rejects Infinity right on a range op', () => {
      const e = errs(validateAlertConfig({
        ...valid,
        threshold: { op: 'OutsideRangeIncluded', left: 0, right: Number.POSITIVE_INFINITY },
      }));
      expect(e[0]).toContain('threshold.right must be a finite number');
    });
  });

  describe('durations', () => {
    it('rejects negative forDuration', () => {
      expect(errs(validateAlertConfig({ ...valid, forDuration: -1 }))).toContain(
        'forDuration must be a non-negative finite number (got -1)',
      );
    });
    it('rejects negative keepFiringFor', () => {
      expect(errs(validateAlertConfig({ ...valid, keepFiringFor: -1 }))).toContain(
        'keepFiringFor must be a non-negative finite number (got -1)',
      );
    });
    it('rejects NaN keepFiringFor', () => {
      expect(errs(validateAlertConfig({ ...valid, keepFiringFor: Number.NaN }))[0]).toContain(
        'keepFiringFor',
      );
    });
    it('accepts keepFiringFor = 0 (the disabled case)', () => {
      expect(validateAlertConfig({ ...valid, keepFiringFor: 0 }).kind).toBe('Ok');
    });
    it('accepts a positive keepFiringFor', () => {
      expect(validateAlertConfig({ ...valid, keepFiringFor: 60000 }).kind).toBe('Ok');
    });
    it('rejects NaN evaluationInterval', () => {
      expect(errs(validateAlertConfig({ ...valid, evaluationInterval: Number.NaN }))[0]).toContain(
        'evaluationInterval',
      );
    });
    it('rejects negative windowDuration', () => {
      expect(errs(validateAlertConfig({ ...valid, windowDuration: -100 }))[0]).toContain(
        'windowDuration',
      );
    });
    it('rejects zero intervalMs (must be strictly positive — it floors effectiveStep)', () => {
      expect(errs(validateAlertConfig({ ...valid, intervalMs: 0 }))[0]).toContain('intervalMs');
    });
    it('rejects negative intervalMs', () => {
      expect(errs(validateAlertConfig({ ...valid, intervalMs: -1 }))[0]).toContain('intervalMs');
    });
  });

  describe('maxDataPoints', () => {
    it('rejects zero', () => {
      expect(errs(validateAlertConfig({ ...valid, maxDataPoints: 0 }))[0]).toContain('maxDataPoints');
    });
    it('rejects negative', () => {
      expect(errs(validateAlertConfig({ ...valid, maxDataPoints: -5 }))[0]).toContain('maxDataPoints');
    });
    it('rejects non-integer', () => {
      expect(errs(validateAlertConfig({ ...valid, maxDataPoints: 1.5 }))[0]).toContain('maxDataPoints');
    });
    it('accepts 1 (minimum useful value)', () => {
      expect(validateAlertConfig({ ...valid, maxDataPoints: 1 }).kind).toBe('Ok');
    });
  });

  describe('enums', () => {
    it('rejects unknown reducer', () => {
      expect(errs(validateAlertConfig({ ...valid, reducer: 'Mode' as 'Mean' }))[0]).toContain(
        'reducer must be one of',
      );
    });
    it('accepts Median (Grafana adds it on top of the original six)', () => {
      const r = validateAlertConfig({ ...valid, reducer: 'Median' });
      expect(r.kind).toBe('Ok');
    });
    it('rejects unknown noDataState', () => {
      expect(errs(validateAlertConfig({ ...valid, noDataState: 'Pause' as 'Ok' }))[0]).toContain(
        'noDataState',
      );
    });
    it('rejects unknown execErrState', () => {
      expect(errs(validateAlertConfig({ ...valid, execErrState: 'Retry' as 'Error' }))[0]).toContain(
        'execErrState',
      );
    });
  });

  describe('nanMode', () => {
    it('accepts None', () => {
      expect(validateAlertConfig({ ...valid, nanMode: { kind: 'None' } }).kind).toBe('Ok');
    });
    it('accepts DropNN', () => {
      expect(validateAlertConfig({ ...valid, nanMode: { kind: 'DropNN' } }).kind).toBe('Ok');
    });
    it('accepts ReplaceNN with a finite replaceWithValue', () => {
      expect(validateAlertConfig({ ...valid, nanMode: { kind: 'ReplaceNN', replaceWithValue: 0 } }).kind).toBe('Ok');
    });
    it('rejects unknown nanMode.kind', () => {
      expect(errs(validateAlertConfig({
        ...valid,
        nanMode: { kind: 'Strict' as 'None' },
      }))[0]).toContain('nanMode.kind must be one of');
    });
    it('rejects ReplaceNN with NaN replaceWithValue', () => {
      expect(errs(validateAlertConfig({
        ...valid,
        nanMode: { kind: 'ReplaceNN', replaceWithValue: Number.NaN },
      }))[0]).toContain('nanMode.replaceWithValue must be a finite number');
    });
    it('rejects ReplaceNN with Infinity replaceWithValue', () => {
      expect(errs(validateAlertConfig({
        ...valid,
        nanMode: { kind: 'ReplaceNN', replaceWithValue: Number.POSITIVE_INFINITY },
      }))[0]).toContain('nanMode.replaceWithValue must be a finite number');
    });
  });

  it('accumulates multiple errors in one pass', () => {
    const errors = errs(validateAlertConfig({
      ...valid,
      threshold: { op: 'Gt', value: Number.NaN },
      forDuration: -1,
      keepFiringFor: 0,
      maxDataPoints: 0,
    }));
    expect(errors.length).toBe(3);
  });
});
