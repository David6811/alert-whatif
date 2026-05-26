// The `query_range` fields adapters read; everything else (matrix-only here)
// is ignored. Lives in ui, not core — core has no host concept.

export type PromQueryRangeResponse = {
  readonly status: 'success' | 'error';
  readonly error?: string;
  readonly errorType?: string;
  readonly data?: {
    readonly resultType: 'matrix';
    readonly result: ReadonlyArray<{
      readonly metric: Readonly<Record<string, string>>;
      // [unixEpochSec, stringValue] — string preserves NaN/+Inf exactly.
      readonly values: ReadonlyArray<readonly [number, string]>;
    }>;
  };
};
