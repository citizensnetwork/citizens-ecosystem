/**
 * Serving areas, the screen (`src/frontend/app/serving-areas.jsx`, issue #259).
 *
 * The real components, mounted with the real React in jsdom, against stand-ins for the public area index, `authedFetch` and the
 * toast. What this pins down is the founder's selection rule as a person meets it: opening an area ticks nothing; a tick means
 * that area and everything inside it and never goes upward (a parent of a chosen area only shows a neutral marker); the distance
 * is disabled, with a one-line reason, until an area is chosen; the summary line says exactly what was chosen; the Online / No
 * fixed place tag is the owner's; a save sends the exact choice and every failure is plain words. The rules themselves are in
 * servingAreasLib.test.ts; the database side is proved by docs/audit/probes/195_service_areas.probe.sql.
 */
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GP = U(1),
  KZN = U(2),
  PTA = U(3),
  CEN = U(4),
  ELD = U(5),
  HAT = U(6);
const area = (id: string, name: string, level: string, parent: string | null) => ({
  id,
  name,
  level,
  parent_id: parent,
  slug: name.toLowerCase(),
  sort: 0,
});
const PROVINCES_AND_PLACES = [
  area(GP, 'Gauteng', 'province', null),
  area(KZN, 'KwaZulu-Natal', 'province', null),
  area(PTA, 'Pretoria', 'place', GP),
  area(CEN, 'Centurion', 'place', GP),
];
const SUBURBS = [area(ELD, 'Eldoraigne', 'suburb', CEN), area(HAT, 'Hatfield', 'suburb', PTA)];
const ALL = [...PROVINCES_AND_PLACES, ...SUBURBS];

type Strs = {
  summaryNone: string;
  suburbsHint: string;
  containsChosen: string;
  includes: string;
  noMatches: string;
  loading: string;
  loadError: string;
  retry: string;
  saved: string;
  tickAll: (n: string) => string;
  tick: (n: string) => string;
  tooMany: (n: number) => string;
  radius: { needsArea: string; hint: string };
  errors: { slowDown: string };
};
type Win = Record<string, unknown> & {
  CCServing: Record<string, (...a: unknown[]) => unknown>;
  ServingAreas: {
    Picker: React.ComponentType<Record<string, unknown>>;
    Field: React.ComponentType<Record<string, unknown>>;
    Editor: React.ComponentType<Record<string, unknown>>;
  };
  MapV2Strings: { serving: Strs; online: { tag: { online: string; noFixedPlace: string } } };
};
let W: Win;

function load(file: string) {
  const src = readFileSync(join(process.cwd(), 'src/frontend/app', file), 'utf8');
  new Function('window', 'React', 'document', src)(window, React, document);
}
beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  function Icon({ name }: { name: string }) {
    return React.createElement('i', { 'data-icon': name });
  }
  const cx = (...a: unknown[]) => a.filter(Boolean).join(' ');
  function Button({
    children,
    icon,
    variant,
    size,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) {
    void icon;
    void variant;
    void size;
    return React.createElement('button', { type: 'button', ...rest }, children);
  }
  w.Icon = Icon;
  w.UI = { cx, Button };
  load('map-v2-strings.jsx');
  load('serving-areas-lib.jsx');
  load('serving-areas.jsx');
  W = window as unknown as Win;
});

/** The public area index, answered from memory: provinces and places by default, children by parent, suburbs by level. */
function installIndex(opts: { fail?: boolean; all?: unknown[] } = {}) {
  const calls: string[] = [];
  const all = (opts.all ?? ALL) as ReturnType<typeof area>[];
  const f = vi.fn((path: string) => {
    calls.push(path);
    if (opts.fail)
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const url = new URL(path, 'http://localhost');
    const parent = url.searchParams.get('parent');
    const level = url.searchParams.get('level');
    const data = parent
      ? all.filter((a) => a.parent_id === parent)
      : level
        ? all.filter((a) => a.level === level)
        : all.filter((a) => a.level !== 'suburb');
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data }) });
  });
  vi.stubGlobal('fetch', f);
  return { f, calls };
}
beforeEach(() => cleanup());
afterEach(() => vi.unstubAllGlobals());

const S = () => W.MapV2Strings.serving;
const tick = (id: string) =>
  document.querySelector(`[data-serving-tick="${id}"]`) as HTMLButtonElement;
const expander = (id: string) =>
  document.querySelector(`[data-serving-expand="${id}"]`) as HTMLButtonElement;
const rowOf = (id: string) =>
  document.querySelector(`[data-serving-row="${id}"]`) as HTMLElement | null;
const summary = () => (document.querySelector('[data-serving-summary]') as HTMLElement).textContent;
const chip = (km: string) =>
  document.querySelector(`[data-serving-radius-km="${km}"]`) as HTMLButtonElement;
const checked = (id: string) => tick(id).getAttribute('aria-checked');

/** The controlled picker with real state, and its latest selection exposed. */
function Harness({
  initial,
  onChangeSpy,
  onLimit,
  onExpand,
}: {
  initial?: unknown;
  onChangeSpy?: (s: unknown) => void;
  onLimit?: () => void;
  onExpand?: (id: string) => void;
}) {
  const C = W.CCServing as unknown as {
    buildIndex: (a: unknown) => unknown;
    emptySelection: () => unknown;
  };
  const index = React.useMemo(() => C.buildIndex(ALL), [C]);
  const [value, setValue] = React.useState(initial ?? C.emptySelection());
  return React.createElement(W.ServingAreas.Picker, {
    index,
    state: 'ready',
    value,
    loadingKids: {},
    onExpand,
    onLimit,
    onChange: (s: unknown) => {
      setValue(s);
      onChangeSpy?.(s);
    },
  });
}
const openAll = () => {
  fireEvent.click(expander(GP));
  fireEvent.click(expander(CEN));
  fireEvent.click(expander(PTA));
};

describe('opening an area is not ticking it', () => {
  it('shows the provinces first, each with a chevron to open it and, separately, a checkbox to serve it', () => {
    render(React.createElement(Harness));
    expect(rowOf(GP)).not.toBeNull();
    expect(rowOf(CEN)).toBeNull(); // nothing inside is shown until opened
    expect(expander(GP).getAttribute('aria-expanded')).toBe('false');
    expect(tick(GP).getAttribute('role')).toBe('checkbox');
    expect(checked(GP)).toBe('false');
  });
  it('opening Gauteng shows its cities and towns and ticks nothing', () => {
    const spy = vi.fn();
    render(React.createElement(Harness, { onChangeSpy: spy }));
    fireEvent.click(expander(GP));
    expect(expander(GP).getAttribute('aria-expanded')).toBe('true');
    expect(rowOf(CEN)).not.toBeNull();
    expect(rowOf(PTA)).not.toBeNull();
    expect(checked(GP)).toBe('false');
    expect(checked(CEN)).toBe('false');
    expect(spy).not.toHaveBeenCalled();
    expect(summary()).toBe(S().summaryNone);
  });
  it("asks for a city's suburbs only when the city is opened, and never for a province", () => {
    const onExpand = vi.fn();
    render(React.createElement(Harness, { onExpand }));
    fireEvent.click(expander(GP));
    expect(onExpand).not.toHaveBeenCalled();
    fireEvent.click(expander(CEN));
    expect(onExpand).toHaveBeenCalledWith(CEN);
  });
  it('offers an optional suburbs list under a city, and says so when there are none', () => {
    render(React.createElement(Harness));
    openAll();
    expect(screen.getAllByText(S().suburbsHint).length).toBeGreaterThan(0);
    expect(rowOf(ELD)).not.toBeNull();
  });
});

describe('a tick means that area and everything inside it, and never goes upward', () => {
  it('choosing Eldoraigne chooses only Eldoraigne: Centurion and Gauteng stay unticked and only show the neutral marker', () => {
    const spy = vi.fn();
    render(React.createElement(Harness, { onChangeSpy: spy }));
    openAll();
    fireEvent.click(tick(ELD));
    expect(checked(ELD)).toBe('true');
    expect(checked(CEN)).toBe('false');
    expect(checked(GP)).toBe('false');
    expect(checked(PTA)).toBe('false');
    expect((spy.mock.calls.at(-1)![0] as { areaIds: string[] }).areaIds).toEqual([ELD]);
    // the display-only marker: a screen-reader note on the parents, no tick
    expect(within(rowOf(CEN)!).getAllByText(S().containsChosen).length).toBe(1);
    expect(within(rowOf(GP)!).getAllByText(S().containsChosen).length).toBeGreaterThan(0);
    expect(summary()).toBe('Serving: Eldoraigne');
  });
  it("choosing Pretoria says it covers everything inside, and reads 'all of Pretoria'", () => {
    render(React.createElement(Harness));
    openAll();
    fireEvent.click(tick(PTA));
    expect(within(rowOf(PTA)!).getByText(S().includes)).toBeTruthy();
    expect(checked(HAT)).toBe('false'); // its suburbs are covered by the tick, not ticked one by one
    expect(summary()).toBe('Serving: all of Pretoria');
  });
  it("labels each checkbox for a screen reader: 'Serve all of …' for a city, 'Serve …' for a suburb", () => {
    render(React.createElement(Harness));
    openAll();
    expect(tick(PTA).getAttribute('aria-label')).toBe(S().tickAll('Pretoria'));
    expect(tick(ELD).getAttribute('aria-label')).toBe(S().tick('Eldoraigne'));
  });
  it('unticking removes exactly that area', () => {
    render(
      React.createElement(Harness, {
        initial: {
          areaIds: [PTA, ELD],
          radiusKm: null,
          radiusCentreAreaId: null,
          presence: 'online',
        },
      }),
    );
    openAll();
    fireEvent.click(tick(ELD));
    expect(checked(ELD)).toBe('false');
    expect(checked(PTA)).toBe('true');
  });
  it('every target is at least 44 px tall and wide', () => {
    render(React.createElement(Harness));
    openAll();
    for (const el of [expander(GP), tick(GP), tick(ELD)])
      expect(el.className).toMatch(/min-h-\[44px\]/);
    expect(expander(GP).className).toMatch(/min-w-\[44px\]/);
    expect(tick(GP).className).toMatch(/min-w-\[44px\]/);
    expect(chip('25').className).toMatch(/min-h-\[44px\]/);
    expect(document.querySelector('[data-serving-presence]')!.className).toMatch(/min-h-\[44px\]/);
  });
});

describe('the distance is an add-on that needs a centre', () => {
  it('is disabled, with a one-line reason, until an area is chosen', () => {
    render(React.createElement(Harness));
    const box = document.querySelector('[data-serving-radius]') as HTMLElement;
    expect(box.getAttribute('data-serving-radius')).toBe('disabled');
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(S().radius.needsArea)).toBeTruthy();
    for (const km of ['off', '10', '25', '50', '100']) expect(chip(km).disabled).toBe(true);
  });
  it('opens up once an area is chosen, and measures from the most specific chosen area', () => {
    const spy = vi.fn();
    render(React.createElement(Harness, { onChangeSpy: spy }));
    openAll();
    fireEvent.click(tick(PTA));
    fireEvent.click(tick(ELD));
    expect(
      (document.querySelector('[data-serving-radius]') as HTMLElement).getAttribute(
        'data-serving-radius',
      ),
    ).toBe('enabled');
    expect(screen.queryByText(S().radius.needsArea)).toBeNull();
    fireEvent.click(chip('50'));
    expect(chip('50').getAttribute('aria-checked')).toBe('true');
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ radiusKm: 50, radiusCentreAreaId: ELD });
    expect(screen.getByText(S().radius.hint)).toBeTruthy();
  });
  it('with two chosen areas the owner can pick which one it is measured from', () => {
    const spy = vi.fn();
    render(React.createElement(Harness, { onChangeSpy: spy }));
    openAll();
    fireEvent.click(tick(PTA));
    fireEvent.click(tick(CEN));
    fireEvent.click(chip('25'));
    const sel = document.querySelector('[data-serving-centre]') as HTMLSelectElement;
    expect(sel).not.toBeNull();
    fireEvent.change(sel, { target: { value: PTA } });
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ radiusKm: 25, radiusCentreAreaId: PTA });
  });
  it('shows no centre picker for a single chosen area', () => {
    render(React.createElement(Harness));
    fireEvent.click(tick(GP));
    fireEvent.click(chip('10'));
    expect(document.querySelector('[data-serving-centre]')).toBeNull();
  });
  it('closes again by itself when the last area is unticked', () => {
    const spy = vi.fn();
    render(React.createElement(Harness, { onChangeSpy: spy }));
    fireEvent.click(tick(GP));
    fireEvent.click(chip('100'));
    fireEvent.click(tick(GP));
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({
      areaIds: [],
      radiusKm: null,
      radiusCentreAreaId: null,
    });
    expect(
      (document.querySelector('[data-serving-radius]') as HTMLElement).getAttribute(
        'data-serving-radius',
      ),
    ).toBe('disabled');
  });
  it('Off clears the distance', () => {
    const spy = vi.fn();
    render(React.createElement(Harness, { onChangeSpy: spy }));
    fireEvent.click(tick(GP));
    fireEvent.click(chip('25'));
    fireEvent.click(chip('off'));
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ radiusKm: null });
  });
});

describe('how people find you', () => {
  it('is online by default, and the owner can choose No fixed place (a mobile ministry is never labelled Online)', () => {
    const spy = vi.fn();
    render(React.createElement(Harness, { onChangeSpy: spy }));
    const online = document.querySelector('[data-serving-presence="online"]') as HTMLElement;
    const mobile = document.querySelector(
      '[data-serving-presence="no_fixed_place"]',
    ) as HTMLElement;
    expect(online.getAttribute('aria-checked')).toBe('true');
    expect(mobile.getAttribute('aria-checked')).toBe('false');
    expect(within(online).getByText(W.MapV2Strings.online.tag.online)).toBeTruthy();
    expect(within(mobile).getByText(W.MapV2Strings.online.tag.noFixedPlace)).toBeTruthy();
    fireEvent.click(mobile);
    expect(mobile.getAttribute('aria-checked')).toBe('true');
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({ presence: 'no_fixed_place' });
  });
});

describe('the cap and the search', () => {
  it('says so, calmly, when someone tries to choose a 21st area, and changes nothing', () => {
    const many = Array.from({ length: 21 }, (_, i) =>
      area(U(100 + i), 'Province ' + String.fromCharCode(65 + i), 'province', null),
    );
    const C = W.CCServing as unknown as {
      buildIndex: (a: unknown) => unknown;
      emptySelection: () => unknown;
    };
    const index = C.buildIndex(many);
    const onLimit = vi.fn();
    const onChange = vi.fn();
    const full = {
      areaIds: many.slice(0, 20).map((a) => a.id),
      radiusKm: null,
      radiusCentreAreaId: null,
      presence: 'online',
    };
    render(
      React.createElement(W.ServingAreas.Picker, {
        index,
        state: 'ready',
        value: full,
        onChange,
        onLimit,
        loadingKids: {},
      }),
    );
    fireEvent.click(tick(many[20]!.id));
    expect(screen.getByRole('alert').textContent).toBe(S().tooMany(20));
    expect(onLimit).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('finds an area by name and lets it be chosen from the results, with its city shown', () => {
    const spy = vi.fn();
    render(React.createElement(Harness, { onChangeSpy: spy }));
    fireEvent.change(document.querySelector('[data-serving-search]')!, {
      target: { value: 'eldo' },
    });
    expect(rowOf(ELD)).not.toBeNull();
    expect(rowOf(GP)).toBeNull();
    expect(within(rowOf(ELD)!).getByText('· Centurion')).toBeTruthy();
    fireEvent.click(tick(ELD));
    expect((spy.mock.calls.at(-1)![0] as { areaIds: string[] }).areaIds).toEqual([ELD]);
  });
  it('says so when nothing matches', () => {
    render(React.createElement(Harness));
    fireEvent.change(document.querySelector('[data-serving-search]')!, {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText(S().noMatches)).toBeTruthy();
  });
});

describe('loading and failing', () => {
  it('shows a status while loading and an alert with a retry on failure, and no list', () => {
    const C = W.CCServing as unknown as {
      buildIndex: (a: unknown) => unknown;
      emptySelection: () => unknown;
    };
    const index = C.buildIndex([]);
    const { rerender } = render(
      React.createElement(W.ServingAreas.Picker, {
        index,
        state: 'loading',
        value: C.emptySelection(),
        onChange: vi.fn(),
      }),
    );
    expect(screen.getByRole('status').textContent).toContain(S().loading);
    expect(document.querySelector('[data-serving-list]')).toBeNull();
    const retry = vi.fn();
    rerender(
      React.createElement(W.ServingAreas.Picker, {
        index,
        state: 'error',
        value: C.emptySelection(),
        onChange: vi.fn(),
        onRetry: retry,
      }),
    );
    fireEvent.click(screen.getByText(S().retry));
    expect(screen.getByRole('alert').textContent).toContain(S().loadError);
    expect(retry).toHaveBeenCalled();
    expect(document.querySelector('[data-serving-radius]')).toBeNull();
  });
});

describe('inside a form (the Apply wizard)', () => {
  it('loads the area index itself, hands back the choice AND its plain-words summary, and shows no map', async () => {
    const { calls } = installIndex();
    const onChange = vi.fn();
    const C = W.CCServing as unknown as { emptySelection: () => unknown };
    render(React.createElement(W.ServingAreas.Field, { value: C.emptySelection(), onChange }));
    await waitFor(() => expect(rowOf(GP)).not.toBeNull());
    expect(calls).toEqual(['/api/v1/service-areas']); // one cacheable read, no coordinates anywhere
    expect(document.querySelector("canvas, [class*='maplibre'], [data-mv2='map']")).toBeNull();
    fireEvent.click(tick(GP));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatchObject({ areaIds: [GP] });
    expect(onChange.mock.calls[0]![1]).toBe('Serving: all of Gauteng');
  });
  it("fetches a city's suburbs only when the city is opened, once", async () => {
    const { calls } = installIndex();
    const C = W.CCServing as unknown as { emptySelection: () => unknown };
    render(
      React.createElement(W.ServingAreas.Field, { value: C.emptySelection(), onChange: vi.fn() }),
    );
    await waitFor(() => expect(rowOf(GP)).not.toBeNull());
    fireEvent.click(expander(GP));
    fireEvent.click(expander(CEN));
    await waitFor(() => expect(rowOf(ELD)).not.toBeNull());
    fireEvent.click(expander(CEN)); // closed
    fireEvent.click(expander(CEN)); // opened again
    expect(calls.filter((c) => c.includes('parent='))).toEqual([
      '/api/v1/service-areas?parent=' + CEN,
    ]);
  });
  it('shows an alert and a retry when the areas cannot be loaded, and loads them after a retry', async () => {
    const bad = installIndex({ fail: true });
    const C = W.CCServing as unknown as { emptySelection: () => unknown };
    render(
      React.createElement(W.ServingAreas.Field, { value: C.emptySelection(), onChange: vi.fn() }),
    );
    await waitFor(() =>
      expect(document.querySelector('[data-serving-state="error"]')).not.toBeNull(),
    );
    expect(bad.f).toHaveBeenCalled();
    installIndex();
    fireEvent.click(screen.getByText(S().retry));
    await waitFor(() => expect(rowOf(GP)).not.toBeNull());
  });
  it('names a saved suburb by loading the suburb list once', async () => {
    const { calls } = installIndex();
    const value = { areaIds: [ELD], radiusKm: null, radiusCentreAreaId: null, presence: 'online' };
    render(React.createElement(W.ServingAreas.Field, { value, onChange: vi.fn() }));
    await waitFor(() => expect(summary()).toBe('Serving: Eldoraigne'));
    expect(calls.filter((c) => c.includes('level=suburb'))).toHaveLength(1);
  });
});

// ── the Dashboard editor ───────────────────────────────────────────────
function authed(
  selection: Record<string, unknown> | 'fail',
  save: { status: number; body?: Record<string, unknown> } = { status: 200 },
) {
  const calls: { path: string; init?: { method?: string; body?: string } }[] = [];
  const f = vi.fn((path: string, init?: { method?: string; body?: string }) => {
    calls.push({ path, init });
    if (init?.method === 'PUT') {
      const sent = JSON.parse(init.body!);
      const body = save.body ?? {
        area_ids: sent.area_ids,
        radius_km: sent.radius_km,
        radius_centre_area_id: sent.radius_centre_area_id,
        presence: sent.presence,
      };
      return Promise.resolve({
        ok: save.status < 400,
        status: save.status,
        json: () => Promise.resolve(body),
      });
    }
    if (selection === 'fail')
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(selection) });
  });
  return { f, calls };
}
const SAVED = { area_ids: [CEN], radius_km: null, radius_centre_area_id: null, presence: 'online' };
const saveBtn = () => document.querySelector('[data-serving-save]') as HTMLButtonElement;

describe('the Dashboard editor', () => {
  it('reads the saved choice for the listing, shows it, and keeps Save off until something changes', async () => {
    installIndex();
    const a = authed(SAVED);
    render(
      React.createElement(W.ServingAreas.Editor, {
        contributorId: U(900),
        authedFetch: a.f,
        toast: vi.fn(),
      }),
    );
    await waitFor(() => expect(summary()).toBe('Serving: all of Centurion'));
    expect(a.calls[0]!.path).toBe('/api/contributor/service-areas?contributor_id=' + U(900));
    expect(saveBtn().disabled).toBe(true);
  });
  it('saves the exact choice with PUT, tells the owner, and goes quiet again', async () => {
    installIndex();
    const a = authed(SAVED);
    const toast = vi.fn();
    render(
      React.createElement(W.ServingAreas.Editor, { contributorId: null, authedFetch: a.f, toast }),
    );
    await waitFor(() => expect(rowOf(GP)).not.toBeNull());
    expect(a.calls[0]!.path).toBe('/api/contributor/service-areas'); // null = the signed-in person's own listing
    fireEvent.click(expander(GP));
    fireEvent.click(tick(PTA));
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(chip('25'));
    fireEvent.click(document.querySelector('[data-serving-presence="no_fixed_place"]')!);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S().saved, 'green'));
    const put = a.calls.find((c) => c.init?.method === 'PUT')!;
    expect(put.path).toBe('/api/contributor/service-areas');
    expect(JSON.parse(put.init!.body!)).toEqual({
      area_ids: [CEN, PTA],
      radius_km: 25,
      radius_centre_area_id: CEN,
      presence: 'no_fixed_place',
    });
    await waitFor(() => expect(saveBtn().disabled).toBe(true));
  });
  it("a refusal is plain words and never the server's own text; the choice stays on screen to try again", async () => {
    installIndex();
    const a = authed(SAVED, { status: 429, body: { error: 'SECRET too many requests' } });
    const toast = vi.fn();
    render(
      React.createElement(W.ServingAreas.Editor, { contributorId: null, authedFetch: a.f, toast }),
    );
    await waitFor(() => expect(rowOf(GP)).not.toBeNull());
    fireEvent.click(tick(GP));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(S().errors.slowDown, 'red'));
    expect(document.body.textContent).not.toMatch(/SECRET/);
    expect(saveBtn().disabled).toBe(false);
    expect(checked(GP)).toBe('true');
  });
  it('cannot save twice at once', async () => {
    installIndex();
    const a = authed(SAVED);
    render(
      React.createElement(W.ServingAreas.Editor, {
        contributorId: null,
        authedFetch: a.f,
        toast: vi.fn(),
      }),
    );
    await waitFor(() => expect(rowOf(GP)).not.toBeNull());
    fireEvent.click(tick(GP));
    fireEvent.click(saveBtn());
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveBtn().disabled).toBe(true));
    expect(a.calls.filter((c) => c.init?.method === 'PUT')).toHaveLength(1);
  });
  it('shows a retry when the saved choice cannot be read, and reads it again on retry', async () => {
    installIndex();
    const bad = authed('fail');
    const { rerender } = render(
      React.createElement(W.ServingAreas.Editor, {
        contributorId: null,
        authedFetch: bad.f,
        toast: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(document.querySelector('[data-serving-editor="error"]')).not.toBeNull(),
    );
    fireEvent.click(screen.getByText(S().retry));
    await waitFor(() => expect(bad.f.mock.calls.length).toBeGreaterThan(1));
    rerender(
      React.createElement(W.ServingAreas.Editor, {
        contributorId: null,
        authedFetch: bad.f,
        toast: vi.fn(),
      }),
    );
  });
});

describe('where the picker appears', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), 'src/frontend/app', f), 'utf8');
  it("the Apply wizard shows it only under 'no fixed location', inside the same step (no new step)", () => {
    const apply = read('apply.jsx');
    expect(apply).toMatch(/window\.CCServing\.offersPicker\(f\) && h\(window\.ServingAreas\.Field/);
    expect((apply.match(/title: copy\.title/g) ?? []).length).toBe(1);
    expect(apply).toMatch(/title: 'Your story'/);
    expect(apply).toMatch(/title: 'Review & submit'/);
  });
  it('the Dashboard and the pending Dashboard show it only for no fixed location, and never to a viewer or in demo mode', () => {
    expect(read('dashboard.jsx')).toMatch(
      /!locked && window\.CCServing\.offersPicker\(f\) && window\.CCServing\.isUuid\(contributor\.id\)/,
    );
    expect(read('pending-application.jsx')).toMatch(
      /f\.noFixedLocation && realUser && h\(window\.ServingAreas\.Editor/,
    );
  });
  it('the application saves the areas only AFTER it is sent, only with no fixed location, and a failure never undoes it', () => {
    const store = read('store.jsx');
    const i = store.indexOf('Serving areas (#259)');
    expect(i).toBeGreaterThan(store.indexOf("'/api/contributor/apply'"));
    const block = store.slice(i, i + 900);
    expect(block).toMatch(/form\.noFixedLocation && form\.serving/);
    expect(block).toMatch(/applyFailed/);
    expect(block.indexOf('saveSelection')).toBeLessThan(block.indexOf("go('dashboard')"));
  });
  it('the files are registered for both the dev page and the production build', () => {
    const html = read('../index.html');
    const build = readFileSync(join(process.cwd(), 'scripts/build-frontend.js'), 'utf8');
    for (const f of ['serving-areas-lib.jsx', 'serving-areas.jsx']) {
      expect(html).toContain(`app/${f}?v=`);
      expect(build).toContain(`'${f}'`);
    }
    // the lib loads before the store and the apply wizard use it, the component after the strings and the UI primitives
    const order = (s: string, a: string, b: string) =>
      expect(s.indexOf(a)).toBeLessThan(s.indexOf(b));
    const tag = (f: string) => `app/${f}?v=`; // the script tags, not the comment that mentions store.jsx
    order(html, tag('serving-areas-lib.jsx'), tag('store.jsx'));
    order(html, tag('map-v2-strings.jsx'), tag('serving-areas.jsx'));
    order(html, tag('ui.jsx'), tag('serving-areas.jsx'));
    order(html, tag('serving-areas.jsx'), tag('apply.jsx'));
    order(html, tag('serving-areas.jsx'), tag('dashboard.jsx'));
    order(html, tag('serving-areas.jsx'), tag('pending-application.jsx'));
  });
});
