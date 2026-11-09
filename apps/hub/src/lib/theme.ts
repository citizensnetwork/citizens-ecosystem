/**
 * Central's appearance preference.
 *
 * The storage key is `citizens-theme`. System is the default and is stored as the absence of the key, so a
 * cleared storage follows the device. Light and Dark are the only stored values.
 *
 * Connect's map reads the device on its own and clears a legacy `cc_map_theme` key. That key is a different
 * shape, so Central does not write it. A later Connect settings screen can read `citizens-theme`.
 */

export const THEME_STORAGE_KEY = 'citizens-theme';

/** Fired in this tab after the preference changes. `storage` covers other tabs. */
export const THEME_EVENT = 'citizens-theme';

export const THEME_PREFS = ['System', 'Light', 'Dark'] as const;

export type ThemePref = (typeof THEME_PREFS)[number];

/** Paths whose surface follows the preference. The 219 homepage stays light. */
export const THEMED_PATHS = ['/citizens', '/citizens/settings'] as const;

export function themeApplies(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return (THEMED_PATHS as readonly string[]).includes(path);
}

export function readThemePref(value: string | null): ThemePref {
  return value === 'Light' || value === 'Dark' ? value : 'System';
}

export function themeIsDark(pref: ThemePref, systemDark: boolean): boolean {
  return pref === 'Dark' || (pref === 'System' && systemDark);
}

export function persistTheme(
  pref: ThemePref,
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
): void {
  if (pref === 'System') storage.removeItem(THEME_STORAGE_KEY);
  else storage.setItem(THEME_STORAGE_KEY, pref);
}
