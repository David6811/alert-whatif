// Thin time-axis strip marking where the rule tripped over a long lookback;
// one marker per Pending/Firing transition.

import React, { useState } from 'react';
import type { CSSProperties } from 'react';
import type { EvalEvent, Sample } from '@alert-whatif/core';

const ICON_FOR_KIND: Record<EvalEvent['kind'], string> = {
  Pending: '⚠️',
  Firing: '\u{1F514}',
  Resolved: '\u{1F515}',
  NoData: '\u{1F32B}️',
  Recovering: '\u{1F4A7}',
};

export type OverviewRangeOption = {
  readonly label: string;
  readonly lookbackSec: number;
  readonly stepSec: number;
};

type Props = {
  readonly samples: ReadonlyArray<Sample>;
  readonly events: ReadonlyArray<EvalEvent>;
  readonly loading?: boolean;
  // Click-to-drill; kind lets the caller frame forward (🔔/⚠️/🌫️) or
  // backward (🔕).
  readonly onEventClick?: (t: number, kind: EvalEvent['kind']) => void;
  // Omitted renders a static label instead of the dropdown.
  readonly lookbackSec?: number;
  readonly onLookbackChange?: (sec: number) => void;
  readonly rangeOptions?: ReadonlyArray<OverviewRangeOption>;
  // 'Firing'/'NoData' suppresses the leftmost marker (no transition to mark).
  readonly initialState?: 'Normal' | 'Firing' | 'NoData';
  // Bells before this (rule didn't exist) render dimmed — Grafana has no
  // annotations to compare, so a drill shows an empty grafana bar.
  readonly ruleCreatedMs?: number;
};

const STRIP_HEIGHT_PX = 26;
const ICON_FONT_SIZE_PX = 13;
// Selected marker grows so 🔔 vs 🔕 (near-identical at 13px) is unambiguous.
const ICON_SELECTED_FONT_SIZE_PX = 26;
// Firing/pending events within this fraction of strip width are one episode
// (threshold flap), collapsing to one 🔔 + one 🔕.
const EPISODE_GAP_PCT = 2;

export function OverviewStrip({
  samples,
  events,
  loading,
  onEventClick,
  lookbackSec,
  onLookbackChange,
  rangeOptions,
  initialState,
  ruleCreatedMs,
}: Props) {
  const [selectedT, setSelectedT] = useState<number | null>(null);
  const labelNode =
    rangeOptions !== undefined &&
    onLookbackChange !== undefined &&
    lookbackSec !== undefined ? (
      <select
        value={String(lookbackSec)}
        onChange={(e) => onLookbackChange(Number(e.target.value))}
        style={selectorStyle}
      >
        {rangeOptions.map((opt) => (
          <option key={opt.lookbackSec} value={String(opt.lookbackSec)}>
            {opt.label}
          </option>
        ))}
      </select>
    ) : (
      <span style={labelStyle}>{describeLookback(lookbackSec)}</span>
    );

  // `Current` mode — just the selector; the main chart covers the present.
  if (lookbackSec === 0) {
    return (
      <div style={currentOnlyStyle}>
        {labelNode}
      </div>
    );
  }
  if (loading && samples.length === 0) {
    return (
      <div style={containerStyle}>
        {labelNode}
        <div style={bandLoadingStyle}>Loading overview…</div>
      </div>
    );
  }
  if (samples.length === 0) {
    return (
      <div style={containerStyle}>
        {labelNode}
        <div style={bandEmptyStyle}>No samples in overview window.</div>
      </div>
    );
  }

  const tMin = samples[0]!.t;
  const tMax = samples[samples.length - 1]!.t;
  const tRange = Math.max(tMax - tMin, 1);

  const episodeGapMs = (EPISODE_GAP_PCT / 100) * tRange;

  type FiringSpan = { readonly from: number; readonly until: number };
  const firingSpans: FiringSpan[] = events
    .flatMap<FiringSpan>((e) => {
      if (e.kind === 'Pending' || e.kind === 'Firing') {
        return [{ from: e.from, until: e.until }];
      }
      return [];
    })
    .sort((a, b) => a.from - b.from);

  type Episode = { from: number; until: number };
  const episodes: Episode[] = [];
  for (const span of firingSpans) {
    const open = episodes[episodes.length - 1];
    if (open !== undefined && span.from - open.until <= episodeGapMs) {
      open.until = Math.max(open.until, span.until);
    } else {
      episodes.push({ from: span.from, until: span.until });
    }
  }

  const noDataMarkers = events.flatMap<{ kind: EvalEvent['kind']; t: number }>((e) =>
    e.kind === 'NoData' ? [{ kind: e.kind, t: e.from }] : [],
  );

  const seriesStart = samples[0]!.t;
  const seriesEnd = samples[samples.length - 1]!.t;
  // Suppress the first 🔔 when the alarm was already active before
  // windowStart — it didn't start in this window.
  const firstIsContinuation =
    (initialState === 'Firing' || initialState === 'NoData') &&
    episodes.length > 0 &&
    episodes[0]!.from <= seriesStart;
  const markers: Array<{ kind: EvalEvent['kind']; t: number }> = [];
  episodes.forEach((ep, idx) => {
    const next = episodes[idx + 1];
    const epEndsBeforeNext = next !== undefined;
    const epEndsBeforeSeriesEnd = ep.until < seriesEnd - episodeGapMs;
    if (!(idx === 0 && firstIsContinuation)) {
      markers.push({ kind: 'Firing', t: ep.from });
    }
    if (epEndsBeforeNext || epEndsBeforeSeriesEnd) {
      markers.push({ kind: 'Resolved', t: ep.until });
    }
  });
  for (const m of noDataMarkers) markers.push(m);
  markers.sort((a, b) => a.t - b.t);

  // Time ticks snapped to clean wallclock boundaries so they line up across
  // reloads. Hover shows the local wallclock.
  const tickIntervalMs = pickTickIntervalMs(tRange);
  const tickMarks: Array<number> = [];
  const firstTick = Math.ceil(tMin / tickIntervalMs) * tickIntervalMs;
  for (let t = firstTick; t < tMin + tRange; t += tickIntervalMs) {
    tickMarks.push(t);
  }

  return (
    <div style={containerStyle}>
      {labelNode}
      <div style={bandStyle}>
        <div style={baselineStyle} />
        {tickMarks.map((t) => {
          const xPct = ((t - tMin) / tRange) * 100;
          if (xPct < 0 || xPct > 100) return null;
          // Date in the tooltip — 48h views straddle midnight, so HH:MM alone
          // is ambiguous.
          const tickIsSelected = selectedT === t;
          return (
            <span
              key={`tick-${t}`}
              style={{
                ...tickMarkStyle,
                left: `${xPct}%`,
                ...(tickIsSelected
                  ? { opacity: 1, background: 'var(--text-primary, #fff)' }
                  : {}),
              }}
              title={new Date(t).toLocaleString(undefined, {
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              onClick={() => setSelectedT(tickIsSelected ? null : t)}
            />
          );
        })}
        {markers.map((m, idx) => {
          const xPct = ((m.t - tMin) / tRange) * 100;
          if (xPct < 0 || xPct > 100) return null;
          const isSelected = selectedT === m.t;
          const isPreRule =
            ruleCreatedMs !== undefined && m.t < ruleCreatedMs;
          const title = isPreRule
            ? `${m.kind} · ${new Date(m.t).toISOString()}\nRule didn't exist yet (created ${new Date(ruleCreatedMs!).toISOString()}). Grafana has no annotations — drill will show empty grafana bar.`
            : `${m.kind} · ${new Date(m.t).toISOString()}`;
          return (
            <span
              key={`marker-${idx}`}
              role="button"
              title={title}
              style={{
                ...iconStyle,
                left: `${xPct}%`,
                cursor: onEventClick !== undefined ? 'pointer' : 'default',
                ...(isPreRule
                  ? { opacity: 0.3, filter: 'grayscale(1)' }
                  : {}),
                ...(isSelected
                  ? {
                      fontSize: ICON_SELECTED_FONT_SIZE_PX,
                      zIndex: 1,
                      filter: 'drop-shadow(0 0 4px var(--text-primary))',
                    }
                  : {}),
              }}
              onClick={() => {
                setSelectedT(m.t);
                if (onEventClick !== undefined) onEventClick(m.t, m.kind);
              }}
            >
              {ICON_FOR_KIND[m.kind]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function describeLookback(sec: number | undefined): string {
  if (sec === undefined) return 'overview';
  if (sec >= 24 * 3600) return `Last ${Math.round(sec / (24 * 3600))}d`;
  if (sec >= 3600) return `Last ${Math.round(sec / 3600)}h`;
  return `Last ${Math.round(sec / 60)}m`;
}

// Aims for ~6-8 ticks across the strip at any lookback.
function pickTickIntervalMs(rangeMs: number): number {
  const MIN = 60_000;
  const TEN_MIN = 600_000;
  const HOUR = 3_600_000;
  const THREE_H = 3 * HOUR;
  const SIX_H = 6 * HOUR;
  if (rangeMs >= 36 * HOUR) return SIX_H;   // 48h+
  if (rangeMs >= 12 * HOUR) return THREE_H; // 24h-36h
  if (rangeMs >= 3 * HOUR)  return HOUR;    // 6h-12h
  if (rangeMs >= 30 * MIN)  return TEN_MIN; // ~30min - 3h
  return MIN;                                // <30min
}

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  height: STRIP_HEIGHT_PX,
  padding: '0.2rem 0.4rem',
  border: '1px solid var(--border-card)',
  borderRadius: 6,
  background: 'var(--bg-card)',
  flexShrink: 0,
};

const currentOnlyStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  paddingBottom: '0.25rem',
  flexShrink: 0,
};

const labelStyle: CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const selectorStyle: CSSProperties = {
  // Inline sizing/colors beat Grafana's near-zero `<select>` reset.
  padding: '0.3rem 0.5rem',
  minHeight: '1.7rem',
  lineHeight: 1.2,
  fontSize: '0.78rem',
  fontFamily: 'inherit',
  letterSpacing: '0.04em',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-input)',
  borderRadius: 4,
  width: 'auto',
  minWidth: '7rem',
  maxWidth: '10rem',
  cursor: 'pointer',
  flexShrink: 0,
};

const bandStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  height: '100%',
  background: 'var(--bg-tile-empty)',
  borderRadius: 4,
};

const baselineStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: '50%',
  height: 1,
  background: 'var(--chart-axis)',
  transform: 'translateY(-50%)',
};

const iconStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  fontSize: ICON_FONT_SIZE_PX,
  lineHeight: 1,
  userSelect: 'none',
};

const tickMarkStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--text-primary, #d0d0d0)',
  opacity: 0.85,
  border: '1px solid var(--bg-card, #1a1a1a)',
  boxSizing: 'border-box',
  cursor: 'pointer',
  pointerEvents: 'auto',
};

const bandLoadingStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-muted)',
  fontSize: '0.72rem',
  fontStyle: 'italic',
};

const bandEmptyStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-faded)',
  fontSize: '0.72rem',
};
