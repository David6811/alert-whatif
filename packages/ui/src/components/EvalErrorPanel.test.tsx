import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvalErrorPanel } from './EvalErrorPanel';

describe('EvalErrorPanel', () => {
  it('lists each error message', () => {
    render(<EvalErrorPanel errors={['threshold value is required']} />);
    expect(screen.getByText('threshold value is required')).toBeInTheDocument();
  });
});
