import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeEffectiveStepMs,
  deriveEvalGridOffsetMs,
  downsampleToStep,
  evaluate,
  planFetch,
  parseGrafanaAlertRule,
  scheduleTickTimes,
  type AlertConfig,
  type EvalEvent,
  type Sample,
  type Tick,
} from '@alert-whatif/core';
import { animationScope } from '../util/animations';
import { buildTimeline } from '../util/timeline';
import { ComputeTracePanel } from '../components/ComputeTracePanel';
import {
  loadGrafanaHistory,
  saveGrafanaHistory,
  type GrafanaHistoryEntry,
} from '../storage/grafana-history-store';
import { DatasetPicker } from '../components/DatasetPicker';
import { EvalErrorPanel } from '../components/EvalErrorPanel';
import { LiveScrubControls } from '../components/LiveScrubControls';
import { LiveStatusStrip } from '../components/LiveStatusStrip';
import { MetricChart } from '../chart/MetricChart';
import { OverviewStrip } from '../components/OverviewStrip';
import { SeriesPicker } from '../components/SeriesPicker';
import type { ThresholdCrossing } from '../calc/crossings';
import { ModeToggle } from '../components/ModeToggle';
import { PageLayout } from '../components/PageLayout';
import { ParamControls } from '../components/ParamControls';
import { ReplayButtons, type Speed } from '../components/ReplayButtons';
import { ReplaySliderBar } from '../components/ReplaySliderBar';
import { RulePicker } from '../components/RulePicker';
import { extractRuleMetadata, extractRuleQuery } from '../data/parse-rule';
import { formatAlertExpression } from '../util/format';
import { reduceAnimationDurationMs } from '../util/reduce-animation-timing';
import { useLiveMode } from '../live/use-live-mode';
import {
  downloadDataset,
  loadCapturedDatasets,
  parseDataset,
  saveCapturedDatasets,
} from '../storage/dataset-io';
import type {
  Dataset,
  GrafanaRuleObservation,
  RuleSummary,
  WhatIfDataSource,
} from '../data/data-source';
import type { ReactNode } from 'react';
import type { ConfigOverrides, LiveContext, Props, WhatIfPreset } from './types';
import {
  AUTO_REPLAY_SPEEDUP,
  LIVE_INTERVAL_SEC,
  LIVE_LOOKBACK_SEC,
  LIVE_SCRUB_MAX_MS,
  MIN_AUTOPLAY_WAIT_MS,
  OVERVIEW_DEFAULT_LOOKBACK_SEC,
  OVERVIEW_RANGE_OPTIONS,
  PLACEHOLDER_CONFIG,
} from './constants';
import {
  applyConfigOverrides,
  changedParamLabels,
  mockRightAnchorT,
} from './helpers';
import {
  currentStateForTick,
  mockPlayheadGrafanaState,
} from '../calc/state';

export type { ConfigOverrides, WhatIfPreset, LiveContext } from './types';

export function WhatIfPage({
  adapter,
  themeToggleSlot,
  liveContext,
  initialRuleUid,
  initialPreset,
  initialLookbackSec,
  initialDrill,
  initialPlay,
  titleLogo,
}: Props) {
  const fixtures = useMemo<ReadonlyArray<Dataset>>(
    () => (adapter.capabilities.fixtures ? adapter.listFixtures!() : []),
    [adapter],
  );

  const hasContentSource =
    fixtures.length > 0 ||
    liveContext !== undefined ||
    adapter.capabilities.fetchRuleList;

  if (!hasContentSource) {
    return (
      <PageLayout
        headerLeft={renderTitle(titleLogo)}
        themeToggle={themeToggleSlot}
        main={<EmptyMessage text="No fixtures and no rule source available." />}
        bottomLeft={null}
        bottomRight={null}
      />
    );
  }

  return (
    <PageShell
      adapter={adapter}
      fixtures={fixtures}
      themeToggleSlot={themeToggleSlot}
      {...(liveContext !== undefined ? { liveContext } : {})}
      {...(initialRuleUid !== undefined ? { initialRuleUid } : {})}
      {...(initialPreset !== undefined ? { initialPreset } : {})}
      {...(initialLookbackSec !== undefined ? { initialLookbackSec } : {})}
      {...(initialDrill !== undefined ? { initialDrill } : {})}
      {...(initialPlay !== undefined ? { initialPlay } : {})}
      {...(titleLogo !== undefined ? { titleLogo } : {})}
    />
  );
}

function renderTitle(logo: ReactNode | undefined): ReactNode {
  return (
    <h1 style={titleStyle}>
      {logo !== undefined && <span style={titleLogoStyle}>{logo}</span>}
      alert-whatif
    </h1>
  );
}

// Split from the top-level export so the fixture-availability check above
// can early-return without violating React's rules-of-hooks.
function PageShell({
  adapter,
  fixtures,
  themeToggleSlot,
  liveContext: propLiveContext,
  initialRuleUid,
  initialPreset,
  initialLookbackSec,
  initialDrill,
  initialPlay,
  titleLogo,
}: {
  readonly adapter: WhatIfDataSource;
  readonly fixtures: ReadonlyArray<Dataset>;
  readonly themeToggleSlot?: ReactNode;
  readonly liveContext?: LiveContext;
  readonly initialRuleUid?: string;
  readonly initialPreset?: WhatIfPreset;
  readonly initialLookbackSec?: number;
  readonly initialDrill?: 'first' | 'last';
  readonly initialPlay?: boolean;
  readonly titleLogo?: ReactNode;
}) {
  const ruleListEnabled =
    adapter.capabilities.fetchRuleList && propLiveContext === undefined;
  const [rules, setRules] = useState<ReadonlyArray<RuleSummary>>([]);
  const [rulesLoading, setRulesLoading] = useState<boolean>(ruleListEnabled);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesReloadTick, setRulesReloadTick] = useState<number>(0);
  const [selectedRuleUid, setSelectedRuleUid] = useState<string | null>(
    initialRuleUid ?? null,
  );
  const [internalLiveContext, setInternalLiveContext] = useState<LiveContext | null>(null);
  // Fixed sample window for a selected rule, rendered in mock mode. In-memory
  // only — every rule pick refreshes.
  const [internalRuleDataset, setInternalRuleDataset] = useState<Dataset | null>(null);
  const [internalRuleError, setInternalRuleError] = useState<string | null>(null);
  // Alert state just before the detail-chart window's left edge — feeds
  // evalHints to remove the leading-Pending phantom from the state bar.
  const [detailInitialState, setDetailInitialState] = useState<
    'Normal' | 'Firing' | 'NoData' | null
  >(null);

  // On first successful load with no rule pre-selected, auto-pick the first
  // rule so the user lands on the chart with zero clicks.
  useEffect(() => {
    if (!ruleListEnabled) return;
    let cancelled = false;
    setRulesLoading(true);
    setRulesError(null);
    void (async () => {
      const result = await adapter.listRules!();
      if (cancelled) return;
      if (result.kind === 'Ok') {
        setRules(result.value);
        if (result.value.length > 0) {
          setSelectedRuleUid((prev) => prev ?? result.value[0]!.uid);
        }
      } else {
        setRulesError(result.errors.join(' · '));
      }
      setRulesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ruleListEnabled, adapter, rulesReloadTick]);

  // On rule selection, parse the rule and populate internalLiveContext so a
  // later Mock → Live toggle works without an extra fetch.
  useEffect(() => {
    if (!ruleListEnabled) return;
    if (selectedRuleUid === null) {
      setInternalLiveContext(null);
      setInternalRuleDataset(null);
      setInternalRuleError(null);
      return;
    }
    let cancelled = false;
    setInternalRuleError(null);
    void (async () => {
      const rule = await adapter.fetchRuleByUid!(selectedRuleUid);
      if (cancelled) return;
      if (rule === null) {
        setInternalRuleError(`Could not fetch rule "${selectedRuleUid}".`);
        setInternalLiveContext(null);
        setInternalRuleDataset(null);
        return;
      }
      const parseResult = parseGrafanaAlertRule(rule);
      if (parseResult.kind === 'Err') {
        setInternalRuleError(parseResult.errors.join(' · '));
        setInternalLiveContext(null);
        setInternalRuleDataset(null);
        return;
      }
      const query = extractRuleQuery(rule);
      const metadata = extractRuleMetadata(rule);
      if (query === null) {
        setInternalRuleError(
          'Rule has no query node (datasourceUID + expr) we can poll.',
        );
        setInternalLiveContext(null);
        setInternalRuleDataset(null);
        return;
      }

      const title = metadata?.title ?? selectedRuleUid;
      setInternalLiveContext({
        datasourceUid: query.datasourceUid,
        query: query.expr,
        ruleTitle: title,
        defaultConfig: parseResult.value,
        ...(metadata !== null ? { ruleMetadata: metadata } : {}),
      });

      setInternalRuleDataset(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [ruleListEnabled, selectedRuleUid, adapter]);

  // Prop wins over internal selection.
  const liveContext = propLiveContext ?? internalLiveContext ?? undefined;
  // `liveAvailable`: a Live context exists now. `liveAccessible`: the user
  // CAN enter Live even if no context yet (RulePicker fetches one on select).
  const liveAvailable = liveContext !== undefined;
  const liveAccessible =
    adapter.capabilities.live &&
    (propLiveContext !== undefined || adapter.capabilities.fetchRuleList);

  // Captured / imported datasets — user-owned, persisted to localStorage.
  const [capturedDatasets, setCapturedDatasets] = useState<ReadonlyArray<Dataset>>(
    () => loadCapturedDatasets(),
  );
  useEffect(() => {
    saveCapturedDatasets(capturedDatasets);
  }, [capturedDatasets]);

  // Picker order: fetched rule dataset first, then captured snapshots
  // (newest first), then bundled fixtures.
  const allDatasets = useMemo<ReadonlyArray<Dataset>>(() => {
    const items: Dataset[] = [];
    if (internalRuleDataset !== null) items.push(internalRuleDataset);
    items.push(...[...capturedDatasets].reverse(), ...fixtures);
    return items;
  }, [internalRuleDataset, capturedDatasets, fixtures]);
  const fixturesAvailable = allDatasets.length > 0;

  const [mode, setMode] = useState<'mock' | 'live'>(
    ruleListEnabled
      ? 'mock'
      : fixturesAvailable || !liveAccessible
        ? 'mock'
        : 'live',
  );

  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => {
    if (!fixturesAvailable) return '';
    const presetId = initialPreset?.datasetId;
    if (presetId !== undefined && allDatasets.some((d) => d.id === presetId)) {
      return presetId;
    }
    return allDatasets[0]!.id;
  });
  const dataset = fixturesAvailable
    ? (allDatasets.find((d) => d.id === selectedDatasetId) ?? allDatasets[0]!)
    : null;

  // `workingConfig` drives chart/evaluator/fetch, changing only on Apply.
  // `draftConfig` is what ParamControls edits; Apply copies draft → working.
  const initialConfig =
    dataset?.defaultAlertConfig ?? liveContext?.defaultConfig ?? PLACEHOLDER_CONFIG;
  // Seed both from a deep-link preset so it lands already "Applied" — never
  // applied to the bare placeholder.
  const seededConfig =
    initialPreset?.overrides !== undefined && (dataset !== null || liveContext !== undefined)
      ? applyConfigOverrides(initialConfig, initialPreset.overrides)
      : initialConfig;
  const [workingConfig, setWorkingConfig] = useState<AlertConfig>(seededConfig);
  const [draftConfig, setDraftConfig] = useState<AlertConfig>(seededConfig);

  // Re-seed both on Live rule switch — unapplied drafts are dropped.
  useEffect(() => {
    if (liveContext !== undefined) {
      setWorkingConfig(liveContext.defaultConfig);
      setDraftConfig(liveContext.defaultConfig);
    }
  }, [liveContext?.defaultConfig]);

  // Range rules mirror Grafana's rule-editor formula; instant rules use
  // intervalMs as-is. Reads workingConfig so refetch fires only after Apply.
  const effectiveStepMs = workingConfig.instant
    ? workingConfig.intervalMs
    : computeEffectiveStepMs({
        intervalMs: workingConfig.intervalMs,
        maxDataPoints: workingConfig.maxDataPoints,
        timeRangeMs: workingConfig.windowDuration,
      });

  // Separated from the fetch so tweaking intervalMs re-fetches the drill
  // view at the same moment but new step.
  const [drillTarget, setDrillTarget] = useState<{
    readonly anchorMs: number;
    readonly kind: EvalEvent['kind'];
  } | null>(null);

  // A new in-memory dataset forces Mock mode showing it.
  useEffect(() => {
    if (internalRuleDataset === null) return;
    setSelectedDatasetId(internalRuleDataset.id);
    setMode('mock');
  }, [internalRuleDataset]);

  // The actual fetch happens in the useEffect below.
  const drillToMoment = (anchorMs: number, kind: EvalEvent['kind']): void => {
    setDrillTarget({ anchorMs, kind });
  };

  // Keyed on drillTarget AND effectiveStepMs so the drill dataset is rebuilt
  // at the new step when Apply runs.
  useEffect(() => {
    if (drillTarget === null) return;
    if (internalLiveContext === null || selectedRuleUid === null) return;
    const { anchorMs, kind } = drillTarget;
    const centerSec = Math.floor(anchorMs / 1000);
    const plan = planFetch({
      config: workingConfig,
      range: { kind: 'centered', centerSec, radiusSec: 15 * 60 },
      stepSec: effectiveStepMs / 1000,
      warmup: true,
    });
    // 🔕 (Resolved) reads backward; everything else reads forward.
    const drillFocalSide: 'leading' | 'trailing' =
      kind === 'Resolved' ? 'trailing' : 'leading';
    let cancelled = false;
    void (async () => {
      const samplesP = adapter.fetchSamples({
        datasourceUid: internalLiveContext.datasourceUid,
        expr: internalLiveContext.query,
        startSec: plan.fetchStartSec,
        endSec: plan.fetchEndSec,
        stepSec: plan.stepSec,
      });
      // Read Grafana's lastEvaluation → evalGridOffsetMs so the tick grid
      // lands on the same sub-minute offset Grafana uses (else Pending shows
      // one tick late vs the GRAFANA bar).
      const ruleStateP =
        adapter.fetchRuleState !== undefined
          ? adapter.fetchRuleState(internalLiveContext.ruleTitle).catch(
              (): GrafanaRuleObservation => ({
                state: 'unknown',
                lastEvaluationMs: null,
              }),
            )
          : Promise.resolve(null);
      // Fetch state-transition annotations so the GRAFANA bar renders even
      // when this session never polled this rule live.
      const historyP = adapter.capabilities.alertHistoryOracle
        ? adapter
            .fetchAlertHistory!(internalLiveContext.ruleTitle, plan.startTimeMs, plan.endTimeMs)
            .catch(() => null)
        : Promise.resolve(null);
      const [result, ruleObservation, historyResult] = await Promise.all([
        samplesP,
        ruleStateP,
        historyP,
      ]);
      if (cancelled || result.kind !== 'Ok') return;
      const lastEvalMs =
        ruleObservation !== null ? ruleObservation.lastEvaluationMs : null;
      const evalGridOffsetMs = deriveEvalGridOffsetMs(
        lastEvalMs,
        internalLiveContext.defaultConfig.evaluationInterval,
      );
      const grafanaHistoryForDrill =
        historyResult !== null && historyResult.kind === 'Ok' ? historyResult.value : undefined;
      const stamp = new Date(centerSec * 1000).toISOString().slice(11, 19);
      const seriesList = result.value;
      const firstSamples = seriesList[0]?.samples ?? [];
      setInternalRuleDataset({
        id: `rule:${selectedRuleUid}:drill:${centerSec}:${effectiveStepMs}`,
        displayName: `${internalLiveContext.ruleTitle} @ ${stamp}Z`,
        description: `30 min around ${new Date(centerSec * 1000).toISOString()} (drill-down from overview)`,
        source: `Drill-down ${internalLiveContext.query}`,
        samples: firstSamples,
        seriesList,
        defaultAlertConfig: internalLiveContext.defaultConfig,
        startTimeMs: plan.startTimeMs,
        endTimeMs: plan.endTimeMs,
        drillFocalMs: anchorMs,
        drillFocalSide,
        ...(evalGridOffsetMs !== undefined ? { evalGridOffsetMs } : {}),
        ...(internalLiveContext.ruleMetadata !== undefined
          ? { ruleMetadata: internalLiveContext.ruleMetadata }
          : {}),
        ...(grafanaHistoryForDrill !== undefined && grafanaHistoryForDrill.length > 0
          ? { grafanaHistory: grafanaHistoryForDrill }
          : {}),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [drillTarget, effectiveStepMs, internalLiveContext, selectedRuleUid, adapter]);

  const [selectedSeriesIdx, setSelectedSeriesIdx] = useState<number>(0);
  // Previous fetch's series-label signature, so the effect below resets the
  // index only when the label set actually changes.
  const lastSeriesSignatureRef = useRef<string>('');

  const [overviewLookbackSec, setOverviewLookbackSec] = useState<number>(() =>
    initialLookbackSec !== undefined &&
    OVERVIEW_RANGE_OPTIONS.some((o) => o.lookbackSec === initialLookbackSec)
      ? initialLookbackSec
      : OVERVIEW_DEFAULT_LOOKBACK_SEC,
  );

  // Mock-mode auto-dataset: freeze a fixed 30-min window for the picked rule
  // so the mock pipeline (chart + scrubber + ParamControls) has data.
  useEffect(() => {
    if (!ruleListEnabled) return;
    if (mode !== 'mock') return;
    if (selectedRuleUid === null || internalLiveContext === null) return;
    // Deep-link auto-drill pending: skip the throwaway mock window so it
    // doesn't flash an unrelated lifecycle before the drill lands.
    if (initialDrill !== undefined && internalRuleDataset === null) return;
    // Drill datasets are kept as-is; the mock dataset encodes intervalMs in
    // its id so a tweak forces a refetch at the new Prometheus step.
    const drillPrefix = `rule:${selectedRuleUid}:drill:`;
    const mockDatasetId = `rule:${selectedRuleUid}:mock:${effectiveStepMs}`;
    if (internalRuleDataset?.id.startsWith(drillPrefix)) return;
    if (internalRuleDataset?.id === mockDatasetId) return;
    let cancelled = false;
    void (async () => {
      const plan = planFetch({
        config: internalLiveContext.defaultConfig,
        range: {
          kind: 'lookback',
          nowSec: Math.floor(Date.now() / 1000),
          lookbackSec: LIVE_LOOKBACK_SEC,
        },
        stepSec: effectiveStepMs / 1000,
        warmup: true,
      });
      const samplesP = adapter.fetchSamples({
        datasourceUid: internalLiveContext.datasourceUid,
        expr: internalLiveContext.query,
        startSec: plan.fetchStartSec,
        endSec: plan.fetchEndSec,
        stepSec: plan.stepSec,
      });
      const initialStateP = adapter.capabilities.initialStateOracle
        ? adapter.fetchInitialAlertState!(internalLiveContext.ruleTitle, plan.startTimeMs)
        : Promise.resolve(null);
      // lastEvaluation → same grid offset as Live's phase-lock, so What-If
      // and Live agree on Pending start times for the same alarm.
      const ruleStateP =
        adapter.fetchRuleState !== undefined
          ? adapter.fetchRuleState(internalLiveContext.ruleTitle).catch(
              (): GrafanaRuleObservation => ({
                state: 'unknown',
                lastEvaluationMs: null,
              }),
            )
          : Promise.resolve(null);
      // State-transition annotations so the chart's grafana bar populates
      // alongside our state bar (the side-by-side view, issue #153).
      const historyP = adapter.capabilities.alertHistoryOracle
        ? adapter
            .fetchAlertHistory!(internalLiveContext.ruleTitle, plan.startTimeMs, plan.endTimeMs)
            .catch(() => null)
        : Promise.resolve(null);
      const [result, initialResult, ruleObservation, historyResult] = await Promise.all([
        samplesP,
        initialStateP,
        ruleStateP,
        historyP,
      ]);
      if (cancelled || result.kind !== 'Ok') return;
      const lastEvalMs =
        ruleObservation !== null ? ruleObservation.lastEvaluationMs : null;
      const evalGridOffsetMs = deriveEvalGridOffsetMs(
        lastEvalMs,
        internalLiveContext.defaultConfig.evaluationInterval,
      );
      const grafanaHistoryForMock =
        historyResult !== null && historyResult.kind === 'Ok' ? historyResult.value : undefined;
      const seriesList = result.value;
      const firstSamples = seriesList[0]?.samples ?? [];
      setInternalRuleDataset({
        id: mockDatasetId,
        displayName: internalLiveContext.ruleTitle,
        description: `Last 30 min of "${internalLiveContext.ruleTitle}" — fetched ${new Date().toISOString().slice(11, 19)}Z`,
        source: `Mock view of Grafana rule ${selectedRuleUid}`,
        samples: firstSamples,
        seriesList,
        defaultAlertConfig: internalLiveContext.defaultConfig,
        startTimeMs: plan.startTimeMs,
        endTimeMs: plan.endTimeMs,
        ...(evalGridOffsetMs !== undefined ? { evalGridOffsetMs } : {}),
        ...(internalLiveContext.ruleMetadata !== undefined
          ? { ruleMetadata: internalLiveContext.ruleMetadata }
          : {}),
        ...(grafanaHistoryForMock !== undefined && grafanaHistoryForMock.length > 0
          ? { grafanaHistory: grafanaHistoryForMock }
          : {}),
      });
      // Set here too (not just the cross-mode effect) — saves a re-fetch
      // since samples + initialState arrive in the same Promise.all.
      setDetailInitialState(
        initialResult !== null && initialResult.kind === 'Ok'
          ? initialResult.value
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ruleListEnabled, selectedRuleUid, internalLiveContext, adapter, internalRuleDataset, effectiveStepMs, initialDrill]);

  // Long-range overview samples for the <OverviewStrip>. Coarse on purpose
  // — orientation only, not the precision surface where ParamControls operate.
  const [overviewSamples, setOverviewSamples] = useState<ReadonlyArray<Sample>>([]);
  const [overviewStartMs, setOverviewStartMs] = useState<number | null>(null);
  // Alert state just before the overview window's left edge, fed to the
  // evaluator as `initialState` to drop the phantom Pending at windowStart.
  // `null` while pending or unsupported; CORE then keeps its 'Normal' default.
  const [overviewInitialState, setOverviewInitialState] = useState<
    'Normal' | 'Firing' | 'NoData' | null
  >(null);
  const [overviewLoading, setOverviewLoading] = useState<boolean>(false);
  useEffect(() => {
    if (!ruleListEnabled || internalLiveContext === null) {
      setOverviewSamples([]);
      setOverviewInitialState(null);
      return;
    }
    const opt =
      OVERVIEW_RANGE_OPTIONS.find((o) => o.lookbackSec === overviewLookbackSec) ??
      OVERVIEW_RANGE_OPTIONS[0]!;
    if (opt.lookbackSec === 0) {
      setOverviewSamples([]);
      setOverviewInitialState(null);
      setOverviewLoading(false);
      return;
    }
    let cancelled = false;
    setOverviewLoading(true);
    void (async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      // Instant rules need `tick.t === sample.t` exactly, so force fetch
      // step = eval interval (else every tick falls in a gap → all NoData →
      // empty strip). Range rules tolerate the coarser strip step.
      const baseline = internalLiveContext.defaultConfig;
      const isInstant = baseline.instant;
      const stepSec = isInstant
        ? Math.max(1, Math.floor(baseline.evaluationInterval / 1000))
        : opt.stepSec;
      const plan = planFetch({
        config: baseline,
        range: { kind: 'lookback', nowSec, lookbackSec: opt.lookbackSec },
        stepSec,
        warmup: true,
      });
      const samplesP = adapter.fetchSamples({
        datasourceUid: internalLiveContext.datasourceUid,
        expr: internalLiveContext.query,
        startSec: plan.fetchStartSec,
        endSec: plan.fetchEndSec,
        stepSec: plan.stepSec,
      });
      const initialStateP = adapter.capabilities.initialStateOracle
        ? adapter.fetchInitialAlertState!(internalLiveContext.ruleTitle, plan.startTimeMs)
        : Promise.resolve(null);
      const [result, initialResult] = await Promise.all([samplesP, initialStateP]);
      if (cancelled) return;
      setOverviewStartMs(plan.startTimeMs);
      if (result.kind === 'Ok') {
        // Follow the main chart's SeriesPicker selection so bells line up.
        const list = result.value;
        const idx = Math.min(selectedSeriesIdx, Math.max(list.length - 1, 0));
        setOverviewSamples(list[idx]?.samples ?? []);
      } else {
        setOverviewSamples([]);
      }
      setOverviewInitialState(
        initialResult !== null && initialResult.kind === 'Ok'
          ? initialResult.value
          : null,
      );
      setOverviewLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ruleListEnabled, internalLiveContext, adapter, overviewLookbackSec, selectedSeriesIdx]);

  // Collapses What-If's `Current` lookback into Live's data-source path.
  // Guarded by `liveAccessible` so the demo build (capabilities.live=false,
  // Current lookback) doesn't flip to live and render "No rule selected"
  // forever despite a usable Mock fixture.
  const effectiveMode: 'live' | 'mock' =
    mode === 'mock' && overviewLookbackSec === 0 && liveAccessible ? 'live' : mode;

  const live = useLiveMode(
    {
      active: effectiveMode === 'live' && liveAvailable,
      datasourceUid: liveContext?.datasourceUid ?? '',
      query: liveContext?.query ?? '',
      ruleTitle: liveContext?.ruleTitle ?? '',
      intervalSec: LIVE_INTERVAL_SEC,
      lookbackSec: LIVE_LOOKBACK_SEC,
      stepSec: effectiveStepMs / 1000,
      evaluationIntervalMs: workingConfig.evaluationInterval,
    },
    adapter,
  );

  const [liveNow, setLiveNow] = useState<number>(() => Date.now());
  const [livePaused, setLivePaused] = useState<boolean>(false);
  const [scrubOffsetMs, setScrubOffsetMs] = useState<number>(0);
  // Fresh-start the scrub on lookback/rule change so a pause from a previous
  // session doesn't leave the chart frozen.
  useEffect(() => {
    setLivePaused(false);
    setScrubOffsetMs(0);
  }, [overviewLookbackSec, selectedRuleUid]);

  // 1 Hz wallclock ticker, decoupled from the 15-s sample poll, so the
  // chart's right edge and the NOW readout advance smoothly. Paused freezes it.
  useEffect(() => {
    if (effectiveMode !== 'live' || livePaused) return;
    setLiveNow(Date.now());
    const interval = setInterval(() => setLiveNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [effectiveMode, livePaused]);

  // Grafana state-bar history, persisted by rule title.
  const ruleTitleKey = liveContext?.ruleTitle ?? '';
  const [grafanaHistory, setGrafanaHistory] = useState<
    ReadonlyArray<GrafanaHistoryEntry>
  >(() => loadGrafanaHistory(ruleTitleKey));

  useEffect(() => {
    setGrafanaHistory(loadGrafanaHistory(ruleTitleKey));
  }, [ruleTitleKey]);

  useEffect(() => {
    saveGrafanaHistory(ruleTitleKey, grafanaHistory);
  }, [ruleTitleKey, grafanaHistory]);

  // Lock-once initialState per rule selection: query the oracle once for the
  // first valid window, then keep it across poll-driven window-slides so the
  // evaluator's input is identical between Mock and Live for the same rule.
  useEffect(() => {
    setDetailInitialState(null);
  }, [selectedRuleUid]);
  const detailWindowStartMs =
    effectiveMode === 'live' ? live.samples[0]?.t : dataset?.samples[0]?.t;
  useEffect(() => {
    if (detailInitialState !== null) return;
    if (detailWindowStartMs === undefined) return;
    if (!adapter.capabilities.initialStateOracle) return;
    if (internalLiveContext === null) return;
    let cancelled = false;
    void (async () => {
      const result = await adapter.fetchInitialAlertState!(
        internalLiveContext.ruleTitle,
        detailWindowStartMs,
      );
      if (cancelled) return;
      setDetailInitialState(result.kind === 'Ok' ? result.value : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [detailInitialState, detailWindowStartMs, adapter, internalLiveContext]);

  useEffect(() => {
    if (effectiveMode !== 'live') return;
    if (live.lastPollAt === null) return;
    // Stamp with Grafana's own `lastEvaluation` so the bar tracks its real
    // transition moment, not our poll arrival.
    const entryT = live.grafanaLatestEvalMs ?? live.lastPollAt;
    setGrafanaHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last !== undefined && last.state === live.grafanaState) return prev;
      return [...prev, { t: entryT, state: live.grafanaState }];
    });
    // grafanaHistory intentionally not in deps — append-only effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMode, live.grafanaState, live.lastPollAt, live.grafanaLatestEvalMs]);

  const jumpToLive = () => {
    setLivePaused(false);
    setScrubOffsetMs(0);
    if (live.lastPollAt !== null) setLiveNow(live.lastPollAt);
  };

  const togglePause = () => {
    if (livePaused) jumpToLive();
    else setLivePaused(true);
  };

  const onScrubChange = (offsetMs: number) => {
    setScrubOffsetMs(offsetMs);
    if (offsetMs !== 0 && !livePaused) setLivePaused(true);
    if (offsetMs === 0 && livePaused) jumpToLive();
  };

  // Live's poll-driven samples, or the frozen Dataset's selected series
  // (falling back to the legacy single `samples` field).
  const samplesRaw: ReadonlyArray<Sample> = (() => {
    if (effectiveMode === 'live') return live.samples;
    const list = dataset?.seriesList;
    if (list !== undefined && list.length > 0) {
      const idx = Math.min(selectedSeriesIdx, list.length - 1);
      return list[idx]!.samples;
    }
    return dataset?.samples ?? [];
  })();
  // Re-sample a frozen fixture to the effective step (no-op at recording
  // resolution or for already-step-spaced live data).
  const samples: ReadonlyArray<Sample> =
    effectiveMode === 'live'
      ? samplesRaw
      : downsampleToStep(samplesRaw, effectiveStepMs, dataset?.evalGridOffsetMs ?? 0);

  // Reset the series index only when the label set changes; an identical
  // signature across refetches preserves the user's pick.
  useEffect(() => {
    const list = dataset?.seriesList ?? [];
    const sig = list.map((s) => JSON.stringify(s.labels)).join('|');
    if (sig !== lastSeriesSignatureRef.current) {
      lastSeriesSignatureRef.current = sig;
      setSelectedSeriesIdx(0);
    }
  }, [dataset?.seriesList]);

  const tickTimes =
    samplesRaw.length > 0
      ? scheduleTickTimes(samplesRaw, workingConfig.evaluationInterval)
      : [];
  const tickCount = tickTimes.length;

  const clampTick = (t: number): number => Math.max(0, Math.min(Math.round(t), tickCount));
  const presetTickRef = useRef<number | undefined>(initialPreset?.tick);
  const [tickIndex, setTickIndex] = useState<number>(
    initialPreset?.tick !== undefined && tickCount > 0 ? clampTick(initialPreset.tick) : tickCount,
  );
  const [playing, setPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<Speed>(1);

  useEffect(() => {
    // Land at the last tick on dataset change, unless a deep-link preset tick
    // wins on first mount (then clears).
    if (presetTickRef.current !== undefined && tickCount > 0) {
      setTickIndex(clampTick(presetTickRef.current));
      presetTickRef.current = undefined;
    } else {
      setTickIndex(tickCount);
    }
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatasetId, mode]);

  useEffect(() => {
    if (effectiveMode === 'live') {
      setTickIndex(tickCount);
    } else if (tickIndex > tickCount) {
      setTickIndex(tickCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickCount, mode]);

  useEffect(() => {
    if (!playing) return;
    if (tickIndex >= tickCount) {
      setPlaying(false);
      autoReplayingRef.current = false;
      return;
    }
    const tickT = tickIndex > 0 ? tickTimes[tickIndex - 1]! : null;
    const windowDuration = workingConfig.instant ? 0 : workingConfig.windowDuration;
    const N =
      tickT === null || workingConfig.instant
        ? 0
        : samples.filter(
            (s) =>
              Number.isFinite(s.v) &&
              s.t > tickT - windowDuration &&
              s.t <= tickT,
          ).length;
    const animMs = reduceAnimationDurationMs(N);
    const speedFactor = autoReplayingRef.current ? speed * AUTO_REPLAY_SPEEDUP : speed;
    const waitMs = Math.max(MIN_AUTOPLAY_WAIT_MS, animMs) / speedFactor;
    const id = setTimeout(
      () => setTickIndex((i) => Math.min(i + 1, tickCount)),
      waitMs,
    );
    return () => clearTimeout(id);
  }, [playing, tickIndex, tickCount, speed, samples, tickTimes, workingConfig]);

  const visibleSamples =
    tickIndex >= tickCount
      ? samples
      : tickIndex <= 0
        ? []
        : samples.filter((s) => s.t <= tickTimes[tickIndex - 1]!);

  const selectDataset = (id: string) => {
    const next = allDatasets.find((d) => d.id === id);
    if (!next) return;
    setSelectedDatasetId(id);
    setWorkingConfig(next.defaultAlertConfig);
  };

  const [exportToast, setExportToast] = useState<string | null>(null);
  const [timelineText, setTimelineText] = useState<string | null>(null);
  const exportToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashExportToast = (msg: string) => {
    if (exportToastTimerRef.current) clearTimeout(exportToastTimerRef.current);
    setExportToast(msg);
    exportToastTimerRef.current = setTimeout(() => setExportToast(null), 4000);
  };

  // Freeze the current Live samples into a Mock-mode Dataset; the current
  // workingConfig travels with the snapshot.
  const captureLiveSnapshot = () => {
    if (liveContext === undefined) return;
    if (live.samples.length === 0) return;
    const captureTime = new Date();
    const id = `live-snapshot-${captureTime.getTime()}`;
    const evalGridOffsetMs = deriveEvalGridOffsetMs(
      live.grafanaLastEvalMs,
      workingConfig.evaluationInterval,
    );
    const captured: Dataset = {
      id,
      displayName: `📸 Snapshot @ ${captureTime.toISOString().slice(11, 19)}Z`,
      description: `Captured from Live mode at ${captureTime.toISOString()} — ${live.samples.length} samples; rule "${liveContext.ruleTitle}".`,
      source: `Live capture (${liveContext.query})`,
      samples: live.samples,
      defaultAlertConfig: workingConfig,
      ...(liveContext.rateInnerWindow !== undefined
        ? { rateInnerWindow: liveContext.rateInnerWindow }
        : {}),
      ...(evalGridOffsetMs !== undefined ? { evalGridOffsetMs } : {}),
    };
    setCapturedDatasets((prev) => [...prev, captured]);
    setMode('mock');
    setSelectedDatasetId(id);
  };

  // Export the current scenario to JSON: Live bundles live.samples +
  // workingConfig; Mock serializes the selected dataset.
  const exportCurrent = () => {
    if (mode === 'live' && liveContext !== undefined) {
      if (live.samples.length === 0) return;
      const captureTime = new Date();
      const lastSampleT = live.samples[live.samples.length - 1]!.t;
      const evalGridOffsetMs = deriveEvalGridOffsetMs(
        live.grafanaLastEvalMs,
        workingConfig.evaluationInterval,
      );
      downloadDataset({
        id: `live-export-${captureTime.getTime()}`,
        displayName: `Live export @ ${captureTime.toISOString().slice(11, 19)}Z`,
        description: `Exported from Live mode at ${captureTime.toISOString()} — ${live.samples.length} samples; rule "${liveContext.ruleTitle}".`,
        source: `Live export (${liveContext.query})`,
        samples: live.samples,
        defaultAlertConfig: workingConfig,
        ...(liveContext.rateInnerWindow !== undefined
          ? { rateInnerWindow: liveContext.rateInnerWindow }
          : {}),
        ...(evalGridOffsetMs !== undefined ? { evalGridOffsetMs } : {}),
      });
      flashExportToast(
        `✓ Exported ${live.samples.length} samples · cutoff ${new Date(lastSampleT).toISOString().slice(11, 19)}Z`,
      );
    } else if (dataset !== null) {
      downloadDataset(dataset);
      flashExportToast(
        `✓ Exported "${dataset.displayName}" · ${dataset.samples.length} samples`,
      );
    }
  };

  // Build the detection-latency timeline (enqueue → threshold → pending → fire)
  // from the current What-If events and show it in a copyable panel.
  const showTimeline = () => {
    const title =
      mode === 'live' && liveContext !== undefined
        ? liveContext.ruleTitle
        : (dataset?.displayName ?? 'rule');
    setTimelineText(
      buildTimeline({
        ruleTitle: title,
        events,
        samples,
        threshold: workingConfig.threshold,
        evalIntervalMs: workingConfig.evaluationInterval,
        forMs: workingConfig.forDuration,
      }),
    );
  };

  // Validate a .json file, append to capturedDatasets, and switch to it.
  // ID collisions get a unique suffix so re-import doesn't overwrite.
  const importFromFile = async (file: File): Promise<{ ok: boolean; error?: string }> => {
    try {
      const text = await file.text();
      const result = parseDataset(text);
      if (result.kind === 'err') return { ok: false, error: result.error };
      const existingIds = new Set(allDatasets.map((d) => d.id));
      let finalId = result.dataset.id;
      let suffix = 1;
      while (existingIds.has(finalId)) {
        finalId = `${result.dataset.id}-${suffix}`;
        suffix += 1;
      }
      const datasetWithUniqueId =
        finalId === result.dataset.id ? result.dataset : { ...result.dataset, id: finalId };
      setCapturedDatasets((prev) => [...prev, datasetWithUniqueId]);
      setMode('mock');
      setSelectedDatasetId(finalId);
      setWorkingConfig(datasetWithUniqueId.defaultAlertConfig);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  // Derived from whichever source knows Grafana's `lastEvaluation`. Naturally
  // stable (deterministic scheduler) and follows a schedule shift without a lock.
  const sharedGridOffsetMs: number | undefined =
    deriveEvalGridOffsetMs(live.grafanaLastEvalMs, workingConfig.evaluationInterval) ??
    dataset?.evalGridOffsetMs;
  const evalHints =
    effectiveMode === 'live'
      ? {
          ...(sharedGridOffsetMs !== undefined
            ? { evalGridOffsetMs: sharedGridOffsetMs }
            : {}),
          endTime: liveNow,
          ...(detailInitialState !== null ? { initialState: detailInitialState } : {}),
        }
      : effectiveMode === 'mock' && sharedGridOffsetMs !== undefined
        ? {
            evalGridOffsetMs: sharedGridOffsetMs,
            // Drill: skip endTime so the grid stops at the last visible
            // sample and the playhead overlaps the bell instead of walking
            // off-screen. Non-drill mocks keep it for their NoData tail.
            ...(dataset?.endTimeMs !== undefined && dataset?.drillFocalMs === undefined
              ? { endTime: dataset.endTimeMs }
              : {}),
            ...(dataset?.startTimeMs !== undefined ? { startTime: dataset.startTimeMs } : {}),
            ...(detailInitialState !== null ? { initialState: detailInitialState } : {}),
          }
        : effectiveMode === 'mock' &&
            (dataset?.endTimeMs !== undefined || dataset?.startTimeMs !== undefined)
          ? {
              ...(dataset.endTimeMs !== undefined && dataset.drillFocalMs === undefined
                ? { endTime: dataset.endTimeMs }
                : {}),
              ...(dataset.startTimeMs !== undefined ? { startTime: dataset.startTimeMs } : {}),
              ...(detailInitialState !== null ? { initialState: detailInitialState } : {}),
            }
          : detailInitialState !== null
            ? { initialState: detailInitialState }
            : undefined;

  const result = evaluate(
    workingConfig,
    { labels: {}, samples: visibleSamples },
    evalHints,
  );
  const events: ReadonlyArray<EvalEvent> = result.kind === 'Ok' ? result.value.events : [];
  const ticks: ReadonlyArray<Tick> = result.kind === 'Ok' ? result.value.ticks : [];
  const currentTick: Tick | null = ticks.length > 0 ? ticks[ticks.length - 1]! : null;
  const ourState = currentStateForTick(currentTick, events);
  const subtitle = formatAlertExpression(workingConfig);

  // Crossings at the eval-interval midpoint (pending/resolved.at -
  // evalInterval/2): the most honest marker since the discrete scrape grid
  // makes sub-step precision unreachable — visibly off both tick boundaries.
  const preciseCrossings: ReadonlyArray<ThresholdCrossing> = useMemo(() => {
    if (!('value' in workingConfig.threshold) || events.length === 0) return [];
    const evalIntervalMs = workingConfig.evaluationInterval;
    const thresholdValue = workingConfig.threshold.value;
    const out: ThresholdCrossing[] = [];
    let prevKind: string | null = null;
    for (const e of events) {
      if (e.kind === 'Pending') {
        out.push({ t: e.from - evalIntervalMs / 2, v: thresholdValue, direction: 'ignition' });
      } else if (e.kind === 'Firing' && prevKind !== 'Pending') {
        out.push({ t: e.from - evalIntervalMs / 2, v: thresholdValue, direction: 'ignition' });
      } else if (e.kind === 'Resolved') {
        out.push({ t: e.at - evalIntervalMs / 2, v: thresholdValue, direction: 'resolution' });
      }
      prevKind = e.kind;
    }
    return out;
  }, [events, workingConfig.threshold, workingConfig.evaluationInterval]);

  // Grafana's recorded state at the playhead, scanned from grafanaHistory.
  const playheadGrafanaState = mockPlayheadGrafanaState(
    dataset?.grafanaHistory,
    currentTick?.t,
    detailInitialState,
  );

  // The rule's unmodified config, re-evaluated so the chart can stack
  // baseline vs what-if events. Skip when reference-equal (bands would overlap).
  const baselineConfig: AlertConfig | null =
    mode === 'mock' && dataset !== null
      ? dataset.defaultAlertConfig
      : liveContext !== undefined
        ? liveContext.defaultConfig
        : null;
  const baselineDiffers = baselineConfig !== null && baselineConfig !== workingConfig;
  const changedLabels = changedParamLabels(draftConfig, baselineConfig);
  const baselineResult = baselineDiffers
    ? evaluate(baselineConfig, { labels: {}, samples: visibleSamples }, evalHints)
    : null;
  const baselineEvents: ReadonlyArray<EvalEvent> | undefined =
    baselineResult !== null && baselineResult.kind === 'Ok'
      ? baselineResult.value.events
      : undefined;

  // Run the BASELINE config (not the tweaked workingConfig) over the overview
  // samples so the strip marks where this rule actually fired historically.
  const overviewEvents: ReadonlyArray<EvalEvent> = useMemo(() => {
    if (baselineConfig === null || overviewSamples.length === 0) return [];
    // Instant rules omit evalGridOffsetMs so ticks anchor to samples[0].t and
    // land on existing samples; range rules use the shared offset.
    const hints: {
      initialState?: 'Normal' | 'Firing' | 'NoData';
      evalGridOffsetMs?: number;
      startTime?: number;
    } = {
      ...(overviewInitialState !== null ? { initialState: overviewInitialState } : {}),
      ...(baselineConfig.instant || sharedGridOffsetMs === undefined
        ? {}
        : { evalGridOffsetMs: sharedGridOffsetMs }),
      // Clamp the grid to the display start so warm-up over-fetched samples
      // complete the leftmost reduce window without spawning bells.
      ...(baselineConfig.instant || overviewStartMs === null
        ? {}
        : { startTime: overviewStartMs }),
    };
    const r = evaluate(baselineConfig, { labels: {}, samples: overviewSamples }, hints);
    return r.kind === 'Ok' ? r.value.events : [];
  }, [baselineConfig, overviewSamples, overviewInitialState, sharedGridOffsetMs, overviewStartMs]);

  // `?drill=first|last`: anchor on the first/last Pending-or-Firing event
  // (not Firing) so it lands exactly on the bell at the episode start.
  const autoDrillDoneRef = useRef<boolean>(initialDrill === undefined);
  useEffect(() => {
    if (autoDrillDoneRef.current) return;
    const active = overviewEvents.filter(
      (e): e is Extract<EvalEvent, { kind: 'Firing' | 'Pending' }> =>
        e.kind === 'Firing' || e.kind === 'Pending',
    );
    const target = initialDrill === 'last' ? active[active.length - 1] : active[0];
    if (target) {
      autoDrillDoneRef.current = true;
      drillToMoment(target.from, 'Firing');
    }
  }, [overviewEvents]);

  // Auto-replay drives the real buttons via `.click()` (not setState) so it
  // takes the hand-tested path and each press flashes on camera. Triggers:
  // `?play=1` deep link and postMessage `{type:'whatif:play'}`.
  const resetBtnRef = useRef<HTMLButtonElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const [autoFlash, setAutoFlash] = useState<'reset' | 'play' | null>(null);
  const replayTimersRef = useRef<number[]>([]);
  const autoReplayingRef = useRef<boolean>(false);

  const pressReplayButton = useCallback((which: 'reset' | 'play') => {
    const el = which === 'reset' ? resetBtnRef.current : playBtnRef.current;
    if (el === null || el.disabled) return;
    setAutoFlash(which);
    el.click();
    replayTimersRef.current.push(window.setTimeout(() => setAutoFlash(null), 260));
  }, []);

  const runAutoReplay = useCallback(
    (holdMs: number) => {
      replayTimersRef.current.forEach((t) => window.clearTimeout(t));
      replayTimersRef.current = [];
      autoReplayingRef.current = true;
      replayTimersRef.current.push(window.setTimeout(() => pressReplayButton('reset'), holdMs));
      replayTimersRef.current.push(window.setTimeout(() => pressReplayButton('play'), holdMs + 1000));
    },
    [pressReplayButton],
  );

  const autoPlayedRef = useRef<boolean>(initialPlay !== true);
  useEffect(() => {
    if (autoPlayedRef.current) return;
    if (samples.length === 0 || drillTarget === null) return;
    autoPlayedRef.current = true;
    runAutoReplay(1300);
  }, [samples, drillTarget, runAutoReplay]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data === null || typeof e.data !== 'object') return;
      if (e.data.type === 'whatif:play') {
        runAutoReplay(300);
      } else if (e.data.type === 'whatif:tweak' && e.data.overrides !== undefined) {
        // Apply an override to both configs (an instant Apply) so the chart
        // re-runs in place on the same drilled history — no reload.
        const next = applyConfigOverrides(workingConfig, e.data.overrides as ConfigOverrides);
        setDraftConfig(next);
        setWorkingConfig(next);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [runAutoReplay, workingConfig]);

  useEffect(() => () => replayTimersRef.current.forEach((t) => window.clearTimeout(t)), []);

  // No context for the active mode — hide chart/params/trace so
  // PLACEHOLDER_CONFIG never reaches the user. Mode-scoped.
  const hasContext =
    effectiveMode === 'mock' ? dataset !== null : liveContext !== undefined;
  const emptyHint =
    internalRuleError !== null
      ? internalRuleError
      : rulesError !== null
        ? `Could not load rules: ${rulesError}`
        : ruleListEnabled && rulesLoading
          ? 'Loading rules…'
          : ruleListEnabled
            ? 'Pick a Grafana alert rule above to see its lifecycle.'
            : 'No rule selected.';

  return (
    <>
    <PageLayout
      className={animationScope}
      headerLeft={
        <>
          {renderTitle(titleLogo)}
          {!ruleListEnabled && fixturesAvailable && liveAccessible ? (
            <ModeToggle mode={mode} onChange={setMode} />
          ) : null}
          {!ruleListEnabled && mode === 'mock' && dataset !== null && allDatasets.length > 1 ? (
            <DatasetPicker
              dataset={dataset}
              datasets={allDatasets}
              onSelect={selectDataset}
            />
          ) : null}
          {ruleListEnabled ? (
            <RulePicker
              rules={rules}
              selectedUid={selectedRuleUid}
              onSelect={setSelectedRuleUid}
              loading={rulesLoading}
              error={rulesError}
              onRefresh={() => setRulesReloadTick((n) => n + 1)}
            />
          ) : null}
        </>
      }
      themeToggle={themeToggleSlot}
      summaryStrip={null}
      main={!hasContext ? (
        <EmptyMessage text={emptyHint} />
      ) : (
        <>
          {effectiveMode === 'live' && liveContext !== undefined ? (
            <LiveStatusStrip
              mode="live"
              {...(adapter.capabilities.grafanaStateOracle
                ? { grafanaState: live.grafanaState }
                : {})}
              {...(dataset?.seriesList !== undefined && dataset.seriesList.length > 1
                ? {
                    pillExtra: (
                      <SeriesPicker
                        seriesList={dataset.seriesList}
                        selectedIdx={selectedSeriesIdx}
                        onSelect={setSelectedSeriesIdx}
                      />
                    ),
                  }
                : {})}
              ourState={ourState}
              lastPollAt={live.lastPollAt}
              intervalSec={LIVE_INTERVAL_SEC}
              error={live.error}
              {...(!ruleListEnabled ? { query: liveContext.query } : {})}
              {...(ruleListEnabled
                ? {}
                : {
                    onSnapshot: captureLiveSnapshot,
                    canSnapshot: live.samples.length > 0,
                  })}
              onExport={exportCurrent}
              canExport={live.samples.length > 0}
              onExportTimeline={showTimeline}
              exportToast={exportToast}
              {...(ruleListEnabled
                ? {
                    onImport: (file: File) => {
                      void importFromFile(file).then((result) => {
                        if (!result.ok) {
                          flashExportToast(
                            `Import failed: ${result.error ?? 'unknown error'}`,
                          );
                        }
                      });
                    },
                  }
                : {})}
              {...(liveContext.footerSlot !== undefined
                ? { footerSlot: liveContext.footerSlot }
                : {})}
            />
          ) : effectiveMode === 'mock' && dataset !== null ? (
            <LiveStatusStrip
              mode="mock"
              ourState={ourState}
              {...(playheadGrafanaState !== undefined &&
              adapter.capabilities.grafanaStateOracle
                ? { grafanaState: playheadGrafanaState }
                : {})}
              {...(dataset.seriesList !== undefined && dataset.seriesList.length > 1
                ? {
                    pillExtra: (
                      <SeriesPicker
                        seriesList={dataset.seriesList}
                        selectedIdx={selectedSeriesIdx}
                        onSelect={setSelectedSeriesIdx}
                      />
                    ),
                  }
                : {})}
              {...(!ruleListEnabled ? { query: dataset.id } : {})}
              tickIndex={tickIndex}
              tickCount={tickCount}
              onExport={exportCurrent}
              onExportTimeline={showTimeline}
              onImport={(file) => {
                void importFromFile(file).then((result) => {
                  if (!result.ok) {
                    flashExportToast(`Import failed: ${result.error ?? 'unknown error'}`);
                  }
                });
              }}
              replayButtons={
                <ReplayButtons
                  tickIndex={tickIndex}
                  tickCount={tickCount}
                  playing={playing}
                  speed={speed}
                  onReset={() => {
                    setTickIndex(0);
                    setPlaying(false);
                  }}
                  onStepBack={() => {
                    setPlaying(false);
                    setTickIndex((i) => Math.max(0, i - 1));
                  }}
                  onTogglePlay={() => setPlaying((p) => !p)}
                  onStepForward={() => {
                    setPlaying(false);
                    setTickIndex((i) => Math.min(tickCount, i + 1));
                  }}
                  onJumpToEnd={() => {
                    setPlaying(false);
                    setTickIndex(tickCount);
                  }}
                  onSpeedChange={setSpeed}
                  hideSpeed={ruleListEnabled}
                  resetButtonRef={resetBtnRef}
                  playButtonRef={playBtnRef}
                  flashing={autoFlash}
                />
              }
            />
          ) : null}
          {ruleListEnabled && internalLiveContext !== null && mode === 'mock' ? (
            <OverviewStrip
              samples={overviewSamples}
              events={overviewEvents}
              loading={overviewLoading}
              onEventClick={drillToMoment}
              lookbackSec={overviewLookbackSec}
              onLookbackChange={setOverviewLookbackSec}
              rangeOptions={OVERVIEW_RANGE_OPTIONS}
              {...(overviewInitialState !== null
                ? { initialState: overviewInitialState }
                : {})}
              {...(internalLiveContext?.ruleMetadata?.updatedMs !== undefined
                ? { ruleCreatedMs: internalLiveContext.ruleMetadata.updatedMs }
                : {})}
            />
          ) : null}
          <MetricChart
            samples={samples}
            visibleSamples={visibleSamples}
            ticks={ticks}
            threshold={workingConfig.threshold}
            evaluationInterval={workingConfig.evaluationInterval}
            windowDuration={workingConfig.instant ? 0 : workingConfig.windowDuration}
            {...(preciseCrossings.length > 0 ? { crossings: preciseCrossings } : {})}
            {...(workingConfig.instant ? {} : { reducer: workingConfig.reducer })}
            events={events}
            {...(baselineEvents !== undefined &&
            !(adapter.capabilities.grafanaStateOracle && grafanaHistory.length > 0)
              ? { baselineEvents }
              : {})}
            {...(detailInitialState !== null ? { initialState: detailInitialState } : {})}
            subtitle={subtitle}
            currentState={ourState}
            {...(effectiveMode === 'mock' && dataset !== null
              ? {
                  rightAnchorT: mockRightAnchorT(dataset),
                  ...(dataset.drillFocalMs !== undefined
                    ? { focalMs: dataset.drillFocalMs }
                    : {}),
                  // Drill GRAFANA bar: prefer drill-time annotations, fall
                  // back to localStorage Live-polling history.
                  ...(adapter.capabilities.grafanaStateOracle &&
                  dataset.grafanaHistory !== undefined &&
                  dataset.grafanaHistory.length > 0
                    ? {
                        grafanaHistory: dataset.grafanaHistory,
                        grafanaHistoryEnd:
                          dataset.endTimeMs ?? liveNow,
                      }
                    : adapter.capabilities.grafanaStateOracle &&
                        grafanaHistory.length > 0
                      ? {
                          grafanaHistory,
                          grafanaHistoryEnd: liveNow,
                        }
                      : {}),
                }
              : {})}
            {...(effectiveMode === 'live'
              ? {
                  rightAnchorT: liveNow + scrubOffsetMs,
                  // Fixed cap suits the rate-based burst demo (0–8). Instant
                  // gauges span a wide range and need the threshold-centred
                  // domain (MetricChart) instead, so skip the override there.
                  ...(workingConfig.instant ? {} : { yMax: 6 }),
                  ...(live.lastPollAt !== null ? { pollSignal: live.lastPollAt } : {}),
                  // GRAFANA history bar only when the oracle exists (demo);
                  // plugin disables the dev-only comparison.
                  ...(adapter.capabilities.grafanaStateOracle
                    ? {
                        grafanaHistory,
                        grafanaHistoryEnd: liveNow,
                      }
                    : {}),
                }
              : {})}
            bottomSlot={
              // Plugin: no bottom strip — the top status bar already carries
              // the replay controls, so a slider here would duplicate them.
              ruleListEnabled ? null : effectiveMode === 'live' ? (
                <LiveScrubControls
                  paused={livePaused}
                  scrubOffsetMs={scrubOffsetMs}
                  scrubMaxMs={LIVE_SCRUB_MAX_MS}
                  onTogglePause={togglePause}
                  onScrubChange={onScrubChange}
                  onJumpToLive={jumpToLive}
                />
              ) : (
                <ReplaySliderBar
                  tickIndex={tickIndex}
                  tickCount={tickCount}
                  onTickIndexChange={(next) => {
                    setPlaying(false);
                    setTickIndex(next);
                  }}
                />
              )
            }
          />
        </>
      )}
      bottomLeft={!hasContext ? null : (
        <ParamControls
          config={draftConfig}
          onChange={setDraftConfig}
          onApply={() => setWorkingConfig(draftConfig)}
          onReset={() => {
            const defaults =
              mode === 'live' && liveContext !== undefined
                ? liveContext.defaultConfig
                : (dataset?.defaultAlertConfig ?? draftConfig);
            // Reset reloads defaults into both draft and applied.
            setDraftConfig(defaults);
            setWorkingConfig(defaults);
          }}
          changedLabels={changedLabels}
          {...(mode === 'mock' && dataset?.ruleMetadata !== undefined
            ? { ruleMetadata: dataset.ruleMetadata }
            : {})}
        />
      )}
      bottomRight={!hasContext ? null : (
        result.kind === 'Err' ? (
          <EvalErrorPanel errors={result.errors} />
        ) : (
          <ComputeTracePanel
            tickIndex={tickIndex}
            tickCount={tickCount}
            currentTick={currentTick}
            samples={samples}
            config={workingConfig}
            events={events}
          />
        )
      )}
    />
    {timelineText !== null ? (
      <div style={timelineOverlayStyle} onClick={() => setTimelineText(null)}>
        <div style={timelineBoxStyle} onClick={(e) => e.stopPropagation()}>
          <div style={timelineHeaderStyle}>
            <span>Detection-latency timeline</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              style={timelineBtnStyle}
              onClick={() => void navigator.clipboard?.writeText(timelineText)}
            >
              📋 Copy
            </button>
            <button
              type="button"
              style={timelineBtnStyle}
              onClick={() => setTimelineText(null)}
            >
              ✕ Close
            </button>
          </div>
          <pre style={timelinePreStyle}>{timelineText}</pre>
        </div>
      </div>
    ) : null}
    </>
  );
}

const timelineOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
};

const timelineBoxStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 680,
  maxHeight: '80vh',
  overflow: 'auto',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-card)',
  borderRadius: 8,
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
};

const timelineHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.6rem 0.85rem',
  borderBottom: '1px solid var(--border-card)',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const timelineBtnStyle: React.CSSProperties = {
  padding: '2px 10px',
  fontSize: '0.78rem',
  border: '1px solid var(--border-card)',
  borderRadius: 4,
  background: 'var(--bg-input, transparent)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

const timelinePreStyle: React.CSSProperties = {
  margin: 0,
  padding: '0.85rem 1rem',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '0.8rem',
  lineHeight: 1.6,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

function EmptyMessage({ text }: { readonly text: string }) {
  return (
    <div style={emptyStyle}>
      <p>{text}</p>
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.25rem',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
};

const titleLogoStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  lineHeight: 1,
};

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  color: 'var(--text-muted)',
};
