// Compact replay button row + speed selector for the Mock-mode strip's
// action slot. The scrubber lives separately in <ReplaySliderBar>.

import React from 'react';
import type { CSSProperties } from 'react';

export type Speed = 1 | 2 | 4;

type Props = {
  readonly tickIndex: number;
  readonly tickCount: number;
  readonly playing: boolean;
  readonly speed: Speed;
  readonly onReset: () => void;
  readonly onStepBack: () => void;
  readonly onTogglePlay: () => void;
  readonly onStepForward: () => void;
  readonly onJumpToEnd: () => void;
  readonly onSpeedChange: (speed: Speed) => void;
  // Plugin hides the speed selector — windows are ~12 ticks.
  readonly hideSpeed?: boolean;
  // Let auto-replay drive these via real `.click()`s.
  readonly resetButtonRef?: React.Ref<HTMLButtonElement>;
  readonly playButtonRef?: React.Ref<HTMLButtonElement>;
  // Momentary highlight so an auto-driven click reads as a press.
  readonly flashing?: 'reset' | 'play' | null;
};

export function ReplayButtons({
  tickIndex,
  tickCount,
  playing,
  speed,
  onReset,
  onStepBack,
  onTogglePlay,
  onStepForward,
  onJumpToEnd,
  onSpeedChange,
  hideSpeed,
  resetButtonRef,
  playButtonRef,
  flashing,
}: Props) {
  const atStart = tickIndex <= 0;
  const atEnd = tickIndex >= tickCount;

  return (
    <span style={groupStyle}>
      <button
        ref={resetButtonRef}
        onClick={onReset}
        disabled={atStart}
        style={flashing === 'reset' ? pressedStyle : buttonStyle}
        title="Reset to start"
      >
        ⏮
      </button>
      <button onClick={onStepBack} disabled={atStart} style={buttonStyle} title="Step back one tick">
        ◀
      </button>
      {/* ⏯ when paused (not plain ▶) so the toggle differs from step-forward. */}
      <button
        ref={playButtonRef}
        onClick={onTogglePlay}
        disabled={atEnd && !playing}
        style={flashing === 'play' ? pressedPlayStyle : playButtonStyle}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '⏯'}
      </button>
      <button onClick={onStepForward} disabled={atEnd} style={buttonStyle} title="Step forward one tick">
        ▶
      </button>
      <button onClick={onJumpToEnd} disabled={atEnd} style={buttonStyle} title="Jump to end">
        ⏭
      </button>
      {hideSpeed ? null : (
        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value) as Speed)}
          style={selectStyle}
          aria-label="Playback speed"
          title="Playback speed"
        >
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      )}
    </span>
  );
}

const groupStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
};

const buttonStyle: CSSProperties = {
  minWidth: 26,
  height: 24,
  padding: '0 0.35rem',
  border: '1px solid var(--border-card)',
  borderRadius: 4,
  background: 'var(--bg-input, transparent)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: '0.78rem',
  lineHeight: 1,
};

const playButtonStyle: CSSProperties = {
  ...buttonStyle,
  minWidth: 32,
  fontWeight: 600,
};

const pressedStyle: CSSProperties = {
  ...buttonStyle,
  background: 'var(--text-link, #4f8cff)',
  color: '#fff',
  borderColor: 'var(--text-link, #4f8cff)',
  boxShadow: '0 0 0 3px color-mix(in srgb, var(--text-link, #4f8cff) 35%, transparent)',
  transform: 'translateY(1px)',
};

const pressedPlayStyle: CSSProperties = {
  ...pressedStyle,
  minWidth: 32,
  fontWeight: 600,
};

const selectStyle: CSSProperties = {
  height: 24,
  padding: '0 0.2rem',
  border: '1px solid var(--border-card)',
  borderRadius: 4,
  background: 'var(--bg-input, transparent)',
  color: 'var(--text-primary)',
  fontSize: '0.78rem',
  marginLeft: '0.25rem',
};
