import { useEffect } from 'react';
import { APPEARANCE } from '../../lib/content';
import {
  THEME_EVENT,
  THEME_STORAGE_KEY,
  persistTheme,
  readThemePref,
  themeApplies,
  themeIsDark,
  type ThemePref,
} from '../../lib/theme';

function systemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function storedPref(): ThemePref {
  try {
    return readThemePref(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'System';
  }
}

/** Paint `data-theme` on the document. The 219 homepage ignores it and stays light. */
export function paintTheme(pref: ThemePref, systemDark: boolean): void {
  const themed = themeApplies(window.location.pathname);
  const dark = themed && themeIsDark(pref, systemDark);
  const root = document.documentElement;
  const next = dark ? 'dark' : 'light';
  const previous = root.getAttribute('data-theme');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (previous && previous !== next && !reduce) {
    root.setAttribute('data-fade', '');
    window.setTimeout(() => root.removeAttribute('data-fade'), 360);
  }
  root.setAttribute('data-theme', next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && themed) meta.setAttribute('content', dark ? '#1b1c18' : '#f7f6f1');
}

export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const run = () => paintTheme(storedPref(), media.matches);
    run();
    media.addEventListener('change', run);
    window.addEventListener(THEME_EVENT, run);
    window.addEventListener('storage', run);
    return () => {
      media.removeEventListener('change', run);
      window.removeEventListener(THEME_EVENT, run);
      window.removeEventListener('storage', run);
    };
  }, []);
  return null;
}

export function rememberTheme(pref: ThemePref): void {
  try {
    persistTheme(pref, window.localStorage);
  } catch {
    /* Private mode: the choice lasts for this view only. */
  }
  paintTheme(pref, systemIsDark());
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function themeStatus(pref: ThemePref, systemDark: boolean): string {
  if (pref === 'Dark') return APPEARANCE.alwaysDark;
  if (pref === 'Light') return APPEARANCE.alwaysLight;
  return systemDark ? APPEARANCE.systemDark : APPEARANCE.systemLight;
}
