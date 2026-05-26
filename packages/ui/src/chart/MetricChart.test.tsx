import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { EvalEvent, Sample, Threshold, Tick } from '@alert-whatif/core';
import { MetricChart } from './MetricChart';

const samples: ReadonlyArray<Sample> = [
  { t: 0, v: 1 },
  { t: 60_000, v: 12 },
  { t: 120_000, v: 3 },
];

const ticks: ReadonlyArray<Tick> = [
  { kind: 'Data', t: 0, v: 1 },
  { kind: 'Data', t: 60_000, v: 12 },
  { kind: 'Data', t: 120_000, v: 3 },
];

const events: ReadonlyArray<EvalEvent> = [
  { kind: 'Firing', from: 60_000, until: 120_000 },
];

const threshold: Threshold = { op: 'Gt', value: 10 };

describe('MetricChart', () => {
  it('renders an svg with at least one path', () => {
    const { container } = render(
      <MetricChart
        samples={samples}
        ticks={ticks}
        events={events}
        threshold={threshold}
        evaluationInterval={60_000}
        windowDuration={60_000}
        reducer="Mean"
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('path')).toBeTruthy();
  });
});
