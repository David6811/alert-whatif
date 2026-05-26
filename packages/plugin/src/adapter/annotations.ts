import { describeFetchError, type WhatIfDataSource } from '@alert-whatif/ui';
import {
  mapAnnotationToBarState,
  mapAnnotationToInitialState,
  type AlertAnnotation,
} from '@alert-whatif/core';
import { api } from './http';
import { fetchRuleState } from './rules';

// Grafana's /api/annotations tag/tags params are silently ignored for alert
// annotations (grafana@12.4), so we over-fetch the window and filter client-side.
async function matchingAnnotations(
  ruleTitle: string,
  window: { from?: number; to?: number },
): Promise<readonly AlertAnnotation[]> {
  const data = await api<readonly AlertAnnotation[]>({
    url: '/api/annotations',
    method: 'GET',
    params: { type: 'alert', ...window, limit: 500 },
  });
  const list = Array.isArray(data) ? data : [];
  return list.filter((a) => a.tags?.includes(`alertname:${ruleTitle}`));
}

export const fetchInitialAlertState: NonNullable<WhatIfDataSource['fetchInitialAlertState']> = async (
  ruleTitle,
  atTimeMs,
) => {
  try {
    const matching = await matchingAnnotations(ruleTitle, { to: atTimeMs });
    if (matching.length > 0) {
      return { kind: 'Ok', value: mapAnnotationToInitialState(matching[0]!.newState) };
    }
  } catch {
    // fall through to the current-state probe
  }

  try {
    const observation = await fetchRuleState(ruleTitle);
    if (observation.state === 'firing') {return { kind: 'Ok', value: 'Firing' };}
    return { kind: 'Ok', value: 'Normal' };
  } catch (e) {
    return { kind: 'Err', errors: [describeFetchError(e)] };
  }
};

export const fetchAlertHistory: NonNullable<WhatIfDataSource['fetchAlertHistory']> = async (
  ruleTitle,
  fromMs,
  toMs,
) => {
  try {
    const matching = await matchingAnnotations(ruleTitle, { from: fromMs, to: toMs });
    const history = [...matching]
      .sort((a, b) => a.time - b.time)
      .map((entry) => ({ t: entry.time, state: mapAnnotationToBarState(entry.newState) }));
    return { kind: 'Ok', value: history };
  } catch (e) {
    return { kind: 'Err', errors: [describeFetchError(e)] };
  }
};
