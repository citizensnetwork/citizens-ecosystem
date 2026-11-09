// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HourCard } from '../src/components/door/HourCard';
import { ThemeChoice } from '../src/components/door/ThemeChoice';
import { ThemeSync } from '../src/components/door/ThemeSync';

function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  return { host, root };
}

describe('Central in the browser', () => {
  let root: Root | undefined;

  beforeEach(() => {
    window.history.pushState({}, '', '/citizens');
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('dark'),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          current: { temperature_2m: 18.2, apparent_temperature: 16.4, weather_code: 1, is_day: 1 },
        }),
      ),
    );
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('reads the weather when the hour card mounts, and keeps going if the request fails', async () => {
    const view = mount(<HourCard />);
    root = view.root;
    await act(async () => {
      root?.render(<HourCard />);
    });
    expect(view.host.textContent).toContain('18°C');
    expect(view.host.textContent).toContain('Partly cloudy');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 500 })),
    );
    const again = mount(<HourCard />);
    await act(async () => {
      again.root.render(<HourCard />);
    });
    expect(again.host.textContent).toContain('Weather is unavailable right now');
    act(() => again.root.unmount());
  });

  it('saves Light, Dark and System from Settings and paints the document', async () => {
    const view = mount(
      <>
        <ThemeSync />
        <ThemeChoice />
      </>,
    );
    root = view.root;
    await act(async () => {
      root?.render(
        <>
          <ThemeSync />
          <ThemeChoice />
        </>,
      );
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const dark = [...view.host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Dark',
    );
    await act(async () => {
      dark?.click();
    });
    expect(localStorage.getItem('citizens-theme')).toBe('Dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const light = [...view.host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Light',
    );
    await act(async () => {
      light?.click();
    });
    expect(localStorage.getItem('citizens-theme')).toBe('Light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    const system = [...view.host.querySelectorAll('button')].find(
      (button) => button.textContent === 'System',
    );
    await act(async () => {
      system?.click();
    });
    expect(localStorage.getItem('citizens-theme')).toBeNull();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
