import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MetricSeries } from '@alert-whatif/core';
import { SeriesPicker } from './SeriesPicker';

const seriesList: ReadonlyArray<MetricSeries> = [
  { labels: { host: 'web-1' }, samples: [] },
  { labels: { host: 'web-2' }, samples: [] },
];

describe('SeriesPicker', () => {
  it('renders the series options when more than one series exists', () => {
    render(<SeriesPicker seriesList={seriesList} selectedIdx={0} onSelect={() => {}} />);
    expect(screen.getByRole('option', { name: 'host="web-1"' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'host="web-2"' })).toBeInTheDocument();
  });
});
