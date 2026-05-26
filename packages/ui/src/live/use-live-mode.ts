// Drives Live mode: polls the adapter for samples + Grafana's state, owns the
// poller lifecycle and all Grafana-eval-grid phase logic (discovery, lock,
// sample-start alignment). Cleared when `active` is false.

import { useEffect, useRef, useState } from 'react';
import type { Sample } from '@alert-whatif/core';
import type {
  GrafanaAlertState,
  WhatIfDataSource,
} from '../data/data-source';
import { createLivePoller } from './live-poller';

export type LiveModeOptions = {
  readonly active: boolean;
  readonly datasourceUid: string;
  readonly query: string;
  readonly ruleTitle: string;
  readonly intervalSec: number;
  // Trailing-window length fetched each tick; gaps stay as gaps.
  readonly lookbackSec: number;
  // `query_range` step; also phase-aligns startSec to Grafana's eval grid.
  readonly stepSec: number;
  // Aligns the sample query's start to Grafana's eval-grid phase so every
  // moment Grafana evaluates at has a sample exactly there.
  readonly evaluationIntervalMs: number;
};

export type LiveModeState = {
  readonly samples: ReadonlyArray<Sample>;
  // Grafana's decision as of the last poll; 'unknown' until the first.
  readonly grafanaState: GrafanaAlertState;
  readonly lastPollAt: number | null;
  // Phase anchor (Grafana's lastEvaluation ms when first learned). The parent
  // passes `phase % evaluationInterval` as the evalGridOffsetMs hint. LOCKED
  // after the first poll: re-reading it would let any divergence be written
  // off as clock drift rather than a real evaluator bug.
  readonly grafanaLastEvalMs: number | null;
  // Unlocked — updates every poll. Stamps the GRAFANA bar with the moment
  // Grafana actually transitioned, not our poll time.
  readonly grafanaLatestEvalMs: number | null;
  readonly error: string | null;
};

export function useLiveMode(
  opts: LiveModeOptions,
  adapter: WhatIfDataSource,
): LiveModeState {
  const [samples, setSamples] = useState<ReadonlyArray<Sample>>([]);
  const [grafanaState, setGrafanaState] = useState<GrafanaAlertState>('unknown');
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const [grafanaLastEvalMs, setGrafanaLastEvalMs] = useState<number | null>(null);
  const [grafanaLatestEvalMs, setGrafanaLatestEvalMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mirrors grafanaLastEvalMs so the async poll closure reads the latest value
  // without re-creating the effect.
  const phaseAnchorRef = useRef<number | null>(null);
  useEffect(() => {
    phaseAnchorRef.current = grafanaLastEvalMs;
  }, [grafanaLastEvalMs]);

  useEffect(() => {
    // Clear phase + samples on every re-run: a new rule context has its own
    // scheduler phase, so keeping old samples through the realignment gap
    // shows phantom NoData. An honest "loading" pause is better.
    setGrafanaLastEvalMs(null);
    setGrafanaLatestEvalMs(null);
    phaseAnchorRef.current = null;
    setSamples([]);
    setGrafanaState('unknown');
    if (!opts.active) {
      setLastPollAt(null);
      setError(null);
      return;
    }

    const poller = createLivePoller({
      intervalSec: opts.intervalSec,
      // Align poll moments to Grafana's eval phase (+1s buffer) so the NOW dot
      // lands on the eval tick and transitions are seen within ~1s, not 15s
      // late. Fixed cadence until the phase is known.
      getNextDelayMs: () => {
        const phaseAnchorMs = phaseAnchorRef.current;
        if (phaseAnchorMs === null) return null;
        const phaseMs =
          ((phaseAnchorMs % opts.evaluationIntervalMs) +
            opts.evaluationIntervalMs) %
          opts.evaluationIntervalMs;
        const stepMs = opts.intervalSec * 1000;
        const BUFFER_MS = 1000;
        const now = Date.now();
        const offset = ((now - phaseMs - BUFFER_MS) % stepMs + stepMs) % stepMs;
        const delay = (stepMs - offset) % stepMs;
        // delay=0 would immediate-fire into a tight loop; push to the next slot.
        return delay === 0 ? stepMs : delay;
      },
      poll: async () => {
        const stepSec = opts.stepSec;

        // Discover the phase once on the first poll even when the state oracle
        // is off (plugin): without it, startSec drifts 15s per poll and the
        // eval-grid offset hops the lifecycle markers between polls.
        if (
          phaseAnchorRef.current === null &&
          adapter.fetchRuleState !== undefined
        ) {
          const rule = await adapter.fetchRuleState(opts.ruleTitle);
          if (rule.lastEvaluationMs !== null) {
            // Sync the ref so the samples fetch below aligns to the new phase.
            phaseAnchorRef.current = rule.lastEvaluationMs;
            setGrafanaLastEvalMs(rule.lastEvaluationMs);
            setGrafanaLatestEvalMs(rule.lastEvaluationMs);
          }
          if (adapter.capabilities.grafanaStateOracle) {
            setGrafanaState(rule.state);
          }
        }

        // Round startSec down to a stepSec mark offset by phaseSec, so samples
        // land on Grafana's phase. Falls back to rawStartSec when unknown.
        const nowSec = Math.floor(Date.now() / 1000);
        const rawStartSec = nowSec - opts.lookbackSec;
        const phaseAnchorMs = phaseAnchorRef.current;
        let startSec: number;
        if (phaseAnchorMs !== null) {
          const phaseSec = Math.floor(
            ((phaseAnchorMs % opts.evaluationIntervalMs) +
              opts.evaluationIntervalMs) %
              opts.evaluationIntervalMs /
              1000,
          );
          startSec =
            Math.floor((rawStartSec - phaseSec) / stepSec) * stepSec + phaseSec;
        } else {
          startSec = rawStartSec;
        }

        // Fetch samples + rule in parallel so a slow rules API doesn't delay
        // samples; skip the rule fetch when there's no state oracle.
        const samplesP = adapter.fetchSamples({
          datasourceUid: opts.datasourceUid,
          expr: opts.query,
          startSec,
          endSec: nowSec,
          stepSec,
        });
        const ruleP = adapter.capabilities.grafanaStateOracle
          ? adapter.fetchRuleState!(opts.ruleTitle)
          : Promise.resolve(null);
        const [samplesResult, rule] = await Promise.all([samplesP, ruleP]);
        if (samplesResult.kind === 'Err') {
          // Throw so createLivePoller's onError handler runs.
          throw new Error(samplesResult.errors.join(' · '));
        }
        // Live consumes the first series only — no SeriesPicker in Live mode.
        setSamples(samplesResult.value[0]?.samples ?? []);
        if (rule !== null) {
          setGrafanaState(rule.state);
          if (rule.lastEvaluationMs !== null) {
            setGrafanaLatestEvalMs(rule.lastEvaluationMs);
            // Follow the (deterministic) schedule each poll rather than
            // locking, so a rule/container restart re-aligns the phase.
            phaseAnchorRef.current = rule.lastEvaluationMs;
            setGrafanaLastEvalMs(rule.lastEvaluationMs);
          }
        }
        setLastPollAt(Date.now());
        setError(null);
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : String(err));
      },
    });

    poller.start();
    return () => poller.stop();
  }, [opts.active, opts.query, opts.ruleTitle, opts.intervalSec, opts.lookbackSec, opts.stepSec, opts.evaluationIntervalMs]);

  return { samples, grafanaState, lastPollAt, grafanaLastEvalMs, grafanaLatestEvalMs, error };
}
