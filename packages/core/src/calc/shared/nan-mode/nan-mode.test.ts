import { describe, expect, it } from 'vitest';
import type { Sample } from '../../../data/types';
import { applyMapInput, applyMapOutput } from './nan-mode';

const samples: ReadonlyArray<Sample> = [
  { t: 1000, v: 2 },
  { t: 2000, v: Number.NaN },
  { t: 3000, v: 5 },
  { t: 4000, v: Number.POSITIVE_INFINITY },
  { t: 5000, v: Number.NEGATIVE_INFINITY },
  { t: 6000, v: 8 },
];

describe('applyMapInput', () => {
  describe('mode: None (no mapper — Grafana default)', () => {
    it('returns the input unchanged', () => {
      expect(applyMapInput(samples, { kind: 'None' })).toBe(samples);
    });
  });

  describe('mode: DropNN', () => {
    it('drops both NaN and ±Inf from input (matches Grafana DropNonNumber.MapInput)', () => {
      const result = applyMapInput(samples, { kind: 'DropNN' });
      expect(result).toEqual([
        { t: 1000, v: 2 },
        { t: 3000, v: 5 },
        { t: 6000, v: 8 },
      ]);
    });
    it('returns an empty array when all samples are NaN/Inf', () => {
      const allBad: ReadonlyArray<Sample> = [
        { t: 1, v: Number.NaN },
        { t: 2, v: Number.POSITIVE_INFINITY },
      ];
      expect(applyMapInput(allBad, { kind: 'DropNN' })).toEqual([]);
    });
  });

  describe('mode: ReplaceNN', () => {
    it('replaces NaN and ±Inf with the configured value (matches Grafana ReplaceNonNumberWithValue.MapInput)', () => {
      const result = applyMapInput(samples, { kind: 'ReplaceNN', replaceWithValue: 0 });
      expect(result).toEqual([
        { t: 1000, v: 2 },
        { t: 2000, v: 0 }, // was NaN
        { t: 3000, v: 5 },
        { t: 4000, v: 0 }, // was +Inf
        { t: 5000, v: 0 }, // was -Inf
        { t: 6000, v: 8 },
      ]);
    });
    it('supports a non-zero replacement value', () => {
      const result = applyMapInput([{ t: 1, v: Number.NaN }], { kind: 'ReplaceNN', replaceWithValue: -42 });
      expect(result).toEqual([{ t: 1, v: -42 }]);
    });
  });
});

describe('applyMapOutput', () => {
  describe('mode: None', () => {
    it('passes the value through unchanged (NaN, Inf, finite — all stay)', () => {
      expect(applyMapOutput(5, { kind: 'None' })).toBe(5);
      expect(applyMapOutput(Number.NaN, { kind: 'None' })).toBeNaN();
      expect(applyMapOutput(Number.POSITIVE_INFINITY, { kind: 'None' })).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('mode: DropNN — asymmetric: drops output NaN only, NOT Inf', () => {
    it('drops a NaN output (returns null → caller emits NoData tick)', () => {
      expect(applyMapOutput(Number.NaN, { kind: 'DropNN' })).toBeNull();
    });
    it('passes ±Inf through (asymmetry — input drops Inf, output does NOT, matches Grafana)', () => {
      expect(applyMapOutput(Number.POSITIVE_INFINITY, { kind: 'DropNN' })).toBe(Number.POSITIVE_INFINITY);
      expect(applyMapOutput(Number.NEGATIVE_INFINITY, { kind: 'DropNN' })).toBe(Number.NEGATIVE_INFINITY);
    });
    it('passes finite values through', () => {
      expect(applyMapOutput(5, { kind: 'DropNN' })).toBe(5);
      expect(applyMapOutput(0, { kind: 'DropNN' })).toBe(0);
    });
  });

  describe('mode: ReplaceNN — asymmetric: replaces output NaN only, NOT Inf', () => {
    it('replaces NaN output with the configured value', () => {
      expect(applyMapOutput(Number.NaN, { kind: 'ReplaceNN', replaceWithValue: -1 })).toBe(-1);
    });
    it('passes ±Inf through (same asymmetry as DropNN)', () => {
      expect(applyMapOutput(Number.POSITIVE_INFINITY, { kind: 'ReplaceNN', replaceWithValue: 0 })).toBe(Number.POSITIVE_INFINITY);
    });
    it('passes finite values through', () => {
      expect(applyMapOutput(5, { kind: 'ReplaceNN', replaceWithValue: 0 })).toBe(5);
    });
  });
});
