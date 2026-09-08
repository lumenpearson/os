import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  applyTheme,
  otherTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  systemPrefersDark,
  type Theme,
} from './theme';

/**
 * The page theme: a stored choice, else the system preference (kept in sync
 * while nothing is stored). Writes `data-theme` on <html>, which the tokens
 * read, in a layout effect so children can read the new tokens in their own
 * effects.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    resolveTheme(readStoredTheme(), systemPrefersDark()),
  );
  const chosen = useRef(false);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (chosen.current) storeTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    const follow = (event: MediaQueryListEvent) => {
      if (readStoredTheme() === null) setTheme(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);

  const toggle = useCallback(() => {
    chosen.current = true;
    setTheme((current) => otherTheme(current));
  }, []);

  return [theme, toggle];
}
