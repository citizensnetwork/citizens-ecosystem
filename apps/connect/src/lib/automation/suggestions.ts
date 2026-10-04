/**
 * Listing automation, Phase 1: the pure rules for a suggested update.
 *
 * A reader (Phase 2: a daily scheduled task) looks at a Contributor's public
 * website, YouTube channel and calendar and posts what it finds to
 * POST /api/automation/suggestions. Nothing it sends is trusted. This module is
 * the whole of "what may come in", with no I/O, so every rule is unit-tested:
 *
 *   - an ALLOW-LIST by construction: only the keys named below are ever copied
 *     into a payload, so an unknown key is dropped, never stored;
 *   - ORGANISATION content only (events, news posts, a few profile fields).
 *     Phone numbers and email addresses typed into free text are replaced with
 *     "[removed]" (POPIA: never individuals' contact details), and the WhatsApp
 *     number is not a suggestible field at all;
 *   - https links only, no credentials, bounded length;
 *   - a stable `fingerprint` so the same item posted on two days is one row.
 *
 * Auto-publish is for events only, only at level `events_auto`, and never for
 * an event that has already started (`isAutoPublishable`).
 *
 * No IMAGES in Phase 1. A suggestion's image would be someone else's URL, and the
 * site's CSP (`img-src`) only allows our own hosts, so a hotlinked picture would
 * render broken (and hotlinking leaks viewers' addresses to a third party). Images
 * need a server-side copy into our own storage, which is a Phase 2 step; until then
 * an `image_url` on an event or news item is dropped with a warning, and a logo or cover
 * is not a suggestible profile field at all.
 */

import { createHash } from "node:crypto";
import { EVENT_CATEGORIES } from "@/lib/categories";
import { checkSocialField, MAX_PUBLIC_URL_LENGTH } from "@/lib/publicUrl";
import { MAX_BIO, normaliseEmail } from "@/lib/contributorFields";

export const AUTO_UPDATE_LEVELS = ["off", "suggest", "events_auto"] as const;
export type AutoUpdateLevel = (typeof AUTO_UPDATE_LEVELS)[number];

/** Where an owner's consent was given. Set by the server, never by the client. */
export const CONSENT_SOURCES = ["google_form", "dashboard", "admin"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const SOURCE_KINDS = ["website", "youtube", "calendar", "facebook", "instagram", "tiktok"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
/**
 * What the Phase 2 reader can actually read. Meta and TikTok do not allow reading a
 * page without the page owner connecting an account, so those rows may exist but
 * stay "coming soon" and cannot be switched on.
 */
export const READABLE_SOURCE_KINDS: readonly SourceKind[] = ["website", "youtube", "calendar"];

export const SUGGESTION_KINDS = ["event", "news", "profile"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const SUGGESTION_STATUSES = ["pending", "published", "auto_published", "dismissed", "superseded"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const MAX_ITEMS_PER_REQUEST = 50;

const MAX_TITLE = 120;
const MIN_TITLE = 3;
const MAX_EVENT_DESCRIPTION = 2_000;
const MAX_NEWS_BODY = 4_000;
const MAX_LOCATION = 300;
/** An event this far ahead is a mistake, not a plan. */
const MAX_DAYS_AHEAD = 730;
/** An end time further than this after the start is dropped (a wrong year, a series). */
const MAX_EVENT_HOURS = 14 * 24;
const REMOVED = "[removed]";
const IMAGES_NOT_IMPORTED = "Images are not imported yet, so the image link was left out.";

// ── consent level ────────────────────────────────────────────────────────

/**
 * The Form's / dashboard's answer → a stored level. Absent means "an older script that
 * never sent it": off, silently. Anything else that is not one of the three is off plus
 * a warning (the Sheet's Notes), never a guess in the owner's favour.
 */
export function parseAutoUpdateLevel(raw: unknown): { level: AutoUpdateLevel; warning: string | null } {
  if (raw === undefined || raw === null || raw === "") return { level: "off", warning: null };
  if (typeof raw === "string" && (AUTO_UPDATE_LEVELS as readonly string[]).includes(raw)) {
    return { level: raw as AutoUpdateLevel, warning: null };
  }
  return {
    level: "off",
    warning: "Unrecognised automatic-updates answer, so automatic updates were left off for this listing.",
  };
}

export function isAutoUpdateLevel(v: unknown): v is AutoUpdateLevel {
  return typeof v === "string" && (AUTO_UPDATE_LEVELS as readonly string[]).includes(v);
}

// ── text, links, personal details ────────────────────────────────────────

// Bounded quantifiers throughout (the CodeQL polynomial-regex lesson, RESUME §3AL), and
// every caller caps the length first.
const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,189}\.[A-Za-z]{2,24}/g;
// Either grouped digits with separators (012 345 6789, +27 12 345 6789, (012) 345-6789) or an
// unbroken run of 9 to 15 digits. A date or a time ("2026-10-05 18:00") has neither shape.
const PHONE_IN_TEXT =
  /(?<![\w.])(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3}[\s.-]\d{3,4}(?![\w])|(?<![\w.])\+?\d{9,15}(?![\w])/g;

/** Replace email addresses and phone numbers in free text with "[removed]". */
export function scrubPersonalContact(text: string): { text: string; removed: boolean } {
  const scrubbed = text.replace(EMAIL_IN_TEXT, REMOVED).replace(PHONE_IN_TEXT, REMOVED);
  return { text: scrubbed, removed: scrubbed !== text };
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** A single-line string: control characters gone, whitespace collapsed, capped. */
function oneLine(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max * 4).replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** A multi-line string: control characters gone, runs of blank lines collapsed, capped. */
function multiLine(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .slice(0, max * 4)
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** An https URL with no credentials, or null. Fragments are dropped. */
export function httpsUrlOrNull(v: unknown, max: number = MAX_PUBLIC_URL_LENGTH): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (!u.hostname.includes(".")) return null;
  u.hash = "";
  const out = u.toString();
  return out.length > max ? null : out;
}

/** "https://www.example.org/x" → "example.org", for "Imported from <domain>". */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ── payloads ─────────────────────────────────────────────────────────────

export type EventPayload = {
  title: string;
  description: string;
  /** ISO 8601, with an offset. */
  start: string;
  end: string | null;
  location: string;
  category: string;
  website_url: string | null;
};

export type NewsPayload = {
  title: string;
  body: string;
  link: string | null;
  /** YYYY-MM-DD */
  post_date: string;
};

/**
 * The profile fields a suggestion may change: text and links only. Phone and WhatsApp
 * numbers are deliberately absent, and so are the logo and cover (images wait for Phase 2).
 */
export const PROFILE_FIELDS = [
  "bio",
  "website_url",
  "contact_email",
  "instagram_handle",
  "facebook_url",
  "tiktok_handle",
  "youtube_url",
  "x_handle",
  "linkedin_url",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfilePayload = { field: ProfileField; value: string };

export type SuggestionPayload = EventPayload | NewsPayload | ProfilePayload;

export type ValidatedSuggestion =
  | { ok: true; kind: "event"; payload: EventPayload; sourceUrl: string; fingerprint: string; warnings: string[] }
  | { ok: true; kind: "news"; payload: NewsPayload; sourceUrl: string; fingerprint: string; warnings: string[] }
  | { ok: true; kind: "profile"; payload: ProfilePayload; sourceUrl: string; fingerprint: string; warnings: string[] }
  | { ok: false; reason: string };

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Letters and digits only, lower-cased: "Sunday  Service!" and "sunday service" match. */
function normForFingerprint(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function sha256(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** A date-time with an explicit offset, or null. A bare "2026-10-05 18:00" is ambiguous, so refused. */
function parseDateTime(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length < 16 || t.length > 40) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(t)) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateEvent(raw: Record<string, unknown>, now: Date, warnings: string[]): { payload: EventPayload } | { reason: string } {
  const title = oneLine(raw.title, MAX_TITLE);
  if (title.length < MIN_TITLE) return { reason: "event_title_required" };

  const start = parseDateTime(raw.start);
  if (!start) return { reason: "event_start_invalid" };
  const year = start.getUTCFullYear();
  if (year < 2000 || start.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) {
    return { reason: "event_start_out_of_range" };
  }

  let end: Date | null = null;
  if (raw.end !== undefined && raw.end !== null && raw.end !== "") {
    const e = parseDateTime(raw.end);
    if (e && e.getTime() > start.getTime() && e.getTime() - start.getTime() <= MAX_EVENT_HOURS * 3_600_000) end = e;
    else warnings.push("The end time was not usable and was dropped.");
  }

  let pii = false;
  const scrub = (text: string) => {
    const r = scrubPersonalContact(text);
    pii ||= r.removed;
    return r.text;
  };

  const description = scrub(multiLine(raw.description, MAX_EVENT_DESCRIPTION));
  const location = scrub(oneLine(raw.location, MAX_LOCATION));
  const safeTitle = scrub(title);
  if (pii) warnings.push("Phone numbers or email addresses were removed from the text.");

  const known = EVENT_CATEGORIES.some((c) => c.value === raw.category);
  if (raw.category !== undefined && raw.category !== null && raw.category !== "" && !known) {
    warnings.push("The category was not recognised and was set to Church services.");
  }
  const category = known ? (raw.category as string) : "church-services";

  if (raw.image_url) warnings.push(IMAGES_NOT_IMPORTED);
  const website = raw.website_url === undefined || raw.website_url === null || raw.website_url === "" ? null : httpsUrlOrNull(raw.website_url);
  if (raw.website_url && !website) warnings.push("The website link was not a usable https link and was dropped.");

  return {
    payload: {
      title: safeTitle,
      description,
      start: start.toISOString(),
      end: end ? end.toISOString() : null,
      location,
      category,
      website_url: website,
    },
  };
}

function validateNews(raw: Record<string, unknown>, now: Date, warnings: string[]): { payload: NewsPayload } | { reason: string } {
  const title = oneLine(raw.title, MAX_TITLE);
  if (title.length < MIN_TITLE) return { reason: "news_title_required" };
  const bodyRaw = multiLine(raw.body, MAX_NEWS_BODY);
  if (!bodyRaw) return { reason: "news_body_required" };

  let pii = false;
  const scrub = (text: string) => {
    const r = scrubPersonalContact(text);
    pii ||= r.removed;
    return r.text;
  };
  const safeTitle = scrub(title);
  const body = scrub(bodyRaw);
  if (pii) warnings.push("Phone numbers or email addresses were removed from the text.");

  const link = raw.link === undefined || raw.link === null || raw.link === "" ? null : httpsUrlOrNull(raw.link);
  if (raw.link && !link) warnings.push("The link was not a usable https link and was dropped.");
  if (raw.image_url) warnings.push(IMAGES_NOT_IMPORTED);

  let postDate = now.toISOString().slice(0, 10);
  if (typeof raw.post_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.post_date)) {
    const d = new Date(`${raw.post_date}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= now.getTime() + 86_400_000 && d.getUTCFullYear() >= 2000) postDate = raw.post_date;
  }
  return { payload: { title: safeTitle, body, link, post_date: postDate } };
}

function validateProfile(raw: Record<string, unknown>, warnings: string[]): { payload: ProfilePayload } | { reason: string } {
  const field = raw.field;
  if (typeof field !== "string" || !(PROFILE_FIELDS as readonly string[]).includes(field)) {
    return { reason: "profile_field_not_allowed" };
  }
  const f = field as ProfileField;

  if (f === "bio") {
    const r = scrubPersonalContact(multiLine(raw.value, MAX_BIO));
    if (!r.text) return { reason: "profile_value_required" };
    if (r.removed) warnings.push("Phone numbers or email addresses were removed from the text.");
    return { payload: { field: f, value: r.text } };
  }
  if (f === "website_url") {
    const url = httpsUrlOrNull(raw.value);
    return url ? { payload: { field: f, value: url } } : { reason: "profile_value_invalid" };
  }
  if (f === "contact_email") {
    const email = normaliseEmail(raw.value);
    return email ? { payload: { field: f, value: email } } : { reason: "profile_value_invalid" };
  }
  // The social handles and links go through the same classifier as every other write, and a
  // full link must be on the platform it claims to be (an Instagram box cannot hold a shop).
  const check = checkSocialField(f, raw.value, MAX_PUBLIC_URL_LENGTH, { matchPlatformHost: true });
  if (!check.ok || !check.value) return { reason: "profile_value_invalid" };
  return { payload: { field: f, value: check.value } };
}

/**
 * Validate one suggested item. Never throws. `sourceUrl` is required (every suggestion is
 * attributable) and must be an https link.
 */
export function validateSuggestion(
  kind: unknown,
  payload: unknown,
  sourceUrl: unknown,
  now: Date = new Date(),
): ValidatedSuggestion {
  if (typeof kind !== "string" || !(SUGGESTION_KINDS as readonly string[]).includes(kind)) return fail("unknown_kind");
  if (!isPlainObject(payload)) return fail("payload_must_be_an_object");
  const source = httpsUrlOrNull(sourceUrl);
  if (!source) return fail("source_url_must_be_https");

  const warnings: string[] = [];
  if (kind === "event") {
    const r = validateEvent(payload, now, warnings);
    if ("reason" in r) return fail(r.reason);
    const day = r.payload.start.slice(0, 10);
    return { ok: true, kind, payload: r.payload, sourceUrl: source, warnings, fingerprint: sha256(["event", normForFingerprint(r.payload.title), day]) };
  }
  if (kind === "news") {
    const r = validateNews(payload, now, warnings);
    if ("reason" in r) return fail(r.reason);
    const anchor = r.payload.link ?? normForFingerprint(r.payload.title);
    return { ok: true, kind, payload: r.payload, sourceUrl: source, warnings, fingerprint: sha256(["news", anchor]) };
  }
  const r = validateProfile(payload, warnings);
  if ("reason" in r) return fail(r.reason);
  return {
    ok: true,
    kind: "profile",
    payload: r.payload,
    sourceUrl: source,
    warnings,
    fingerprint: sha256(["profile", r.payload.field, normForFingerprint(r.payload.value)]),
  };
}

/** Events only, only at `events_auto`, and only if it has not started yet. */
export function isAutoPublishable(
  level: AutoUpdateLevel,
  suggestion: { kind: SuggestionKind; payload: SuggestionPayload },
  now: Date = new Date(),
): boolean {
  if (level !== "events_auto" || suggestion.kind !== "event") return false;
  const start = Date.parse((suggestion.payload as EventPayload).start);
  return Number.isFinite(start) && start > now.getTime();
}
