import type {
  AlertConfig,
  Duration,
  ExecErrState,
  NanMode,
  NoDataState,
  ReducerKind,
  Threshold,
} from '@alert-whatif/core';
import type { RuleMetadata } from '../types';
import type { WhatIfDataSource } from '../data/data-source';
import type { ReactNode } from 'react';

export type ConfigOverrides = {
  readonly threshold?: Threshold;
  readonly forDuration?: Duration;
  readonly keepFiringFor?: Duration;
  readonly evaluationInterval?: Duration;
  readonly intervalMs?: Duration;
  readonly maxDataPoints?: number;
  readonly noDataState?: NoDataState;
  readonly execErrState?: ExecErrState;
  readonly windowDuration?: Duration;
  readonly reducer?: ReducerKind;
  readonly nanMode?: NanMode;
};

export type WhatIfPreset = {
  readonly datasetId?: string;
  readonly overrides?: ConfigOverrides;
  readonly tick?: number;
};

export type LiveContext = {
  readonly datasourceUid: string;
  readonly query: string;
  readonly ruleTitle: string;
  readonly defaultConfig: AlertConfig;
  readonly ruleMetadata?: RuleMetadata;
  // PromQL rate(metric[Nm]) inner window in ms — chart renders the inner band.
  readonly rateInnerWindow?: number;
  readonly footerSlot?: ReactNode;
};

export type Props = {
  readonly adapter: WhatIfDataSource;
  readonly themeToggleSlot?: ReactNode;
  // Externally-supplied live-mode wiring. When omitted and the adapter
  // implements `listRules`, the Page builds it internally on rule selection.
  readonly liveContext?: LiveContext;
  // `?fromRule=<uid>` deep link.
  readonly initialRuleUid?: string;
  readonly initialPreset?: WhatIfPreset;
  // `?lookback=` deep link.
  readonly initialLookbackSec?: number;
  // `?drill=first|last` — auto-drill into the first/last Firing episode.
  readonly initialDrill?: 'first' | 'last';
  // `?play=1` — auto-replay once samples load.
  readonly initialPlay?: boolean;
  readonly titleLogo?: ReactNode;
};
