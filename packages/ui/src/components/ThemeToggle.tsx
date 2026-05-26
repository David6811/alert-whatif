// Dark/Light segmented control. Stateless — the parent owns the theme.

import React from 'react';
import type { CSSProperties } from 'react';
import type { Theme } from '../util/use-theme';

type Props = {
  readonly theme: Theme;
  readonly onChange: (next: Theme) => void;
};

export function ThemeToggle({ theme, onChange }: Props) {
  return (
    <div role="group" aria-label="Theme" style={groupStyle}>
      <Button label="Dark" active={theme === 'dark'} onClick={() => onChange('dark')} />
      <Button label="Light" active={theme === 'light'} onClick={() => onChange('light')} />
    </div>
  );
}

function Button({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={active ? { ...buttonStyle, ...buttonActiveStyle } : buttonStyle}
    >
      {label}
    </button>
  );
}

const groupStyle: CSSProperties = {
  display: 'inline-flex',
  border: '1px solid var(--border-card)',
  borderRadius: 6,
  overflow: 'hidden',
};

// The wrapper carries the border/radius, so individual buttons drop them.
const buttonStyle: CSSProperties = {
  border: 'none',
  borderRadius: 0,
  padding: '0.25rem 0.7rem',
  fontSize: '0.8rem',
  background: 'transparent',
  color: 'var(--text-muted)',
};

const buttonActiveStyle: CSSProperties = {
  background: 'var(--bg-button-hover)',
  color: 'var(--text-primary)',
};
