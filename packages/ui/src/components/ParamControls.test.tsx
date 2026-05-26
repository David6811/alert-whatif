import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { AlertConfig, Threshold } from '@alert-whatif/core';
import { ParamControls } from './ParamControls';

const config: AlertConfig = {
  threshold: { op: 'Gt', value: 10 },
  forDuration: 60_000,
  keepFiringFor: 0,
  evaluationInterval: 60_000,
  windowDuration: 60_000,
  reducer: 'Mean',
  nanMode: { kind: 'None' },
  noDataState: 'NoData',
  execErrState: 'Error',
  instant: false,
  intervalMs: 15_000,
  maxDataPoints: 100,
};

describe('ParamControls', () => {
  it('renders the threshold, for, and reducer controls', () => {
    render(
      <ParamControls config={config} onChange={() => {}} onApply={() => {}} onReset={() => {}} />,
    );
    expect(screen.getByText('for')).toBeInTheDocument();
    expect(screen.getByText('reducer')).toBeInTheDocument();
    expect(screen.getByText('evaluator.type')).toBeInTheDocument();
  });

  it('converts the threshold to a range shape when switching to a range op', async () => {
    const user = userEvent.setup();
    let received: AlertConfig | null = null;
    render(
      <ParamControls
        config={config}
        onChange={(next) => {
          received = next;
        }}
        onApply={() => {}}
        onReset={() => {}}
      />,
    );

    const opSelect = screen
      .getAllByRole('combobox')
      .find((el) => el.querySelector('option[value="WithinRange"]') !== null)!;
    await user.selectOptions(opSelect, 'WithinRange');

    expect(received).not.toBeNull();
    const threshold = (received as unknown as AlertConfig).threshold as Threshold;
    expect(threshold).toEqual({ op: 'WithinRange', left: 10, right: 10 });
  });
});
