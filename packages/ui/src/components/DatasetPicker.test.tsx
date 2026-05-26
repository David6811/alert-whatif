import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AlertConfig } from '@alert-whatif/core';
import type { Dataset } from '../data/data-source';
import { DatasetPicker } from './DatasetPicker';

const config: AlertConfig = {
  threshold: { op: 'Gt', value: 10 },
  forDuration: 0,
  keepFiringFor: 0,
  evaluationInterval: 60_000,
  windowDuration: 60_000,
  reducer: 'Mean',
  nanMode: { kind: 'None' },
  noDataState: 'NoData',
  execErrState: 'Error',
  instant: false,
  intervalMs: 15_000,
  maxDataPoints: 100,
};

const dataset: Dataset = {
  id: 'cpu-spike',
  displayName: 'CPU spike',
  description: '',
  source: '',
  samples: [
    { t: 0, v: 1 },
    { t: 60_000, v: 2 },
  ],
  defaultAlertConfig: config,
};

describe('DatasetPicker', () => {
  it('renders the dataset option', () => {
    render(<DatasetPicker dataset={dataset} datasets={[dataset]} onSelect={() => {}} />);
    expect(screen.getByRole('option', { name: 'CPU spike' })).toBeInTheDocument();
  });
});
