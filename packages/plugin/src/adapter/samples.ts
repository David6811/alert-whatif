import {
  describeFetchError,
  type PromQueryRangeResponse,
  type WhatIfDataSource,
} from '@alert-whatif/ui';
import type { MetricSeries } from '@alert-whatif/core';
import { api } from './http';

const MAX_SERIES = 10;

export const fetchSamples: NonNullable<WhatIfDataSource['fetchSamples']> = async (req) => {
  try {
    const url = `/api/datasources/proxy/uid/${req.datasourceUid}/api/v1/query_range`;
    const body = new URLSearchParams({
      query: req.expr,
      start: String(req.startSec),
      end: String(req.endSec),
      step: String(req.stepSec),
    });
    const json = await api<PromQueryRangeResponse>({
      url,
      method: 'POST',
      data: body.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (json.status !== 'success') {
      return {
        kind: 'Err',
        errors: [
          `Prometheus returned status=${json.status}: ${json.error ?? '(no error message)'}`,
        ],
      };
    }
    const rawSeries = json.data?.result ?? [];
    if (rawSeries.length === 0) {return { kind: 'Ok', value: [] };}
    if (rawSeries.length > MAX_SERIES) {
      console.warn(
        `[alert-whatif] Prometheus returned ${rawSeries.length} series; capping to the first ${MAX_SERIES} for the SeriesPicker. To narrow the result, wrap the rule's expr in sum() or add label filters.`,
      );
    }
    const seriesList: MetricSeries[] = rawSeries.slice(0, MAX_SERIES).map((s) => ({
      labels: (s.metric ?? {}) as Record<string, string>,
      samples: s.values.map(([tSec, vStr]) => ({
        t: Math.floor(tSec * 1000),
        v: Number(vStr),
      })),
    }));
    return { kind: 'Ok', value: seriesList };
  } catch (e) {
    return { kind: 'Err', errors: [describeFetchError(e)] };
  }
};
