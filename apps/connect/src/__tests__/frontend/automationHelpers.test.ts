/**
 * The owner side of listing automation (automation.jsx): the pure helpers, plus
 * drift guards that keep its lists identical to the server library's, so the
 * dashboard can never offer a level, a source or a profile field the database and
 * the endpoint would refuse.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadFrontend } from "./support/loadFrontend";
import { AUTO_UPDATE_LEVELS, PROFILE_FIELDS, READABLE_SOURCE_KINDS, SOURCE_KINDS } from "@/lib/automation/suggestions";

type Helpers = {
  LEVELS: { value: string }[];
  SOURCE_KINDS: { value: string; readable: boolean }[];
  FIELD_LABEL: Record<string, string>;
  parseSourceUrl: (raw: unknown) => string | null;
  sourceDomain: (url: string) => string;
  timeAgo: (iso: string | null, now?: number) => string;
  eventFormFromPayload: (p: Record<string, unknown>) => Record<string, unknown>;
  newsFormFromPayload: (p: Record<string, unknown>) => {
    title: string;
    body: string;
    date: string;
  };
  profileFieldsFrom: (field: string, value: string, contributor?: { socials?: Record<string, string> }) => Record<string, unknown> | null;
  suggestionTitle: (s: { kind: string; payload?: Record<string, unknown> }) => string;
  toggled: (picked: string[], id: string, on: boolean) => string[];
  selectionOf: (
    pending: { id: string }[],
    picked: string[],
  ) => { ids: string[]; count: number; total: number; all: boolean; some: boolean };
  selectionText: (count: number, total: number) => string;
  dismissQuestion: (count: number) => string;
  dismissedText: (total: number, failed: number) => string;
  mapInChunks: <T, R>(items: T[], size: number, fn: (x: T) => Promise<R>) => Promise<R[]>;
  draftFromSuggestion: (s: { kind: string; payload?: Record<string, unknown> }) => Record<string, string>;
  changesFromDraft: (s: { kind: string; payload?: Record<string, unknown> }, draft: Record<string, string>) => Record<string, string> | null;
  applyChanges: (s: { kind: string; payload: Record<string, unknown> }, changes: Record<string, string> | null) => Record<string, unknown>;
  editErrorText: (reason?: string) => string;
};

let H: Helpers;
beforeAll(() => {
  const noop = () => null;
  const win = loadFrontend("automation.jsx", {
    UI: {
      cx: noop,
      Button: noop,
      Field: noop,
      Input: noop,
      Textarea: noop,
      Toggle: noop,
      Empty: noop,
    },
    Icon: noop,
  });
  H = win.CC_AUTOMATION_HELPERS as Helpers;
});

describe("drift guards: the dashboard offers exactly what the server accepts", () => {
  it("levels", () => {
    expect(H.LEVELS.map((l) => l.value)).toEqual([...AUTO_UPDATE_LEVELS]);
  });
  it("source kinds, and which of them can be read", () => {
    expect(H.SOURCE_KINDS.map((k) => k.value).sort()).toEqual([...SOURCE_KINDS].sort());
    expect(
      H.SOURCE_KINDS.filter((k) => k.readable)
        .map((k) => k.value)
        .sort(),
    ).toEqual([...READABLE_SOURCE_KINDS].sort());
  });
  it("every suggestible profile field has a label and maps onto an update the store understands", () => {
    for (const f of PROFILE_FIELDS) {
      expect(H.FIELD_LABEL[f], f).toBeTruthy();
      expect(H.profileFieldsFrom(f, "x", { socials: {} }), f).not.toBeNull();
    }
    expect(H.profileFieldsFrom("logo_url", "https://x.example/a.png", {})).toBeNull();
    expect(H.profileFieldsFrom("role", "admin", {})).toBeNull();
  });
});

describe("parseSourceUrl", () => {
  it("accepts a link with or without a scheme, upgrades http, drops the fragment", () => {
    expect(H.parseSourceUrl("https://church.example/events#top")).toBe("https://church.example/events");
    expect(H.parseSourceUrl("church.example")).toBe("https://church.example/");
    expect(H.parseSourceUrl("  http://church.example/x  ")).toBe("https://church.example/x");
  });
  it("accepts a host with a port (it is not a scheme)", () => {
    expect(H.parseSourceUrl("church.example:8443/events.ics")).toBe("https://church.example:8443/events.ics");
  });
  it("refuses other schemes, credentials, bare words, empties and over-long links", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://church.example",
      "mailto:a@b.example",
      "https://user:pw@church.example",
      "church",
      "",
      "   ",
      null,
      undefined,
      5,
      "https://" + "a".repeat(600) + ".org",
    ]) {
      expect(H.parseSourceUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe("sourceDomain / timeAgo", () => {
  it("names a source without www", () => {
    expect(H.sourceDomain("https://www.church.example/a/b")).toBe("church.example");
    expect(H.sourceDomain("nonsense")).toBe("");
  });
  it("says how long ago a source was checked", () => {
    const now = Date.parse("2026-10-04T12:00:00Z");
    expect(H.timeAgo(null, now)).toBe("Never checked");
    expect(H.timeAgo("garbage", now)).toBe("Never checked");
    expect(H.timeAgo("2026-10-04T11:59:40Z", now)).toBe("Checked just now");
    expect(H.timeAgo("2026-10-04T11:55:00Z", now)).toBe("Checked 5 minutes ago");
    expect(H.timeAgo("2026-10-04T11:59:00Z", now)).toBe("Checked 1 minute ago");
    expect(H.timeAgo("2026-10-04T09:00:00Z", now)).toBe("Checked 3 hours ago");
    expect(H.timeAgo("2026-10-01T12:00:00Z", now)).toBe("Checked 3 days ago");
  });
});

describe("eventFormFromPayload: the create-event form, in the owner's own timezone", () => {
  // Built from local parts so the expectation does not depend on where the test runs.
  const start = new Date(2026, 9, 11, 9, 30);
  const sameDay = new Date(2026, 9, 11, 11, 0);
  const nextDay = new Date(2026, 9, 12, 1, 0);
  const payload = {
    title: "Sunday Celebration",
    description: "Join us.",
    location: "12 Church Street",
    category: "church-services",
  };

  it("splits the start into a local date and time, and keeps an end time on the same day", () => {
    const f = H.eventFormFromPayload({
      ...payload,
      start: start.toISOString(),
      end: sameDay.toISOString(),
    });
    expect(f).toMatchObject({
      title: "Sunday Celebration",
      date: "2026-10-11",
      time: "09:30",
      endTime: "11:00",
      location: "12 Church Street",
      category: "church-services",
      address: "",
      coverPhoto: "",
      volunteeringEnabled: false,
    });
  });
  it("drops an end time that falls on another day (the form takes one day)", () => {
    expect(H.eventFormFromPayload({ ...payload, start: start.toISOString(), end: nextDay.toISOString() }).endTime).toBe("");
    expect(H.eventFormFromPayload({ ...payload, start: start.toISOString() }).endTime).toBe("");
  });
  it("never throws on a bad start", () => {
    expect(H.eventFormFromPayload({ ...payload, start: "nope" })).toMatchObject({
      date: "",
      time: "",
    });
  });
});

describe("newsFormFromPayload / profileFieldsFrom", () => {
  it("keeps the source link as a plain closing line", () => {
    expect(
      H.newsFormFromPayload({
        title: "T",
        body: "Body.",
        link: "https://church.example/n/1",
        post_date: "2026-10-04",
      }),
    ).toEqual({
      title: "T",
      body: "Body.\n\nSource: https://church.example/n/1",
      date: "2026-10-04",
    });
    expect(H.newsFormFromPayload({ title: "T", body: "Body.", link: null, post_date: "2026-10-04" }).body).toBe("Body.");
  });
  it("maps a profile suggestion to the store's update shape, merging socials so no other link is cleared", () => {
    expect(H.profileFieldsFrom("bio", "About us", {})).toEqual({ bio: "About us" });
    expect(H.profileFieldsFrom("website_url", "https://church.example", {})).toEqual({
      website: "https://church.example",
    });
    expect(H.profileFieldsFrom("contact_email", "office@church.example", {})).toEqual({
      contactEmail: "office@church.example",
    });
    expect(
      H.profileFieldsFrom("instagram_handle", "@church", {
        socials: { facebook: "facebook.com/church", youtube: "@church" },
      }),
    ).toEqual({
      socials: { facebook: "facebook.com/church", youtube: "@church", instagram: "@church" },
    });
  });
});

describe("choosing several suggestions at once", () => {
  const pending = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("names a suggestion for a screen reader by its title, or by what it would change", () => {
    expect(H.suggestionTitle({ kind: "event", payload: { title: "Sunday Celebration" } })).toBe("Sunday Celebration");
    expect(H.suggestionTitle({ kind: "news", payload: { title: "New building opens" } })).toBe("New building opens");
    expect(H.suggestionTitle({ kind: "profile", payload: { field: "bio", value: "x" } })).toBe("Update your About text");
    expect(H.suggestionTitle({ kind: "profile", payload: { field: "nope" } })).toBe("Update your profile");
    expect(H.suggestionTitle({ kind: "news", payload: {} })).toBe("News post");
    expect(H.suggestionTitle({ kind: "event" })).toBe("Event");
  });

  it("adds and removes one id without ever duplicating it or touching the rest", () => {
    expect(H.toggled([], "a", true)).toEqual(["a"]);
    expect(H.toggled(["a"], "a", true)).toEqual(["a"]);
    expect(H.toggled(["a", "b"], "a", false)).toEqual(["b"]);
    expect(H.toggled(["b"], "a", false)).toEqual(["b"]);
  });

  it("reports none, some and all against what is still waiting", () => {
    expect(H.selectionOf(pending, [])).toEqual({ ids: [], count: 0, total: 3, all: false, some: false });
    expect(H.selectionOf(pending, ["b"])).toEqual({ ids: ["b"], count: 1, total: 3, all: false, some: true });
    expect(H.selectionOf(pending, ["c", "a", "b"])).toEqual({ ids: ["a", "b", "c"], count: 3, total: 3, all: true, some: false });
  });

  it("forgets an id that is no longer pending, so a count or a confirm never mentions it", () => {
    expect(H.selectionOf(pending, ["a", "gone"])).toMatchObject({ ids: ["a"], count: 1 });
    expect(H.selectionOf([], ["a"])).toEqual({ ids: [], count: 0, total: 0, all: false, some: false });
  });

  it("says the count in plain words, in the singular too", () => {
    expect(H.selectionText(0, 5)).toBe("None selected");
    expect(H.selectionText(2, 5)).toBe("2 of 5 selected");
    expect(H.dismissQuestion(1)).toBe("Dismiss 1 suggestion?");
    expect(H.dismissQuestion(7)).toBe("Dismiss 7 suggestions?");
  });

  it("reports a batch result, including a partial one", () => {
    expect(H.dismissedText(3, 0)).toBe("Dismissed 3 suggestions.");
    expect(H.dismissedText(1, 0)).toBe("Dismissed 1 suggestion.");
    expect(H.dismissedText(4, 1)).toBe("Dismissed 3 of 4. 1 is still selected. Please try again.");
    expect(H.dismissedText(4, 3)).toBe("Dismissed 1 of 4. 3 are still selected. Please try again.");
  });

  it("runs a batch a few at a time, in order, never more at once than asked", async () => {
    let live = 0;
    let peak = 0;
    const out = await H.mapInChunks([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 1));
      live--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(3);
    expect(await H.mapInChunks([], 3, async (n: number) => n)).toEqual([]);
  });
});

describe("editing a suggestion that is still waiting", () => {
  // Built from local parts so the expectations do not depend on where the test runs.
  const start = new Date(2026, 9, 11, 9, 30);
  const end = new Date(2026, 9, 11, 11, 30);
  const eventS = {
    id: "s1",
    kind: "event",
    payload: {
      title: "Sunday Celebration",
      description: "Join us.",
      location: "12 Church Street",
      category: "church-services",
      start: start.toISOString(),
      end: end.toISOString(),
    },
  };
  const newsS = { id: "s2", kind: "news", payload: { title: "New building", body: "Open Sunday.", link: null, post_date: "2026-10-03" } };
  const profS = { id: "s3", kind: "profile", payload: { field: "bio", value: "We serve Pretoria." } };

  it("shows exactly the fields an owner can change, an event's start as their own date and time", () => {
    expect(H.draftFromSuggestion(eventS)).toEqual({
      title: "Sunday Celebration",
      description: "Join us.",
      location: "12 Church Street",
      date: "2026-10-11",
      time: "09:30",
    });
    expect(H.draftFromSuggestion(newsS)).toEqual({ title: "New building", body: "Open Sunday." });
    expect(H.draftFromSuggestion(profS)).toEqual({ value: "We serve Pretoria." });
    expect(H.draftFromSuggestion({ kind: "event", payload: { title: "x", start: "nope" } })).toMatchObject({ date: "", time: "" });
  });

  it("finds nothing to save when nothing differs", () => {
    for (const s of [eventS, newsS, profS]) expect(H.changesFromDraft(s, H.draftFromSuggestion(s)), s.kind).toBeNull();
  });

  it("names only what changed, in the keys the server accepts", () => {
    expect(H.changesFromDraft(eventS, { ...H.draftFromSuggestion(eventS), title: "Sunday Celebration (new venue)" })).toEqual({ title: "Sunday Celebration (new venue)" });
    expect(H.changesFromDraft(eventS, { ...H.draftFromSuggestion(eventS), location: "The Hall", description: "" })).toEqual({ location: "The Hall", description: "" });
    expect(H.changesFromDraft(newsS, { title: "New building", body: "Open Sunday at 9." })).toEqual({ body: "Open Sunday at 9." });
    expect(H.changesFromDraft(profS, { value: "We serve the city." })).toEqual({ value: "We serve the city." });
  });

  it("turns a new date or time into a start instant from the owner's own clock", () => {
    const moved = H.changesFromDraft(eventS, { ...H.draftFromSuggestion(eventS), date: "2026-10-18", time: "18:00" });
    expect(Object.keys(moved ?? {})).toEqual(["start"]);
    expect(moved?.start).toBe(new Date(2026, 9, 18, 18, 0).toISOString());
    const onlyTime = H.changesFromDraft(eventS, { ...H.draftFromSuggestion(eventS), time: "10:00" });
    expect(onlyTime?.start).toBe(new Date(2026, 9, 11, 10, 0).toISOString());
  });

  it("sends an empty start for a date or time that was cleared, so the server's own rule refuses it", () => {
    expect(H.changesFromDraft(eventS, { ...H.draftFromSuggestion(eventS), date: "" })).toEqual({ start: "" });
    expect(H.changesFromDraft(eventS, { ...H.draftFromSuggestion(eventS), time: "" })).toEqual({ start: "" });
  });

  it("lays the changes over the payload, and moves an event's end with its start", () => {
    expect(H.applyChanges(eventS, null)).toEqual(eventS.payload);
    const moved = H.applyChanges(eventS, { start: new Date(2026, 9, 18, 18, 0).toISOString() });
    expect(moved.start).toBe(new Date(2026, 9, 18, 18, 0).toISOString());
    expect(moved.end).toBe(new Date(2026, 9, 18, 20, 0).toISOString()); // still two hours
    const explicit = H.applyChanges(eventS, { start: new Date(2026, 9, 18, 18, 0).toISOString(), end: new Date(2026, 9, 18, 19, 0).toISOString() });
    expect(explicit.end).toBe(new Date(2026, 9, 18, 19, 0).toISOString());
    const noEnd = H.applyChanges({ ...eventS, payload: { ...eventS.payload, end: null } }, { start: new Date(2026, 9, 18, 18, 0).toISOString() });
    expect(noEnd.end).toBeNull();
    expect(H.applyChanges(newsS, { body: "x" })).toEqual({ ...newsS.payload, body: "x" });
  });

  it("explains each refusal in plain words, with a safe default", () => {
    for (const reason of ["event_title_required", "news_body_required", "event_start_invalid", "event_start_out_of_range", "profile_value_invalid", "not_pending", "not_found", "consent_off", "edit_unavailable"]) {
      expect(H.editErrorText(reason), reason).toMatch(/[a-z]/);
      expect(H.editErrorText(reason), reason).not.toBe(H.editErrorText("something_new"));
    }
    expect(H.editErrorText(undefined)).toBe("Could not save that change. Please try again.");
    expect(H.editErrorText("something_new")).toBe("Could not save that change. Please try again.");
  });
});
