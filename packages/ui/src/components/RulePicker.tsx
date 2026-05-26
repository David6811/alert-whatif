// Grafana alert-rule selector for the header, rendered when the adapter
// exposes `listRules`. Grouped by folder, state-dot prefixed, with a ↻ refresh.

import React from 'react';
import type { CSSProperties } from 'react';
import type { GrafanaAlertState, RuleSummary } from '../data/data-source';

type Props = {
  readonly rules: ReadonlyArray<RuleSummary>;
  readonly selectedUid: string | null;
  readonly onSelect: (uid: string) => void;
  readonly loading: boolean;
  readonly error: string | null;
  // Omitted hides the ↻ button.
  readonly onRefresh?: () => void;
};

export function RulePicker({
  rules,
  selectedUid,
  onSelect,
  loading,
  error,
  onRefresh,
}: Props) {
  const disabled = loading || error !== null;
  const grouped = groupByFolder(rules);
  const counts = countByState(rules);

  return (
    <label style={wrapperStyle}>
      <span style={labelStyle}>Rule:</span>
      <select
        value={selectedUid ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        style={selectStyle}
        disabled={disabled}
      >
        {loading && <option value="">Loading rules…</option>}
        {error !== null && !loading && <option value="">(error loading rules)</option>}
        {!loading && error === null && selectedUid === null && (
          <option value="" disabled>
            Pick a rule…
          </option>
        )}
        {!loading &&
          error === null &&
          grouped.map(({ folder, rules: folderRules }) => {
            // No-folder rules render flat; folder-tagged ones inside an optgroup.
            if (folder === undefined) {
              return folderRules.map((r) => (
                <option key={r.uid} value={r.uid}>
                  {renderOption(r)}
                </option>
              ));
            }
            return (
              <optgroup key={folder} label={folder}>
                {folderRules.map((r) => (
                  <option key={r.uid} value={r.uid}>
                    {renderOption(r)}
                  </option>
                ))}
              </optgroup>
            );
          })}
      </select>
      {!loading && error === null && (
        <span style={metaStyle}>{describeCounts(rules.length, counts)}</span>
      )}
      {onRefresh !== undefined && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          style={refreshButtonStyle}
          title="Reload rules list"
          aria-label="Reload rules list"
        >
          ↻
        </button>
      )}
    </label>
  );
}

const STATE_DOT: Record<GrafanaAlertState, string> = {
  firing: '🔴',
  pending: '🟡',
  inactive: '⚪',
  unknown: '❔',
};

function renderOption(r: RuleSummary): string {
  const dot = r.state !== undefined ? STATE_DOT[r.state] : '';
  return dot !== '' ? `${dot} ${r.title}` : r.title;
}

type FolderGroup = {
  readonly folder: string | undefined;
  readonly rules: ReadonlyArray<RuleSummary>;
};

// Preserves first-seen folder order so the picker doesn't re-shuffle on refresh.
function groupByFolder(rules: ReadonlyArray<RuleSummary>): ReadonlyArray<FolderGroup> {
  const groups = new Map<string | undefined, RuleSummary[]>();
  for (const r of rules) {
    const existing = groups.get(r.folder);
    if (existing) existing.push(r);
    else groups.set(r.folder, [r]);
  }
  return Array.from(groups.entries()).map(([folder, folderRules]) => ({
    folder,
    rules: folderRules,
  }));
}

type StateCounts = {
  readonly firing: number;
  readonly pending: number;
  readonly inactive: number;
  readonly unknown: number;
};

function countByState(rules: ReadonlyArray<RuleSummary>): StateCounts {
  const counts = { firing: 0, pending: 0, inactive: 0, unknown: 0 };
  for (const r of rules) {
    if (r.state !== undefined) counts[r.state] += 1;
  }
  return counts;
}

// "3 rules · 1 firing · 2 inactive" — non-zero buckets only.
function describeCounts(total: number, c: StateCounts): string {
  const noun = `${total} rule${total === 1 ? '' : 's'}`;
  const parts: string[] = [];
  if (c.firing > 0) parts.push(`${c.firing} firing`);
  if (c.pending > 0) parts.push(`${c.pending} pending`);
  if (c.unknown > 0) parts.push(`${c.unknown} unknown`);
  // Skip inactive when it's the only non-zero bucket ("3 rules · 3 inactive").
  const nonInactiveTotal = c.firing + c.pending + c.unknown;
  if (nonInactiveTotal > 0 && c.inactive > 0) parts.push(`${c.inactive} inactive`);
  return parts.length > 0 ? `${noun} · ${parts.join(' · ')}` : noun;
}

const wrapperStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
};

const labelStyle: CSSProperties = {
  fontSize: '0.875rem',
  color: 'var(--text-muted)',
};

const selectStyle: CSSProperties = {
  // Inline sizing/colors beat Grafana's select reset.
  padding: '0.4rem 0.55rem',
  minHeight: '2rem',
  lineHeight: 1.2,
  fontSize: '0.875rem',
  width: 'auto',
  minWidth: '14rem',
  maxWidth: '24rem',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-input)',
  borderRadius: 4,
};

const metaStyle: CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-muted)',
};

const refreshButtonStyle: CSSProperties = {
  padding: '0.15rem 0.4rem',
  fontSize: '0.9rem',
  lineHeight: 1,
  border: '1px solid var(--border-card)',
  borderRadius: 3,
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
};
