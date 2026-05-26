import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModeToggle } from './ModeToggle';

describe('ModeToggle', () => {
  it('renders the What-If and Live mode options', () => {
    render(<ModeToggle mode="mock" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'What-If' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Live' })).toBeInTheDocument();
  });
});
