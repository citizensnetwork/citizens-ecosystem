import { useEffect, useState } from 'react';
import { PATH_ROOT } from '@citizens/ecosystem';
import { CENTRAL } from '../../lib/content';
import type { DayBand, WeatherLook, WeatherNow } from '../../lib/weather';
import {
  PRETORIA,
  WEATHER_WORDS,
  loadWeather,
  pretoriaClock,
  weatherLook,
} from '../../lib/weather';

export function HourCard() {
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const clock = window.setInterval(tick, 20000);
    const controller = new AbortController();
    loadWeather(fetch, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      if (next) setWeather(next);
      else setFailed(true);
    });
    return () => {
      window.clearInterval(clock);
      controller.abort();
    };
  }, []);

  return <HourCardView now={now} weather={weather} failed={failed} />;
}

export function HourCardView({
  now,
  weather,
  failed,
}: {
  now: Date | null;
  weather: WeatherNow | null;
  failed: boolean;
}) {
  const clock = now ? pretoriaClock(now) : null;
  const look: WeatherLook = weather
    ? weatherLook(weather.code, weather.day)
    : clock?.band === 'night'
      ? 'moon'
      : 'cloud';
  const band: DayBand = clock?.band ?? 'day';
  return (
    <article
      className="glass hour-card"
      data-look={look}
      data-band={band}
      aria-label={`This hour in ${PRETORIA.label}`}
    >
      <p className="kicker">
        <a className="app-kicker" href={PATH_ROOT}>
          Central
        </a>
        {' · '}
        {CENTRAL.hourKicker}
      </p>
      <div className="hour-time">
        <b>{clock ? clock.time : '—'}</b>
        <small>
          {PRETORIA.label}
          {clock ? ` · ${clock.date}` : ''}
        </small>
      </div>
      <div className="hour-weather">
        <span className={`hour-art wx wx-${look}`}>
          <WeatherArt look={look} />
        </span>
        <div>
          {weather ? (
            <>
              <b>{weather.temp}°C</b>
              <span>
                {WEATHER_WORDS[look]} · feels like {weather.feels}°C
              </span>
            </>
          ) : (
            <span>{failed ? 'Weather is unavailable right now' : 'Weather is loading'}</span>
          )}
        </div>
      </div>
      <small className="hour-note">
        {weather ? 'Conditions now' : failed ? 'No weather report' : 'Waiting for the weather'} ·
        time is live (SAST)
      </small>
    </article>
  );
}

function WeatherArt({ look }: { look: WeatherLook }) {
  const cloud = (
    <path
      className="wx-cloud"
      d="M7 19H16.5A4.5 4.5 0 0 0 17.2 10.06 6 6 0 0 0 5.74 12.2 3.5 3.5 0 0 0 7 19Z"
    />
  );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {look === 'sun' ? (
        <g className="wx-sun">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3V4.5M12 19.5V21M3 12H4.5M19.5 12H21M5.6 5.6 6.7 6.7M17.3 17.3 18.4 18.4M5.6 18.4 6.7 17.3M17.3 6.7 18.4 5.6" />
        </g>
      ) : null}
      {look === 'moon' ? (
        <path className="wx-moon" d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" />
      ) : null}
      {look === 'partly' ? (
        <>
          <path
            className="wx-sun"
            d="M8.5 3V4M3 8.5H4M4.6 4.6 5.3 5.3M12.4 4.6 11.7 5.3M5.4 11.2A3.5 3.5 0 1 1 11.6 7.6"
          />
          {cloud}
        </>
      ) : null}
      {look === 'rain' ? (
        <>
          {cloud}
          <path className="wx-rain" d="M9 22 9.5 21M13 22 13.5 21" />
        </>
      ) : null}
      {look === 'storm' ? (
        <>
          {cloud}
          <path className="wx-sun" d="M12.5 13 10.5 16.5H13.5L11.5 20" />
        </>
      ) : null}
      {look === 'cloud' ? cloud : null}
    </svg>
  );
}
