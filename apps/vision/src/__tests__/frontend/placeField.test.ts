/**
 * The Place field itself (src/frontend/app/place-field.jsx), run for real in
 * jsdom: the .jsx is compiled to React.createElement calls (the shape the
 * production build ships; esbuild itself cannot start under jsdom, so Vite's
 * transform does it), React is the installed one, and MapTiler is a stubbed fetch.
 *
 * What matters here is the promise the field makes: it is OPTIONAL and it
 * NEVER blocks logging an activity. Whatever MapTiler does (no key, refused
 * key, down), the person can still type a name, and the field says plainly
 * whether that name will be on the Timeline Map or text only.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { transformWithOxc } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const FILES = [
  "src/frontend/app/timeline-lib.jsx",
  "src/frontend/app/place-lib.jsx",
  "src/frontend/app/place-field.jsx",
];
const compiled: Record<string, string> = {};
beforeAll(async () => {
  for (const rel of FILES) {
    compiled[rel] = (await transformWithOxc(read(rel), rel, { jsx: { runtime: "classic" } })).code;
  }
});
afterAll(() => { for (const rel of FILES) delete compiled[rel]; });

type Place = { name: string; lat: number | null; lng: number | null };
type Env = { MAPTILER_KEY?: string };

const EMPTY: Place = { name: "", lat: null, lng: null };
const LIVE: Env = { MAPTILER_KEY: "test-key" };

// Fresh module state per test: the field remembers a refused key for the page.
type Comp = React.ComponentType<Record<string, unknown>>;
function loadScreens() {
  const win: Record<string, unknown> = {};
  new Function("window", compiled["src/frontend/app/timeline-lib.jsx"]!)(win);
  new Function("window", compiled["src/frontend/app/place-lib.jsx"]!)(win);
  new Function("window", "React", compiled["src/frontend/app/place-field.jsx"]!)(win, React);
  return win.Screens as { PlaceField: Comp; PlaceEditor: Comp };
}
const loadField = () => loadScreens().PlaceField;

let root: Root;
let host: HTMLDivElement;
let changes: Place[];
let submits: number;

function mount(env: Env, initial: Place = EMPTY) {
  const Field = loadField();
  function Harness() {
    const [v, setV] = useState<Place>(initial);
    return React.createElement(Field, {
      value: v,
      onChange: (n: Place) => { changes.push(n); setV(n); },
      onSubmit: () => { submits += 1; },
      loadMap: () => Promise.reject(new Error("no map in unit tests")),
      env,
    });
  }
  act(() => { root.render(React.createElement(Harness)); });
}

const input = () => host.querySelector("input") as HTMLInputElement;
const text = () => host.textContent ?? "";
const buttons = () => Array.from(host.querySelectorAll("button")).map((b) => b.textContent);
const options = () => Array.from(host.querySelectorAll('[role="option"]')).map((o) => o.textContent);

function type(value: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function key(k: string) {
  act(() => { input().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); });
}
async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(450); });
}
function click(el: Element) {
  act(() => { (el as HTMLElement).click(); });
}

const answer = (features: unknown[], status = 200) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve({ features }) });
const HATFIELD = {
  id: "place.1",
  text: "Hatfield",
  place_name: "Hatfield, City of Tshwane Metropolitan Municipality, South Africa",
  center: [28.2431, -25.7508],
};
const BROOKLYN = { id: "place.2", text: "Brooklyn", place_name: "Brooklyn, Pretoria, South Africa", center: [28.2395, -25.7677] };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  changes = [];
  submits = 0;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("without a MapTiler key (demo, previews, local)", () => {
  it("says search is off, offers no pin map, and asks MapTiler nothing", () => {
    mount({});
    expect(text()).toContain("Place");
    expect(text()).toContain("(optional)");
    expect(text()).toContain("Place search is switched off on this site");
    expect(buttons()).not.toContain("Drop a pin");
    type("Mamelodi community hall");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a typed name as text only and says it will not be on the Timeline Map", () => {
    mount({});
    type("Mamelodi community hall");
    expect(changes.at(-1)).toEqual({ name: "Mamelodi community hall", lat: null, lng: null });
    expect(text()).toContain("won't appear on the Timeline Map");
  });

  it("turns a pasted coordinate pair into a real, labelled spot", () => {
    mount({});
    type("-25.7461, 28.1881");
    expect(options()).toEqual(["Coordinates -25.74610, 28.18810"]);
    click(host.querySelector('[role="option"]')!);
    expect(changes.at(-1)).toEqual({ name: "Coordinates -25.74610, 28.18810", lat: -25.7461, lng: 28.1881 });
    expect(text()).toContain("On the Timeline Map at -25.74610, 28.18810");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not offer null island as a place", () => {
    mount({});
    type("0, 0");
    expect(options()).toEqual([]);
    expect(changes.at(-1)).toEqual({ name: "0, 0", lat: null, lng: null });
  });

  it("Enter with nothing to choose logs the activity", () => {
    mount({});
    type("Hatfield");
    key("Enter");
    expect(submits).toBe(1);
  });
});

describe("with a key", () => {
  it("searches after a pause, lists MapTiler's answers and a pick sets the name and the spot", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD, BROOKLYN]));
    mount(LIVE);
    expect(buttons()).toContain("Drop a pin");
    type("Hatfield");
    expect(fetchMock).not.toHaveBeenCalled(); // debounced
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("https://api.maptiler.com/geocoding/Hatfield.json?key=test-key");
    expect(options()).toEqual([HATFIELD.place_name, BROOKLYN.place_name]);
    expect(text()).toContain("© OpenStreetMap contributors");
    click(host.querySelectorAll('[role="option"]')[1]!);
    expect(changes.at(-1)).toEqual({ name: BROOKLYN.place_name, lat: -25.7677, lng: 28.2395 });
    expect(text()).toContain("On the Timeline Map at -25.76770, 28.23950");
    expect(options()).toEqual([]); // the list closes after a pick
  });

  it("types ahead with one request, not one per keystroke, and reuses an answer it already has", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD]));
    mount(LIVE);
    type("Hat"); type("Hatf"); type("Hatfi");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/Hatfi.json?");
    type("Hatfie"); type("Hatfi"); // a slip and its fix inside the pause: answered from the cache
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(options()).toEqual([HATFIELD.place_name]);
    type("Hatfie"); // a query nobody asked yet costs one more request
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not ask for fewer than three characters", async () => {
    mount(LIVE);
    type("Ha");
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the arrow keys move through the choices and Enter picks the highlighted one", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD, BROOKLYN]));
    mount(LIVE);
    type("Hatfield");
    await settle();
    key("ArrowDown"); key("ArrowDown");
    expect(host.querySelector('[role="option"][aria-selected="true"]')!.textContent).toBe(BROOKLYN.place_name);
    key("Enter");
    expect(changes.at(-1)).toMatchObject({ name: BROOKLYN.place_name, lat: -25.7677 });
    expect(submits).toBe(0); // choosing is not logging
  });

  it("Enter with choices showing picks the first; it never logs a text-only place by accident", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD, BROOKLYN]));
    mount(LIVE);
    type("Hatfield");
    await settle();
    key("Enter");
    expect(changes.at(-1)).toMatchObject({ name: HATFIELD.place_name, lat: -25.7508 });
    expect(submits).toBe(0);
    key("Enter"); // list closed now: this one logs
    expect(submits).toBe(1);
  });

  it("Escape closes the list and keeps the typed name", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD]));
    mount(LIVE);
    type("Hatfield");
    await settle();
    expect(options()).toHaveLength(1);
    key("Escape");
    expect(options()).toEqual([]);
    expect(input().value).toBe("Hatfield");
  });

  it("says so when nothing matches, and the name can still be kept as text", async () => {
    fetchMock.mockReturnValue(answer([]));
    mount(LIVE);
    type("Mamelodi community hall");
    await settle();
    expect(text()).toContain("No match for that");
    expect(text()).toContain("plain name");
    expect(changes.at(-1)).toEqual({ name: "Mamelodi community hall", lat: null, lng: null });
  });

  it("editing the name after a pick keeps the spot (and says where it is); Remove pin drops only the spot", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD]));
    mount(LIVE);
    type("Hatfield");
    await settle();
    click(host.querySelector('[role="option"]')!);
    type("Hatfield Baptist hall");
    expect(changes.at(-1)).toEqual({ name: "Hatfield Baptist hall", lat: -25.7508, lng: 28.2431 });
    expect(text()).toContain("On the Timeline Map at -25.75080, 28.24310");
    click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Remove pin")!);
    expect(changes.at(-1)).toEqual({ name: "Hatfield Baptist hall", lat: null, lng: null });
    await settle();
    expect(text()).toContain("Saved as text only");
  });

  it("emptying the box removes the place, pin included; Clear does the same", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD]));
    mount(LIVE);
    type("Hatfield");
    await settle();
    click(host.querySelector('[role="option"]')!);
    type("");
    expect(changes.at(-1)).toEqual(EMPTY);
    expect(buttons()).not.toContain("Clear");
    type("Hatfield");
    await settle();
    click(host.querySelector('[role="option"]')!);
    click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Clear")!);
    expect(changes.at(-1)).toEqual(EMPTY);
    expect(input().value).toBe("");
  });

  it("forgets a finished search when the form is reset, so nothing stale reopens", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD]));
    mount(LIVE);
    type("Hatfield");
    await settle();
    click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Clear")!);
    act(() => { input().focus(); });
    expect(options()).toEqual([]);
  });
});

describe("when MapTiler cannot be used", () => {
  it("a refused key (403) turns search and pins off, says so, and the name still works as text", async () => {
    fetchMock.mockReturnValue(answer([], 403));
    mount(LIVE);
    type("Hatfield");
    await settle();
    expect(text()).toContain("did not accept this site");
    expect(text()).toContain("saved as text only and won't appear on the Timeline Map");
    expect(buttons()).not.toContain("Drop a pin");
    type("Hatfield Baptist hall");
    expect(changes.at(-1)).toEqual({ name: "Hatfield Baptist hall", lat: null, lng: null });
    expect(text()).toContain("saved as text only");
    expect(fetchMock).toHaveBeenCalledTimes(1); // and it does not ask again
    key("Enter");
    expect(submits).toBe(1);
  });

  it("a refused key is remembered: later searches do not ask again", async () => {
    fetchMock.mockReturnValue(answer([], 401));
    mount(LIVE);
    type("Hatfield");
    await settle();
    type("Brooklyn");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("MapTiler being down says so; the name still works as text and a later try can succeed", async () => {
    fetchMock.mockReturnValueOnce(answer([], 503));
    mount(LIVE);
    type("Hatfield");
    await settle();
    expect(text()).toContain("isn't answering right now");
    expect(buttons()).toContain("Drop a pin"); // not a key problem, so pins stay available
    key("Enter");
    expect(submits).toBe(1);
    fetchMock.mockReturnValue(answer([BROOKLYN]));
    type("Brooklyn");
    await settle();
    expect(options()).toEqual([BROOKLYN.place_name]);
  });

  it("a request that throws (offline) is treated the same way", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    mount(LIVE);
    type("Hatfield");
    await settle();
    expect(text()).toContain("isn't answering right now");
    expect(changes.at(-1)).toEqual({ name: "Hatfield", lat: null, lng: null });
  });
});

describe("PlaceEditor (add, change or remove the place of an activity already logged)", () => {
  const HATFIELD_PLACE: Place = { name: "Hatfield", lat: -25.7508, lng: 28.2431 };
  const NAME_ONLY: Place = { name: "Mamelodi community hall", lat: null, lng: null };

  type EditorProps = {
    initial: Place;
    saving?: boolean;
    error?: string | null;
    env?: Env;
  };
  let saved: Place[];
  let cancels: number;

  function props(p: EditorProps) {
    return {
      initial: p.initial,
      saving: !!p.saving,
      error: p.error ?? null,
      label: "Food drive",
      onSave: (n: Place) => { saved.push(n); },
      onCancel: () => { cancels += 1; },
      loadMap: () => Promise.reject(new Error("no map in unit tests")),
      env: p.env ?? {},
    };
  }
  function mountEditor(p: EditorProps) {
    const { PlaceEditor } = loadScreens();
    act(() => { root.render(React.createElement(PlaceEditor, props(p))); });
    return {
      rerender: (next: EditorProps) => { act(() => { root.render(React.createElement(PlaceEditor, props(next))); }); },
    };
  }
  const button = (label: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement | undefined;

  beforeEach(() => { saved = []; cancels = 0; });

  it("opens on the saved place with the cursor in the field, and Save waits for a change", () => {
    mountEditor({ initial: HATFIELD_PLACE });
    expect(input().value).toBe("Hatfield");
    expect(document.activeElement).toBe(input());
    expect(text()).toContain("On the Timeline Map at -25.75080, 28.24310");
    expect(button("Save place")!.disabled).toBe(true);
    click(button("Save place")!);
    expect(saved).toEqual([]);
  });

  it("an activity with no place yet starts empty and offers to add one", () => {
    mountEditor({ initial: EMPTY });
    expect(input().value).toBe("");
    expect(button("Save place")!.disabled).toBe(true);
    expect(buttons()).not.toContain("Clear");
  });

  it("names the group for a screen reader with the activity's title", () => {
    mountEditor({ initial: EMPTY });
    const group = host.querySelector("[data-cv-place-editor]")!;
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Place for Food drive");
  });

  it("a pasted coordinate pair, picked, enables Save and saves the spot (no MapTiler key needed)", () => {
    mountEditor({ initial: EMPTY });
    type("-25.7461, 28.1881");
    click(host.querySelector('[role="option"]')!);
    expect(button("Save place")!.disabled).toBe(false);
    click(button("Save place")!);
    expect(saved).toEqual([{ name: "Coordinates -25.74610, 28.18810", lat: -25.7461, lng: 28.1881 }]);
  });

  it("a typed name alone can be saved as text, with the honest note that it is not on the map", () => {
    mountEditor({ initial: EMPTY });
    type("Mamelodi community hall");
    expect(text()).toContain("won't appear on the Timeline Map");
    click(button("Save place")!);
    expect(saved).toEqual([NAME_ONLY]);
  });

  it("Enter in the field saves when there is something to save, and does nothing when there is not", () => {
    mountEditor({ initial: HATFIELD_PLACE });
    key("Enter");
    expect(saved).toEqual([]);
    type("Hatfield Baptist hall");
    key("Enter");
    expect(saved).toEqual([{ name: "Hatfield Baptist hall", lat: -25.7508, lng: 28.2431 }]);
  });

  it("Remove pin keeps the name and saves a text-only place", () => {
    mountEditor({ initial: HATFIELD_PLACE });
    click(button("Remove pin")!);
    click(button("Save place")!);
    expect(saved).toEqual([{ name: "Hatfield", lat: null, lng: null }]);
  });

  it("Clear turns Save into Remove place and says a pinned activity leaves the map; it saves an empty place", () => {
    mountEditor({ initial: HATFIELD_PLACE });
    click(button("Clear")!);
    expect(button("Save place")).toBeUndefined();
    expect(text()).toContain("This takes the activity off your Timeline Map.");
    click(button("Remove place")!);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(EMPTY);
  });

  it("removing a name-only place does not claim the map changes", () => {
    mountEditor({ initial: NAME_ONLY });
    click(button("Clear")!);
    expect(button("Remove place")).toBeDefined();
    expect(text()).not.toContain("takes the activity off your Timeline Map");
  });

  it("Cancel and Escape close it without saving", () => {
    mountEditor({ initial: HATFIELD_PLACE });
    type("Something else");
    click(button("Cancel")!);
    expect(cancels).toBe(1);
    key("Escape");
    expect(cancels).toBe(2);
    expect(saved).toEqual([]);
  });

  it("Escape with the list of choices open only closes the list", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD]));
    mountEditor({ initial: EMPTY, env: LIVE });
    type("Hatfield");
    await settle();
    expect(options()).toHaveLength(1);
    key("Escape");
    expect(options()).toEqual([]);
    expect(cancels).toBe(0);
    key("Escape");
    expect(cancels).toBe(1);
  });

  it("while saving it says so, locks the buttons and ignores Escape and Enter", () => {
    const view = mountEditor({ initial: HATFIELD_PLACE });
    type("Hatfield Baptist hall");
    view.rerender({ initial: HATFIELD_PLACE, saving: true });
    expect(button("Saving…")!.disabled).toBe(true);
    expect(button("Cancel")!.disabled).toBe(true);
    key("Escape");
    key("Enter");
    expect(cancels).toBe(0);
    expect(saved).toEqual([]);
  });

  it("a failed save shows its message and keeps everything the person typed, ready to try again", () => {
    const view = mountEditor({ initial: HATFIELD_PLACE });
    type("Hatfield Baptist hall");
    view.rerender({ initial: HATFIELD_PLACE, saving: true });
    view.rerender({ initial: HATFIELD_PLACE, error: "Could not save the place. Check your connection and try again." });
    const alert = host.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Check your connection");
    expect(input().value).toBe("Hatfield Baptist hall");
    expect(button("Save place")!.disabled).toBe(false);
    click(button("Save place")!);
    expect(saved).toEqual([{ name: "Hatfield Baptist hall", lat: -25.7508, lng: 28.2431 }]);
  });

  it("shows no error box when there is no error", () => {
    mountEditor({ initial: HATFIELD_PLACE });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("when MapTiler refuses the key it still works as text, and says so", async () => {
    fetchMock.mockReturnValue(answer([], 403));
    mountEditor({ initial: EMPTY, env: LIVE });
    type("Hatfield");
    await settle();
    expect(text()).toContain("did not accept this site");
    expect(buttons()).not.toContain("Drop a pin");
    click(button("Save place")!);
    expect(saved).toEqual([{ name: "Hatfield", lat: null, lng: null }]);
  });
});

describe("accessibility", () => {
  it("is a labelled combobox that announces the choices and the state", async () => {
    fetchMock.mockReturnValue(answer([HATFIELD]));
    mount(LIVE);
    const el = input();
    expect(el.getAttribute("role")).toBe("combobox");
    expect(el.id).toBeTruthy();
    expect(host.querySelector(`label[for="${el.id}"]`)).not.toBeNull();
    expect(el.getAttribute("aria-expanded")).toBe("false");
    type("Hatfield");
    await settle();
    expect(el.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(`#${CSS.escape(el.getAttribute("aria-controls")!)}`)!.getAttribute("role")).toBe("listbox");
    key("ArrowDown");
    const active = el.getAttribute("aria-activedescendant")!;
    expect(host.querySelector(`#${CSS.escape(active)}`)!.getAttribute("role")).toBe("option");
    const status = host.querySelector(`#${CSS.escape(el.getAttribute("aria-describedby")!)}`)!;
    expect(status.getAttribute("role")).toBe("status");
  });
});
