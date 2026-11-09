/**
 * Pretoria conditions for Central's hour card, read from Open-Meteo when the feed opens.
 * No key, no schedule. A failed or empty response is "no weather", and the clock still runs.
 */

export const PRETORIA = {
  latitude: -25.7479,
  longitude: 28.2293,
  timezone: 'Africa/Johannesburg',
  label: 'Pretoria',
} as const;

export type DayBand = 'dawn' | 'day' | 'dusk' | 'night';

export type WeatherLook = 'sun' | 'moon' | 'partly' | 'cloud' | 'rain' | 'storm';

export const WEATHER_WORDS: Record<WeatherLook, string> = {
  sun: 'Clear',
  moon: 'Clear night',
  partly: 'Partly cloudy',
  cloud: 'Cloudy',
  rain: 'Rain',
  storm: 'Thunderstorms',
};

export interface WeatherNow {
  code: number;
  temp: number;
  feels: number;
  day: boolean;
}

/** WMO weather code plus whether it is daytime, to one of the six drawings. */
export function weatherLook(code: number, day: boolean): WeatherLook {
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 71 && code <= 82)) return 'rain';
  if (code === 0) return day ? 'sun' : 'moon';
  if (code <= 2) return day ? 'partly' : 'moon';
  return 'cloud';
}

export function dayBand(hour: number): DayBand {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

export function pretoriaClock(now: Date): { time: string; date: string; band: DayBand } {
  const zone = PRETORIA.timezone;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', hour12: false }).format(
      now,
    ),
  );
  return {
    time,
    date: `${part('weekday')} ${part('day')} ${part('month')}`,
    band: dayBand(Number.isFinite(hour) ? hour % 24 : 0),
  };
}

export function openMeteoUrl(): string {
  const query = new URLSearchParams({
    latitude: String(PRETORIA.latitude),
    longitude: String(PRETORIA.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    timezone: PRETORIA.timezone,
  });
  return `https://api.open-meteo.com/v1/forecast?${query.toString()}`;
}

function numberAt(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Pull the current hour from an Open-Meteo forecast body, or null when it is not usable. */
export function parseOpenMeteo(body: unknown): WeatherNow | null {
  if (!body || typeof body !== 'object') return null;
  const current = (body as { current?: unknown }).current;
  if (!current || typeof current !== 'object') return null;
  const record = current as Record<string, unknown>;
  const temp = numberAt(record, 'temperature_2m');
  const feels = numberAt(record, 'apparent_temperature');
  const code = numberAt(record, 'weather_code');
  if (temp === null || feels === null || code === null) return null;
  return {
    temp: Math.round(temp),
    feels: Math.round(feels),
    code,
    day: record.is_day !== 0,
  };
}

export async function loadWeather(
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<WeatherNow | null> {
  try {
    const response = await fetchImpl(openMeteoUrl(), { signal });
    if (!response.ok) return null;
    return parseOpenMeteo(await response.json());
  } catch {
    return null;
  }
}
