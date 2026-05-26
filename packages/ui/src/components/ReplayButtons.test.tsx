import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReplayButtons } from './ReplayButtons';

describe('ReplayButtons', () => {
  it('renders the playback speed selector', () => {
    render(
      <ReplayButtons
        tickIndex={0}
        tickCount={10}
        playing={false}
        speed={1}
        onReset={() => {}}
        onStepBack={() => {}}
        onTogglePlay={() => {}}
        onStepForward={() => {}}
        onJumpToEnd={() => {}}
        onSpeedChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Playback speed' })).toBeInTheDocument();
  });
});
