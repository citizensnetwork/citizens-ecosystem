import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HourCardView } from '../src/components/door/HourCard';
import { themeStatus } from '../src/components/door/ThemeSync';
import { persistTheme, readThemePref, themeApplies, themeIsDark } from '../src/lib/theme';
import {
  dayBand,
  loadWeather,
  openMeteoUrl,
  parseOpenMeteo,
  pretoriaClock,
  weatherLook,
} from '../src/lib/weather';

describe('theme preference', () => {
  it('follows the device unless Light or Dark was saved, and only on Central and Settings', () => {
    expect(readThemePref(null)).toBe('System');
    expect(readThemePref('Light')).toBe('Light');
    expect(readThemePref('nope')).toBe('System');
    expect(themeIsDark('System', true)).toBe(true);
    expect(themeIsDark('System', false)).toBe(false);
    expect(themeIsDark('Dark', false)).toBe(true);
    expect(themeIsDark('Light', true)).toBe(false);
    expect(themeApplies('/citizens')).toBe(true);
    expect(themeApplies('/citizens/')).toBe(true);
    expect(themeApplies('/citizens/settings')).toBe(true);
    expect(themeApplies('/')).toBe(false);
    expect(themeApplies('/citizens/philosophy')).toBe(false);
  });

  it('stores Light and Dark, and removes the key for System', () => {
    const removed: string[] = [];
    const set: [string, string][] = [];
    const storage = {
      setItem: (key: string, value: string) => set.push([key, value]),
      removeItem: (key: string) => removed.push(key),
    };
    persistTheme('Dark', storage);
    persistTheme('System', storage);
    expect(set).toEqual([['citizens-theme', 'Dark']]);
    expect(removed).toEqual(['citizens-theme']);
  });

  it('describes what the choice is doing', () => {
    expect(themeStatus('System', true)).toContain('dark right now');
    expect(themeStatus('System', false)).toContain('light right now');
    expect(themeStatus('Dark', false)).toContain('Always dark');
    expect(themeStatus('Light', true)).toContain('Always light');
  });
});

describe('Pretoria weather', () => {
  it('asks Open-Meteo for the current hour in Pretoria, with no key', () => {
    const url = new URL(openMeteoUrl());
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('-25.7479');
    expect(url.searchParams.get('longitude')).toBe('28.2293');
    expect(url.searchParams.get('timezone')).toBe('Africa/Johannesburg');
    expect(url.searchParams.get('current')).toContain('weather_code');
  });

  it('maps WMO codes onto the six drawings, and ignores a body with no current hour', () => {
    expect(weatherLook(0, true)).toBe('sun');
    expect(weatherLook(0, false)).toBe('moon');
    expect(weatherLook(2, true)).toBe('partly');
    expect(weatherLook(3, true)).toBe('cloud');
    expect(weatherLook(61, true)).toBe('rain');
    expect(weatherLook(95, false)).toBe('storm');
    expect(parseOpenMeteo(null)).toBeNull();
    expect(parseOpenMeteo({ current: { temperature_2m: '12' } })).toBeNull();
    expect(
      parseOpenMeteo({
        current: { temperature_2m: 12.4, apparent_temperature: 8.2, weather_code: 3, is_day: 1 },
      }),
    ).toEqual({ temp: 12, feels: 8, code: 3, day: true });
  });

  it('reads a clock in South African time', () => {
    const clock = pretoriaClock(new Date('2026-11-09T12:06:00Z'));
    expect(clock.time).toBe('14:06');
    expect(clock.date).toBe('Monday 9 November');
    expect(clock.band).toBe('day');
    expect(dayBand(6)).toBe('dawn');
    expect(dayBand(18)).toBe('dusk');
    expect(dayBand(23)).toBe('night');
    expect(dayBand(Number.NaN)).toBe('night');
  });

  it('returns null when the request fails, and the reading when it succeeds', async () => {
    const fail = loadWeather(async () => new Response('no', { status: 502 }));
    await expect(fail).resolves.toBeNull();
    const ok = loadWeather(async () =>
      Response.json({
        current: { temperature_2m: 21, apparent_temperature: 19, weather_code: 0, is_day: 1 },
      }),
    );
    await expect(ok).resolves.toEqual({ temp: 21, feels: 19, code: 0, day: true });
    const thrown = loadWeather(async () => {
      throw new Error('offline');
    });
    await expect(thrown).resolves.toBeNull();
  });
});

describe('the hour card without a report', () => {
  it('keeps the clock and says the weather is missing, rather than inventing a temperature', () => {
    const markup = renderToStaticMarkup(
      <HourCardView now={new Date('2026-11-09T12:06:00Z')} weather={null} failed />,
    );
    expect(markup).toContain('14:06');
    expect(markup).toContain('Pretoria');
    expect(markup).toContain('Weather is unavailable right now');
    expect(markup).not.toContain('°C');
  });

  it('shows the temperature once a report arrives', () => {
    const markup = renderToStaticMarkup(
      <HourCardView
        now={new Date('2026-11-09T12:06:00Z')}
        weather={{ temp: 12, feels: 8, code: 3, day: true }}
        failed={false}
      />,
    );
    expect(markup).toContain('12°C');
    expect(markup).toContain('Cloudy');
    expect(markup).toContain('feels like 8°C');
  });
});
