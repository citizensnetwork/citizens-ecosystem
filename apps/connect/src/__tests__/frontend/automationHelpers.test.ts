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
