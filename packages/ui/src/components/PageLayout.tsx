// 100vh three-row page chrome (header / main chart / bottom two-column).
// Columns scroll internally so there's no document-level scrollbar.

import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { pageStyle } from '../styles';

type Props = {
  readonly className?: string;
  readonly headerLeft: ReactNode;
  readonly themeToggle?: ReactNode;
  // Compact summary chips below the top header row.
  readonly summaryStrip?: ReactNode;
  readonly main: ReactNode;
  readonly bottomLeft: ReactNode;
  readonly bottomRight: ReactNode;
};

export function PageLayout({
  className,
  headerLeft,
  themeToggle,
  summaryStrip,
  main,
  bottomLeft,
  bottomRight,
}: Props) {
  return (
    <div style={pageStyle} className={className}>
      <header style={headerStyle}>
        <div style={headerTopRowStyle}>
          <div style={headerLeftStyle}>{headerLeft}</div>
          {themeToggle}
        </div>
        {summaryStrip ? <div style={headerSummaryStyle}>{summaryStrip}</div> : null}
      </header>
      <div style={mainSlotStyle}>{main}</div>
      <div style={bottomGridStyle}>
        <div style={bottomColStyle}>{bottomLeft}</div>
        <div style={bottomColStyle}>{bottomRight}</div>
      </div>
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  flexShrink: 0,
};

const headerTopRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '1rem',
};

const headerSummaryStyle: CSSProperties = {};

const headerLeftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  flexWrap: 'wrap',
};

// Chart row absorbs spare viewport, floored at 380px; children stack so the
// status strip takes its natural height and the chart fills the rest.
const mainSlotStyle: CSSProperties = {
  flex: '1 1 380px',
  minHeight: 380,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
};

const bottomGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '1rem',
  // Capped at 45vh so a tall Parameters card doesn't push the chart down;
  // columns scroll internally past that.
  flex: '0 1 auto',
  maxHeight: '45vh',
  minHeight: 0,
};

const bottomColStyle: CSSProperties = {
  overflowY: 'auto',
  minHeight: 0,
};
