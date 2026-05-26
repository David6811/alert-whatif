import type { WhatIfDataSource } from '@alert-whatif/ui';

export const capabilities: WhatIfDataSource['capabilities'] = {
  fixtures: false,
  live: true,
  grafanaStateOracle: true,
  fetchRuleByUid: true,
  fetchRuleList: true,
  initialStateOracle: true,
  alertHistoryOracle: true,
  snapshot: true,
};
