// What-If | Live header toggle. The internal state key is still `'mock'`; only
// the visible label reads "What-If".

import React from 'react';
import type { CSSProperties } from 'react';

export type DemoMode = 'mock' | 'live';

type Props = {
  readonly mode: DemoMode;
  readonly onChange: (next: DemoMode) => void;
  // Disables Live with a hint (no VITE_GRAFANA_TOKEN → proxy 401).
  readonly liveDisabled?: boolean;
};

const MOCK_ACCENT = '#6366f1';
const LIVE_ACCENT = '#ef4444';

export function ModeToggle({ mode, onChange, liveDisabled }: Props) {
  return (
    <div style={wrapStyle} role="radiogroup" aria-label="Demo mode">
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'mock'}
        onClick={() => onChange('mock')}
        style={buttonStyle(mode === 'mock', MOCK_ACCENT)}
      >
        What-If
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'live'}
        onClick={() => !liveDisabled && onChange('live')}
        disabled={liveDisabled}
        style={buttonStyle(mode === 'live', LIVE_ACCENT, liveDisabled)}
        title={liveDisabled ? 'Set VITE_GRAFANA_TOKEN in .env.local to enable Live mode' : undefined}
      >
        Live
      </button>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: 'inline-flex',
  border: '1px solid var(--border-card)',
  borderRadius: 6,
  overflow: 'hidden',
};

const buttonStyle = (
  active: boolean,
  accent: string,
  disabled?: boolean,
): CSSProperties => ({
  padding: '0.25rem 0.75rem',
  fontSize: '0.85rem',
  fontWeight: active ? 600 : 400,
  border: 'none',
  background: active ? hexWithAlpha(accent, 0.22) : 'transparent',
  color: disabled ? 'var(--text-faded)' : active ? accent : 'var(--text-primary)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  boxShadow: active ? `inset 0 -2px 0 ${accent}` : undefined,
});

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
