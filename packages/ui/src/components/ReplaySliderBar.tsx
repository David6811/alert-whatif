// Mock-mode tickIndex scrubber, docked in the chart's bottomSlot to mirror
// Live's <LiveScrubControls>. Stateless — the parent owns tickIndex/tickCount.

import React from 'react';
import type { CSSProperties } from 'react';

type Props = {
  readonly tickIndex: number;
  readonly tickCount: number;
  readonly onTickIndexChange: (next: number) => void;
};

export function ReplaySliderBar({ tickIndex, tickCount, onTickIndexChange }: Props) {
  // [0, 1] when empty so the layout still reserves the same height.
  const max = Math.max(tickCount, 1);
  const fillPct = tickCount === 0 ? 0 : Math.round((tickIndex / tickCount) * 100);

  return (
    <div style={rowStyle}>
      {/* Gutter placeholder mirroring LiveScrubControls' pause-button gutter. */}
      <div style={gutterSlotStyle} aria-hidden />
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={tickIndex}
        onChange={(e) => onTickIndexChange(Number(e.target.value))}
        disabled={tickCount === 0}
        className="scrub-slider"
        style={{ ...sliderStyle, ['--scrub-fill' as 'width']: `${fillPct}%` }}
        aria-label="Replay tick index"
        title={`tick ${tickIndex} / ${tickCount}`}
      />
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  paddingTop: '0.15rem',
};

const gutterSlotStyle: CSSProperties = {
  width: '5.5rem',
  flexShrink: 0,
};

// Full post-gutter width — Mock has no `⤓ now` button to make room for.
const sliderStyle: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  margin: 0,
  height: 18,
  padding: 0,
  WebkitAppearance: 'none',
  appearance: 'none',
  background: 'transparent',
  border: 'none',
};
