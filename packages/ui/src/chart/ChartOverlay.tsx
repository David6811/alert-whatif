import React from 'react';
import type { CSSProperties } from 'react';
import { overlayItemStyle, gutterLabelStyle } from './styles';

// HTML element positioned in [0,100] canvas coords; `anchor` aligns its box
// relative to (x, y).
export type ChartOverlayAnchor =
  | 'center-top'
  | 'center-middle'
  | 'center-bottom'
  | 'start-top'
  | 'end-top';

export function ChartOverlay({
  x,
  y,
  anchor,
  children,
}: {
  readonly x: number;
  readonly y: number;
  readonly anchor: ChartOverlayAnchor;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...overlayItemStyle,
        left: `${x}%`,
        top: `${y}%`,
        ...overlayAnchorStyles[anchor],
      }}
    >
      {children}
    </div>
  );
}

const overlayAnchorStyles: Record<ChartOverlayAnchor, CSSProperties> = {
  'center-top': { transform: 'translateX(-50%)' },
  'center-middle': { transform: 'translate(-50%, -50%)' },
  'center-bottom': { transform: 'translate(-50%, -100%)' },
  'start-top': {},
  'end-top': { transform: 'translateX(-100%)' },
};

// Gutter-column label right-aligned to the chart-area's left edge; `align`
// sets which vertical edge sits at y.
export type GutterAlign = 'top' | 'middle' | 'bottom';

export function GutterLabel({
  y,
  align,
  children,
}: {
  readonly y: number;
  readonly align: GutterAlign;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...gutterLabelStyle,
        top: `${y}%`,
        transform:
          align === 'middle'
            ? 'translateY(-50%)'
            : align === 'bottom'
              ? 'translateY(-100%)'
              : undefined,
      }}
    >
      {children}
    </div>
  );
}
