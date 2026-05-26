// Selects which series feeds the (single-instance) evaluator when a query
// returned more than one. Hidden for ≤1 series.

import React from 'react';
import type { CSSProperties } from 'react';
import type { MetricSeries } from '@alert-whatif/core';

type Props = {
  readonly seriesList: ReadonlyArray<MetricSeries>;
  readonly selectedIdx: number;
  readonly onSelect: (idx: number) => void;
};

export function SeriesPicker({ seriesList, selectedIdx, onSelect }: Props) {
  if (seriesList.length < 2) return null;
  return (
    <div style={containerStyle}>
      <span style={labelStyle}>series</span>
      <select
        value={selectedIdx}
        onChange={(e) => onSelect(Number(e.target.value))}
        style={selectStyle}
        title="Prometheus returned multiple series for this rule's query. Pick which one to evaluate."
      >
        {seriesList.map((s, i) => (
          <option key={i} value={i}>
            {formatLabels(s.labels) || `(series ${i + 1})`}
          </option>
        ))}
      </select>
      <span style={countStyle}>
        {selectedIdx + 1} / {seriesList.length}
      </span>
    </div>
  );
}

function formatLabels(labels: Readonly<Record<string, string>>): string {
  const entries = Object.entries(labels).filter(
    ([k]) => k !== '__name__' && k !== '',
  );
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}="${v}"`).join(', ');
}

const containerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  fontSize: '0.75rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const labelStyle: CSSProperties = {
  color: 'var(--text-muted, #999)',
  textTransform: 'uppercase',
  fontSize: '0.65rem',
  letterSpacing: '0.05em',
};

const selectStyle: CSSProperties = {
  fontSize: '0.75rem',
  fontFamily: 'inherit',
  background: 'var(--bg-input, #1a1a1a)',
  color: 'var(--text-primary, #e0e0e0)',
  border: '1px solid var(--chart-axis, #555)',
  borderRadius: 3,
  padding: '0.1rem 0.3rem',
  minHeight: '1.4rem',
  maxWidth: '24rem',
};

const countStyle: CSSProperties = {
  color: 'var(--text-muted, #999)',
  fontSize: '0.65rem',
};
