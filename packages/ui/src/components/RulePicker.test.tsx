import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RuleSummary } from '../data/data-source';
import { RulePicker } from './RulePicker';

const rules: ReadonlyArray<RuleSummary> = [
  { uid: 'rule-1', title: 'High CPU', state: 'firing' },
];

describe('RulePicker', () => {
  it('renders a rule option', () => {
    render(
      <RulePicker
        rules={rules}
        selectedUid="rule-1"
        onSelect={() => {}}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByRole('option', { name: '🔴 High CPU' })).toBeInTheDocument();
  });
});
