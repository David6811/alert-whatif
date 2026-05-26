// Public surface for @alert-whatif/{demo,plugin}. Anything used only within
// packages/ui is imported by relative path, not re-exported here.

export { WhatIfPage, type WhatIfPreset, type ConfigOverrides } from './WhatIfPage';

export { MetricChart } from './chart/MetricChart';
export { ParamControls } from './components/ParamControls';
export { LiveStatusStrip } from './components/LiveStatusStrip';
export { RulePicker } from './components/RulePicker';

export { ThemeToggle } from './components/ThemeToggle';
export { useTheme, type Theme } from './util/use-theme';

export { useLiveMode } from './live/use-live-mode';

export { describeFetchError } from './util/describe-error';

export type { PromQueryRangeResponse } from './data/prometheus-types';

export type {
  Dataset,
  GrafanaAlertState,
  GrafanaRuleObservation,
  RuleSummary,
  WhatIfDataSource,
} from './data/data-source';
export type { RuleMetadata } from './types';
