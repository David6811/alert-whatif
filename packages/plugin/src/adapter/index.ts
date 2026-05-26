import type { WhatIfDataSource } from '@alert-whatif/ui';
import { capabilities } from './capabilities';
import { fetchSamples } from './samples';
import { fetchRuleState, listRules, fetchRuleByUid } from './rules';
import { fetchInitialAlertState, fetchAlertHistory } from './annotations';

export const grafanaAdapter: WhatIfDataSource = {
  capabilities,
  fetchSamples,
  fetchRuleState,
  fetchRuleByUid,
  listRules,
  fetchInitialAlertState,
  fetchAlertHistory,
};
