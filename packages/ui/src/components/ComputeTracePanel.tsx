// Per-tick compute trace, laid out to mirror alert.json's expressions DAG
// (A query → B reduce → C threshold → for-gate) so the user can map UI block
// to JSON node by refId. Pure presentation; the parent supplies currentTick.

import React from 'react';
import type { CSSProperties } from 'react';
import type { AlertConfig, EvalEvent, Sample, Tick } from '@alert-whatif/core';
import { computeEffectiveStepMs, passes } from '@alert-whatif/core';
import {
  FLASH_DURATION_MS,
  FLASH_GAP_MS,
  SWEEP_PER_DOT_MS,
  SWEEP_STAGGER_MS,
} from '../util/reduce-animation-timing';
import { cardStyle, mutedTextStyle } from '../styles';

type Props = {
  readonly tickIndex: number;
  readonly tickCount: number;
  readonly currentTick: Tick | null;
  readonly samples: ReadonlyArray<Sample>;
  readonly config: AlertConfig;
  readonly events: ReadonlyArray<EvalEvent>;
};

export function ComputeTracePanel({
  tickIndex,
  tickCount,
  currentTick,
  samples,
  config,
  events,
}: Props) {
  if (currentTick === null) {
    return (
      <section style={cardStyle}>
        <h2 style={headingStyle}>Compute trace</h2>
        <p style={mutedTextStyle}>
          No ticks evaluated yet — press <strong>▶</strong> or <strong>▶ +1</strong> to step
          forward.
        </p>
      </section>
    );
  }

  const tickTime = currentTick.t;
  // Range slices a window for the reducer; instant looks up the sample at
  // tick.t exactly.
  const windowEnd = tickTime;
  const windowStart = config.instant ? tickTime : tickTime - config.windowDuration;
  const slice = config.instant
    ? samples.filter((s) => s.t === tickTime)
    : samples.filter((s) => s.t > windowStart && s.t <= windowEnd);
  const finiteCount = slice.filter((s) => Number.isFinite(s.v)).length;
  const droppedCount = slice.length - finiteCount;

  const lifecycle = lifecycleAt(tickTime, events);

  const thresholdSummary = thresholdSummaryOf(config.threshold);

  return (
    <section style={cardStyle}>
      <header style={titleRowStyle}>
        <h2 style={headingStyle}>Compute trace</h2>
        <span style={mutedTextStyle}>
          Tick <strong>{tickIndex}</strong> / {tickCount} &middot;{' '}
          <span key={`tick-time-${tickTime}`} className="reduce-output-flash">
            <code style={codeInlineStyle}>{formatTime(tickTime)}</code>
          </span>
        </span>
      </header>

      {/* DAG node A — query. */}
      <NodeHeader
        refId="A"
        type="query"
        summary={config.instant ? 'instant' : `range · ${formatMs(config.windowDuration)} → 0s`}
      />
      {config.instant ? (
        <TraceRow label="Sample @ tick.t">
          {slice.length > 0 ? (
            <code style={codeInlineStyle}>
              {Number.isFinite(slice[0]!.v) ? slice[0]!.v.toFixed(3) : String(slice[0]!.v)}
            </code>
          ) : (
            <span style={mutedInlineStyle}>NoData (Prom returned no sample at this step)</span>
          )}
        </TraceRow>
      ) : (
        <>
          <TraceRow label="Window">
            <span key={`window-${windowEnd}`} className="reduce-output-flash">
              <code style={codeInlineStyle}>
                ({formatTime(windowStart)}, {formatTime(windowEnd)}]
              </code>
            </span>
          </TraceRow>
          <TraceRow label="Samples">
            <strong>{slice.length}</strong>
            {droppedCount > 0 ? (
              <span style={mutedInlineStyle}>
                {' '}
                ({finiteCount} finite, {droppedCount} NaN/Inf — nanMode: {config.nanMode.kind})
              </span>
            ) : null}
            {slice.length > 0 ? (
              <div style={sliceListStyle}>
                {slice.map((s, i) => (
                  <span
                    key={`slice-${tickTime}-${s.t}`}
                    className="reduce-output-flash"
                    style={{
                      // Match the chart's reduce-sample-dot sweep stagger.
                      animationDelay: `${i * SWEEP_STAGGER_MS}ms`,
                    }}
                  >
                    <code style={sliceItemStyle}>
                      {Number.isFinite(s.v) ? s.v.toFixed(3) : String(s.v)}
                    </code>
                  </span>
                ))}
              </div>
            ) : null}
          </TraceRow>
        </>
      )}

      {/* DAG node B — reduce. Range only; Output flashes in sync with the
          chart's reduce-result-dot pop. */}
      {config.instant ? null : (
        <>
          <NodeHeader refId="B" type="reduce" summary={config.reducer.toLowerCase()} />
          <TraceRow label="Output">
            {currentTick.kind === 'Data' ? (
              <span
                key={`reduce-out-${tickTime}`}
                className="reduce-output-flash"
                style={{
                  animationDelay: `${reduceFlashDelayMs(slice.length)}ms`,
                }}
              >
                <code style={codeInlineStyle}>{currentTick.v.toFixed(6)}</code>
              </span>
            ) : (
              <span style={mutedInlineStyle}>NoData (empty slice or reducer NaN)</span>
            )}
          </TraceRow>
          <SampleCountBreakdown config={config} />
        </>
      )}

      {/* Threshold node — refId C (range, after B) or B (instant, after A). */}
      <NodeHeader
        refId={config.instant ? 'B' : 'C'}
        type="threshold"
        summary={thresholdSummary}
      />
      <TraceRow label="Check">
        {currentTick.kind === 'Data' ? (
          <ThresholdLine value={currentTick.v} threshold={config.threshold} />
        ) : (
          <span style={mutedInlineStyle}>n/a</span>
        )}
      </TraceRow>

      {/* For-gate / lifecycle — rule-level (spec.for), not an expression node. */}
      <NodeHeader label="For-gate" summary={`for ${formatMs(config.forDuration)}`} />
      <TraceRow label="Lifecycle">
        {lifecycle ? (
          <strong
            key={`lifecycle-${lifecycle}`}
            className="reduce-output-flash"
            style={{ color: stateColor(lifecycle) }}
          >
            {lifecycle}
          </strong>
        ) : (
          <span
            key="lifecycle-normal"
            className="reduce-output-flash"
            style={mutedInlineStyle}
          >
            Normal (no active episode)
          </span>
        )}
      </TraceRow>
    </section>
  );
}

// Makes the otherwise-invisible fetch-layer effective-step formula auditable.
// Range only.
function SampleCountBreakdown({ config }: { readonly config: AlertConfig }) {
  if (config.instant) return null;
  const intervalMs = config.intervalMs;
  const maxDataPoints = config.maxDataPoints;
  const rangeMs = config.windowDuration;
  const resolution = maxDataPoints === 0 ? 1500 : maxDataPoints;
  const safeMs = rangeMs / resolution;
  const safeBranchTaken = safeMs < intervalMs;
  const effectiveStepMs = computeEffectiveStepMs({ intervalMs, maxDataPoints, timeRangeMs: rangeMs });
  const samplesPerWindow = Math.floor(rangeMs / effectiveStepMs);

  const maxValue = safeBranchTaken ? intervalMs : safeMs;
  // Suffix only when grid rounding changes the value.
  const gridSuffix =
    maxValue === effectiveStepMs ? '' : ` → grid ${effectiveStepMs}`;

  return (
    <div style={breakdownBoxStyle}>
      <div style={breakdownHeaderStyle}>How many samples per window</div>
      <pre style={formulaStyle}>
        {`step    = max(${intervalMs}, ${rangeMs}/${resolution}) = max(${intervalMs}, ${formatNumber(safeMs)}) = `}
        <span key={`step-${maxValue}`} className="reduce-output-flash">
          {formatNumber(maxValue)}{gridSuffix} ms
        </span>
        {'\n'}
        {`samples = ${rangeMs} / ${effectiveStepMs} = `}
        <span key={`samples-${samplesPerWindow}`} className="reduce-output-flash">
          {samplesPerWindow}
        </span>
      </pre>
    </div>
  );
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

// Mirrors MetricChart so the panel's reduce-output flash fires in sync.
function reduceFlashDelayMs(n: number): number {
  if (n <= 0) return 0;
  const lastSweepEnd = (n - 1) * SWEEP_STAGGER_MS + SWEEP_PER_DOT_MS;
  return lastSweepEnd + FLASH_GAP_MS + FLASH_DURATION_MS;
}

// `refId + type` (matching alert.json), or an explicit `label` for the for-gate.
function NodeHeader({
  refId,
  type,
  label,
  summary,
}: {
  readonly refId?: string;
  readonly type?: string;
  readonly label?: string;
  readonly summary?: string;
}) {
  const title = label ?? `${refId} · ${type}`;
  return (
    <div style={nodeHeaderStyle}>
      <span style={nodeHeaderTitleStyle}>{title}</span>
      {summary !== undefined ? <span style={nodeHeaderSummaryStyle}>{summary}</span> : null}
    </div>
  );
}

function thresholdSummaryOf(threshold: AlertConfig['threshold']): string {
  if ('value' in threshold) return `${threshold.op} ${threshold.value}`;
  return `${threshold.op} [${threshold.left}, ${threshold.right}]`;
}

function TraceRow({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{children}</div>
    </div>
  );
}

function ThresholdLine({ value, threshold }: { readonly value: number; readonly threshold: AlertConfig['threshold'] }) {
  const pass = passes(value, threshold);
  const thr = 'value' in threshold ? `${threshold.op} ${threshold.value}` : `${threshold.op} [${threshold.left}, ${threshold.right}]`;
  const valueStr = value.toFixed(3);
  const verdict = pass ? 'PASS' : 'fail';
  return (
    <code style={codeInlineStyle}>
      <span key={`thr-val-${valueStr}`} className="reduce-output-flash">
        {valueStr}
      </span>
      {' '}{thr}{' → '}
      <strong
        key={`thr-verdict-${verdict}`}
        className="reduce-output-flash"
        style={{ color: pass ? 'var(--event-firing)' : 'var(--text-muted)' }}
      >
        {verdict}
      </strong>
    </code>
  );
}

// Which ranged event contains tickTime, half-open [from, until) to match
// currentStateForTick + the state bar + Grafana's resolution semantics.
function lifecycleAt(
  tickTime: number,
  events: ReadonlyArray<EvalEvent>,
): 'Pending' | 'Firing' | 'NoData' | 'Recovering' | null {
  for (const e of events) {
    if (e.kind === 'Resolved') continue;
    if (tickTime >= e.from && tickTime < e.until) return e.kind;
  }
  return null;
}

function stateColor(state: string): string {
  switch (state) {
    case 'Firing':
      return 'var(--event-firing)';
    case 'Pending':
      return 'var(--event-pending)';
    case 'Recovering':
      return 'var(--event-recovering, var(--event-pending))';
    case 'NoData':
      return 'var(--event-nodata, var(--text-muted))';
    default:
      return 'var(--text-primary)';
  }
}

// Local timezone to match MetricChart's wallclock.
function formatTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatMs(d: number): string {
  if (d >= 60_000 && d % 60_000 === 0) return `${d / 60_000}m`;
  if (d >= 60_000) return `${(d / 60_000).toFixed(1)}m`;
  if (d >= 1000 && d % 1000 === 0) return `${d / 1000}s`;
  if (d >= 1000) return `${(d / 1000).toFixed(1)}s`;
  return `${d}ms`;
}

const headingStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 0,
  fontSize: '0.95rem',
};

const titleRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '0.5rem',
  marginBottom: '0.4rem',
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '7.5rem 1fr',
  alignItems: 'baseline',
  gap: '0.5rem',
  marginBottom: '0.2rem',
};

const labelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const valueStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: '0.9rem',
  fontVariantNumeric: 'tabular-nums',
  overflowWrap: 'anywhere',
};

const codeInlineStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.85rem',
  background: 'var(--bg-input, transparent)',
  padding: '1px 4px',
  borderRadius: 3,
};

const mutedInlineStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
};

const sliceListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.25rem',
  marginTop: '0.35rem',
};

const sliceItemStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.78rem',
  padding: '1px 5px',
  borderRadius: 3,
  background: 'var(--bg-input, rgba(127,127,127,0.08))',
  border: '1px solid var(--border-card)',
};

const nodeHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.5rem',
  marginTop: '0.5rem',
  marginBottom: '0.2rem',
  paddingTop: '0.35rem',
  borderTop: '1px solid var(--border-card)',
};

const nodeHeaderTitleStyle: CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-primary)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const nodeHeaderSummaryStyle: CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const breakdownBoxStyle: CSSProperties = {
  marginTop: '0.8rem',
  padding: '0.6rem 0.7rem',
  border: '1px dashed var(--border-card)',
  borderRadius: 4,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const breakdownHeaderStyle: CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '0.4rem',
};

const formulaStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.78rem',
  lineHeight: 1.5,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap',
  fontVariantNumeric: 'tabular-nums',
};
