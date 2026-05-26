// Shared per-kind color encoding (CSS vars from index.css, theme-aware).

import type { EvalEvent } from '@alert-whatif/core';

export const EVENT_COLOR: Record<EvalEvent['kind'], string> = {
  Pending: 'var(--event-pending)',
  Firing: 'var(--event-firing)',
  Recovering: 'var(--event-recovering)',
  NoData: 'var(--event-nodata)',
  Resolved: 'var(--event-resolved)',
};
