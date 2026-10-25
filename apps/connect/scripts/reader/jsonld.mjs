// schema.org Events from a page's JSON-LD blocks. Pure, and never throws.
//
// Found wherever they sit: a top-level object, an array, an "@graph", or nested inside another
// node (an Organization's "event", an Event's "subEvent"), within a fixed node budget. A
// cancelled or postponed event is counted, not returned. An event with only a date (no start
// time) is counted, not returned: Connect publishes a start time and the Reader does not guess one.

import { htmlToText } from "./html.mjs";
import { DEFAULT_TZ, parseIsoDateTime } from "./time.mjs";

const MAX_NODES = 5_000;
const MAX_DEPTH = 12;
const EXTRA_EVENT_TYPES = new Set(["festival", "hackathon", "courseinstance"]);

/** "Event", "MusicEvent", "schema:Event", "https://schema.org/Event" ... */
function isEventType(type) {
  const list = Array.isArray(type) ? type : [type];
  return list.some((t) => {
    if (typeof t !== "string") return false;
    const local = t.slice(Math.max(t.lastIndexOf("/"), t.lastIndexOf(":")) + 1).toLowerCase();
    return local.endsWith("event") || EXTRA_EVENT_TYPES.has(local);
  });
}

const str = (v) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const first = (v) => (Array.isArray(v) ? v[0] : v);

function enumValue(v) {
  const s = str(first(v));
  return s.slice(Math.max(s.lastIndexOf("/"), s.lastIndexOf(":")) + 1).toLowerCase();
}

function addressText(a) {
  const v = first(a);
  if (typeof v === "string") return htmlToText(v, 300);
  if (!v || typeof v !== "object") return "";
  const parts = [v.streetAddress, v.addressLocality, v.addressRegion, v.postalCode].map((p) => htmlToText(str(p), 120)).filter(Boolean);
  return parts.join(", ");
}

function locationText(loc, attendance) {
  const v = first(loc);
  if (typeof v === "string") return htmlToText(v, 300);
  if (v && typeof v === "object") {
    if (isVirtual(v)) return "Online";
    const name = htmlToText(str(v.name), 150);
    const address = addressText(v.address) || (isPostal(v) ? addressText(v) : "");
    const text = name && address && !address.toLowerCase().includes(name.toLowerCase()) ? `${name}, ${address}` : address || name;
    if (text) return text;
  }
  return enumValue(attendance) === "onlineeventattendancemode" ? "Online" : "";
}

const typeIs = (node, wanted) => (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).some((t) => typeof t === "string" && t.toLowerCase().endsWith(wanted));
const isVirtual = (node) => typeIs(node, "virtuallocation");
const isPostal = (node) => typeIs(node, "postaladdress");

function httpsUrl(raw, base) {
  const v = str(first(raw)) || (first(raw) && typeof first(raw) === "object" ? str(first(raw)["@id"] ?? first(raw).url) : "");
  if (!v) return null;
  try {
    const u = new URL(v.trim(), base);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Parse one JSON-LD block; HTML comment wrappers some CMSs add are tolerated. Returns undefined when it is not JSON. */
export function parseJsonLdBlock(text) {
  let t = String(text ?? "").trim();
  if (t.startsWith("<!--")) t = t.slice(4);
  if (t.endsWith("-->")) t = t.slice(0, -3);
  t = t.trim();
  if (t.startsWith("<![CDATA[") && t.endsWith("]]>")) t = t.slice(9, -3);
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/**
 * @param {string[]} blocks  raw JSON-LD texts from the page
 * @param {string} pageUrl
 * @returns {{ events: { title, description, startMs, endMs, location, url }[], skippedNoTime: number, cancelled: number }}
 */
export function eventsFromJsonLd(blocks, pageUrl, tz = DEFAULT_TZ) {
  const out = { events: [], skippedNoTime: 0, cancelled: 0 };
  const seen = new Set();
  let budget = MAX_NODES;

  const visit = (node, depth) => {
    if (budget-- <= 0 || depth > MAX_DEPTH || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    if (isEventType(node["@type"])) take(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "@context") continue;
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };

  const take = (e) => {
    const status = enumValue(e.eventStatus);
    if (status === "eventcancelled" || status === "eventpostponed") {
      out.cancelled++;
      return;
    }
    const start = parseIsoDateTime(str(first(e.startDate)), tz);
    if (!start || !("ms" in start)) {
      out.skippedNoTime++;
      return;
    }
    const end = parseIsoDateTime(str(first(e.endDate)), tz);
    out.events.push({
      title: htmlToText(str(first(e.name)), 400),
      description: htmlToText(str(first(e.description)), 6_000),
      startMs: start.ms,
      endMs: end && "ms" in end && end.ms > start.ms ? end.ms : null,
      location: locationText(e.location, e.eventAttendanceMode),
      url: httpsUrl(e.url, pageUrl),
    });
  };

  for (const block of blocks.slice(0, 30)) {
    const parsed = parseJsonLdBlock(block);
    if (parsed !== undefined) visit(parsed, 0);
  }
  return out;
}
