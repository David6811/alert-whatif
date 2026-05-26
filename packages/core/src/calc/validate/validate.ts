import type {
  AlertConfig,
  ExecErrState,
  NanMode,
  NoDataState,
  ReducerKind,
  Result,
  Threshold,
  ThresholdOp,
} from '../../data/types';
import { COMPARISON_OPS, RANGE_OPS } from '../../data/threshold-ops';

const REDUCER_KINDS: readonly ReducerKind[] = ['Last', 'Min', 'Max', 'Sum', 'Mean', 'Count', 'Median'];
const THRESHOLD_OPS: readonly ThresholdOp[] = [...COMPARISON_OPS, ...RANGE_OPS];
const NODATA_STATES: readonly NoDataState[] = ['Alerting', 'NoData', 'Ok', 'KeepLast'];
const EXECERR_STATES: readonly ExecErrState[] = ['Alerting', 'Error', 'Ok', 'KeepLast'];
const NAN_MODE_KINDS: readonly NanMode['kind'][] = ['None', 'DropNN', 'ReplaceNN'];

function validateNanMode(m: NanMode, errors: string[]): void {
  if (!NAN_MODE_KINDS.includes(m.kind)) {
    errors.push(`nanMode.kind must be one of ${NAN_MODE_KINDS.join('|')} (got ${m.kind})`);
    return;
  }
  if (m.kind === 'ReplaceNN' && !Number.isFinite(m.replaceWithValue)) {
    errors.push(
      `nanMode.replaceWithValue must be a finite number when kind=ReplaceNN (got ${m.replaceWithValue})`,
    );
  }
}

function validateThreshold(t: Threshold, errors: string[]): void {
  if (!THRESHOLD_OPS.includes(t.op)) {
    errors.push(`threshold.op must be one of ${THRESHOLD_OPS.join('|')} (got ${t.op})`);
    return; // can't pick comparison vs range branch without a known op
  }
  if ((COMPARISON_OPS as readonly string[]).includes(t.op)) {
    const v = (t as { value: number }).value;
    if (!Number.isFinite(v)) errors.push(`threshold.value must be a finite number (got ${v})`);
  } else {
    const { left, right } = t as { left: number; right: number };
    if (!Number.isFinite(left)) errors.push(`threshold.left must be a finite number (got ${left})`);
    if (!Number.isFinite(right)) errors.push(`threshold.right must be a finite number (got ${right})`);
  }
}

// Validates an AlertConfig at the boundary between caller and core. Returns `Ok(config)`
// when well-formed, `Err(errors)` otherwise — never throws.
//
// Runtime check (in addition to TypeScript's compile-time check) because the config may
// arrive from JSON parsing where TS types aren't enforced — and because the user can drag
// sliders to any value in the What-If UI, including ones TS can't disallow (NaN, Infinity,
// negative durations, non-integer maxDataPoints, …).
export function validateAlertConfig(config: AlertConfig): Result<AlertConfig> {
  const errors: string[] = [];

  validateThreshold(config.threshold, errors);

  if (!Number.isFinite(config.forDuration) || config.forDuration < 0) {
    errors.push(`forDuration must be a non-negative finite number (got ${config.forDuration})`);
  }
  if (!Number.isFinite(config.keepFiringFor) || config.keepFiringFor < 0) {
    errors.push(
      `keepFiringFor must be a non-negative finite number (got ${config.keepFiringFor})`,
    );
  }
  if (!Number.isFinite(config.evaluationInterval) || config.evaluationInterval < 0) {
    errors.push(
      `evaluationInterval must be a non-negative finite number (got ${config.evaluationInterval})`,
    );
  }
  if (!Number.isFinite(config.intervalMs) || config.intervalMs <= 0) {
    errors.push(`intervalMs must be a positive finite number (got ${config.intervalMs})`);
  }

  if (!Number.isInteger(config.maxDataPoints) || config.maxDataPoints <= 0) {
    errors.push(`maxDataPoints must be a positive integer (got ${config.maxDataPoints})`);
  }

  // `reducer` / `nanMode` / `windowDuration` exist only on range configs; the
  // discriminated union enforces shape at compile time, so instant configs
  // have nothing to validate here. Range gets the extra checks.
  if (!config.instant) {
    if (!Number.isFinite(config.windowDuration) || config.windowDuration < 0) {
      errors.push(
        `windowDuration must be a non-negative finite number (got ${config.windowDuration})`,
      );
    }
    if (!REDUCER_KINDS.includes(config.reducer)) {
      errors.push(`reducer must be one of ${REDUCER_KINDS.join('|')} (got ${config.reducer})`);
    }
    validateNanMode(config.nanMode, errors);
  }
  if (!NODATA_STATES.includes(config.noDataState)) {
    errors.push(
      `noDataState must be one of ${NODATA_STATES.join('|')} (got ${config.noDataState})`,
    );
  }
  if (!EXECERR_STATES.includes(config.execErrState)) {
    errors.push(
      `execErrState must be one of ${EXECERR_STATES.join('|')} (got ${config.execErrState})`,
    );
  }

  return errors.length === 0 ? { kind: 'Ok', value: config } : { kind: 'Err', errors };
}
