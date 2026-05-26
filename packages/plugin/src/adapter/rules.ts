import { describeFetchError, type WhatIfDataSource } from '@alert-whatif/ui';
import {
  legacyRuleToV0Alpha1,
  parseRulesListResponse,
  parseRuleStateResponse,
  type GrafanaRulesResponse,
  type LegacyGroup,
  type LegacyRule,
} from '@alert-whatif/core';
import { api } from './http';

const RULES_URL = '/api/prometheus/grafana/api/v1/rules';

export const fetchRuleState: NonNullable<WhatIfDataSource['fetchRuleState']> = async (ruleTitle) => {
  try {
    return parseRuleStateResponse(await api<GrafanaRulesResponse>({ url: RULES_URL, method: 'GET' }), ruleTitle);
  } catch {
    return { state: 'unknown', lastEvaluationMs: null };
  }
};

export const listRules: NonNullable<WhatIfDataSource['listRules']> = async () => {
  try {
    return parseRulesListResponse(await api<GrafanaRulesResponse>({ url: RULES_URL, method: 'GET' }));
  } catch (e) {
    return { kind: 'Err', errors: [describeFetchError(e)] };
  }
};

export const fetchRuleByUid: NonNullable<WhatIfDataSource['fetchRuleByUid']> = (uid) =>
  fetchLegacyRuleByUid(uid);

async function fetchLegacyRuleByUid(uid: string): Promise<unknown | null> {
  let rule: LegacyRule;
  try {
    rule = await api<LegacyRule>({
      url: `/api/v1/provisioning/alert-rules/${encodeURIComponent(uid)}`,
      method: 'GET',
    });
  } catch {
    return null;
  }

  let intervalSec = 60;
  try {
    const group = await api<LegacyGroup>({
      url: `/api/v1/provisioning/folder/${encodeURIComponent(rule.folderUID)}/rule-groups/${encodeURIComponent(rule.ruleGroup)}`,
      method: 'GET',
    });
    if (Number.isFinite(group.interval) && group.interval > 0) {
      intervalSec = group.interval;
    }
  } catch {
    // fall back to the 60s default
  }

  return legacyRuleToV0Alpha1(rule, intervalSec);
}
