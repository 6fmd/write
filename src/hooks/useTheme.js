import { useState, useEffect } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      const stored = window.localStorage.getItem('write-md:theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // ignore
    }
    return window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem('write-md:theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggle = () => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  };

  return { theme, toggle };
}

