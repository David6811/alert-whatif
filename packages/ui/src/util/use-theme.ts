// localStorage theme hook (defaults 'dark'); publishes to <html data-theme>.

import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'alert-whatif:theme';

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

export function useTheme(): readonly [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme] as const;
}
