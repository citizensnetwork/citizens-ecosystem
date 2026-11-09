import { useEffect, useState } from 'react';
import { APPEARANCE } from '../../lib/content';
import {
  THEME_EVENT,
  THEME_PREFS,
  THEME_STORAGE_KEY,
  readThemePref,
  type ThemePref,
} from '../../lib/theme';
import { rememberTheme, themeStatus } from './ThemeSync';

/** System, Light or Dark. This is the only place the choice is offered. */
export function ThemeChoice() {
  const [pref, setPref] = useState<ThemePref>('System');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const read = () => {
      try {
        setPref(readThemePref(window.localStorage.getItem(THEME_STORAGE_KEY)));
      } catch {
        setPref('System');
      }
      setSystemDark(media.matches);
    };
    read();
    media.addEventListener('change', read);
    window.addEventListener(THEME_EVENT, read);
    return () => {
      media.removeEventListener('change', read);
      window.removeEventListener(THEME_EVENT, read);
    };
  }, []);

  return (
    <div className="appearance">
      <div className="appearance-row">
        <div>
          <h2>{APPEARANCE.theme}</h2>
          <p>{themeStatus(pref, systemDark)}</p>
        </div>
        <div className="theme-choice" role="group" aria-label={APPEARANCE.theme}>
          {THEME_PREFS.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={pref === choice}
              onClick={() => {
                setPref(choice);
                rememberTheme(choice);
              }}
            >
              {choice === 'System'
                ? APPEARANCE.system
                : choice === 'Light'
                  ? APPEARANCE.light
                  : APPEARANCE.dark}
            </button>
          ))}
        </div>
      </div>
      <p className="appearance-note">{APPEARANCE.note}</p>
    </div>
  );
}
