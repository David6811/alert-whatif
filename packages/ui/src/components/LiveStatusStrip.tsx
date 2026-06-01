// Status strip above the chart in both Live and Mock modes — one component so
// chrome, chips, and spacing stay in lockstep. Live shows both state pills + a
// =/≠ comparison and a Snapshot/Export action; Mock shows our pill alone and
// the replay button row in the same action slot.

import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { GrafanaAlertState } from '../data/data-source';
import type { OurState } from '../calc/state';
import { statesMatch } from '../calc/state';

type CommonProps = {
  readonly ourState: OurState;
  // Context label (PromQL live / dataset id mock); omitted skips the chip.
  readonly query?: string;
  // Slot after the comparison pill (e.g. SeriesPicker for multi-series).
  readonly pillExtra?: ReactNode;
};

type LiveProps = CommonProps & {
  readonly mode: 'live';
  // Omitted (grafanaStateOracle off) degrades to the What-If pill alone.
  readonly grafanaState?: GrafanaAlertState;
  readonly lastPollAt: number | null;
  readonly intervalSec: number;
  readonly error: string | null;
  // Freeze current live samples into a Mock dataset for scrubbing.
  readonly onSnapshot?: () => void;
  readonly canSnapshot?: boolean;
  readonly onExport?: () => void;
  readonly canExport?: boolean;
  // Opens the detection-latency timeline panel (enqueue → threshold → pending → fire).
  readonly onExportTimeline?: () => void;
  // Plugin uses Import in place of Snapshot.
  readonly onImport?: (file: File) => void;
  // Brief post-export confirmation carrying the file's cutoff timestamp.
  readonly exportToast?: string | null;
  // Extra row inside the same card (today <PushControls/>).
  readonly footerSlot?: ReactNode;
};

type MockProps = CommonProps & {
  readonly mode: 'mock';
  // Rendered in the same action slot Snapshot uses in Live.
  readonly replayButtons: ReactNode;
  readonly tickIndex: number;
  readonly tickCount: number;
  // Grafana's state at the playhead (from grafanaHistory); omitted shows our
  // chip alone.
  readonly grafanaState?: GrafanaAlertState;
  readonly onExport?: () => void;
  readonly onExportTimeline?: () => void;
  readonly onImport?: (file: File) => void;
};

type Props = LiveProps | MockProps;

export function LiveStatusStrip(props: Props) {
  return (
    <div style={rootStyle}>
      <div style={rowStyle}>
        {props.query !== undefined && props.query !== '' ? (
          <>
            <span style={queryStyle}>
              <code style={codeStyle}>{props.query}</code>
            </span>
            <span style={separatorStyle}>·</span>
          </>
        ) : null}

        {props.mode === 'live' ? (
          <LivePills
            {...(props.grafanaState !== undefined
              ? { grafanaState: props.grafanaState }
              : {})}
            ourState={props.ourState}
          />
        ) : (
          <LivePills
            {...(props.grafanaState !== undefined
              ? { grafanaState: props.grafanaState }
              : {})}
            ourState={props.ourState}
          />
        )}

        {props.pillExtra !== undefined ? (
          <span style={{ marginLeft: '0.75rem', display: 'inline-flex', alignItems: 'center' }}>
            {props.pillExtra}
          </span>
        ) : null}

        <div style={spacerStyle} />

        {props.mode === 'live' ? (
          <>
            <span style={pollMetaStyle}>
              {props.lastPollAt === null
                ? 'connecting…'
                : `polled ${formatTime(props.lastPollAt)} · every ${props.intervalSec}s`}
            </span>
            {props.onSnapshot !== undefined ? (
              <button
                type="button"
                onClick={props.onSnapshot}
                disabled={!props.canSnapshot}
                style={iconButtonStyle(!!props.canSnapshot)}
                title={
                  props.canSnapshot
                    ? 'Freeze the current live samples into a Mock dataset and switch to it (for tick-by-tick scrubbing)'
                    : 'Wait for the first poll to complete'
                }
              >
                📸 Snapshot
              </button>
            ) : null}
            {props.onExportTimeline !== undefined ? (
              <button
                type="button"
                onClick={props.onExportTimeline}
                style={iconButtonStyle(true)}
                title="Show the detection-latency timeline: job enqueued → threshold reached → Pending → Firing (email), with total latency"
              >
                🧭 Timeline
              </button>
            ) : null}
            {props.onExport !== undefined ? (
              <button
                type="button"
                onClick={props.onExport}
                disabled={!props.canExport}
                style={iconButtonStyle(!!props.canExport)}
                title={
                  props.canExport
                    ? 'Download the current scenario as a JSON file you can re-import or share.\n\nThe file freezes everything up to the most recent poll — no need to pause first. If you want the export to precisely match a frame you’re inspecting (e.g. mid-firing), pause Live updates first via the ⏸ button on the scrub strip.'
                    : 'Wait for the first poll to complete'
                }
              >
                📥 Export
              </button>
            ) : null}
            {props.onImport !== undefined ? (
              <label style={iconButtonStyle(true)} title="Import a previously-exported JSON dataset">
                📤 Import
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file !== undefined && props.onImport !== undefined) {
                      props.onImport(file);
                    }
                    e.target.value = '';
                  }}
                  style={hiddenFileInputStyle}
                />
              </label>
            ) : null}
          </>
        ) : (
          <>
            <span style={pollMetaStyle}>
              tick <strong>{props.tickIndex}</strong> / {props.tickCount}
            </span>
            <span style={actionSlotStyle}>{props.replayButtons}</span>
            {props.onExportTimeline !== undefined ? (
              <button
                type="button"
                onClick={props.onExportTimeline}
                style={iconButtonStyle(true)}
                title="Show the detection-latency timeline: job enqueued → threshold reached → Pending → Firing (email), with total latency"
              >
                🧭 Timeline
              </button>
            ) : null}
            {props.onExport !== undefined ? (
              <button
                type="button"
                onClick={props.onExport}
                style={iconButtonStyle(true)}
                title="Download the current dataset as a JSON file you can re-import or share"
              >
                📥 Export
              </button>
            ) : null}
            {props.onImport !== undefined ? (
              <label style={iconButtonStyle(true)} title="Import a previously-exported JSON dataset">
                📤 Import
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file !== undefined && props.onImport !== undefined) {
                      props.onImport(file);
                    }
                    e.target.value = '';
                  }}
                  style={hiddenFileInputStyle}
                />
              </label>
            ) : null}
          </>
        )}
      </div>

      {props.mode === 'live' && props.error !== null ? (
        <div style={errorRowStyle}>
          <span style={errorLabelStyle}>poll error</span>
          <code style={errorCodeStyle}>{props.error}</code>
        </div>
      ) : null}

      {props.mode === 'live' && props.exportToast ? (
        <div style={toastRowStyle}>{props.exportToast}</div>
      ) : null}

      {props.mode === 'live' && props.footerSlot !== undefined ? (
        <div style={rowStyle}>{props.footerSlot}</div>
      ) : null}
    </div>
  );
}

function LivePills({
  grafanaState,
  ourState,
}: {
  // Omitted renders only the What-If pill, no comparison symbol.
  readonly grafanaState?: GrafanaAlertState;
  readonly ourState: OurState;
}) {
  if (grafanaState === undefined) {
    return (
      <>
        <span style={labelStyle}>What-If</span>
        <Chip kind={chipKindForOurs(ourState)}>{ourState}</Chip>
      </>
    );
  }
  const grafanaLabel = grafanaState === 'unknown' ? '—' : grafanaState;
  const matched = statesMatch(grafanaState, ourState);
  return (
    <>
      <span style={labelStyle}>Grafana</span>
      <Chip kind={chipKindForGrafana(grafanaState)}>{grafanaLabel}</Chip>
      <span
        style={matched ? matchSymbolStyle : mismatchSymbolStyle}
        aria-label={matched ? 'match' : 'diverged'}
        title={matched ? 'States agree' : 'States disagree — investigate'}
      >
        {matched ? '=' : '≠'}
      </span>
      <span style={labelStyle}>What-If</span>
      <Chip kind={chipKindForOurs(ourState)}>{ourState.toLowerCase()}</Chip>
    </>
  );
}

type ChipKind = 'firing' | 'pending' | 'nodata' | 'inactive' | 'unknown';

function Chip({ kind, children }: { readonly kind: ChipKind; readonly children: React.ReactNode }) {
  return <span style={chipStyle(kind)}>{children}</span>;
}

function chipKindForGrafana(s: GrafanaAlertState): ChipKind {
  if (s === 'firing') return 'firing';
  if (s === 'pending') return 'pending';
  if (s === 'inactive') return 'inactive';
  return 'unknown';
}

function chipKindForOurs(s: OurState): ChipKind {
  if (s === 'Firing') return 'firing';
  if (s === 'Pending') return 'pending';
  if (s === 'NoData') return 'nodata';
  if (s === 'Recovering') return 'pending';
  return 'inactive';
}

// Local timezone to match MetricChart + ComputeTracePanel.
function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--border-card)',
  borderRadius: 8,
  background: 'var(--bg-card)',
  marginBottom: '0.5rem',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  fontSize: '0.85rem',
};

const errorRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '0.4rem',
  paddingTop: '0.25rem',
  borderTop: '1px solid var(--border-card)',
  fontSize: '0.8rem',
};

const toastRowStyle: CSSProperties = {
  paddingTop: '0.25rem',
  borderTop: '1px solid var(--border-card)',
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

const labelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const queryStyle: CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
};

const codeStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.8rem',
  padding: '1px 4px',
  borderRadius: 3,
  background: 'var(--bg-input, transparent)',
};

const pollMetaStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.8rem',
  fontVariantNumeric: 'tabular-nums',
};

const matchSymbolStyle: CSSProperties = {
  color: 'var(--chart-state-normal, #22c55e)',
  fontWeight: 700,
  fontSize: '1rem',
  padding: '0 0.15rem',
};

const mismatchSymbolStyle: CSSProperties = {
  color: 'var(--event-firing, #ef4444)',
  fontWeight: 700,
  fontSize: '1rem',
  padding: '0 0.15rem',
};

const separatorStyle: CSSProperties = {
  color: 'var(--text-faded)',
  fontSize: '0.85rem',
};

const spacerStyle: CSSProperties = { flex: '1 1 auto' };

// Shared by the 📸/📥/📤 buttons; also styles the <label> wrapping Import's
// hidden file input.
const iconButtonStyle = (enabled: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  marginLeft: '0.5rem',
  padding: '2px 8px',
  fontSize: '0.78rem',
  border: '1px solid var(--border-card)',
  borderRadius: 4,
  background: 'var(--bg-input, transparent)',
  color: enabled ? 'var(--text-primary)' : 'var(--text-faded)',
  cursor: enabled ? 'pointer' : 'not-allowed',
  opacity: enabled ? 1 : 0.5,
  whiteSpace: 'nowrap',
});

// Visually hidden but keyboard-focusable so the label can trigger it.
const hiddenFileInputStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

const actionSlotStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  marginLeft: '0.5rem',
};

const errorLabelStyle: CSSProperties = {
  color: 'var(--text-error)',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const errorCodeStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.78rem',
  color: 'var(--text-error)',
};

const chipStyle = (kind: ChipKind): CSSProperties => ({
  padding: '1px 8px',
  borderRadius: 999,
  fontSize: '0.78rem',
  fontWeight: 600,
  textTransform: 'lowercase',
  background: chipBackground(kind),
  color: chipColor(kind),
  border: `1px solid ${chipBorder(kind)}`,
});

function chipBackground(kind: ChipKind): string {
  switch (kind) {
    case 'firing':
      return 'rgba(239, 68, 68, 0.22)';
    case 'pending':
      return 'rgba(234, 179, 8, 0.22)';
    case 'nodata':
      return 'rgba(99, 102, 241, 0.22)';
    case 'inactive':
      return 'rgba(34, 197, 94, 0.22)';
    case 'unknown':
    default:
      return 'rgba(127, 127, 127, 0.22)';
  }
}

function chipColor(kind: ChipKind): string {
  switch (kind) {
    case 'firing':
      return 'var(--event-firing, #ef4444)';
    case 'pending':
      return 'var(--event-pending, #eab308)';
    case 'nodata':
      return 'var(--event-nodata, #6366f1)';
    case 'inactive':
      return '#22c55e';
    case 'unknown':
    default:
      return 'var(--text-muted)';
  }
}

function chipBorder(kind: ChipKind): string {
  return chipColor(kind);
}
