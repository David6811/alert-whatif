// Live-mode pause + history-scrub strip below the chart. Stateless — the
// parent owns `paused` + `scrubOffsetMs`.

import React from 'react';
import type { CSSProperties } from 'react';

type Props = {
  readonly paused: boolean;
  readonly scrubOffsetMs: number;
  // Max scrubback distance; slider runs -scrubMaxMs..0 (live).
  readonly scrubMaxMs: number;
  readonly onTogglePause: () => void;
  readonly onScrubChange: (offsetMs: number) => void;
  readonly onJumpToLive: () => void;
};

const SLIDER_STEP_MS = 15_000; // 15s — matches the poll cadence

export function LiveScrubControls({
  paused,
  scrubOffsetMs,
  scrubMaxMs,
  onTogglePause,
  onScrubChange,
  onJumpToLive,
}: Props) {
  const atLive = !paused && scrubOffsetMs === 0;
  const offsetSec = Math.round(-scrubOffsetMs / 1000);
  const offsetLabel = atLive
    ? 'live'
    : offsetSec >= 60
    ? `${Math.floor(offsetSec / 60)}m ${offsetSec % 60}s back`
    : `${offsetSec}s back`;

  // Filled fraction, handed to CSS so the WebKit track can paint the fill
  // (Firefox uses ::-moz-range-progress natively).
  const fillPct = scrubMaxMs === 0
    ? 100
    : Math.round(((scrubOffsetMs + scrubMaxMs) / scrubMaxMs) * 100);

  return (
    <div style={rowStyle}>
      {/* Left gutter — same width as the chart's, pause button right-aligned. */}
      <div style={gutterSlotStyle}>
        <button
          type="button"
          onClick={onTogglePause}
          style={iconButtonStyle}
          title={paused ? 'Resume live updates' : 'Pause live updates'}
          aria-label={paused ? 'Resume live updates' : 'Pause live updates'}
        >
          {paused ? '▶' : '⏸'}
        </button>
      </div>

      {/* Track takes 11/12 of the post-gutter width so the thumb at max lands
          under the chart's NOW line; `⤓ now` occupies the remaining 1/12. */}
      <input
        type="range"
        min={-scrubMaxMs}
        max={0}
        step={SLIDER_STEP_MS}
        value={scrubOffsetMs}
        onChange={(e) => onScrubChange(Number(e.target.value))}
        className="scrub-slider"
        style={{ ...sliderStyle, ['--scrub-fill' as 'width']: `${fillPct}%` }}
        aria-label="Scrub through live history"
        title={offsetLabel}
      />

      <button
        type="button"
        onClick={onJumpToLive}
        disabled={atLive}
        style={liveButtonStyle(atLive)}
        title={`Snap back to live tip${atLive ? '' : ` · currently ${offsetLabel}`}`}
      >
        ⤓ now
      </button>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  paddingTop: '0.15rem',
};

// 5.5rem to match MetricChart's gutter so the track starts at the plot area.
const gutterSlotStyle: CSSProperties = {
  width: '5.5rem',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingRight: '0.5rem',
  boxSizing: 'border-box',
};

const iconButtonStyle: CSSProperties = {
  width: 26,
  height: 26,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.85rem',
  lineHeight: 1,
  border: 'none',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

// paddingLeft 10px keeps the text clear of the slider thumb's disk at max.
const liveButtonStyle = (atLive: boolean): CSSProperties => ({
  flex: '1 1 0',
  minWidth: 0,
  padding: '2px 4px 2px 10px',
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  border: 'none',
  borderRadius: 999,
  background: 'transparent',
  color: atLive ? 'var(--text-faded)' : 'var(--event-firing, #ef4444)',
  cursor: atLive ? 'default' : 'pointer',
  opacity: atLive ? 0.55 : 1,
  whiteSpace: 'nowrap',
  textAlign: 'left',
});

// 11/12 matches the chart's NOW position; the +7px offsets the native thumb
// halo inset so the thumb center at max lands directly under NOW.
const sliderStyle: CSSProperties = {
  flex: '0 1 calc((100% - 5.5rem) * 11 / 12 + 7px)',
  minWidth: 0,
  margin: 0,
  height: 18,
  padding: 0,
  // appearance:none so the .scrub-slider CSS paints the track/thumb.
  WebkitAppearance: 'none',
  appearance: 'none',
  background: 'transparent',
  border: 'none',
};
