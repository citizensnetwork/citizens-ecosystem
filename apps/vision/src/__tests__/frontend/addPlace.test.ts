/**
 * "Add a place" on an activity that is already logged
 * (src/frontend/app/views.jsx → Activities).
 *
 * The .jsx is compiled the same way the production build ships it, then
 * mounted with the real Place field. Demo saves stay in memory and a real
 * spot is added to the Timeline Map's sample points. Live saves PATCH
 * /api/activities/:id and surface the error without closing the row.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { transformWithOxc } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const FILES = [
  "src/frontend/app/ui.jsx",
  "src/frontend/app/timeline-lib.jsx",
  "src/frontend/app/place-lib.jsx",
  "src/frontend/app/place-field.jsx",
  "src/frontend/app/views.jsx",
];
const compiled: Record<string, string> = {};
beforeAll(async () => {
  for (const rel of FILES) {
    compiled[rel] = (await transformWithOxc(read(rel), rel, { jsx: { runtime: "classic" } })).code;
  }
});
afterAll(() => { for (const rel of FILES) delete compiled[rel]; });

type Row = Record<string, unknown>;
type FetchCall = { path: string; opts?: { method?: string; body?: string } };

const FOOD: Row = {
  id: "act-1", title: "Community Food Drive", space: "Community Projects", type: "outreach",
  date: "2026-06-28", reach: 218, engagement: 72, rating: 4.7, claimed: true,
};
const YOUTH: Row = {
  id: "act-2", title: "Youth night", space: "Outreach", type: "event", date: "2026-06-21",
  place: "Hatfield", onMap: true, lat: -25.7487, lng: 28.238,
  reach: 94, engagement: 61, rating: 4.5, claimed: false,
};

let root: Root;
let host: HTMLDivElement;
let mapActivities: Row[];
let calls: FetchCall[];

function load(win: Record<string, unknown>) {
  const run = (rel: string, withReact: boolean) => {
    const code = compiled[rel]!;
    if (withReact) new Function("window", "React", code)(win, React);
    else new Function("window", code)(win);
  };
  run("src/frontend/app/ui.jsx", true);
  run("src/frontend/app/timeline-lib.jsx", false);
  run("src/frontend/app/place-lib.jsx", false);
  run("src/frontend/app/place-field.jsx", true);
  run("src/frontend/app/views.jsx", true);
}

function mount(live = false, authFetch?: (path: string, opts?: FetchCall["opts"]) => Promise<unknown>) {
  mapActivities = [];
  const data: Record<string, unknown> = {
    mode: live ? "live" : "demo",
    orgId: live ? "org-1" : null,
    activities: [structuredClone(FOOD), structuredClone(YOUTH)],
    mapActivities,
  };
  const win: Record<string, unknown> = {
    CV_DATA: data,
    CV_STORE: { authFetch: authFetch ?? null },
    Screens: {},
    __CV_ENV: {},
  };
  load(win);
  const Activities = (win.Screens as { Activities: React.ComponentType }).Activities;
  act(() => { root.render(React.createElement(Activities)); });
  return win;
}

const btn = (id: string) => document.getElementById("cv-place-" + id) as HTMLButtonElement;
const editorOf = (id: string) => document.getElementById("cv-place-editor-" + id);
const field = (id: string) => editorOf(id)!.querySelector('[role="combobox"]') as HTMLInputElement;
const press = (el: Element, label: string) => {
  const found = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === label);
  if (!found) throw new Error("no button " + label);
  return found as HTMLButtonElement;
};
function click(el: Element) {
  act(() => { (el as HTMLElement).click(); });
}
function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function key(el: Element, k: string) {
  act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); });
}

beforeEach(() => {
  calls = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe("Add a place on a logged activity", () => {
  it("offers Add a place when there is no position, and the place name when there is one", () => {
    mount();
    const add = btn("act-1");
    expect(add.textContent).toContain("Add a place");
    expect(add.style.minHeight).toBe("44px");
    expect(add.style.color).toBe("var(--brand-ink)");
    expect(add.style.border).toContain("var(--border)");
    expect(add.querySelector("svg")!.getAttribute("width")).toBe("15");
    expect(add.getAttribute("aria-expanded")).toBe("false");
    expect(btn("act-2").textContent).toContain("Hatfield");
    expect(host.textContent).toContain("On the Timeline Map");
    expect(host.textContent).not.toContain("Saved without a map position");
  });

  it("opens the same Place field under the row and moves focus into it", () => {
    mount();
    click(btn("act-1"));
    const editor = editorOf("act-1");
    expect(editor).not.toBeNull();
    expect(editor!.getAttribute("colspan")).toBe("7");
    expect(editor!.textContent).toContain("Place");
    expect(press(editor!, "Save").textContent).toBe("Save");
    expect(press(editor!, "Cancel")).not.toBeNull();
    expect(document.activeElement).toBe(field("act-1"));
    expect(btn("act-1").getAttribute("aria-expanded")).toBe("true");
  });

  it("Escape and Cancel collapse the row and return focus to the button", () => {
    mount();
    click(btn("act-1"));
    typeInto(field("act-1"), "Hatfield");
    key(field("act-1"), "Escape");
    expect(editorOf("act-1")).toBeNull();
    expect(document.activeElement).toBe(btn("act-1"));
    expect(btn("act-1").textContent).toContain("Add a place");

    click(btn("act-1"));
    typeInto(field("act-1"), "Hatfield");
    click(press(editorOf("act-1")!, "Cancel"));
    expect(editorOf("act-1")).toBeNull();
    expect(document.activeElement).toBe(btn("act-1"));
  });

  it("disables Save while the place is empty, and Enter shows an error on the field", () => {
    mount();
    click(btn("act-1"));
    const save = press(editorOf("act-1")!, "Save");
    expect(save.disabled).toBe(true);
    expect(save.textContent).toBe("Save");
    typeInto(field("act-1"), "   ");
    expect(field("act-1").value).toBe("");
    expect(press(editorOf("act-1")!, "Save").disabled).toBe(true);

    key(field("act-1"), "Enter");
    const input = field("act-1");
    const described = (input.getAttribute("aria-describedby") || "").split(/\s+/);
    const errorEl = described
      .map((id) => document.getElementById(id))
      .find((el) => el && el.textContent === "Add a place name");
    expect(errorEl).toBeTruthy();
    expect(errorEl!.getAttribute("style")).toContain("var(--danger)");
    expect(errorEl!.getAttribute("role")).not.toBe("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(editorOf("act-1")).not.toBeNull();
    expect(editorOf("act-1")!.querySelector('[role="alert"]')).toBeNull();

    typeInto(input, "Hall");
    expect(press(editorOf("act-1")!, "Save").disabled).toBe(false);
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(editorOf("act-1")!.textContent).not.toContain("Add a place name");
  });

  it("saves a name with no coordinates and says it has no map position", () => {
    mount();
    click(btn("act-1"));
    typeInto(field("act-1"), "Mamelodi hall");
    key(field("act-1"), "Enter");
    expect(editorOf("act-1")).toBeNull();
    expect(btn("act-1").textContent).toContain("Mamelodi hall");
    expect(host.textContent).toContain("Saved without a map position");
    expect(mapActivities).toEqual([]);
    expect(document.activeElement).toBe(btn("act-1"));
  });

  it("saves a real spot and the activity then appears on the Timeline Map", () => {
    const win = mount();
    click(btn("act-1"));
    typeInto(field("act-1"), "-25.7461, 28.1881");
    click(editorOf("act-1")!.querySelector('[role="option"]')!);
    click(press(editorOf("act-1")!, "Save"));
    expect(editorOf("act-1")).toBeNull();
    expect(btn("act-1").textContent).toContain("Coordinates -25.74610, 28.18810");
    expect(host.textContent).toContain("On the Timeline Map");
    const TL = win.CV_TIMELINE as { toPoints(rows: Row[]): { id: string; lat: number; lng: number }[] };
    expect(TL.toPoints(mapActivities)).toEqual([
      expect.objectContaining({ id: "act-1", lat: -25.7461, lng: 28.1881 }),
    ]);
    click(host.querySelector('[aria-label="Delete Community Food Drive"]')!);
    expect(TL.toPoints(mapActivities)).toEqual([]);
  });

  it("keeps a saved pin when the name is unchanged, even if the pin was removed in the field", () => {
    const win = mount();
    click(btn("act-2"));
    expect(field("act-2").value).toBe("Hatfield");
    click(press(editorOf("act-2")!, "Remove pin"));
    click(press(editorOf("act-2")!, "Save"));
    expect(btn("act-2").textContent).toContain("Hatfield");
    expect(host.textContent).toContain("On the Timeline Map");
    expect(host.textContent).not.toContain("Saved without a map position");
    const TL = win.CV_TIMELINE as { toPoints(rows: Row[]): { id: string; lat: number; lng: number }[] };
    expect(TL.toPoints(mapActivities)).toEqual([
      expect.objectContaining({ id: "act-2", lat: -25.7487, lng: 28.238 }),
    ]);
  });

  it("clears the pin when the name changes to one with no map location", () => {
    const win = mount();
    click(btn("act-2"));
    typeInto(field("act-2"), "");
    typeInto(field("act-2"), "Mamelodi hall");
    click(press(editorOf("act-2")!, "Save"));
    expect(btn("act-2").textContent).toContain("Mamelodi hall");
    expect(host.textContent).toContain("Saved without a map position");
    expect(host.textContent).not.toContain("On the Timeline Map");
    const TL = win.CV_TIMELINE as { toPoints(rows: Row[]): { id: string }[] };
    expect(TL.toPoints(mapActivities)).toEqual([]);
  });

  it("edits a saved place and keeps the spot when the new name still has one", () => {
    const win = mount();
    click(btn("act-2"));
    expect(field("act-2").value).toBe("Hatfield");
    typeInto(field("act-2"), "Hatfield hall");
    click(press(editorOf("act-2")!, "Save"));
    expect(btn("act-2").textContent).toContain("Hatfield hall");
    const TL = win.CV_TIMELINE as { toPoints(rows: Row[]): { id: string }[] };
    expect(TL.toPoints(mapActivities).map((p) => p.id)).toEqual(["act-2"]);
    expect(host.textContent).toContain("On the Timeline Map");
  });

  it("opens one editor at a time", () => {
    mount();
    click(btn("act-1"));
    typeInto(field("act-1"), "unsaved");
    click(btn("act-2"));
    expect(editorOf("act-1")).toBeNull();
    expect(field("act-2").value).toBe("Hatfield");
  });
});

describe("Add a place against the live API", () => {
  function liveFetch(fail = false) {
    let release: ((res: unknown) => void) | null = null;
    const authFetch = (path: string, opts?: FetchCall["opts"]) => {
      calls.push({ path, opts });
      if (opts?.method === "PATCH") {
        return new Promise((resolve) => {
          release = resolve;
          if (fail) {
            resolve({ ok: false, status: 500, json: async () => ({ error: "nope" }) });
            release = null;
          }
        });
      }
      if (String(path).includes("/api/metrics")) {
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            { id: "act-1", title: "Community Food Drive", type: "outreach", date: "2026-06-28" },
            {
              id: "act-2", title: "Youth night", type: "event", date: "2026-06-21",
              location_name: "Hatfield", latitude: -25.7487, longitude: 28.238,
            },
          ],
        }),
      });
    };
    return { authFetch, hold: () => release };
  }

  async function settled() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("shows Saving…, then PATCHes latitude, longitude and location_name", async () => {
    const { authFetch, hold } = liveFetch();
    mount(true, authFetch);
    await settled();
    expect(btn("act-1").textContent).toContain("Add a place");
    expect(btn("act-2").textContent).toContain("Hatfield");

    click(btn("act-1"));
    typeInto(field("act-1"), "-25.7461, 28.1881");
    click(editorOf("act-1")!.querySelector('[role="option"]')!);
    typeInto(field("act-1"), "E2e Hall");
    click(press(editorOf("act-1")!, "Save"));
    await settled();
    const save = press(editorOf("act-1")!, "Saving…");
    expect(save.disabled).toBe(true);
    expect(press(editorOf("act-1")!, "Cancel").disabled).toBe(true);

    const patch = calls.find((c) => c.opts?.method === "PATCH")!;
    expect(patch.path).toBe("/api/activities/act-1");
    expect(JSON.parse(patch.opts!.body!)).toEqual({
      latitude: -25.7461, longitude: 28.1881, location_name: "E2e Hall",
    });

    await act(async () => {
      hold()!({
        ok: true,
        json: async () => ({
          data: {
            id: "act-1", title: "Community Food Drive", type: "outreach", date: "2026-06-28",
            latitude: -25.7461, longitude: 28.1881, location_name: "E2e Hall",
          },
        }),
      });
      await Promise.resolve();
    });
    expect(editorOf("act-1")).toBeNull();
    expect(btn("act-1").textContent).toContain("E2e Hall");
    expect(host.textContent).toContain("On the Timeline Map");
  });

  it("keeps the saved coordinates when the name is unchanged, and does not send null", async () => {
    const { authFetch, hold } = liveFetch();
    mount(true, authFetch);
    await settled();
    click(btn("act-2"));
    click(press(editorOf("act-2")!, "Remove pin"));
    click(press(editorOf("act-2")!, "Save"));
    await settled();
    const patch = calls.find((c) => c.opts?.method === "PATCH")!;
    expect(patch.path).toBe("/api/activities/act-2");
    const body = JSON.parse(patch.opts!.body!);
    expect(body).toEqual({
      location_name: "Hatfield", latitude: -25.7487, longitude: 28.238,
    });
    expect(body.latitude).not.toBeNull();
    expect(body.longitude).not.toBeNull();
    await act(async () => {
      hold()!({
        ok: true,
        json: async () => ({
          data: {
            id: "act-2", title: "Youth night", type: "event", date: "2026-06-21",
            location_name: "Hatfield", latitude: -25.7487, longitude: 28.238,
          },
        }),
      });
      await Promise.resolve();
    });
    expect(host.textContent).toContain("On the Timeline Map");
    expect(editorOf("act-2")).toBeNull();
  });

  it("sends null coordinates only when the name changes to one with no map location", async () => {
    const { authFetch, hold } = liveFetch();
    mount(true, authFetch);
    await settled();
    click(btn("act-2"));
    typeInto(field("act-2"), "");
    typeInto(field("act-2"), "Other hall");
    click(press(editorOf("act-2")!, "Save"));
    await settled();
    const patch = calls.find((c) => c.opts?.method === "PATCH")!;
    expect(JSON.parse(patch.opts!.body!)).toEqual({
      location_name: "Other hall", latitude: null, longitude: null,
    });
    await act(async () => {
      hold()!({
        ok: true,
        json: async () => ({
          data: {
            id: "act-2", title: "Youth night", type: "event", date: "2026-06-21",
            location_name: "Other hall", latitude: null, longitude: null,
          },
        }),
      });
      await Promise.resolve();
    });
    expect(host.textContent).toContain("Saved without a map position");
    expect(host.textContent).not.toContain("On the Timeline Map");
    expect(editorOf("act-2")).toBeNull();
  });

  it("saves a name only as null coordinates", async () => {
    const { authFetch, hold } = liveFetch();
    mount(true, authFetch);
    await settled();
    click(btn("act-1"));
    typeInto(field("act-1"), "Name only hall");
    click(press(editorOf("act-1")!, "Save"));
    await settled();
    const patch = calls.find((c) => c.opts?.method === "PATCH")!;
    expect(JSON.parse(patch.opts!.body!)).toEqual({
      location_name: "Name only hall", latitude: null, longitude: null,
    });
    await act(async () => {
      hold()!({
        ok: true,
        json: async () => ({
          data: {
            id: "act-1", title: "Community Food Drive", type: "outreach", date: "2026-06-28",
            location_name: "Name only hall", latitude: null, longitude: null,
          },
        }),
      });
      await Promise.resolve();
    });
    expect(host.textContent).toContain("Saved without a map position");
    expect(editorOf("act-1")).toBeNull();
  });

  it("shows an alert and leaves the row open when the save fails", async () => {
    const { authFetch } = liveFetch(true);
    mount(true, authFetch);
    await settled();
    click(btn("act-1"));
    typeInto(field("act-1"), "Hatfield");
    click(press(editorOf("act-1")!, "Save"));
    await settled();
    const alert = editorOf("act-1")!.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Could not save this place");
    expect(alert.getAttribute("style")).toContain("var(--danger)");
    expect(editorOf("act-1")).not.toBeNull();
    expect(press(editorOf("act-1")!, "Save").disabled).toBe(false);
    expect(btn("act-1").textContent).toContain("Add a place");
  });
});
