// Pure-presentation form mirroring the tree shape of Grafana's alert.json
// (spec → expressions A/B/C). Row labels carry the full JSON path so each
// control maps back to a field. Fields the evaluator doesn't act on yet render
// greyed. Owns no state — the parent holds the config.

import React from 'react';
import type {
  AlertConfig,
  ExecErrState,
  NanMode,
  NoDataState,
  RangeAlertConfig,
  ReducerKind,
  Threshold,
  ThresholdOp,
} from '@alert-whatif/core';
import { changeThresholdOp, COMPARISON_OPS, RANGE_OPS } from '@alert-whatif/core';
import type { CSSProperties } from 'react';
import type { RuleMetadata } from '../types';
import { cardHeadingStyle, cardStyle } from '../styles';

// Threaded via context so each Row self-checks whether it was tweaked.
const EMPTY_LABELS: ReadonlySet<string> = new Set();
const ChangedLabelsContext = React.createContext<ReadonlySet<string>>(EMPTY_LABELS);

type Props = {
  readonly config: AlertConfig;
  readonly onChange: (next: AlertConfig) => void;
  // Commit the draft; edits don't propagate until the parent's onApply runs.
  readonly onApply: () => void;
  readonly onReset: () => void;
  // Falls back to placeholder text when omitted.
  readonly ruleMetadata?: RuleMetadata | undefined;
  readonly paused?: boolean | undefined;
  readonly onPausedChange?: ((paused: boolean) => void) | undefined;
  // Row labels to frame as "changed from default".
  readonly changedLabels?: ReadonlySet<string> | undefined;
};

const ALL_OPS: ReadonlyArray<ThresholdOp> = [...COMPARISON_OPS, ...RANGE_OPS];

const REDUCERS: ReadonlyArray<ReducerKind> = [
  'Last', 'Min', 'Max', 'Sum', 'Mean', 'Count', 'Median',
];
const NODATA_STATES: ReadonlyArray<NoDataState> = ['Alerting', 'NoData', 'Ok', 'KeepLast'];
const EXECERR_STATES: ReadonlyArray<ExecErrState> = ['Alerting', 'Error', 'Ok', 'KeepLast'];
const NAN_KINDS: ReadonlyArray<NanMode['kind']> = ['None', 'DropNN', 'ReplaceNN'];

export function ParamControls({
  config,
  onChange,
  onApply,
  onReset,
  ruleMetadata,
  paused = false,
  onPausedChange,
  changedLabels,
}: Props) {
  // Typed against RangeAlertConfig (the superset); range-only controls render
  // conditionally so the call is sound at runtime.
  const set = <K extends keyof RangeAlertConfig>(key: K, value: RangeAlertConfig[K]) =>
    onChange({ ...config, [key]: value } as AlertConfig);

  return (
    <ChangedLabelsContext.Provider value={changedLabels ?? EMPTY_LABELS}>
    <section style={cardStyle}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={cardHeadingStyle} title="Mirrors `spec` in Grafana's alert.json. Greyed rows are shown for completeness but not yet editable / acted on.">
          Parameters
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={onReset} style={resetButtonStyle}>
            Reset to defaults
          </button>
          <button type="button" onClick={onApply} style={applyButtonStyle}>
            Apply
          </button>
        </div>
      </header>

      <div style={fieldsetGridStyle}>
      <Fieldset title="Rule (spec)">
        <Row label="title" disabled>
          <ReadOnlyText value={ruleMetadata?.title ?? '(none)'} />
        </Row>
        <Row label="labels" disabled>
          <LabelsDisplay labels={ruleMetadata?.labels} />
        </Row>
        <Row label="paused" path="spec.paused — calc/ does not suppress events (#103)" disabled>
          <input
            type="checkbox"
            checked={paused}
            onChange={(e) => onPausedChange?.(e.target.checked)}
            disabled
          />
        </Row>
        <Row label="for">
          <NumberInput value={config.forDuration} onChange={(v) => set('forDuration', v)} min={0} />
        </Row>
        <Row
          label="keepFiringFor"
          path="spec.keep_firing_for — temporarily disabled"
          disabled
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <NumberInput
              value={config.keepFiringFor}
              onChange={(v) => set('keepFiringFor', v)}
              min={0}
              disabled
            />
            <ComingSoonHint />
          </span>
        </Row>
        <Row label="noDataState">
          <select
            value={config.noDataState}
            onChange={(e) => set('noDataState', e.target.value as NoDataState)}
            style={selectStyle}
          >
            {NODATA_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Row>
        <Row
          label="execErrState"
          path="spec.execErrState — calc/ does not apply this policy (#103)"
          disabled
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <select
              value={config.execErrState}
              onChange={(e) => set('execErrState', e.target.value as ExecErrState)}
              style={selectStyle}
              disabled
            >
              {EXECERR_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ComingSoonHint />
          </span>
        </Row>
        <Row label="trigger.interval">
          <NumberInput
            value={config.evaluationInterval}
            onChange={(v) => set('evaluationInterval', v)}
            min={0}
          />
        </Row>
      </Fieldset>

      <Fieldset title="expressions.A — Query (Stage A · Prometheus)">
        <Row label="expr" path="expressions.A.model.expr" disabled>
          <ReadOnlyCode value={ruleMetadata?.query.expr ?? '(no PromQL provided)'} />
        </Row>
        <Row label="mode" path="expressions.A.model.range / .instant" disabled>
          <ModeToggle mode={ruleMetadata?.query.mode ?? 'range'} />
        </Row>
        {/* Step + cap feed computeEffectiveStepMs upstream of calc/, so a tweak
            changes the Prometheus step and sample density. */}
        <Row label="intervalMs" path="expressions.A.model.intervalMs">
          <NumberInput
            value={config.intervalMs}
            onChange={(v) => set('intervalMs', v)}
            min={1}
            step={1000}
          />
        </Row>
        <Row label="maxDataPoints" path="expressions.A.model.maxDataPoints">
          <NumberInput
            value={config.maxDataPoints}
            onChange={(v) => set('maxDataPoints', v)}
            min={1}
            step={1}
          />
        </Row>
        {config.instant ? null : (
          <Row label="relativeTimeRange.from" path="expressions.A.relativeTimeRange.from">
            <NumberInput
              value={config.windowDuration}
              onChange={(v) => set('windowDuration', v)}
              min={0}
            />
          </Row>
        )}
        <Row label="relativeTimeRange.to" path="expressions.A.relativeTimeRange.to" disabled>
          <ReadOnlyText value="0s (fixed)" />
        </Row>
      </Fieldset>

      {/* Reduce expression — range rules only; instant has no B node. */}
      {config.instant ? null : (
        <Fieldset title="expressions.B — Reduce">
          <Row label="reducer" path="expressions.B.model.reducer">
            <select
              value={config.reducer}
              onChange={(e) => set('reducer', e.target.value as ReducerKind)}
              style={selectStyle}
            >
              {REDUCERS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Row>
          <Row label="settings.mode" path="expressions.B.model.settings.mode">
            <select
              value={config.nanMode.kind}
              onChange={(e) =>
                set('nanMode', changeNanKind(config.nanMode, e.target.value as NanMode['kind']))
              }
              style={selectStyle}
            >
              {NAN_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </Row>
          {config.nanMode.kind === 'ReplaceNN' ? (
            <Row
              label="settings.replaceWithValue"
              path="expressions.B.model.settings.replaceWithValue"
            >
              <NumberInput
                value={config.nanMode.replaceWithValue}
                onChange={(v) => set('nanMode', { kind: 'ReplaceNN', replaceWithValue: v })}
              />
            </Row>
          ) : null}
        </Fieldset>
      )}

      <Fieldset title={config.instant ? 'expressions.B — Threshold' : 'expressions.C — Threshold'}>
        <Row
          label="evaluator.type"
          path="expressions.C.model.conditions[0].evaluator.type"
        >
          <select
            value={config.threshold.op}
            onChange={(e) =>
              set('threshold', changeThresholdOp(config.threshold, e.target.value as ThresholdOp))
            }
            style={selectStyle}
          >
            {ALL_OPS.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </Row>
        <ThresholdFields
          threshold={config.threshold}
          onChange={(t) => set('threshold', t)}
        />
      </Fieldset>
      </div>
    </section>
    </ChangedLabelsContext.Provider>
  );
}

function Fieldset({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>{title}</legend>
      <div
        style={{
          display: 'grid',
          // minmax(0, 1fr) so a long unbreakable value can shrink instead of
          // overflowing the column.
          gridTemplateColumns: 'max-content minmax(0, 1fr)',
          gap: '0.25rem 0.75rem',
        }}
      >
        {children}
      </div>
    </fieldset>
  );
}

function Row({
  label,
  path,
  disabled,
  children,
}: {
  readonly label: string;
  // Full JSON path the label abbreviates, shown on hover.
  readonly path?: string;
  readonly disabled?: boolean;
  readonly children: React.ReactNode;
}) {
  const changed = React.useContext(ChangedLabelsContext).has(label);
  return (
    <>
      <label
        style={{ ...(disabled ? disabledLabelStyle : labelStyle), ...(changed ? changedLabelStyle : null) }}
        title={path ?? label}
      >
        {changed ? '✎ ' : ''}{label}
      </label>
      <div style={{ ...(disabled ? disabledRowStyle : null), ...(changed ? changedCellStyle : null) }}>
        {children}
      </div>
    </>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  step,
  disabled,
}: {
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly min?: number;
  readonly step?: number;
  readonly disabled?: boolean;
}) {
  // Track raw text locally so partial retypes don't snap back; push to the
  // parent only on a finite parse, so the form never holds NaN.
  const [raw, setRaw] = React.useState<string>(
    Number.isFinite(value) ? String(value) : '',
  );
  const lastPropValueRef = React.useRef<number>(value);
  React.useEffect(() => {
    if (value !== lastPropValueRef.current) {
      lastPropValueRef.current = value;
      setRaw(Number.isFinite(value) ? String(value) : '');
    }
  }, [value]);

  return (
    <input
      type="number"
      value={raw}
      min={min}
      step={step ?? 'any'}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value;
        setRaw(next);
        if (next.trim() !== '') {
          const parsed = e.target.valueAsNumber;
          if (Number.isFinite(parsed)) onChange(parsed);
        }
      }}
      onBlur={() => {
        // Snap back to the last valid value if left empty / unparseable.
        if (raw.trim() === '' || !Number.isFinite(Number(raw))) {
          setRaw(Number.isFinite(value) ? String(value) : '');
        }
      }}
      style={numberInputStyle}
    />
  );
}

// Small ⓘ that reveals "coming soon" when clicked.
function ComingSoonHint() {
  const [open, setOpen] = React.useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        role="button"
        title="Will come soon"
        aria-label="Will come soon"
        onClick={() => setOpen((v) => !v)}
        style={{
          cursor: 'pointer',
          color: 'var(--text-muted, #888)',
          fontSize: '0.85rem',
          userSelect: 'none',
        }}
      >
        ⓘ
      </span>
      {open ? (
        <span
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '0.25rem',
            padding: '0.25rem 0.5rem',
            background: 'var(--bg-card, rgba(20,20,30,0.97))',
            border: '1px solid var(--chart-axis, #555)',
            borderRadius: 3,
            fontSize: '0.7rem',
            color: 'var(--text-primary, #d0d0d0)',
            whiteSpace: 'nowrap',
            zIndex: 5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          Will come soon
        </span>
      ) : null}
    </span>
  );
}

function ReadOnlyText({ value }: { readonly value: string }) {
  return <span style={readOnlyTextStyle}>{value}</span>;
}

function ReadOnlyCode({ value }: { readonly value: string }) {
  // title carries the full value so ellipsised PromQL is visible on hover.
  return (
    <code style={readOnlyCodeStyle} title={value}>
      {value}
    </code>
  );
}

function LabelsDisplay({ labels }: { readonly labels: Readonly<Record<string, string>> | undefined }) {
  const entries = labels ? Object.entries(labels) : [];
  if (entries.length === 0) {
    return <ReadOnlyText value="(none)" />;
  }
  return (
    <span style={readOnlyTextStyle}>
      {entries.map(([k, v]) => `${k}=${v}`).join(' · ')}
    </span>
  );
}

// Read-only range / instant indicator; switching modes happens upstream.
function ModeToggle({ mode }: { readonly mode: 'range' | 'instant' }) {
  return (
    <span style={readOnlyTextStyle}>
      <label style={inlineLabelStyle}>
        <input type="radio" name="query-mode" checked={mode === 'range'} disabled readOnly /> range
      </label>
      <label style={inlineLabelStyle}>
        <input type="radio" name="query-mode" checked={mode === 'instant'} disabled readOnly /> instant
      </label>
    </span>
  );
}


// Extracted so the discriminated-union narrowing on `threshold` survives into
// the inline onChange closures.
function ThresholdFields({
  threshold,
  onChange,
}: {
  readonly threshold: Threshold;
  readonly onChange: (t: Threshold) => void;
}) {
  if ('value' in threshold) {
    return (
      <Row label="conditions[0].evaluator.params">
        <NumberInput
          value={threshold.value}
          onChange={(v) => onChange({ op: threshold.op, value: v })}
        />
      </Row>
    );
  }
  return (
    <>
      <Row label="conditions[0].evaluator.params[0] (left)">
        <NumberInput
          value={threshold.left}
          onChange={(v) => onChange({ op: threshold.op, left: v, right: threshold.right })}
        />
      </Row>
      <Row label="conditions[0].evaluator.params[1] (right)">
        <NumberInput
          value={threshold.right}
          onChange={(v) => onChange({ op: threshold.op, left: threshold.left, right: v })}
        />
      </Row>
    </>
  );
}

// Preserves replaceWithValue across a round-trip out of and back into ReplaceNN.
function changeNanKind(current: NanMode, nextKind: NanMode['kind']): NanMode {
  if (nextKind === 'ReplaceNN') {
    const prevValue = current.kind === 'ReplaceNN' ? current.replaceWithValue : 0;
    return { kind: 'ReplaceNN', replaceWithValue: prevValue };
  }
  return { kind: nextKind };
}

const resetButtonStyle: CSSProperties = {
  fontSize: 12,
  padding: '0.25rem 0.5rem',
  cursor: 'pointer',
  border: '1px solid var(--border-input)',
  background: 'var(--bg-button)',
  color: 'var(--text-primary)',
  borderRadius: 4,
};

const applyButtonStyle: CSSProperties = {
  ...resetButtonStyle,
  background: 'var(--accent-primary, #3b82f6)',
  color: 'var(--text-on-accent, #fff)',
  borderColor: 'transparent',
  fontWeight: 600,
};

const fieldsetGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: '0.4rem',
  marginTop: '0.25rem',
};

const fieldsetStyle: CSSProperties = {
  marginTop: 0,
  border: '1px solid var(--border-card)',
  borderRadius: 6,
  padding: '0.3rem 0.5rem',
};

const legendStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: '0.78rem',
  padding: '0 0.25rem',
};

const labelStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.72rem',
  alignSelf: 'center',
};

const disabledLabelStyle: CSSProperties = {
  ...labelStyle,
  color: 'var(--text-faded)',
};

const disabledRowStyle: CSSProperties = {
  opacity: 0.6,
};

// Amber, distinct from the chart's other colors.
const changedLabelStyle: CSSProperties = {
  color: '#f59e0b',
  fontWeight: 700,
};
const changedCellStyle: CSSProperties = {
  outline: '2px solid #f59e0b',
  outlineOffset: '2px',
  borderRadius: '4px',
  background: 'rgba(245, 158, 11, 0.12)',
};

// Inline bg/color/border so controls render inside any host stylesheet —
// Grafana's reset uses `!important` that beats even our scoped rules, but
// inline styles sit above the cascade entirely.
const numberInputStyle: CSSProperties = {
  width: 'auto',
  maxWidth: '6rem',
  padding: '0.15rem 0.35rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.75rem',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-input)',
  borderRadius: 4,
};

const selectStyle: CSSProperties = {
  // Grafana compresses native `<select>` to near-zero height and hides the
  // font; inline minHeight + explicit color/background wins.
  width: '100%',
  maxWidth: '9rem',
  boxSizing: 'border-box',
  minHeight: '1.6rem',
  padding: '0.15rem 0.35rem',
  lineHeight: 1.2,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.75rem',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-input)',
  borderRadius: 4,
  cursor: 'pointer',
};

const readOnlyTextStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.72rem',
  color: 'var(--text-muted)',
};

const readOnlyCodeStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.72rem',
  color: 'var(--text-primary)',
  background: 'var(--bg-input, transparent)',
  padding: '1px 4px',
  borderRadius: 3,
  // Block-sized so its overflow:hidden ellipsis takes effect in the cell.
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const inlineLabelStyle: CSSProperties = {
  marginRight: '0.5rem',
  whiteSpace: 'nowrap',
};

