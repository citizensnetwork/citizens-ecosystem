// schema.org Event in JSON-LD, the structured data a page publishes about its own events.
// Deterministic: it reads only fields the page states; nothing is inferred from free text.

import { httpsUrl, htmlToText, multiLine, oneLine } from "./text.mjs";
import { parseIsoDateTime } from "./time.mjs";

const MAX_NODES = 1000;
const MAX_DEPTH = 6;

/** schema.org types that are an event (Event and its named subtypes). */
const EVENT_TYPES = new Set([
  "Event", "BusinessEvent", "ChildrensEvent", "ComedyEvent", "CourseInstance", "DanceEvent", "DeliveryEvent",
  "EducationEvent", "EventSeries", "ExhibitionEvent", "Festival", "FoodEvent", "Hackathon", "LiteraryEvent",
  "MusicEvent", "PublicationEvent", "SaleEvent", "ScreeningEvent", "SocialEvent", "SportsEvent",
  "TheaterEvent", "VisualArtsEvent",
]);

function typeNames(node) {
  const raw = node["@type"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((t) => typeof t === "string")
    .map((t) => t.slice(Math.max(t.lastIndexOf("/"), t.lastIndexOf(":")) + 1));
}

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** A schema.org text value: a string, {"@value": ...}, or the first of a list. */
function str(v) {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.length ? str(v[0]) : "";
  if (isObject(v) && typeof v["@value"] === "string") return v["@value"];
  return "";
}

function locationText(loc) {
  const first = Array.isArray(loc) ? loc[0] : loc;
  if (typeof first === "string") return first;
  if (!isObject(first)) return "";
  const types = typeNames(first);
  if (types.includes("VirtualLocation")) return "Online";
  const name = str(first.name);
  const a = first.address;
  let address = "";
  if (typeof a === "string") address = a;
  else if (isObject(a)) {
    address = [str(a.streetAddress), str(a.addressLocality), str(a.addressRegion), str(a.postalCode)].filter(Boolean).join(", ");
  }
  return [name, address].filter(Boolean).join(", ");
}

/**
 * @param {string[]} blocks the raw text of each JSON-LD script
 * @param {string} pageUrl
 * @returns {{ events: {title:string, description:string, startMs:number, endMs:number|null, location:string, url:string|null}[], skippedNoTime:number, cancelled:number }}
 */
export function eventsFromJsonLd(blocks, pageUrl) {
  const result = { events: [], skippedNoTime: 0, cancelled: 0 };
  let nodes = 0;

  const visit = (node, depth) => {
    if (nodes++ > MAX_NODES || depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n, depth + 1);
      return;
    }
    if (!isObject(node)) return;
    if (Array.isArray(node["@graph"])) visit(node["@graph"], depth + 1);
    if (Array.isArray(node.itemListElement)) {
      for (const el of node.itemListElement) visit(isObject(el) && el.item ? el.item : el, depth + 1);
    }
    if (typeNames(node).some((t) => EVENT_TYPES.has(t))) {
      readEvent(node);
      if (node.subEvent) visit(node.subEvent, depth + 1);
    } else {
      // An Organization / Place / WebPage that lists its events.
      if (node.event) visit(node.event, depth + 1);
      if (node.mainEntity) visit(node.mainEntity, depth + 1);
    }
  };

  const readEvent = (node) => {
    const status = str(node.eventStatus);
    if (/EventCancelled|EventPostponed/.test(status)) {
      result.cancelled++;
      return;
    }
    const title = oneLine(htmlToText(str(node.name)), 200);
    if (!title) return;
    const start = parseIsoDateTime(str(node.startDate));
    if (!start) return;
    if (start.kind !== "datetime") {
      result.skippedNoTime++;
      return;
    }
    const end = parseIsoDateTime(str(node.endDate));
    let location = oneLine(htmlToText(locationText(node.location)), 300);
    if (!location && /OnlineEventAttendanceMode/.test(str(node.eventAttendanceMode))) location = "Online";
    result.events.push({
      title,
      description: multiLine(htmlToText(str(node.description)), 4000),
      startMs: start.ms,
      endMs: end?.kind === "datetime" ? end.ms : null,
      location,
      url: httpsUrl(str(node.url), pageUrl),
    });
  };

  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(stripWrappers(block));
    } catch {
      continue; // one malformed block never hides the others
    }
    visit(parsed, 0);
  }
  return result;
}

/** Some sites wrap the JSON in an HTML comment or CDATA marker; JSON.parse would refuse that. */
function stripWrappers(text) {
  let t = text.trim();
  if (t.startsWith("<!--")) t = t.slice(4);
  if (t.endsWith("-->")) t = t.slice(0, -3);
  t = t.trim();
  if (t.startsWith("//<![CDATA[")) t = t.slice(11);
  else if (t.startsWith("<![CDATA[")) t = t.slice(9);
  if (t.endsWith("//]]>")) t = t.slice(0, -5);
  else if (t.endsWith("]]>")) t = t.slice(0, -3);
  return t.trim();
}
