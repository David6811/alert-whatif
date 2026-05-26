import { describe, expect, it } from 'vitest';
import type { Sample } from '../../../../data/types';
import { scheduleTickTimes } from './schedule';

describe('scheduleTickTimes', () => {
  describe('default anchoring (no hints)', () => {
    it('anchors at samples[0].t and steps by evaluationInterval until lastSample', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 0 },
        { t: 3500, v: 0 },
      ];
      expect(scheduleTickTimes(samples, 1000)).toEqual([1000, 2000, 3000]);
    });

    it('returns one tick when there is only a single sample', () => {
      const samples: ReadonlyArray<Sample> = [{ t: 5000, v: 0 }];
      expect(scheduleTickTimes(samples, 1000)).toEqual([5000]);
    });
  });

  describe('phase alignment (evalGridOffsetMs)', () => {
    it('advances the first tick FORWARD when firstSample is past the target phase', () => {
      // firstSample phase = 45000 % 60000 = 45000
      // target phase     = 30000
      // advance          = mathMod(30000 - 45000, 60000) = 45000   ← negative-mod path
      // firstTick        = 45000 + 45000 = 90000
      const samples: ReadonlyArray<Sample> = [
        { t: 45000, v: 0 },
        { t: 200000, v: 0 },
      ];
      expect(
        scheduleTickTimes(samples, 60000, { evalGridOffsetMs: 30000 }),
      ).toEqual([90000, 150000]);
    });

    it('keeps firstSample as firstTick when already on the target phase', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 30000, v: 0 },
        { t: 150000, v: 0 },
      ];
      expect(
        scheduleTickTimes(samples, 60000, { evalGridOffsetMs: 30000 }),
      ).toEqual([30000, 90000, 150000]);
    });

    it('reduces evalGridOffsetMs modulo evaluationInterval (90000 == phase 30000)', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 45000, v: 0 },
        { t: 150000, v: 0 },
      ];
      expect(
        scheduleTickTimes(samples, 60000, { evalGridOffsetMs: 90000 }),
      ).toEqual([90000, 150000]);
    });
  });

  describe('extension (endTime)', () => {
    it('extends ticks past lastSample when endTime > lastSample', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 0 },
        { t: 3000, v: 0 },
      ];
      expect(scheduleTickTimes(samples, 1000, { endTime: 5000 })).toEqual([
        1000, 2000, 3000, 4000, 5000,
      ]);
    });

    it('ignores endTime when endTime <= lastSample (extend-only invariant)', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 1000, v: 0 },
        { t: 3000, v: 0 },
      ];
      expect(scheduleTickTimes(samples, 1000, { endTime: 2000 })).toEqual([
        1000, 2000, 3000,
      ]);
    });
  });

  describe('extension (startTime)', () => {
    it('extends ticks before firstSample when startTime < firstSample', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 3000, v: 0 },
        { t: 5000, v: 0 },
      ];
      expect(scheduleTickTimes(samples, 1000, { startTime: 1000 })).toEqual([
        1000, 2000, 3000, 4000, 5000,
      ]);
    });

    it('clamps the grid to startTime when startTime > firstSample (over-fetch warm-up: pre-startTime samples produce no ticks)', () => {
      const samples: ReadonlyArray<Sample> = [
        { t: 3000, v: 0 },
        { t: 5000, v: 0 },
      ];
      expect(scheduleTickTimes(samples, 1000, { startTime: 4000 })).toEqual([
        4000, 5000,
      ]);
    });
  });

  describe('phase + extension together', () => {
    it('emits phase-aligned ticks extending past lastSample to endTime', () => {
      // firstTick 90000 (see "advances forward" test above)
      // stopAt = max(200000, 250000) = 250000
      // ticks  = 90000, 150000, 210000 (next would be 270000 > stopAt)
      const samples: ReadonlyArray<Sample> = [
        { t: 45000, v: 0 },
        { t: 200000, v: 0 },
      ];
      expect(
        scheduleTickTimes(samples, 60000, {
          evalGridOffsetMs: 30000,
          endTime: 250000,
        }),
      ).toEqual([90000, 150000, 210000]);
    });
  });

  describe('edge cases', () => {
    it('returns [] when phase-aligned firstTick is past the stop boundary', () => {
      // Single sample at t=55000, target phase 50000, interval 60000.
      // advance = mathMod(50000 - 55000, 60000) = 55000
      // firstTick = 55000 + 55000 = 110000, but stopAt = lastSample = 55000.
      // firstTick > stopAt → empty.
      const samples: ReadonlyArray<Sample> = [{ t: 55000, v: 0 }];
      expect(
        scheduleTickTimes(samples, 60000, { evalGridOffsetMs: 50000 }),
      ).toEqual([]);
    });
  });
});
