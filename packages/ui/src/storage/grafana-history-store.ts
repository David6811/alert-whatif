// localStorage Grafana state-bar history, keyed by rule title; entries older
// than 24h are pruned on load. Pure I/O, no React.

import type { GrafanaAlertState } from '../data/data-source';

export type GrafanaHistoryEntry = {
  readonly t: number;
  readonly state: GrafanaAlertState;
};

const STORAGE_KEY_PREFIX = 'alert-whatif:grafana-history:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VALID_STATES: ReadonlySet<string> = new Set([
  'inactive',
  'pending',
  'firing',
  'unknown',
]);

export function loadGrafanaHistory(
  ruleTitle: string,
): ReadonlyArray<GrafanaHistoryEntry> {
  if (typeof window === 'undefined' || ruleTitle === '') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + ruleTitle);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.flatMap((e: unknown) => {
      if (typeof e !== 'object' || e === null) return [];
      const t = (e as { t?: unknown }).t;
      const state = (e as { state?: unknown }).state;
      if (typeof t !== 'number' || !Number.isFinite(t) || t < cutoff) return [];
      if (typeof state !== 'string' || !VALID_STATES.has(state)) return [];
      return [{ t, state: state as GrafanaAlertState }];
    });
  } catch {
    return [];
  }
}

export function saveGrafanaHistory(
  ruleTitle: string,
  history: ReadonlyArray<GrafanaHistoryEntry>,
): void {
  if (typeof window === 'undefined' || ruleTitle === '') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PREFIX + ruleTitle,
      JSON.stringify(history),
    );
  } catch {
    // Quota exceeded / private mode — in-memory state still works.
  }
}
