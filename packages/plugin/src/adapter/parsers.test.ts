// Pins Grafana's /api/v1/rules JSON shape against the core parsers the adapter
// uses. The network methods are exercised in docker (getBackendSrv is hard to mock).

import { parseRuleStateResponse, parseRulesListResponse } from '@alert-whatif/core';

describe('parseRuleStateResponse', () => {
  test('returns unknown for status=error', () => {
    expect(
      parseRuleStateResponse({ status: 'error', error: 'boom' }, 'any-rule'),
    ).toEqual({ state: 'unknown', lastEvaluationMs: null });
  });

  test('returns unknown when data is missing', () => {
    expect(parseRuleStateResponse({ status: 'success' }, 'any-rule')).toEqual({
      state: 'unknown',
      lastEvaluationMs: null,
    });
  });

  test('returns unknown when rule title is not found', () => {
    const res = parseRuleStateResponse(
      {
        status: 'success',
        data: {
          groups: [
            { rules: [{ name: 'other-rule', state: 'firing' }] },
          ],
        },
      },
      'missing-rule',
    );
    expect(res).toEqual({ state: 'unknown', lastEvaluationMs: null });
  });

  test('returns matched rule state with parsed lastEvaluation', () => {
    const res = parseRuleStateResponse(
      {
        status: 'success',
        data: {
          groups: [
            {
              rules: [
                {
                  name: 'demo-rule',
                  state: 'pending',
                  lastEvaluation: '2026-05-19T10:00:00Z',
                },
              ],
            },
          ],
        },
      },
      'demo-rule',
    );
    expect(res.state).toBe('pending');
    expect(res.lastEvaluationMs).toBe(Date.parse('2026-05-19T10:00:00Z'));
  });

  test('null lastEvaluationMs when lastEvaluation is absent', () => {
    const res = parseRuleStateResponse(
      {
        status: 'success',
        data: {
          groups: [{ rules: [{ name: 'demo-rule', state: 'inactive' }] }],
        },
      },
      'demo-rule',
    );
    expect(res).toEqual({ state: 'inactive', lastEvaluationMs: null });
  });

  test('normalises unknown raw states to "unknown"', () => {
    const res = parseRuleStateResponse(
      {
        status: 'success',
        data: {
          groups: [
            { rules: [{ name: 'demo-rule', state: 'WeirdNewState' }] },
          ],
        },
      },
      'demo-rule',
    );
    expect(res.state).toBe('unknown');
  });

  test('walks across multiple groups to find the rule', () => {
    const res = parseRuleStateResponse(
      {
        status: 'success',
        data: {
          groups: [
            { rules: [{ name: 'unrelated', state: 'firing' }] },
            {
              rules: [
                { name: 'demo-rule', state: 'firing', lastEvaluation: '2026-05-19T10:00:00Z' },
              ],
            },
          ],
        },
      },
      'demo-rule',
    );
    expect(res.state).toBe('firing');
  });
});

describe('parseRulesListResponse', () => {
  test('returns Err for status=error', () => {
    const res = parseRulesListResponse({ status: 'error', error: 'boom' });
    expect(res.kind).toBe('Err');
  });

  test('returns Err when data is missing', () => {
    const res = parseRulesListResponse({ status: 'success' });
    expect(res.kind).toBe('Err');
  });

  test('returns Ok with empty list when no groups', () => {
    const res = parseRulesListResponse({
      status: 'success',
      data: { groups: [] },
    });
    expect(res).toEqual({ kind: 'Ok', value: [] });
  });

  test('skips rules without __alert_rule_uid__ label', () => {
    const res = parseRulesListResponse({
      status: 'success',
      data: {
        groups: [
          {
            rules: [
              { name: 'no-uid-rule', state: 'firing' },
              {
                name: 'with-uid-rule',
                state: 'firing',
                uid: 'abc123',
              },
            ],
          },
        ],
      },
    });
    expect(res.kind).toBe('Ok');
    if (res.kind === 'Ok') {
      expect(res.value).toEqual([
        { uid: 'abc123', title: 'with-uid-rule', state: 'firing' },
      ]);
    }
  });

  test('surfaces folder name from group.file', () => {
    const res = parseRulesListResponse({
      status: 'success',
      data: {
        groups: [
          {
            file: 'tong-sui-ops',
            rules: [
              {
                name: 'demo',
                state: 'firing',
                uid: 'uid1',
              },
            ],
          },
        ],
      },
    });
    expect(res.kind).toBe('Ok');
    if (res.kind === 'Ok') {
      expect(res.value[0]).toEqual({
        uid: 'uid1',
        title: 'demo',
        folder: 'tong-sui-ops',
        state: 'firing',
      });
    }
  });

  test('walks every group', () => {
    const res = parseRulesListResponse({
      status: 'success',
      data: {
        groups: [
          {
            file: 'g1',
            rules: [
              { name: 'a', state: 'firing', uid: 'u1' },
            ],
          },
          {
            file: 'g2',
            rules: [
              { name: 'b', state: 'pending', uid: 'u2' },
            ],
          },
        ],
      },
    });
    expect(res.kind).toBe('Ok');
    if (res.kind === 'Ok') {
      expect(res.value).toHaveLength(2);
      expect(res.value.map((r) => r.uid)).toEqual(['u1', 'u2']);
    }
  });
});
