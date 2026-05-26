import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EvalEvent, Sample } from '@alert-whatif/core';
import { OverviewStrip } from './OverviewStrip';

const samples: ReadonlyArray<Sample> = [
  { t: 0, v: 1 },
  { t: 300_000, v: 9 },
  { t: 600_000, v: 2 },
];

const events: ReadonlyArray<EvalEvent> = [
  { kind: 'Firing', from: 200_000, until: 400_000 },
];

describe('OverviewStrip', () => {
  it('renders a firing marker for a firing episode', () => {
    render(<OverviewStrip samples={samples} events={events} lookbackSec={3600} />);
    const markers = screen.getAllByRole('button');
    expect(markers.length).toBeGreaterThan(0);
  });
});
