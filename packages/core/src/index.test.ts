import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index';

describe('@alert-whatif/core', () => {
  it('exposes a CORE_VERSION constant matching the package version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
