import type { CSSProperties } from 'react';
import { cardStyle } from '../styles';

export const chartCardStyle: CSSProperties = {
  ...cardStyle,
  // basis 0 so sibling natural heights win first; the chart absorbs the rest.
  flex: '1 1 0',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  border: 'none',
  padding: '0.25rem 0.5rem',
};

export const chartTitleWrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.75rem',
  paddingLeft: '5.5rem',
  paddingRight: '0.5rem',
  marginBottom: '0.25rem',
  flexShrink: 0,
};

export const chartTitleMainStyle: CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

export const chartTitleSubStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
};

export const chartTitleSpacerStyle: CSSProperties = { flex: '1 1 auto' };

export const chartTitleRangeStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

// 2-column row: left gutter for labels, right chart-area for SVG + overlays.
export const chartCanvasStyle: CSSProperties = {
  flex: '1 1 auto',
  display: 'flex',
  minHeight: 0,
};

export const gutterStyle: CSSProperties = {
  width: '5.5rem',
  position: 'relative',
  flexShrink: 0,
};

export const gutterLabelStyle: CSSProperties = {
  position: 'absolute',
  right: '0.5rem',
  whiteSpace: 'nowrap',
};

export const chartAreaStyle: CSSProperties = {
  flex: '1 1 auto',
  position: 'relative',
  minHeight: 0,
  overflow: 'hidden',
};

export const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
};

export const overlayItemStyle: CSSProperties = {
  position: 'absolute',
  whiteSpace: 'nowrap',
};

export const legendStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  // Larger than the intra-item line gap so the two stacked items read as
  // distinct entries, not one block.
  gap: '0.45rem',
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.7rem',
  color: 'var(--text-primary)',
};

export const legendItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
};

export const legendTextStackStyle: CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  lineHeight: 1.1,
};

export const legendSubLabelStyle: CSSProperties = {
  color: 'var(--text-muted)',
};

export const numericStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.65rem',
  color: 'var(--chart-axis-text)',
};

export const tickLabelStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.65rem',
  color: 'var(--chart-axis-text)',
};

export const secondsLabelStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.55rem',
  color: 'var(--text-faded)',
  fontVariantNumeric: 'tabular-nums',
};

export const barLabelStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.65rem',
  color: 'var(--text-muted)',
};

export const windowLabelStyle: CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '0.6rem',
  color: 'var(--text-muted)',
  opacity: 0.75,
};

export const emojiStyle: CSSProperties = {
  fontSize: '0.9rem',
  lineHeight: 1,
};

export const subdivisionDotStyle: CSSProperties = {
  display: 'inline-block',
  width: 2,
  height: 2,
  borderRadius: '50%',
  background: 'var(--text-faded)',
  opacity: 0.6,
};

export const crossingEmojiStyle: CSSProperties = {
  fontSize: '0.95rem',
  lineHeight: 1,
};

// White-with-shadow to stay readable against any event color.
export const stateLabelStyle: CSSProperties = {
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'rgba(255, 255, 255, 0.95)',
  textShadow: '0 0 2px rgba(0,0,0,0.5)',
  whiteSpace: 'nowrap',
};

// Divergence indicator label (issue #153).
export const divergenceLabelStyle: CSSProperties = {
  fontSize: '0.65rem',
  color: 'var(--chart-divergence, #f5a524)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  background: 'var(--bg-card, rgba(20,20,30,0.85))',
  padding: '0 0.25rem',
  borderRadius: 3,
  border: '1px solid var(--chart-divergence, #f5a524)',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  pointerEvents: 'auto',
  userSelect: 'none',
};

// Overrides ChartOverlay's `whiteSpace: nowrap` so the note wraps at 18rem.
export const divergencePopoverStyle: CSSProperties = {
  fontSize: '0.72rem',
  background: 'var(--bg-card, rgba(20,20,30,0.97))',
  border: '1px solid var(--chart-divergence, #f5a524)',
  borderRadius: 4,
  padding: '0.5rem 0.65rem',
  width: '18rem',
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
  pointerEvents: 'auto',
  color: 'var(--text-primary, #e0e0e0)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  lineHeight: 1.4,
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
};
export const divergencePopoverTitleStyle: CSSProperties = {
  color: 'var(--chart-divergence, #f5a524)',
  fontWeight: 600,
  marginBottom: '0.3rem',
};
export const divergencePopoverRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '0.4rem',
};
export const divergencePopoverKeyStyle: CSSProperties = {
  color: 'var(--text-muted, #999)',
};
export const divergencePopoverValStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
};
export const divergencePopoverNoteStyle: CSSProperties = {
  marginTop: '0.35rem',
  color: 'var(--text-muted, #999)',
  fontFamily: 'inherit',
};
