import { describe, it, expect } from 'vitest';
import { thresholdCenteredDomain } from './geometry';

describe('thresholdCenteredDomain', () => {
  it('places the threshold near the vertical centre for a stuck queue-lag gauge', () => {
    // queue_lag-jobs_stuck: normal 28s, stuck 600s, threshold 360s.
    const { yMin, yMax } = thresholdCenteredDomain(28, 600, [360]);
    expect(yMin).toBe(0); // clamped: 360 - half < 0
    expect(yMax).toBe(860); // 360 + niceCeil(332 * 1.15) = 360 + 500
    const center = (360 - yMin) / (yMax - yMin);
    expect(center).toBeGreaterThan(0.35);
    expect(center).toBeLessThan(0.65);
  });

  it('clamps yMin to 0 for non-negative data', () => {
    const { yMin } = thresholdCenteredDomain(10, 50, [360]);
    expect(yMin).toBe(0);
  });

  it('allows a negative floor when data goes below zero', () => {
    const { yMin, yMax } = thresholdCenteredDomain(-200, 100, [0]);
    expect(yMin).toBeLessThan(0);
    expect(yMax).toBeGreaterThan(0);
    expect(yMax + yMin).toBeCloseTo(0, 6); // symmetric around threshold 0
  });

  it('centres on the midpoint of two threshold bounds (unclamped)', () => {
    // rawMin negative so the 0-floor clamp does not apply and centring is exact.
    const { yMin, yMax } = thresholdCenteredDomain(-50, 100, [40, 60]);
    expect((yMin + yMax) / 2).toBeCloseTo(50, 6);
  });

  it('falls back to a padded data domain when no finite threshold is given', () => {
    const { yMin, yMax } = thresholdCenteredDomain(0, 80, [Number.NaN]);
    expect(yMin).toBe(0);
    expect(yMax).toBeGreaterThanOrEqual(80);
  });
});
