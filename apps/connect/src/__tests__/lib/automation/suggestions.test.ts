import { describe, it, expect } from "vitest";
import {
  AUTO_UPDATE_LEVELS,
  PROFILE_FIELDS,
  READABLE_SOURCE_KINDS,
  httpsUrlOrNull,
  isAutoPublishable,
  parseAutoUpdateLevel,
  scrubPersonalContact,
  sourceDomain,
  validateSuggestion,
  type EventPayload,
} from "@/lib/automation/suggestions";

const NOW = new Date("2026-10-04T08:00:00Z");
const SRC = "https://www.church.example/events";

const goodEvent = {
  title: "  Sunday   Celebration ",
  description: "Join us for worship.",
  start: "2026-10-11T09:00:00+02:00",
  end: "2026-10-11T11:00:00+02:00",
  location: "12 Church Street, Pretoria",
  category: "church-services",
  image_url: "https://www.church.example/img/a.jpg",
  website_url: "https://www.church.example/sunday",
};

describe("parseAutoUpdateLevel: consent is off unless clearly given", () => {
  it("accepts exactly the three levels", () => {
    for (const l of AUTO_UPDATE_LEVELS) expect(parseAutoUpdateLevel(l)).toEqual({ level: l, warning: null });
  });
  it("treats an absent answer (an older script) as off, silently", () => {
    for (const v of [undefined, null, ""]) expect(parseAutoUpdateLevel(v)).toEqual({ level: "off", warning: null });
  });
  it("treats anything else as off WITH a warning, never a guess in the owner's favour", () => {
    for (const v of ["yes", "EVENTS_AUTO", "events_auto ", 1, true, {}, ["suggest"]]) {
      const r = parseAutoUpdateLevel(v);
      expect(r.level, String(v)).toBe("off");
      expect(r.warning, String(v)).toMatch(/left off/);
    }
  });
});

describe("scrubPersonalContact: no individuals' phone numbers or emails", () => {
  it("removes emails", () => {
    expect(scrubPersonalContact("Write to pastor.john@gmail.example today")).toEqual({ text: "Write to [removed] today", removed: true });
  });
  it("removes South African and international numbers in the shapes people type", () => {
    for (const n of ["012 345 6789", "012-345-6789", "(012) 345 6789", "0123456789", "082 123 4567", "+27 82 123 4567", "+27821234567", "27821234567"]) {
      const r = scrubPersonalContact(`Call ${n} now`);
      expect(r.text, n).toBe("Call [removed] now");
      expect(r.removed).toBe(true);
    }
  });
  it("leaves dates, times, years, prices and street numbers alone", () => {
    for (const t of ["2026-10-05 18:00", "18:00-20:00", "Sunday 11 October 2026 at 09:00", "R150 per person", "12 Church Street", "Doors 17h30, ages 18-35", "Room 204, floor 3"]) {
      expect(scrubPersonalContact(t), t).toEqual({ text: t, removed: false });
    }
  });
  it("handles hostile long input without blowing up", () => {
    const hostile = "1".repeat(5000) + "@" + "a".repeat(5000);
    const t0 = Date.now();
    scrubPersonalContact(hostile.slice(0, 4000));
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe("httpsUrlOrNull / sourceDomain", () => {
  it("accepts a plain https link and drops the fragment", () => {
    expect(httpsUrlOrNull("https://example.org/a#frag")).toBe("https://example.org/a");
  });
  it("refuses http, other schemes, credentials, bare hosts, junk and over-long links", () => {
    for (const v of ["http://example.org", "javascript:alert(1)", "data:text/html,x", "ftp://example.org", "https://user:pw@example.org", "https://localhost/x", "example.org", "", "   ", null, undefined, 5, {}, "https://" + "a".repeat(600) + ".org"]) {
      expect(httpsUrlOrNull(v), String(v)).toBeNull();
    }
  });
  it("names the source without www", () => {
    expect(sourceDomain("https://www.church.example/x")).toBe("church.example");
    expect(sourceDomain("not a url")).toBe("");
  });
});

describe("validateSuggestion: shared rules", () => {
  it("rejects an unknown kind, a non-object payload and a missing or non-https source", () => {
    expect(validateSuggestion("poll", {}, SRC, NOW)).toEqual({ ok: false, reason: "unknown_kind" });
    expect(validateSuggestion(undefined, {}, SRC, NOW)).toEqual({ ok: false, reason: "unknown_kind" });
    for (const p of [null, "x", 5, [], undefined]) {
      expect(validateSuggestion("event", p, SRC, NOW), String(p)).toEqual({ ok: false, reason: "payload_must_be_an_object" });
    }
    for (const s of [undefined, "", "http://church.example", "javascript:1", "church.example"]) {
      expect(validateSuggestion("event", goodEvent, s, NOW), String(s)).toEqual({ ok: false, reason: "source_url_must_be_https" });
    }
  });
});

describe("validateSuggestion: events", () => {
  it("accepts a good event and normalises it", () => {
    const r = validateSuggestion("event", goodEvent, SRC, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== "event") throw new Error("expected an event");
    expect(r.payload.title).toBe("Sunday Celebration");
    expect(r.payload.start).toBe("2026-10-11T07:00:00.000Z");
    expect(r.payload.end).toBe("2026-10-11T09:00:00.000Z");
    expect(r.payload.category).toBe("church-services");
    expect(r.sourceUrl).toBe(SRC);
    expect(r.warnings).toEqual([]);
    expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("copies ONLY the allow-listed keys (an unknown key is dropped, never stored)", () => {
    const r = validateSuggestion("event", { ...goodEvent, created_by: "someone-else", status: "cancelled", visibility: "private", contact_phone: "0821234567", attendee_list: ["a"] }, SRC, NOW);
    if (!r.ok) throw new Error(r.reason);
    expect(Object.keys(r.payload).sort()).toEqual(["category", "description", "end", "image_url", "location", "start", "title", "website_url"]);
  });

  it("requires a real title and a start with an explicit offset", () => {
    expect(validateSuggestion("event", { ...goodEvent, title: "  " }, SRC, NOW)).toEqual({ ok: false, reason: "event_title_required" });
    expect(validateSuggestion("event", { ...goodEvent, title: "ab" }, SRC, NOW)).toEqual({ ok: false, reason: "event_title_required" });
    for (const start of [undefined, "", "tomorrow", "2026-10-11", "2026-10-11 09:00", "2026-10-11T09:00", "2026-13-40T09:00:00Z", 12345]) {
      expect(validateSuggestion("event", { ...goodEvent, start }, SRC, NOW), String(start)).toEqual({ ok: false, reason: "event_start_invalid" });
    }
  });

  it("refuses a start before 2000 or more than two years ahead", () => {
    expect(validateSuggestion("event", { ...goodEvent, start: "1999-12-31T09:00:00Z" }, SRC, NOW)).toEqual({ ok: false, reason: "event_start_out_of_range" });
    expect(validateSuggestion("event", { ...goodEvent, start: "2030-01-01T09:00:00Z" }, SRC, NOW)).toEqual({ ok: false, reason: "event_start_out_of_range" });
  });

  it("keeps a PAST event (it can wait for approval) but never marks it auto-publishable", () => {
    const r = validateSuggestion("event", { ...goodEvent, start: "2026-09-27T09:00:00+02:00", end: null }, SRC, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== "event") throw new Error("expected an event");
    expect(isAutoPublishable("events_auto", r, NOW)).toBe(false);
  });

  it("drops an unusable end time with a warning instead of failing the event", () => {
    for (const end of ["2026-10-11T08:00:00+02:00", "2027-10-11T11:00:00+02:00", "later", 5]) {
      const r = validateSuggestion("event", { ...goodEvent, end }, SRC, NOW);
      if (!r.ok || r.kind !== "event") throw new Error("expected an event");
      expect(r.payload.end, String(end)).toBeNull();
      expect(r.warnings.join(" ")).toMatch(/end time/);
    }
  });

  it("scrubs phone numbers and emails out of the title, description and location, with one warning", () => {
    const r = validateSuggestion(
      "event",
      { ...goodEvent, title: "Youth night, call 082 123 4567", description: "Questions? mail leader@home.example or +27 82 123 4567", location: "Hall (ask 012 345 6789)" },
      SRC,
      NOW,
    );
    if (!r.ok || r.kind !== "event") throw new Error("expected an event");
    const all = `${r.payload.title} ${r.payload.description} ${r.payload.location}`;
    expect(all).not.toMatch(/082|leader@|012 345/);
    expect(all).toContain("[removed]");
    expect(r.warnings.filter((w) => /removed/.test(w))).toHaveLength(1);
  });

  it("falls back to Church services for an unknown category, and drops non-https links, each with a warning", () => {
    const r = validateSuggestion("event", { ...goodEvent, category: "bingo", image_url: "http://x.example/a.jpg", website_url: "javascript:alert(1)" }, SRC, NOW);
    if (!r.ok || r.kind !== "event") throw new Error("expected an event");
    expect(r.payload.category).toBe("church-services");
    expect(r.payload.image_url).toBeNull();
    expect(r.payload.website_url).toBeNull();
    expect(r.warnings).toHaveLength(3);
  });

  it("caps lengths and strips control characters", () => {
    const r = validateSuggestion("event", { ...goodEvent, title: "T".repeat(500), description: "line1\u0000\u0007\n\n\n\n\nline2" + "x".repeat(5000) }, SRC, NOW);
    if (!r.ok || r.kind !== "event") throw new Error("expected an event");
    expect(r.payload.title.length).toBe(120);
    expect(r.payload.description.length).toBeLessThanOrEqual(2000);
    expect(r.payload.description).not.toMatch(/\u0000|\u0007/);
    expect(r.payload.description.startsWith("line1 \n\nline2")).toBe(true);
  });

  it("gives the same fingerprint to the same event on another day's run, and a different one for a different day or title", () => {
    const a = validateSuggestion("event", goodEvent, SRC, NOW);
    const b = validateSuggestion("event", { ...goodEvent, title: "sunday celebration!", description: "A different blurb", location: "Elsewhere" }, "https://www.church.example/other", new Date("2026-10-06T08:00:00Z"));
    const otherDay = validateSuggestion("event", { ...goodEvent, start: "2026-10-18T09:00:00+02:00" }, SRC, NOW);
    const otherTitle = validateSuggestion("event", { ...goodEvent, title: "Prayer Evening" }, SRC, NOW);
    if (!a.ok || !b.ok || !otherDay.ok || !otherTitle.ok) throw new Error("expected valid events");
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(otherDay.fingerprint).not.toBe(a.fingerprint);
    expect(otherTitle.fingerprint).not.toBe(a.fingerprint);
  });
});

describe("isAutoPublishable: events only, at events_auto only, never already-started", () => {
  const future: EventPayload = { ...(goodEvent as unknown as EventPayload), start: "2026-10-11T07:00:00.000Z" };
  it("publishes a future event at events_auto", () => {
    expect(isAutoPublishable("events_auto", { kind: "event", payload: future }, NOW)).toBe(true);
  });
  it("never at off or suggest", () => {
    expect(isAutoPublishable("off", { kind: "event", payload: future }, NOW)).toBe(false);
    expect(isAutoPublishable("suggest", { kind: "event", payload: future }, NOW)).toBe(false);
  });
  it("never for news or profile suggestions, even at events_auto", () => {
    expect(isAutoPublishable("events_auto", { kind: "news", payload: { title: "x", body: "y", link: null, image_url: null, post_date: "2026-10-04" } }, NOW)).toBe(false);
    expect(isAutoPublishable("events_auto", { kind: "profile", payload: { field: "bio", value: "x" } }, NOW)).toBe(false);
  });
  it("never for an event that has already started, nor one starting this very instant", () => {
    expect(isAutoPublishable("events_auto", { kind: "event", payload: { ...future, start: "2026-10-04T07:59:59.000Z" } }, NOW)).toBe(false);
    expect(isAutoPublishable("events_auto", { kind: "event", payload: { ...future, start: NOW.toISOString() } }, NOW)).toBe(false);
  });
});

describe("validateSuggestion: news", () => {
  const news = { title: "New building opens", body: "We open our doors on Sunday.", link: "https://www.church.example/news/1", image_url: "https://www.church.example/n.jpg" };

  it("accepts a news post and defaults the date to today", () => {
    const r = validateSuggestion("news", news, SRC, NOW);
    if (!r.ok || r.kind !== "news") throw new Error("expected news");
    expect(r.payload).toEqual({ ...news, post_date: "2026-10-04" });
  });
  it("requires a title and a body", () => {
    expect(validateSuggestion("news", { ...news, title: "" }, SRC, NOW)).toEqual({ ok: false, reason: "news_title_required" });
    expect(validateSuggestion("news", { ...news, body: "   " }, SRC, NOW)).toEqual({ ok: false, reason: "news_body_required" });
  });
  it("copies only the allow-listed keys and scrubs personal contact details", () => {
    const r = validateSuggestion("news", { ...news, body: "Ring Pastor on 082 123 4567 or pastor@home.example", author_id: "x", pinned: true }, SRC, NOW);
    if (!r.ok || r.kind !== "news") throw new Error("expected news");
    expect(Object.keys(r.payload).sort()).toEqual(["body", "image_url", "link", "post_date", "title"]);
    expect(r.payload.body).toBe("Ring Pastor on [removed] or [removed]");
    expect(r.warnings.join(" ")).toMatch(/removed/);
  });
  it("accepts a sane post_date and ignores a future or malformed one", () => {
    const ok = validateSuggestion("news", { ...news, post_date: "2026-10-01" }, SRC, NOW);
    const future = validateSuggestion("news", { ...news, post_date: "2027-01-01" }, SRC, NOW);
    const junk = validateSuggestion("news", { ...news, post_date: "yesterday" }, SRC, NOW);
    if (!ok.ok || !future.ok || !junk.ok || ok.kind !== "news" || future.kind !== "news" || junk.kind !== "news") throw new Error("expected news");
    expect(ok.payload.post_date).toBe("2026-10-01");
    expect(future.payload.post_date).toBe("2026-10-04");
    expect(junk.payload.post_date).toBe("2026-10-04");
  });
  it("dedupes on the article link when there is one, else on the title", () => {
    const a = validateSuggestion("news", news, SRC, NOW);
    const sameLink = validateSuggestion("news", { ...news, title: "Retitled" }, SRC, NOW);
    const noLinkA = validateSuggestion("news", { ...news, link: null }, SRC, NOW);
    const noLinkB = validateSuggestion("news", { ...news, link: null, title: "NEW  building opens!" }, SRC, NOW);
    if (!a.ok || !sameLink.ok || !noLinkA.ok || !noLinkB.ok) throw new Error("expected news");
    expect(sameLink.fingerprint).toBe(a.fingerprint);
    expect(noLinkB.fingerprint).toBe(noLinkA.fingerprint);
    expect(noLinkA.fingerprint).not.toBe(a.fingerprint);
  });
});

describe("validateSuggestion: profile updates", () => {
  it("offers organisation fields only: no personal phone or WhatsApp number, nothing else", () => {
    expect([...PROFILE_FIELDS].sort()).toEqual(
      ["bio", "contact_email", "cover_url", "facebook_url", "instagram_handle", "linkedin_url", "logo_url", "tiktok_handle", "website_url", "x_handle", "youtube_url"].sort(),
    );
    for (const field of ["whatsapp_number", "phone", "email", "role", "contributor_status", "contributor_hidden", "billing_tier", "full_name", "physical_address", "id"]) {
      expect(validateSuggestion("profile", { field, value: "x" }, SRC, NOW), field).toEqual({ ok: false, reason: "profile_field_not_allowed" });
    }
    expect(validateSuggestion("profile", { value: "x" }, SRC, NOW)).toEqual({ ok: false, reason: "profile_field_not_allowed" });
  });
  it("accepts a bio, scrubbing personal details", () => {
    const r = validateSuggestion("profile", { field: "bio", value: "We serve Pretoria. Call 012 345 6789." }, SRC, NOW);
    if (!r.ok || r.kind !== "profile") throw new Error("expected profile");
    expect(r.payload).toEqual({ field: "bio", value: "We serve Pretoria. Call [removed]." });
    expect(validateSuggestion("profile", { field: "bio", value: "  " }, SRC, NOW)).toEqual({ ok: false, reason: "profile_value_required" });
  });
  it("requires https links for website, logo and cover", () => {
    for (const field of ["website_url", "logo_url", "cover_url"]) {
      expect(validateSuggestion("profile", { field, value: "https://www.church.example/a.png" }, SRC, NOW).ok, field).toBe(true);
      for (const value of ["http://www.church.example/a.png", "javascript:1", "church.example", ""]) {
        expect(validateSuggestion("profile", { field, value }, SRC, NOW), `${field} ${value}`).toEqual({ ok: false, reason: "profile_value_invalid" });
      }
    }
  });
  it("validates contact_email", () => {
    const r = validateSuggestion("profile", { field: "contact_email", value: " Office@Church.Example " }, SRC, NOW);
    if (!r.ok || r.kind !== "profile") throw new Error("expected profile");
    expect(r.payload.value).toBe("office@church.example");
    expect(validateSuggestion("profile", { field: "contact_email", value: "not an email" }, SRC, NOW)).toEqual({ ok: false, reason: "profile_value_invalid" });
  });
  it("runs social values through the shared classifier (a display name is not a handle; a link must be on its platform)", () => {
    expect(validateSuggestion("profile", { field: "instagram_handle", value: "@gracechurch" }, SRC, NOW).ok).toBe(true);
    expect(validateSuggestion("profile", { field: "youtube_url", value: "https://www.youtube.com/@gracechurch" }, SRC, NOW).ok).toBe(true);
    expect(validateSuggestion("profile", { field: "instagram_handle", value: "Grace Church Radio" }, SRC, NOW)).toEqual({ ok: false, reason: "profile_value_invalid" });
    expect(validateSuggestion("profile", { field: "facebook_url", value: "https://shop.example/buy" }, SRC, NOW)).toEqual({ ok: false, reason: "profile_value_invalid" });
    expect(validateSuggestion("profile", { field: "x_handle", value: "javascript:alert(1)" }, SRC, NOW)).toEqual({ ok: false, reason: "profile_value_invalid" });
  });
  it("dedupes on field and value", () => {
    const a = validateSuggestion("profile", { field: "bio", value: "We serve Pretoria." }, SRC, NOW);
    const b = validateSuggestion("profile", { field: "bio", value: "we  serve PRETORIA" }, SRC, NOW);
    const c = validateSuggestion("profile", { field: "website_url", value: "https://www.church.example/" }, SRC, NOW);
    if (!a.ok || !b.ok || !c.ok) throw new Error("expected profile");
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });
});

describe("sources", () => {
  it("only website, YouTube and calendar are readable in Phase 1/2 (Meta and TikTok need the page owner to connect an account)", () => {
    expect([...READABLE_SOURCE_KINDS].sort()).toEqual(["calendar", "website", "youtube"]);
  });
});
