import { describe, expect, it } from 'vitest';
import {
  mapAnnotationToBarState,
  mapAnnotationToInitialState,
  normaliseRuleState,
  parseRuleStateResponse,
  parseRulesListResponse,
} from './parse-api';

describe('normaliseRuleState', () => {
  it('passes through the three known states (case-insensitive)', () => {
    expect(normaliseRuleState('Inactive')).toBe('inactive');
    expect(normaliseRuleState('PENDING')).toBe('pending');
    expect(normaliseRuleState('firing')).toBe('firing');
  });

  it('collapses anything else to unknown', () => {
    expect(normaliseRuleState('')).toBe('unknown');
    expect(normaliseRuleState('recovering')).toBe('unknown');
  });
});

describe('mapAnnotationToInitialState', () => {
  it('maps Alerting → Firing', () => {
    expect(mapAnnotationToInitialState('Alerting')).toBe('Firing');
  });

  it('maps NoData variants → NoData', () => {
    expect(mapAnnotationToInitialState('NoData')).toBe('NoData');
    expect(mapAnnotationToInitialState('Normal (NoData)')).toBe('NoData');
  });

  it('collapses Normal and Pending to Normal', () => {
    expect(mapAnnotationToInitialState('Normal')).toBe('Normal');
    expect(mapAnnotationToInitialState('Pending')).toBe('Normal');
  });
});

describe('mapAnnotationToBarState', () => {
  it('keeps Pending distinct (the bar shows the transition story)', () => {
    expect(mapAnnotationToBarState('Pending')).toBe('pending');
    expect(mapAnnotationToBarState('Alerting')).toBe('firing');
    expect(mapAnnotationToBarState('Normal')).toBe('inactive');
    expect(mapAnnotationToBarState('OK')).toBe('inactive');
  });

  it('falls back to unknown for unrecognised labels', () => {
    expect(mapAnnotationToBarState('NoData')).toBe('unknown');
  });
});

describe('parseRuleStateResponse', () => {
  it('returns unknown when the title is not found', () => {
    expect(
      parseRuleStateResponse(
        { status: 'success', data: { groups: [{ rules: [{ name: 'other', state: 'firing' }] }] } },
        'missing',
      ),
    ).toEqual({ state: 'unknown', lastEvaluationMs: null });
  });

  it('returns state + parsed lastEvaluation for the matching rule', () => {
    expect(
      parseRuleStateResponse(
        {
          status: 'success',
          data: {
            groups: [
              {
                rules: [{ name: 'mine', state: 'firing', lastEvaluation: '2026-05-14T14:00:30Z' }],
              },
            ],
          },
        },
        'mine',
      ),
    ).toEqual({ state: 'firing', lastEvaluationMs: Date.parse('2026-05-14T14:00:30Z') });
  });
});

describe('parseRulesListResponse', () => {
  it('errors when status is not success', () => {
    expect(parseRulesListResponse({ status: 'error', error: 'boom' }).kind).toBe('Err');
  });

  it('skips rules without a uid and normalises state', () => {
    const r = parseRulesListResponse({
      status: 'success',
      data: {
        groups: [
          {
            file: 'folderA',
            rules: [
              { name: 'has-uid', state: 'Firing', uid: 'abc' },
              { name: 'no-uid', state: 'inactive' },
            ],
          },
        ],
      },
    });
    expect(r).toEqual({
      kind: 'Ok',
      value: [{ uid: 'abc', title: 'has-uid', folder: 'folderA', state: 'firing' }],
    });
  });
});
