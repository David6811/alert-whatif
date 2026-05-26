// Slim header dataset selector — dropdown + a one-line metadata strip.

import React from 'react';
import type { CSSProperties } from 'react';
import type { Dataset } from '../data/data-source';
import { formatRange } from '../util/format';

type Props = {
  readonly dataset: Dataset;
  readonly datasets: ReadonlyArray<Dataset>;
  readonly onSelect: (id: string) => void;
};

export function DatasetPicker({ dataset, datasets, onSelect }: Props) {
  const first = dataset.samples[0];
  const last = dataset.samples[dataset.samples.length - 1];
  // Guard the empty-window case so formatRange isn't called on undefined edges.
  const range =
    first !== undefined && last !== undefined
      ? `${dataset.samples.length} samples · ${formatRange(first.t, last.t)}`
      : '(no samples in window)';
  return (
    <label style={wrapperStyle}>
      <span style={labelStyle}>Scenario:</span>
      <select value={dataset.id} onChange={(e) => onSelect(e.target.value)} style={selectStyle}>
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.displayName}
          </option>
        ))}
      </select>
      <span style={metaStyle}>{range}</span>
    </label>
  );
}

const wrapperStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

const labelStyle: CSSProperties = {
  fontSize: '0.875rem',
  color: 'var(--text-muted)',
};

const selectStyle: CSSProperties = {
  padding: '0.4rem 0.55rem',
  minHeight: '2rem',
  lineHeight: 1.2,
  fontSize: '0.875rem',
  minWidth: '14rem',
  // Inline wins over Grafana's select color/height reset.
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-input)',
  borderRadius: 4,
};

const metaStyle: CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-muted)',
};
