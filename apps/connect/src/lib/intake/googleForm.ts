/**
 * Pure helpers for POST /api/intake/google-form — the Google Form → map
 * Contributor intake (build brief: docs/handoffs/CONTRIBUTOR_FORM_INTAKE_HANDOFF.md).
 *
 * The founder's Apps Script (tools/google-forms/intake.gs) sends the Form's
 * RAW answer labels; every label → slug decision lives here, server-side, so
 * there is one source of truth and the script stays dumb. Unknown labels are
 * rejected (never silently defaulted) and the script writes the error back to
 * the Sheet row.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { CONTRIBUTOR_TYPES, type ContributorType } from "@/lib/categories";
import type { ContributorKind } from "@/types/db";

// ── Labels ──────────────────────────────────────────────────────────────

/** Case/space/`&`/`/`-insensitive form of a Form answer label. */
export function normaliseLabel(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

// "Individual (freelancer, speaker)" → "individual". Bounded, so it can't be
// driven into backtracking.
const TRAILING_NOTE_RE = /\s*\([^()]{0,200}\)$/;

function lookupLabel<T>(table: ReadonlyMap<string, T>, raw: string): T | undefined {
  const key = normaliseLabel(raw);
  return table.get(key) ?? table.get(key.replace(TRAILING_NOTE_RE, ""));
}

// Q2.2 "Organisation Type". The live Form's options (founder, 2026-09-26) are
// the first four; the brief's wording is accepted too, so a later edit of the
// Form's option text doesn't silently break intake.
const KIND_LABELS: ReadonlyMap<string, ContributorKind> = new Map([
  ["church", "ministry"],
  ["christian nonprofit/ministry", "organization"],
  ["christian business", "business"],
  ["individual", "individual"],
  ["ministry", "ministry"],
  ["organisation", "organization"],
  ["organization", "organization"],
  ["business", "business"],
]);

// Q2.3 "Primary category": the 12 Contributor type labels, plus each slug.
const TYPE_LABELS: ReadonlyMap<string, ContributorType> = new Map(
  CONTRIBUTOR_TYPES.flatMap((t) => [
    [normaliseLabel(t.label), t.value] as const,
    [t.value, t.value] as const,
  ]),
);

export type LabelResult<T> = { ok: true; value: T } | { ok: false };

/** Empty → null kind (the question is optional to the schema); unknown → not ok. */
export function mapOrganisationType(raw: unknown): LabelResult<ContributorKind | null> {
  if (typeof raw !== "string" || !raw.trim()) return { ok: true, value: null };
  const kind = lookupLabel(KIND_LABELS, raw);
  return kind ? { ok: true, value: kind } : { ok: false };
}

/** Required: empty or unknown → not ok. */
export function mapPrimaryCategory(raw: unknown): LabelResult<ContributorType> {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false };
  const type = lookupLabel(TYPE_LABELS, raw);
  return type ? { ok: true, value: type } : { ok: false };
}

/**
 * Q3.1 "Do you have a fixed physical location people can visit?" → true/false,
 * null when unanswered (the caller decides from whether an address was given),
 * or "unknown" for an answer that is neither yes nor no.
 */
export function parseFixedLocation(raw: unknown): boolean | null | "unknown" {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const answer = normaliseLabel(raw);
  if (answer.startsWith("yes")) return true;
  if (answer.startsWith("no")) return false;
  return "unknown";
}

// ── Coordinates ─────────────────────────────────────────────────────────

export type LatLng = { lat: number; lng: number };

const MAX_MAPS_URL = 2_048;
const NUM = "(-?\\d{1,3}(?:\\.\\d{1,15})?)";
// Most → least precise: the dropped pin, then an explicit coordinate query,
// then the viewport centre. Bounded quantifiers throughout.
const COORD_PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|query|ll|destination|center)=(?:loc:)?${NUM},\\+?${NUM}(?=$|[&#])`),
  new RegExp(`@${NUM},${NUM}`),
];

/** A usable coordinate pair, or null (out of range, or the 0,0 "null island"). */
export function toLatLng(lat: unknown, lng: unknown): LatLng | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * Coordinates embedded in a (long) Google Maps link, or null. The server never
 * FETCHES the link (no SSRF surface) — short maps.app.goo.gl links are
 * resolved by the Apps Script before it sends them.
 */
export function parseMapsCoordinates(link: unknown): LatLng | null {
  if (typeof link !== "string" || !link.trim() || link.length > MAX_MAPS_URL) return null;
  let text = link.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    text = text.replace(/%2C/gi, ",");
  }
  for (const re of COORD_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const point = toLatLng(Number(m[1]), Number(m[2]));
      if (point) return point;
    }
  }
  return null;
}

/**
 * Forward-geocode an address with MapTiler (same endpoint and South-Africa
 * bias as the frontend's store.jsx geocodeAddress). Best-effort: any failure
 * is null and the caller records a warning instead of failing the intake.
 * `referer` is sent because the key may be origin-restricted in MapTiler.
 */
export async function geocodeWithMapTiler(
  address: string,
  opts: { key: string; referer: string },
): Promise<LatLng | null> {
  const q = address.trim().slice(0, 300);
  if (!q || !opts.key) return null;
  try {
    const url =
      `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json` +
      `?key=${encodeURIComponent(opts.key)}&limit=1&country=za`;
    const res = await fetch(url, {
      headers: { Referer: opts.referer },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: { center?: unknown }[] };
    const center = json.features?.[0]?.center;
    return Array.isArray(center) ? toLatLng(center[1], center[0]) : null;
  } catch {
    return null;
  }
}

// ── Signature ───────────────────────────────────────────────────────────

/** Replay window for X-Intake-Timestamp, in seconds either side of now. */
export const SIGNATURE_WINDOW_SECONDS = 300;

/** hex HMAC-SHA256(secret, `${timestamp}.${body}`) — the Apps Script computes the same. */
export function signIntake(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyIntakeSignature(args: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSeconds: number;
}): boolean {
  const { secret, timestamp, signature, body, nowSeconds } = args;
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_WINDOW_SECONDS) return false;
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signIntake(secret, timestamp, body), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ── Images ──────────────────────────────────────────────────────────────

/**
 * Per image, decoded. Two images at this cap are ~4 MB of base64 — under
 * Vercel's ~4.5 MB request-body limit with room for the JSON around them.
 * The Apps Script applies the same cap (and resizes larger photos first).
 */
export const MAX_IMAGE_BYTES = 1_500_000;
const MAX_IMAGE_BASE64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type IntakeImage = {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
};

export type ImageResult =
  | { ok: true; image: IntakeImage }
  | { ok: false; reason: "invalid" | "too_large" | "unsupported_type" };

/** The real type from the file's magic bytes — never the claimed mime alone. */
export function sniffImageType(bytes: Buffer): IntakeImage["contentType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const EXT: Record<IntakeImage["contentType"], IntakeImage["ext"]> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** `{mime, base64}` from the script → a checked image, or why it was refused. Null = not sent. */
export function decodeIntakeImage(input: unknown): ImageResult | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") return { ok: false, reason: "invalid" };
  const { mime, base64 } = input as { mime?: unknown; base64?: unknown };
  if (typeof mime === "string" && mime && !ALLOWED_IMAGE_MIME.has(mime.toLowerCase())) {
    return { ok: false, reason: "unsupported_type" };
  }
  if (typeof base64 !== "string" || !base64) return { ok: false, reason: "invalid" };
  // Size BEFORE decoding or pattern-matching: never process an unbounded string.
  if (base64.length > MAX_IMAGE_BASE64 + 4) return { ok: false, reason: "too_large" };
  if (!BASE64_RE.test(base64)) return { ok: false, reason: "invalid" };
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return { ok: false, reason: "invalid" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, reason: "unsupported_type" };
  return { ok: true, image: { bytes, contentType, ext: EXT[contentType] } };
}
