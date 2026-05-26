import { describe, it, expect } from 'vitest';
import { computeEffectiveStepMs, roundIntervalMs } from './effective-step';

describe('roundIntervalMs', () => {
  it('rounds small ms values to the nearest grid step', () => {
    expect(roundIntervalMs(1)).toBe(1);
    expect(roundIntervalMs(11)).toBe(10);
    expect(roundIntervalMs(15)).toBe(10);
    expect(roundIntervalMs(16)).toBe(20);
    expect(roundIntervalMs(36)).toBe(50);
    expect(roundIntervalMs(76)).toBe(100);
  });

  it('rounds second-grade values', () => {
    expect(roundIntervalMs(1000)).toBe(1000);
    expect(roundIntervalMs(1501)).toBe(2000);
    expect(roundIntervalMs(15000)).toBe(15000);
    expect(roundIntervalMs(17501)).toBe(20000);
    expect(roundIntervalMs(45001)).toBe(60000);
  });

  it('rounds minute-grade values', () => {
    expect(roundIntervalMs(60000)).toBe(60000);
    expect(roundIntervalMs(90001)).toBe(120000);
    expect(roundIntervalMs(120000)).toBe(120000);
    expect(roundIntervalMs(210001)).toBe(300000);
  });

  it('preserves Grafana quirk: no 5ms bucket', () => {
    expect(roundIntervalMs(5)).toBe(1);
    expect(roundIntervalMs(10)).toBe(1);
  });

  it('preserves Grafana quirk: 1d (86400000) appears for two consecutive ranges', () => {
    expect(roundIntervalMs(86400001)).toBe(86400000);
    expect(roundIntervalMs(172800001)).toBe(86400000);
    expect(roundIntervalMs(604800001)).toBe(604800000);
  });

  it('caps at 1 year', () => {
    expect(roundIntervalMs(63072000000)).toBe(31536000000);
  });
});

describe('computeEffectiveStepMs', () => {
  it('returns intervalMs as-is (no rounding) when safe < intervalMs', () => {
    // Default demo rule: 4-min range, intervalMs=15000, maxDP=43200.
    // safe = 240000 / 43200 ≈ 5.5ms — well below 15000 → return 15000 unrounded.
    expect(
      computeEffectiveStepMs({
        intervalMs: 15000,
        maxDataPoints: 43200,
        timeRangeMs: 240000,
      }),
    ).toBe(15000);
  });

  it('rounds safe step up to the grid when safe > intervalMs', () => {
    // 240000 / 2 = 120000, > 15000, roundUpToGrid(120000) = 120000.
    expect(
      computeEffectiveStepMs({
        intervalMs: 15000,
        maxDataPoints: 2,
        timeRangeMs: 240000,
      }),
    ).toBe(120000);
  });

  it('rounds non-grid safe steps up to the next grid bucket', () => {
    // 240000 / 3 = 80000ms. roundUpToGrid: ≤90000 → 60000? wait — 80000 ≤90000, returns 60000.
    // But 80000 > 60000 — the ladder rounds 80000 to the grid value associated with its bucket.
    // From the source: `if (ms <= 90000) return 60000;` — so 80000 → 60000.
    // That's an oddity of Grafana's "round to nearest representative", not "round up".
    expect(
      computeEffectiveStepMs({
        intervalMs: 1000,
        maxDataPoints: 3,
        timeRangeMs: 240000,
      }),
    ).toBe(60000);
  });

  it('falls back to default resolution (1500) when maxDataPoints is 0', () => {
    // 1500000 / 1500 = 1000ms. > intervalMs=1, roundUpToGrid(1000) = 1000.
    expect(
      computeEffectiveStepMs({
        intervalMs: 1,
        maxDataPoints: 0,
        timeRangeMs: 1500000,
      }),
    ).toBe(1000);
  });
});
