// Hybrid HTML + SVG: an SVG layer (preserveAspectRatio="none",
// non-scaling-stroke) holds geometry; an HTML overlay holds text + emoji so
// they stay crisp despite the SVG stretch. Both use [0,100] percentage coords.

import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  EvalEvent,
  ReducerKind,
  Sample,
  Threshold,
  Tick,
} from '@alert-whatif/core';
import { detectStateBarDivergence } from '@alert-whatif/core';
import { EVENT_COLOR } from '../util/event-colors';
import {
  FLASH_DURATION_MS,
  FLASH_GAP_MS,
  SWEEP_PER_DOT_MS,
  SWEEP_STAGGER_MS,
} from '../util/reduce-animation-timing';
import { mutedTextStyle } from '../styles';
import {
  CHART_TOP_PCT,
  CHART_BOTTOM_PCT,
  GRAFANA_BAR_TOP_PCT,
  GRAFANA_BAR_BOTTOM_PCT,
  STATE_BAR_TOP_PCT,
  STATE_BAR_BOTTOM_PCT,
  BASELINE_BAR_TOP_PCT,
  BASELINE_BAR_BOTTOM_PCT,
  COLOR_LINE,
  COLOR_THRESHOLD,
  COLOR_AXIS,
  COLOR_WINDOW,
  COLOR_WINDOW_BORDER,
  COLOR_STATE_NORMAL,
  DIVERGENCE_STROKE,
  DIVERGENCE_LABEL_PCT,
  MAX_EYES,
  TARGET_CHART_SPAN_MS,
  RIGHT_ANCHOR_PAD_MS,
} from './constants';
import { thresholdYValues, padDomain, niceCeil, thresholdCenteredDomain } from './geometry';
import {
  computeEvalTicks,
  computeDisplayTicks,
  computeSubdivisionTicks,
  computeMinuteTicks,
} from './ticks';
import {
  eventsToTransitions,
  grafanaHistoryToTransitions,
  computeNoDataRanges,
} from '../calc/state';
import { findThresholdCrossings } from '../calc/crossings';
import type { ThresholdCrossing } from '../calc/crossings';
import {
  filterEvents,
  buildGappedPath,
} from './transitions';
import {
  formatTime,
  formatTimeShort,
  formatSeconds,
  formatTickLabel,
  formatThresholdLabelValue,
} from './format';
import {
  chartCardStyle,
  chartCanvasStyle,
  gutterStyle,
  chartAreaStyle,
  overlayStyle,
  legendStyle,
  legendItemStyle,
  legendTextStackStyle,
  legendSubLabelStyle,
  numericStyle,
  tickLabelStyle,
  secondsLabelStyle,
  barLabelStyle,
  windowLabelStyle,
  emojiStyle,
  subdivisionDotStyle,
  crossingEmojiStyle,
  stateLabelStyle,
  divergenceLabelStyle,
  divergencePopoverStyle,
  divergencePopoverTitleStyle,
  divergencePopoverRowStyle,
  divergencePopoverKeyStyle,
  divergencePopoverValStyle,
  divergencePopoverNoteStyle,
} from './styles';
import { ChartTitle } from './ChartTitle';
import { ChartOverlay, GutterLabel } from './ChartOverlay';

type Props = {
  readonly samples: ReadonlyArray<Sample>;
  // Subset of `samples` to plot (replay prefix); X-axis stays pinned to the
  // full sample range. Defaults to `samples`.
  readonly visibleSamples?: ReadonlyArray<Sample>;
  // Per-tick reduced values — the single number the threshold compared against.
  readonly ticks?: ReadonlyArray<Tick>;
  // Live: pin the right edge here (a 1-Hz wallclock) and extend backward, so
  // "now" advances every second. Omit (Mock) to center the data.
  readonly rightAnchorT?: number | undefined;
  // Force the Y ceiling (Live passes a fixed cap) so a value's pixel height
  // is stable across polls; values above clip to the top.
  readonly yMax?: number | undefined;
  readonly threshold: Threshold;
  readonly evaluationInterval: number;
  readonly windowDuration: number;
  // Pre-computed crossings; falls back to internal interpolation when omitted.
  readonly crossings?: ReadonlyArray<ThresholdCrossing>;
  // Drives the legend's "reduce (…)" label; falls back to "mean".
  readonly reducer?: ReducerKind;
  readonly events?: ReadonlyArray<EvalEvent>;
  // Second event series for the what-if comparison: working config vs baseline.
  readonly baselineEvents?: ReadonlyArray<EvalEvent>;
  readonly subtitle?: string;
  // Single source of truth from the parent so the status line matches the
  // LiveStatusStrip chip exactly (avoids lag from local recomputation).
  readonly currentState?: EvalEvent['kind'] | 'Normal';
  // State just before the first sample. 'Firing'/'NoData' suppresses the
  // left-edge marker since there's no transition INTO it to mark.
  readonly initialState?: 'Normal' | 'Firing' | 'NoData';
  // Drill: extend the right edge past the last sample so a post-data Resolved
  // transition stays visible.
  readonly displayEndT?: number;
  // Mirror of displayEndT for the left edge (🔔 firing at samples[0].t).
  readonly displayStartT?: number;
  // Drill focal timestamp shown in the time-range banner.
  readonly focalMs?: number;
  // React `key` for the NOW ⏰ pop animation — bump per Live poll.
  readonly pollSignal?: number;
  // Per-poll Grafana state changes (Live/drill), rendered as a second bar so
  // divergence from ours is obvious.
  readonly grafanaHistory?: ReadonlyArray<{ readonly t: number; readonly state: string }> | undefined;
  // "until" for grafanaHistory's last segment (usually liveNow).
  readonly grafanaHistoryEnd?: number | undefined;
  // Docked inside the chart card below the SVG (Live scrub strip).
  readonly bottomSlot?: ReactNode;
};

export function MetricChart({
  samples,
  visibleSamples,
  ticks,
  threshold,
  evaluationInterval,
  windowDuration,
  crossings: crossingsOverride,
  reducer,
  events = [],
  subtitle,
  rightAnchorT,
  yMax,
  bottomSlot,
  currentState,
  grafanaHistory,
  grafanaHistoryEnd,
  baselineEvents,
  initialState,
  displayEndT,
  displayStartT,
  focalMs,
  pollSignal,
}: Props) {
  // Banner uses the visible sample range, not the wider fetch window, so it
  // matches what the user actually sees.
  const bannerStart = samples[0]?.t;
  const bannerEnd = samples[samples.length - 1]?.t;
  const spanMs =
    bannerStart !== undefined && bannerEnd !== undefined
      ? bannerEnd - bannerStart
      : undefined;
  const spanLabel =
    spanMs !== undefined && spanMs > 0
      ? ` · ${spanMs >= 3600_000 ? `${Math.round(spanMs / 3600_000)}h` : `${Math.round(spanMs / 60_000)}m visible`}`
      : '';
  const timeRange =
    bannerStart === undefined || bannerEnd === undefined
      ? undefined
      : focalMs !== undefined
        ? `${formatTime(bannerStart)} → 📍 ${formatTime(focalMs)} → ${formatTime(bannerEnd)}${spanLabel}`
        : `${formatTime(bannerStart)} → ${formatTime(bannerEnd)}${spanLabel}`;
  return (
    <section style={chartCardStyle}>
      <ChartTitle subtitle={subtitle ?? ''} timeRange={timeRange} />
      {samples.length === 0 ? (
        <p style={mutedTextStyle}>No samples to plot.</p>
      ) : (
        <ChartBody
          samples={samples}
          visibleSamples={visibleSamples ?? samples}
          ticks={ticks ?? []}
          threshold={threshold}
          evaluationInterval={evaluationInterval}
          windowDuration={windowDuration}
          {...(crossingsOverride !== undefined ? { crossingsOverride } : {})}
          reducer={reducer}
          events={events}
          rightAnchorT={rightAnchorT}
          yMaxOverride={yMax}
          bottomSlot={bottomSlot}
          currentState={currentState}
          grafanaHistory={grafanaHistory}
          grafanaHistoryEnd={grafanaHistoryEnd}
          baselineEvents={baselineEvents}
          initialState={initialState}
          displayEndT={displayEndT}
          displayStartT={displayStartT}
          pollSignal={pollSignal}
        />
      )}
    </section>
  );
}

function ChartBody({
  samples,
  visibleSamples,
  ticks,
  threshold,
  evaluationInterval,
  windowDuration,
  crossingsOverride,
  reducer,
  events,
  rightAnchorT,
  yMaxOverride,
  bottomSlot,
  currentState,
  grafanaHistory,
  grafanaHistoryEnd,
  baselineEvents,
  initialState,
  displayEndT,
  displayStartT,
  pollSignal,
}: {
  readonly samples: ReadonlyArray<Sample>;
  readonly visibleSamples: ReadonlyArray<Sample>;
  readonly ticks: ReadonlyArray<Tick>;
  readonly threshold: Threshold;
  readonly evaluationInterval: number;
  readonly windowDuration: number;
  readonly crossingsOverride?: ReadonlyArray<ThresholdCrossing>;
  readonly reducer: ReducerKind | undefined;
  readonly events: ReadonlyArray<EvalEvent>;
  readonly rightAnchorT: number | undefined;
  readonly yMaxOverride: number | undefined;
  readonly bottomSlot: ReactNode | undefined;
  readonly grafanaHistory: ReadonlyArray<{ readonly t: number; readonly state: string }> | undefined;
  readonly grafanaHistoryEnd: number | undefined;
  readonly currentState: EvalEvent['kind'] | 'Normal' | undefined;
  readonly baselineEvents: ReadonlyArray<EvalEvent> | undefined;
  readonly initialState: 'Normal' | 'Firing' | 'NoData' | undefined;
  readonly displayEndT: number | undefined;
  readonly displayStartT: number | undefined;
  readonly pollSignal: number | undefined;
}) {
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  // Live (rightAnchorT set): pin the right edge and extend a FIXED span back
  // so the grid density stays stable as samples accumulate. Mock: center the
  // data. Both fall back to data span when data is wider than the target.
  const dataSpan = last.t - first.t;
  let chartMinT: number;
  let chartMaxT: number;
  if (rightAnchorT !== undefined) {
    chartMaxT = rightAnchorT + RIGHT_ANCHOR_PAD_MS;
    chartMinT = chartMaxT - TARGET_CHART_SPAN_MS;
  } else {
    const span = Math.max(dataSpan, TARGET_CHART_SPAN_MS);
    const center = (first.t + last.t) / 2;
    chartMinT = center - span / 2;
    chartMaxT = center + span / 2;
  }
  // Drill: extend past the last sample (keeping chartMinT at first.t) so the
  // empty tail makes a post-data Resolved/NoData transition land on-screen.
  if (displayEndT !== undefined && displayEndT > chartMaxT) {
    chartMaxT = displayEndT;
    if (chartMinT > first.t) chartMinT = first.t;
  }
  // Mirror for the left edge (🔔 click where Normal/NoData precedes data).
  if (displayStartT !== undefined && displayStartT < chartMinT) {
    chartMinT = displayStartT;
    if (chartMaxT < last.t) chartMaxT = last.t;
  }
  const tSpan = chartMaxT - chartMinT || 1;

  const sampleValues = samples.map((s) => s.v).filter((v) => Number.isFinite(v));
  const rawMin = sampleValues.length > 0 ? Math.min(...sampleValues) : 0;
  const rawMax = sampleValues.length > 0 ? Math.max(...sampleValues) : 1;
  // Override (Live's fixed cap) keeps pixel height stable across polls.
  // Instant rules centre the domain on the threshold so the line sits mid-chart
  // (see thresholdCenteredDomain); range+reduce rules keep the data-driven
  // [0, niceCeil(max)] scaling, where niceCeil steps in familiar buckets so the
  // line doesn't jitter.
  const isInstant = reducer === undefined;
  let yMin: number;
  let yMax: number;
  if (yMaxOverride !== undefined) {
    yMax = yMaxOverride;
    yMin = padDomain(rawMin, yMax).yMin;
  } else if (isInstant) {
    ({ yMin, yMax } = thresholdCenteredDomain(rawMin, rawMax, thresholdYValues(threshold)));
  } else {
    yMax = niceCeil(rawMax);
    yMin = padDomain(rawMin, yMax).yMin;
  }
  const ySpan = yMax - yMin || 1;

  const xPct = (t: number) => ((t - chartMinT) / tSpan) * 100;
  const yPctInChart = (v: number) => {
    if (!Number.isFinite(v)) return (CHART_TOP_PCT + CHART_BOTTOM_PCT) / 2;
    const pct = (yMax - v) / ySpan;
    const clamped = Math.max(0, Math.min(1, pct));
    return CHART_TOP_PCT + clamped * (CHART_BOTTOM_PCT - CHART_TOP_PCT);
  };

  const thresholdYs = thresholdYValues(threshold);
  // Eyes mark "where Grafana evaluates": anchor to the evaluator's grid and
  // step in evaluationInterval to fill the chart. Live clips to ≤ NOW so no
  // eye claims an eval that hasn't happened. Falls back to the sample grid
  // when evaluate() returned no ticks.
  const evalRangeEnd = rightAnchorT ?? chartMaxT;
  const evalTicks =
    ticks.length > 0 && evaluationInterval > 0
      ? computeDisplayTicks(ticks[0]!.t, evaluationInterval, chartMinT, evalRangeEnd)
      : computeEvalTicks(first.t, last.t, evaluationInterval);
  // Labels on the absolute UTC minute grid (HH:MM:00) so a :30 eval sits
  // visually between two labels, not stacked on one.
  const displayTicks = computeMinuteTicks(chartMinT, chartMaxT);

  // 15s grid dotted into the gaps; coincidences with shown markers filtered at
  // render time.
  const subdivisionTicks = computeSubdivisionTicks(chartMinT, chartMaxT, 15_000);
  const displayTickSet = new Set(displayTicks);
  const evalTickSet = new Set(evalTicks);

  // Eval ticks beyond the latest visible sample stay drawn so the playhead
  // reads as sliding over a fixed grid, not scrolling it.
  const hasVisible = visibleSamples.length > 0;
  const lastVisible = hasVisible ? visibleSamples[visibleSamples.length - 1]! : undefined;
  const visibleEvalTicks = hasVisible
    ? evalTicks.filter((t) => t <= lastVisible!.t)
    : [];
  // Most-recent Data tick. Read from `ticks` (evaluator output), NOT
  // visibleEvalTicks, so a Prometheus delivery gap near the boundary doesn't
  // freeze the playhead while the evaluator keeps reducing older samples.
  let latestDataTickT: number | null = null;
  for (let i = ticks.length - 1; i >= 0; i--) {
    if (ticks[i]!.kind === 'Data') {
      latestDataTickT = ticks[i]!.t;
      break;
    }
  }
  const latestTick = latestDataTickT !== null
    ? latestDataTickT
    : visibleEvalTicks.length > 0
      ? visibleEvalTicks[visibleEvalTicks.length - 1]!
      : (hasVisible ? lastVisible!.t : first.t);
  // Anchored to latestTick so the box's right border and the reduce-result
  // dot share one moment.
  const windowAnchor = latestTick;
  // Full windowDuration left of the playhead — no clamp to first.t, since the
  // window is a semantic span; xPct clipping handles overflow.
  const windowStart = windowAnchor - windowDuration;
  const showEyes = evalTicks.length > 0 && evalTicks.length <= MAX_EYES;
  const showWindow = hasVisible && windowDuration > 0 && evaluationInterval > 0;

  // Re-mount the animation on each forward latestTick. Skipped on backward
  // moves (replay scrubbing) and same-tick sample refreshes.
  const [animationKey, setAnimationKey] = useState(0);
  const prevLatestTickRef = useRef<number | null>(null);

  const [openDivergenceIdx, setOpenDivergenceIdx] = useState<number | null>(null);
  useEffect(() => {
    if (openDivergenceIdx === null) return;
    const onDocClick = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt?.closest('[data-divergence-popover], [data-divergence-trigger]')) return;
      setOpenDivergenceIdx(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [openDivergenceIdx]);
  useEffect(() => {
    const prev = prevLatestTickRef.current;
    if (prev !== null && latestTick > prev) {
      setAnimationKey((k) => k + 1);
    }
    prevLatestTickRef.current = latestTick;
  }, [latestTick]);
  // Same window math as evaluate()'s slideTo.
  const animationWindowSamples = visibleSamples.filter(
    (s) =>
      s.t > latestTick - windowDuration &&
      s.t <= latestTick &&
      Number.isFinite(s.v),
  );
  // Pulled from ticks (not recomputed) to match evaluate() exactly.
  const latestTickValue =
    ticks.length > 0 && ticks[ticks.length - 1]!.t === latestTick &&
    ticks[ticks.length - 1]!.kind === 'Data'
      ? (ticks[ticks.length - 1] as Extract<Tick, { kind: 'Data' }>).v
      : null;
  // Phase timing MUST stay in sync with the CSS keyframes in index.css. Flash
  // + fade start after the last sweep dot ends. Instant rules skip the sweep —
  // only the result-pop dot, zero delay. (isInstant computed above for the Y domain.)
  const N = isInstant ? 0 : animationWindowSamples.length;
  const lastSweepEndMs = N > 0 ? (N - 1) * SWEEP_STAGGER_MS + SWEEP_PER_DOT_MS : 0;
  const flashDelayMs = lastSweepEndMs + FLASH_GAP_MS;
  const fadeDelayMs = flashDelayMs + FLASH_DURATION_MS;
  const resultDelayMs = isInstant ? 0 : fadeDelayMs;

  // Prefer parent-supplied crossings; fall back to local interpolation.
  // 'ignition'/'resolution' are framed by alert state, not value direction
  // (an Lt threshold ignites on a falling value).
  const crossings =
    crossingsOverride !== undefined
      ? crossingsOverride
      : findThresholdCrossings(visibleSamples, threshold);
  // Drawn on top of the event rects so an in-progress NoData lifecycle (which
  // only emits a Pending event until the for-gate fires) still shows NoData.
  const noDataRanges = computeNoDataRanges(ticks, evaluationInterval);
  // One marker per event — a live window can contain multiple cycles.
  const pendingEvents = filterEvents(events, 'Pending');
  const allFiringEvents = filterEvents(events, 'Firing');
  // Already-Firing-before-windowStart: snap the first marker to first.t so the
  // 🔔 lines up with the state bar's leftmost red pixel.
  const firingSuppressionWindow = first.t + evaluationInterval;
  const firingEvents =
    initialState === 'Firing' &&
    allFiringEvents.length > 0 &&
    allFiringEvents[0]!.from <= firingSuppressionWindow
      ? [{ ...allFiringEvents[0]!, from: first.t }, ...allFiringEvents.slice(1)]
      : allFiringEvents;
  const resolvedEvents = filterEvents(events, 'Resolved');
  const allNoDataEvents = filterEvents(events, 'NoData');
  const noDataEvents =
    initialState === 'NoData' &&
    allNoDataEvents.length > 0 &&
    allNoDataEvents[0]!.from <= firingSuppressionWindow
      ? allNoDataEvents.slice(1)
      : allNoDataEvents;

  // Derive the gap threshold from the observed cadence (2× step) so tweaking
  // intervalMs doesn't break the polyline at every pair. Falls back to 30s.
  const inferredSampleStepMs =
    visibleSamples.length >= 2
      ? Math.max(1, visibleSamples[1]!.t - visibleSamples[0]!.t)
      : 15_000;
  const RATE_GAP_THRESHOLD_MS = inferredSampleStepMs * 2;
  const MEAN_GAP_THRESHOLD_MS = evaluationInterval * 1.5;

  const ratePath = buildGappedPath(
    visibleSamples,
    (s) => s.t,
    (s) => s.v,
    xPct,
    yPctInChart,
    RATE_GAP_THRESHOLD_MS,
  );

  // One point per Data tick at the reducer's output; NoData ticks gap the line.
  const meanPath = buildGappedPath(
    ticks.filter((t): t is Extract<Tick, { kind: 'Data' }> => t.kind === 'Data'),
    (t) => t.t,
    (t) => t.v,
    xPct,
    yPctInChart,
    MEAN_GAP_THRESHOLD_MS,
  );

  // Surfaces the issue #153 timing gap: UI-built rules skip the query_offset
  // imported rules get, so their transitions lag by ~1 eval cycle.
  const divergences =
    grafanaHistory !== undefined && grafanaHistory.length > 0
      ? detectStateBarDivergence(
          eventsToTransitions(events),
          grafanaHistoryToTransitions(grafanaHistory),
          evaluationInterval,
        )
      : [];

  return (
    <>
      <div style={chartCanvasStyle}>
        {/* Numeric Y labels intentionally omitted — with multiple curves a bare
            axis number wouldn't say which curve it measures. */}
        <div style={gutterStyle}>
          {thresholdYs.map((v) => {
            const inRange = v >= yMin && v <= yMax;
            const lineY = inRange ? yPctInChart(v) : v < yMin ? CHART_BOTTOM_PCT : CHART_TOP_PCT;
            const arrow = inRange ? '' : v < yMin ? '↓ ' : '↑ ';
            return (
              <GutterLabel key={`thresh-lbl-${v}`} y={lineY} align="bottom">
                <span style={{ ...numericStyle, color: 'var(--chart-threshold)' }}>
                  thresh {arrow}
                  {formatThresholdLabelValue(threshold, v)}
                </span>
              </GutterLabel>
            );
          })}
          {grafanaHistory !== undefined && grafanaHistory.length > 0 ? (
            <GutterLabel y={(GRAFANA_BAR_TOP_PCT + GRAFANA_BAR_BOTTOM_PCT) / 2} align="middle">
              <span style={barLabelStyle}>grafana</span>
            </GutterLabel>
          ) : null}
          {baselineEvents !== undefined ? (
            <GutterLabel
              y={(BASELINE_BAR_TOP_PCT + BASELINE_BAR_BOTTOM_PCT) / 2}
              align="middle"
            >
              <span style={barLabelStyle}>baseline</span>
            </GutterLabel>
          ) : null}
          <GutterLabel y={(STATE_BAR_TOP_PCT + STATE_BAR_BOTTOM_PCT) / 2} align="middle">
            <span style={barLabelStyle}>{baselineEvents !== undefined ? 'what-if' : 'state'}</span>
          </GutterLabel>
          {/* Series legend — labels split across two lines to fit the gutter. */}
          <GutterLabel y={CHART_TOP_PCT + (CHART_BOTTOM_PCT - CHART_TOP_PCT) * 0.35} align="middle">
            <div style={legendStyle}>
              <span style={legendItemStyle}>
                <svg width="18" height="10" aria-hidden style={{ flexShrink: 0 }}>
                  <line
                    x1="0"
                    y1="5"
                    x2="18"
                    y2="5"
                    stroke="var(--chart-line)"
                    strokeWidth="2"
                  />
                </svg>
                <span style={legendTextStackStyle}>
                  <span>Prom</span>
                  <span style={legendSubLabelStyle}>(rate)</span>
                </span>
              </span>
              {isInstant ? null : (
                <span style={legendItemStyle}>
                  <svg width="18" height="10" aria-hidden style={{ flexShrink: 0 }}>
                    <line
                      x1="0"
                      y1="5"
                      x2="18"
                      y2="5"
                      stroke="var(--event-pending)"
                      strokeWidth="2"
                      strokeDasharray="3 2"
                      opacity="0.55"
                    />
                  </svg>
                  <span style={legendTextStackStyle}>
                    <span>reduce</span>
                    <span style={legendSubLabelStyle}>
                      ({(reducer ?? 'Mean').toLowerCase()})
                    </span>
                  </span>
                </span>
              )}
            </div>
          </GutterLabel>
        </div>

        <div style={chartAreaStyle}>
        <svg
          role="img"
          aria-label="Metric chart"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          {/* relativeTimeRange highlight — bottom half only, so it doesn't
              collide with the polyline in the top half. */}
          {!isInstant && showWindow ? (
            <rect
              x={xPct(windowStart)}
              y={(CHART_TOP_PCT + CHART_BOTTOM_PCT) / 2}
              width={Math.max(xPct(windowAnchor) - xPct(windowStart), 0.1)}
              height={(CHART_BOTTOM_PCT - CHART_TOP_PCT) / 2}
              fill={COLOR_WINDOW}
              stroke={COLOR_WINDOW_BORDER}
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {/* Chart-bottom baseline — X-axis frame plus a y=0 reference. */}
          <line
            x1={0}
            x2={100}
            y1={CHART_BOTTOM_PCT}
            y2={CHART_BOTTOM_PCT}
            stroke={COLOR_AXIS}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />

          {/* Threshold line(s). */}
          {thresholdYs.map((v) => {
            const inRange = v >= yMin && v <= yMax;
            const lineY = inRange ? yPctInChart(v) : v < yMin ? CHART_BOTTOM_PCT : CHART_TOP_PCT;
            return (
              <line
                key={`thresh-${v}`}
                x1={0}
                x2={100}
                y1={lineY}
                y2={lineY}
                stroke={COLOR_THRESHOLD}
                strokeDasharray="3 2"
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Sample polyline — `<path>` so data gaps break the line instead of
              drawing a fake straight segment across them. */}
          <path
            d={ratePath}
            fill="none"
            stroke={COLOR_LINE}
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />

          {/* `mean` polyline — dashed, one point per Data tick. */}
          {!isInstant && meanPath.length > 0 ? (
            <path
              d={meanPath}
              fill="none"
              stroke={COLOR_LINE}
              strokeWidth={1}
              strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke"
              opacity={0.85}
            />
          ) : null}

          {/* Crossing guides — dashed (vs the solid lifecycle guides) to signal
              the crossing time is interpolated, not a real eval moment. */}
          {crossings.map((c) => {
            const xp = xPct(c.t);
            if (xp < 0 || xp > 100) return null;
            return (
              <line
                key={`xguide-${c.t}-${c.direction}`}
                x1={xp}
                x2={xp}
                y1={CHART_TOP_PCT}
                y2={STATE_BAR_BOTTOM_PCT}
                stroke={COLOR_THRESHOLD}
                strokeWidth={0.8}
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
                opacity={0.45}
              />
            );
          })}

          {/* NOW reference line — fixed position in Live mode; data scrolls past. */}
          {rightAnchorT !== undefined ? (
            <line
              x1={xPct(rightAnchorT)}
              x2={xPct(rightAnchorT)}
              y1={CHART_TOP_PCT}
              y2={STATE_BAR_BOTTOM_PCT}
              stroke="var(--text-primary)"
              strokeWidth={0.9}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
              opacity={0.55}
            />
          ) : null}

          {/* Pending guides — one per Normal → Pending transition. */}
          {pendingEvents.map((p, i) => {
            const xp = xPct(p.from);
            if (xp < 0 || xp > 100) return null;
            return (
              <line
                key={`pending-guide-${i}-${p.from}`}
                x1={xp}
                x2={xp}
                y1={CHART_TOP_PCT}
                y2={STATE_BAR_BOTTOM_PCT}
                stroke={EVENT_COLOR.Pending}
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
                opacity={0.45}
              />
            );
          })}

          {/* Firing guides — one per Firing event. */}
          {firingEvents.map((f, i) => {
            const xp = xPct(f.from);
            if (xp < 0 || xp > 100) return null;
            return (
              <line
                key={`firing-guide-${i}-${f.from}`}
                x1={xp}
                x2={xp}
                y1={CHART_TOP_PCT}
                y2={STATE_BAR_BOTTOM_PCT}
                stroke="var(--event-firing)"
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
                opacity={0.45}
              />
            );
          })}

          {/* Resolved guides — one per Resolved point event. */}
          {resolvedEvents.map((r, i) => {
            const xp = xPct(r.at);
            if (xp < 0 || xp > 100) return null;
            return (
              <line
                key={`resolved-guide-${i}-${r.at}`}
                x1={xp}
                x2={xp}
                y1={CHART_TOP_PCT}
                y2={STATE_BAR_BOTTOM_PCT}
                stroke={EVENT_COLOR.Resolved}
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
                opacity={0.45}
              />
            );
          })}

          {/* NoData guides — one per NoData event. */}
          {noDataEvents.map((n, i) => {
            const xp = xPct(n.from);
            if (xp < 0 || xp > 100) return null;
            return (
              <line
                key={`nodata-guide-${i}-${n.from}`}
                x1={xp}
                x2={xp}
                y1={CHART_TOP_PCT}
                y2={STATE_BAR_BOTTOM_PCT}
                stroke={EVENT_COLOR.NoData}
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
                opacity={0.45}
              />
            );
          })}

          {/* GRAFANA state bar. Segments clipped to the playhead (latestTick)
              so it reveals progressively in step with the what-if bar below. */}
          {grafanaHistory !== undefined && grafanaHistory.length > 0 ? (
            <>
              <rect
                x={0}
                y={GRAFANA_BAR_TOP_PCT}
                width={100}
                height={GRAFANA_BAR_BOTTOM_PCT - GRAFANA_BAR_TOP_PCT}
                fill={COLOR_STATE_NORMAL}
              />
              {grafanaHistory.map((entry, idx) => {
                const next = grafanaHistory[idx + 1];
                const rawUntil = next?.t ?? grafanaHistoryEnd ?? entry.t;
                const segUntil = Math.min(rawUntil, latestTick);
                if (entry.t >= latestTick) return null;
                const fillKind: EvalEvent['kind'] | null =
                  entry.state === 'pending' ? 'Pending' :
                  entry.state === 'firing' ? 'Firing' :
                  null;
                if (fillKind === null) return null;
                const x1 = xPct(entry.t);
                const x2 = xPct(segUntil);
                if (x2 <= 0 || x1 >= 100) return null;
                const x = Math.max(x1, 0);
                const w = Math.min(x2, 100) - x;
                if (w <= 0) return null;
                return (
                  <rect
                    key={`grafana-seg-${idx}-${entry.t}`}
                    x={x}
                    y={GRAFANA_BAR_TOP_PCT}
                    width={Math.max(w, 0.1)}
                    height={GRAFANA_BAR_BOTTOM_PCT - GRAFANA_BAR_TOP_PCT}
                    fill={EVENT_COLOR[fillKind]}
                  />
                );
              })}
            </>
          ) : null}

          {/* Baseline event bar — the rule's current config vs the tweaked one. */}
          {baselineEvents !== undefined ? (
            <>
              <rect
                x={0}
                y={BASELINE_BAR_TOP_PCT}
                width={100}
                height={BASELINE_BAR_BOTTOM_PCT - BASELINE_BAR_TOP_PCT}
                fill={COLOR_STATE_NORMAL}
              />
              {baselineEvents.map((event, idx) => {
                const color = EVENT_COLOR[event.kind];
                if (event.kind === 'Resolved') {
                  const x = xPct(event.at);
                  return (
                    <line
                      key={`base-evt-${idx}`}
                      x1={x}
                      x2={x}
                      y1={BASELINE_BAR_TOP_PCT - 0.5}
                      y2={BASELINE_BAR_BOTTOM_PCT + 0.5}
                      stroke={color}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }
                const untilCapped = Math.min(event.until, windowAnchor);
                if (untilCapped <= event.from) return null;
                const x1 = xPct(event.from);
                const x2 = xPct(untilCapped);
                return (
                  <rect
                    key={`base-evt-${idx}`}
                    x={x1}
                    y={BASELINE_BAR_TOP_PCT}
                    width={Math.max(x2 - x1, 0.1)}
                    height={BASELINE_BAR_BOTTOM_PCT - BASELINE_BAR_TOP_PCT}
                    fill={color}
                  />
                );
              })}
            </>
          ) : null}

          {/* State bar — Normal background + event overlays. */}
          <rect
            x={0}
            y={STATE_BAR_TOP_PCT}
            width={100}
            height={STATE_BAR_BOTTOM_PCT - STATE_BAR_TOP_PCT}
            fill={COLOR_STATE_NORMAL}
          />
          {events.map((event, idx) => {
            const color = EVENT_COLOR[event.kind];
            if (event.kind === 'Resolved') {
              const x = xPct(event.at);
              return (
                <line
                  key={`evt-${idx}`}
                  x1={x}
                  x2={x}
                  y1={STATE_BAR_TOP_PCT - 0.5}
                  y2={STATE_BAR_BOTTOM_PCT + 0.5}
                  stroke={color}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            // Cap at NOW: emit.ts extends an open lifecycle one eval past the
            // last tick, which would push our bar past NOW while Grafana's
            // stops at the last observation, making the two incommensurable.
            const eventUntilCapped = Math.min(event.until, windowAnchor);
            if (eventUntilCapped <= event.from) return null;
            const x1 = xPct(event.from);
            const x2 = xPct(eventUntilCapped);
            return (
              <rect
                key={`evt-${idx}`}
                x={x1}
                y={STATE_BAR_TOP_PCT}
                width={Math.max(x2 - x1, 0.1)}
                height={STATE_BAR_BOTTOM_PCT - STATE_BAR_TOP_PCT}
                fill={color}
              />
            );
          })}

          {/* Divergence indicators — dashed verticals through both bars per
              ≥1-eval timing gap, with a connector at the inter-bar mid-y. */}
          {divergences.map((d, i) => {
            const xs = xPct(d.stateAt);
            const xg = xPct(d.grafanaAt);
            const yTop = DIVERGENCE_LABEL_PCT;
            const yBot = STATE_BAR_BOTTOM_PCT;
            const yMid = (GRAFANA_BAR_BOTTOM_PCT + STATE_BAR_TOP_PCT) / 2;
            return (
              <g key={`divg-${i}-${d.stateAt}`} opacity={0.85}>
                <line
                  x1={xs} x2={xs} y1={yTop} y2={yBot}
                  stroke={DIVERGENCE_STROKE}
                  strokeWidth={0.8}
                  strokeDasharray="0.6 0.6"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={xg} x2={xg} y1={yTop} y2={yBot}
                  stroke={DIVERGENCE_STROKE}
                  strokeWidth={0.8}
                  strokeDasharray="0.6 0.6"
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={Math.min(xs, xg)} x2={Math.max(xs, xg)} y1={yMid} y2={yMid}
                  stroke={DIVERGENCE_STROKE}
                  strokeWidth={0.8}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {/* NoData overlay rects — drawn after events.map so NoData wins over
              the Pending rect emitted during an in-progress NoData lifecycle. */}
          {noDataRanges.map((r, i) => {
            const untilCapped = Math.min(r.until, windowAnchor);
            if (untilCapped <= r.from) return null;
            return (
              <rect
                key={`nodata-tick-${i}-${r.from}`}
                x={xPct(r.from)}
                y={STATE_BAR_TOP_PCT}
                width={Math.max(xPct(untilCapped) - xPct(r.from), 0.1)}
                height={STATE_BAR_BOTTOM_PCT - STATE_BAR_TOP_PCT}
                fill={EVENT_COLOR.NoData}
              />
            );
          })}

          {/* Playhead at the latest seen eval tick. */}
          {hasVisible ? (
            <line
              x1={xPct(latestTick)}
              x2={xPct(latestTick)}
              y1={CHART_TOP_PCT}
              y2={STATE_BAR_BOTTOM_PCT}
              stroke={COLOR_LINE}
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              opacity={0.65}
            />
          ) : null}
        </svg>

        {/* HTML overlay — text + emoji, pointer-events:none. */}
        <div style={overlayStyle}>
          {/* Reduce-animation dots — HTML (not SVG) so they stay round under
              the SVG's stretch. animationDelay staggers the sweep. */}
          {animationKey > 0 && latestTickValue !== null && (N > 0 || isInstant) ? (
            <div key={`reduce-${animationKey}`}>
              {/* Sweep dots — range mode only; instant skips straight to the pop. */}
              {N > 0 ? animationWindowSamples.map((s, i) => (
                <div
                  key={`reduce-sample-${i}`}
                  className="reduce-sample-dot"
                  style={{
                    left: `${xPct(s.t)}%`,
                    top: `${yPctInChart(s.v)}%`,
                    animationDelay: `${i * SWEEP_STAGGER_MS}ms, ${flashDelayMs}ms, ${fadeDelayMs}ms`,
                  }}
                />
              )) : null}
              <div
                className="reduce-result-dot"
                style={{
                  left: `${xPct(latestTick)}%`,
                  top: `${yPctInChart(latestTickValue)}%`,
                  animationDelay: `${resultDelayMs}ms`,
                }}
              />
            </div>
          ) : null}

          {/* Divergence labels — "60s ⓘ" pill; click opens the popover below. */}
          {divergences.map((d, i) => {
            const xs = xPct(d.stateAt);
            const xg = xPct(d.grafanaAt);
            const cx = (xs + xg) / 2;
            const cy = DIVERGENCE_LABEL_PCT;
            const seconds = Math.round(Math.abs(d.gapMs) / 1000);
            const label = seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
            return (
              <ChartOverlay
                key={`divg-label-${i}-${d.stateAt}`}
                x={cx}
                y={cy}
                anchor="center-middle"
              >
                <span
                  style={divergenceLabelStyle}
                  data-divergence-trigger
                  title={`Grafana detected this ${d.kind.toLowerCase()} transition ${label} after the algorithm did. Click for details.`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDivergenceIdx(openDivergenceIdx === i ? null : i);
                  }}
                >
                  {label} ⓘ
                </span>
              </ChartOverlay>
            );
          })}

          {/* Divergence popover (single open at a time). */}
          {openDivergenceIdx !== null && divergences[openDivergenceIdx] !== undefined ? (() => {
            const d = divergences[openDivergenceIdx]!;
            const xs = xPct(d.stateAt);
            const xg = xPct(d.grafanaAt);
            const cx = (xs + xg) / 2;
            // Pop up into the empty chart area above the bars.
            const cy = DIVERGENCE_LABEL_PCT - 1.5;
            const seconds = Math.round(Math.abs(d.gapMs) / 1000);
            const label = seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
            const kindLower = d.kind.toLowerCase();
            return (
              <ChartOverlay x={cx} y={cy} anchor="center-bottom">
                <div style={divergencePopoverStyle} data-divergence-popover>
                  <div style={divergencePopoverTitleStyle}>
                    {kindLower} divergence · {label}
                  </div>
                  <div style={divergencePopoverRowStyle}>
                    <span style={divergencePopoverKeyStyle}>Algorithm</span>
                    <code style={divergencePopoverValStyle}>{formatTime(d.stateAt)}</code>
                  </div>
                  <div style={divergencePopoverRowStyle}>
                    <span style={divergencePopoverKeyStyle}>Grafana</span>
                    <code style={divergencePopoverValStyle}>{formatTime(d.grafanaAt)}</code>
                  </div>
                  <div style={divergencePopoverNoteStyle}>
                    Grafana queried Prometheus before the latest samples were
                    ingested. UI-built rules don't apply the query_offset
                    that imported rules get.
                  </div>
                </div>
              </ChartOverlay>
            );
          })() : null}

          {/* State-bar text labels — segments narrower than 5% are skipped. */}
          {events.map((event, idx) => {
            if (event.kind === 'Resolved') return null;
            const x1 = xPct(event.from);
            const x2 = xPct(event.until);
            const widthPct = x2 - x1;
            if (widthPct < 5) return null;
            const centerX = (x1 + x2) / 2;
            const centerY = (STATE_BAR_TOP_PCT + STATE_BAR_BOTTOM_PCT) / 2;
            return (
              <ChartOverlay
                key={`state-label-${idx}`}
                x={centerX}
                y={centerY}
                anchor="center-middle"
              >
                <span style={stateLabelStyle}>{event.kind.toLowerCase()}</span>
              </ChartOverlay>
            );
          })}

          {/* "nodata" labels for the tick-derived NoData overlays. */}
          {noDataRanges.map((r, i) => {
            const x1 = xPct(r.from);
            const x2 = xPct(r.until);
            const widthPct = x2 - x1;
            if (widthPct < 5) return null;
            const centerX = (x1 + x2) / 2;
            const centerY = (STATE_BAR_TOP_PCT + STATE_BAR_BOTTOM_PCT) / 2;
            return (
              <ChartOverlay
                key={`nodata-tick-label-${i}-${r.from}`}
                x={centerX}
                y={centerY}
                anchor="center-middle"
              >
                <span style={stateLabelStyle}>nodata</span>
              </ChartOverlay>
            );
          })}

          {/* Time labels (HH:MM) — edge anchors flip from center to start/end. */}
          {displayTicks.map((t) => {
            const xp = xPct(t);
            const anchor = xp < 3 ? 'start-top' : xp > 97 ? 'end-top' : 'center-top';
            return (
              <ChartOverlay key={`tick-label-${t}`} x={xp} y={2} anchor={anchor}>
                <span style={tickLabelStyle}>{formatTimeShort(t)}</span>
              </ChartOverlay>
            );
          })}

          {/* 15s subdivision dots between minute labels. */}
          {subdivisionTicks
            .filter((t) => !displayTickSet.has(t))
            .map((t) => (
              <ChartOverlay key={`tick-dot-${t}`} x={xPct(t)} y={3} anchor="center-middle">
                <span style={subdivisionDotStyle} />
              </ChartOverlay>
            ))}

          {/* Eye emoji per eval tick. */}
          {showEyes &&
            evalTicks.map((t) => {
              const xp = xPct(t);
              const anchor = xp < 3 ? 'start-top' : xp > 97 ? 'end-top' : 'center-top';
              return (
                <ChartOverlay key={`eye-${t}`} x={xp} y={11} anchor={anchor}>
                  <span style={emojiStyle}>{'\u{1F441}'}</span>
                </ChartOverlay>
              );
            })}

          {/* 15s subdivision dots between the eyes. */}
          {showEyes &&
            subdivisionTicks
              .filter((t) => !evalTickSet.has(t))
              .map((t) => (
                <ChartOverlay key={`eye-dot-${t}`} x={xPct(t)} y={13} anchor="center-middle">
                  <span style={subdivisionDotStyle} />
                </ChartOverlay>
              ))}

          {/* `:SS` under each eye — confirms eval ticks land on Grafana's grid. */}
          {showEyes &&
            evalTicks.map((t) => {
              const xp = xPct(t);
              const anchor = xp < 3 ? 'start-top' : xp > 97 ? 'end-top' : 'center-top';
              return (
                <ChartOverlay key={`eye-sec-${t}`} x={xp} y={17} anchor={anchor}>
                  <span style={secondsLabelStyle}>{formatSeconds(t)}</span>
                </ChartOverlay>
              );
            })}

          {/* relativeTimeRange [Nm] label. */}
          {!isInstant && showWindow ? (
            <ChartOverlay
              x={(xPct(windowStart) + xPct(windowAnchor)) / 2}
              y={(CHART_TOP_PCT + CHART_BOTTOM_PCT) / 2 + 4}
              anchor="center-top"
            >
              <span style={windowLabelStyle}>
                relativeTimeRange [{formatTickLabel(windowDuration)}]
              </span>
            </ChartOverlay>
          ) : null}

          {/* Crossing markers — 💥 ignition, 💧 resolution. */}
          {crossings.map((c) => {
            const xp = xPct(c.t);
            if (xp < 0 || xp > 100) return null;
            return (
              <ChartOverlay
                key={`xicon-${c.t}-${c.direction}`}
                x={xp}
                y={yPctInChart(c.v)}
                anchor="center-middle"
              >
                <span style={crossingEmojiStyle}>
                  {c.direction === 'ignition' ? '\u{1F4A5}' : '\u{1F4A7}'}
                </span>
              </ChartOverlay>
            );
          })}

          {/* Crossing time label — inside the state bar, off the threshold line. */}
          {crossings.map((c) => {
            const xp = xPct(c.t);
            if (xp < 0 || xp > 100) return null;
            return (
              <ChartOverlay
                key={`xicon-time-${c.t}-${c.direction}`}
                x={xp}
                y={(STATE_BAR_TOP_PCT + STATE_BAR_BOTTOM_PCT) / 2}
                anchor="center-middle"
              >
                <span style={secondsLabelStyle}>{formatSeconds(c.t)}</span>
              </ChartOverlay>
            );
          })}

          {/* NOW indicator — ⏰ at the dashed NOW line, time below. Live only. */}
          {rightAnchorT !== undefined ? (
            <>
              <ChartOverlay x={xPct(rightAnchorT)} y={50} anchor="center-middle">
                <span
                  key={pollSignal ?? 'no-poll'}
                  className="alert-whatif-now-clock-pop"
                  aria-label="now"
                >
                  <span className="alert-whatif-now-clock-breath" style={emojiStyle}>
                    ⏰
                  </span>
                </span>
              </ChartOverlay>
              <ChartOverlay x={xPct(rightAnchorT)} y={54} anchor="center-top">
                <span style={secondsLabelStyle}>{formatSeconds(rightAnchorT)}</span>
              </ChartOverlay>
            </>
          ) : null}

          {/* ⚠️/🔔/🔕/🌫️ lifecycle markers — emoji only; each lands on an eval
              tick, so the eye-row timestamp below already shows the time. */}
          {pendingEvents.map((p, i) => {
            const xp = xPct(p.from);
            if (xp < 0 || xp > 100) return null;
            return (
              <ChartOverlay
                key={`pending-marker-${i}-${p.from}`}
                x={xp}
                y={11}
                anchor="center-top"
              >
                <span style={emojiStyle}>{'⚠️'}</span>
              </ChartOverlay>
            );
          })}

          {firingEvents.map((f, i) => {
            const xp = xPct(f.from);
            if (xp < 0 || xp > 100) return null;
            return (
              <ChartOverlay
                key={`firing-marker-${i}-${f.from}`}
                x={xp}
                y={11}
                anchor="center-top"
              >
                <span style={emojiStyle}>{'\u{1F514}'}</span>
              </ChartOverlay>
            );
          })}

          {resolvedEvents.map((r, i) => {
            const xp = xPct(r.at);
            if (xp < 0 || xp > 100) return null;
            return (
              <ChartOverlay
                key={`resolved-marker-${i}-${r.at}`}
                x={xp}
                y={11}
                anchor="center-top"
              >
                <span style={emojiStyle}>{'\u{1F515}'}</span>
              </ChartOverlay>
            );
          })}

          {noDataEvents.map((n, i) => {
            const xp = xPct(n.from);
            if (xp < 0 || xp > 100) return null;
            return (
              <ChartOverlay
                key={`nodata-marker-${i}-${n.from}`}
                x={xp}
                y={11}
                anchor="center-top"
              >
                <span style={emojiStyle}>{'\u{1F32B}️'}</span>
              </ChartOverlay>
            );
          })}

        </div>
        </div>
      </div>

      {bottomSlot}
    </>
  );
}
