import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveStatusStrip } from './LiveStatusStrip';

describe('LiveStatusStrip', () => {
  it('renders the What-If state pill in mock mode', () => {
    render(
      <LiveStatusStrip
        mode="mock"
        ourState="Firing"
        replayButtons={null}
        tickIndex={3}
        tickCount={10}
      />,
    );
    expect(screen.getByText('What-If')).toBeInTheDocument();
    expect(screen.getByText('Firing')).toBeInTheDocument();
  });

  it('shows the match indicator when grafana and our state agree', () => {
    render(
      <LiveStatusStrip
        mode="mock"
        ourState="Firing"
        grafanaState="firing"
        replayButtons={null}
        tickIndex={3}
        tickCount={10}
      />,
    );
    expect(screen.getByLabelText('match')).toBeInTheDocument();
  });

  it('shows the divergence indicator when grafana and our state disagree', () => {
    render(
      <LiveStatusStrip
        mode="mock"
        ourState="Normal"
        grafanaState="firing"
        replayButtons={null}
        tickIndex={3}
        tickCount={10}
      />,
    );
    expect(screen.getByLabelText('diverged')).toBeInTheDocument();
  });
});
