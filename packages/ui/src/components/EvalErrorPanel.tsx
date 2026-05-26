// The validator's Err arm as a red list, shown when `evaluate()` rejects config.

import React from 'react';
import { cardHeadingStyle, cardStyle, errorTextStyle } from '../styles';

export function EvalErrorPanel({ errors }: { readonly errors: ReadonlyArray<string> }) {
  return (
    <section style={cardStyle}>
      <h2 style={{ ...cardHeadingStyle, ...errorTextStyle }}>Configuration rejected</h2>
      <p style={errorTextStyle}>Evaluator rejected the current config:</p>
      <ul style={{ color: 'var(--text-primary)', marginTop: 0 }}>
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </section>
  );
}
