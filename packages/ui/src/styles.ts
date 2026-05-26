// Shared inline-style objects, theme-aware via index.css CSS variables.

import type { CSSProperties } from 'react';

export const pageStyle: CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  // 100% (not 100vh) so the plugin's content area minus topbar doesn't
  // overflow into an outer scrollbar.
  height: '100%',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  boxSizing: 'border-box',
  color: 'var(--text-primary)',
};

export const cardStyle: CSSProperties = {
  border: '1px solid var(--border-card)',
  borderRadius: 8,
  padding: '0.6rem 0.9rem',
  background: 'var(--bg-card)',
  boxSizing: 'border-box',
  // min-height (not height) so tall content expands the card and the column's
  // overflow-y:auto kicks in.
  minHeight: '100%',
};

export const cardHeadingStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: '0.4rem',
  fontSize: '0.95rem',
};

export const mutedTextStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.78rem',
  margin: '0.15rem 0 0.35rem',
};

export const errorTextStyle: CSSProperties = { color: 'var(--text-error)' };

export const footerStyle: CSSProperties = {
  color: 'var(--text-faded)',
  fontSize: '0.8rem',
  marginTop: '2rem',
};
