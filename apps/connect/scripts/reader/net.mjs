// The Reader's polite fetcher. Every address it fetches was typed into a listing, so it is
// untrusted from the first byte:
//
//   - https only, on the default port, no credentials, never an IP literal or a local name;
//   - the address a name resolves to must be PUBLIC (no private, loopback, link-local, metadata,
//     carrier-grade NAT, multicast or documentation range), and that check runs inside the
//     connection's own DNS lookup, so the address that was checked is the address connected to
//     (no gap for a DNS answer that changes between a check and the fetch);
//   - redirects are followed by hand, at most 3, and each one is re-checked from the top,
//     including the robots.txt of the site it points at;
//   - robots.txt is read first and honoured (RFC 9309; unreachable means "stay away");
//   - one request a second per host, a 10 s deadline per request (lookup, connect and body), a
//     1 MB cap on the decoded body, an honest User-Agent, no cookies;
//   - Facebook, Instagram, TikTok, WhatsApp and Threads are never fetched, whatever points there.
//
// It never throws: a failure is { ok: false, reason } with a short, fixed phrase that is safe to
// show the owner on their dashboard and to print in a public log ("HTTP 404", "timed out", ...).

import https from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import zlib from "node:zlib";
import { isAllowed, parseRobots } from "./robots.mjs";

export const USER_AGENT = "CitizensConnectReader/1.0 (+https://www.citizenscentral.co.za)";

export const LIMITS = {
  minGapMs: 1_000,
  timeoutMs: 10_000,
  maxBytes: 1_000_000,
  maxRobotsBytes: 500_000,
  maxRedirects: 3,
};

/** The fixed phrases a fetch can fail with. Nothing else ever reaches a status line. */
export const REASONS = {
  notPublic: "not a public https address",
  neverRead: "this site is never read",
  lookup: "address lookup failed",
  robotsBlocked: "blocked by robots.txt",
  robotsUnavailable: "robots.txt unavailable",
  timeout: "timed out",
  connect: "could not connect",
  tooManyRedirects: "too many redirects",
  insecureRedirect: "redirected to a non-https address",
  encoding: "unsupported content encoding",
};

const NEVER_READ = ["facebook.com", "fb.com", "fb.me", "fbcdn.net", "instagram.com", "cdninstagram.com", "tiktok.com", "tiktokcdn.com", "whatsapp.com", "whatsapp.net", "wa.me", "threads.net", "threads.com"];

/** Is `hostname` one of the sites the Reader never reads (or a subdomain of one)? Exact label match, never a substring. */
export function isNeverReadHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, "");
  return NEVER_READ.some((d) => h === d || h.endsWith("." + d));
}

// ── is this a public address? ───────────────────────────────────────────────

function v4Private(a) {
  const o = a.split(".").map(Number);
  if (o.length !== 4 || o.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const [p, q, r] = o;
  if (p === 0 || p === 10 || p === 127) return true; // "this network", private, loopback
  if (p === 100 && q >= 64 && q <= 127) return true; // carrier-grade NAT
  if (p === 169 && q === 254) return true; // link local, cloud metadata
  if (p === 172 && q >= 16 && q <= 31) return true;
  if (p === 192 && q === 0 && (r === 0 || r === 2)) return true; // IETF assignments, TEST-NET-1
  if (p === 192 && q === 88 && r === 99) return true; // 6to4 relay
  if (p === 192 && q === 168) return true;
  if (p === 198 && (q === 18 || q === 19)) return true; // benchmarking
  if (p === 198 && q === 51 && r === 100) return true; // TEST-NET-2
  if (p === 203 && q === 0 && r === 113) return true; // TEST-NET-3
  return p >= 224; // multicast, reserved, broadcast
}

/** The 8 groups of an IPv6 address as numbers, or null. */
function v6Groups(a) {
  let s = a;
  let tail = [];
  const lastColon = s.lastIndexOf(":");
  if (s.slice(lastColon + 1).includes(".")) {
    const v4 = s.slice(lastColon + 1).split(".").map(Number);
    if (v4.length !== 4 || v4.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1) + "0:0";
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part) => (part === "" ? [] : part.split(":").map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 && fill !== 0) return null;
  if (fill < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill(0), ...rest];
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
  if (tail.length) groups.splice(6, 2, ...tail);
  return groups;
}

/** True for any address that is NOT publicly routable (and for anything that is not an address). */
export function isPrivateAddress(address) {
  const a = String(address).toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const family = isIP(a);
  if (family === 4) return v4Private(a);
  if (family !== 6) return true;
  const g = v6Groups(a);
  if (!g) return true;
  // IPv4-mapped (::ffff:a.b.c.d) and the deprecated IPv4-compatible form: judge the IPv4 address.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && g[7] <= 1) return true; // :: and ::1
    return v4Private(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  // Only global unicast (2000::/3) is public, minus documentation, 6to4, Teredo and ORCHID ranges in it.
  if (g[0] < 0x2000 || g[0] > 0x3fff) return true;
  if (g[0] === 0x2001 && (g[1] === 0x0db8 || g[1] === 0 || (g[1] >= 0x10 && g[1] <= 0x2f))) return true;
  if (g[0] === 0x2002 || g[0] === 0x3fff) return true;
  return false;
}

/** A name the Reader may even try to resolve: dotted, not an IP literal, not a local-only name. */
export function isPlausiblePublicHostname(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253 || !h.includes(".") || h.startsWith("[") || isIP(h) !== 0) return false;
  if (!/^[a-z0-9.-]+$/.test(h) || h.split(".").some((label) => !label || label.length > 63)) return false;
  // An IPv4 shorthand ("2130706433", "0x7f.1") is never a name: a real top-level label has a letter.
  const tld = h.slice(h.lastIndexOf(".") + 1);
  if (!/[a-z]/.test(tld) || /^0x/.test(tld)) return false;
  for (const local of ["localhost", "local", "internal", "lan", "home", "corp", "intranet", "test", "invalid", "example", "onion", "home.arpa"]) {
    if (h === local || h.endsWith("." + local)) return false;
  }
  return true;
}

/** https, default port, no credentials, a plausible public name, not a never-read site. Returns a reason or null. */
export function urlProblem(u) {
  if (u.protocol !== "https:" || u.username || u.password || (u.port !== "" && u.port !== "443")) return REASONS.notPublic;
  if (isNeverReadHost(u.hostname)) return REASONS.neverRead;
  if (!isPlausiblePublicHostname(u.hostname)) return REASONS.notPublic;
  return null;
}

// ── the connection-time guard ───────────────────────────────────────────────

export class BlockedAddressError extends Error {
  constructor() {
    super(REASONS.notPublic);
    this.code = "READER_BLOCKED_ADDRESS";
  }
}

/** Every address of `hostname`: [{ address, family }]. */
export function resolveAll(hostname) {
  return new Promise((resolve, reject) => dnsLookup(hostname, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs))));
}

/**
 * A `lookup` for node:net / node:https that refuses the connection unless EVERY address the name
 * resolves to is public, and then hands over exactly those checked addresses.
 */
export function guardedLookup(resolve = resolveAll) {
  return (hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "object" && options !== null ? options : {};
    resolve(hostname).then(
      (addrs) => {
        const list = (addrs ?? []).filter((x) => x && typeof x.address === "string");
        if (!list.length) return cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
        if (list.some((x) => isPrivateAddress(x.address))) return cb(new BlockedAddressError());
        const family = (x) => x.family === 6 || x.family === "IPv6" ? 6 : 4;
        if (opts.all) return cb(null, list.map((x) => ({ address: x.address, family: family(x) })));
        return cb(null, list[0].address, family(list[0]));
      },
      (err) => cb(err),
    );
  };
}

// ── reading a body with caps ────────────────────────────────────────────────

/**
 * Read `stream` (an HTTP response) through the decoder its Content-Encoding names, keeping at most
 * `maxBytes` of DECODED bytes (so a small compressed bomb cannot blow up). Resolves
 * { buffer, truncated } or rejects with Error(reason).
 */
export function readCapped(stream, encoding, maxBytes) {
  return new Promise((resolve, reject) => {
    const enc = String(encoding ?? "").trim().toLowerCase();
    let decoder = null;
    if (enc === "gzip" || enc === "x-gzip") decoder = zlib.createGunzip();
    else if (enc === "deflate") decoder = zlib.createInflate();
    else if (enc === "br") decoder = zlib.createBrotliDecompress();
    else if (enc !== "" && enc !== "identity") {
      stream.destroy?.();
      return reject(new Error(REASONS.encoding));
    }
    const source = decoder ? stream.pipe(decoder) : stream;
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (truncated) => {
      if (settled) return;
      settled = true;
      resolve({ buffer: Buffer.concat(chunks), truncated });
    };
    source.on("data", (chunk) => {
      if (settled) return;
      const room = maxBytes - size;
      if (chunk.length >= room) {
        if (room > 0) chunks.push(chunk.subarray(0, room));
        size = maxBytes;
        finish(true);
        stream.destroy?.();
        decoder?.destroy();
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    source.on("end", () => finish(false));
    const fail = () => {
      if (settled) return;
      if (chunks.length) return finish(true); // a body cut short still holds what arrived
      settled = true;
      reject(new Error(REASONS.connect));
    };
    source.on("error", fail);
    if (decoder) stream.on("error", fail);
  });
}

/** Decode bytes with the charset the Content-Type names, falling back to UTF-8. */
export function decodeText(buffer, contentType) {
  const m = /charset=["']?([\w.:-]{1,40})/i.exec(String(contentType ?? ""));
  try {
    return new TextDecoder(m ? m[1].toLowerCase() : "utf-8").decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

// ── the default transport: one GET over node:https with the guarded lookup ──

/**
 * @returns {Promise<{ status: number, location: string | null, contentType: string, buffer: Buffer, truncated: boolean }>}
 * Rejects with an Error whose message is one of REASONS.
 */
export function httpsGet(url, { headers, timeoutMs, maxBytes, lookup = guardedLookup() }) {
  return new Promise((resolve, reject) => {
    let done = false;
    const settle = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(v);
    };
    const req = https.request(url, { method: "GET", headers: { ...headers, Connection: "close" }, lookup, agent: false });
    const timer = setTimeout(() => {
      req.destroy();
      settle(reject, new Error(REASONS.timeout));
    }, timeoutMs);
    req.on("error", (err) => {
      if (err instanceof BlockedAddressError || err?.code === "READER_BLOCKED_ADDRESS") return settle(reject, new Error(REASONS.notPublic));
      if (err?.code === "ENOTFOUND" || err?.code === "EAI_AGAIN" || err?.code === "ENODATA") return settle(reject, new Error(REASONS.lookup));
      settle(reject, new Error(REASONS.connect));
    });
    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      const location = typeof res.headers.location === "string" ? res.headers.location : null;
      const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
      if (status < 200 || status >= 300) {
        res.destroy();
        return settle(resolve, { status, location, contentType, buffer: Buffer.alloc(0), truncated: false });
      }
      readCapped(res, res.headers["content-encoding"], maxBytes).then(
        ({ buffer, truncated }) => settle(resolve, { status, location, contentType, buffer, truncated }),
        (err) => settle(reject, err),
      );
    });
    req.end();
  });
}

// ── the fetcher ─────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {typeof httpsGet} [opts.transport]  one GET; must enforce the address guard itself (the default does)
 * @param {(host: string) => Promise<{ address: string }[]>} [opts.resolve]
 * @param {() => number} [opts.now]
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 */
export function createFetcher(opts = {}) {
  const cfg = { ...LIMITS, ...opts };
  const resolve = opts.resolve ?? resolveAll;
  const transport = opts.transport ?? ((url, o) => httpsGet(url, { ...o, lookup: guardedLookup(resolve) }));
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const nextSlot = new Map(); // host -> earliest time of its next request
  const hostVerdict = new Map(); // host -> Promise<null | reason>
  const robotsCache = new Map(); // origin -> Promise<{ rules } | { blocked }>
  const stats = { requests: 0 };

  async function pace(host) {
    const t = Math.max(now(), nextSlot.get(host) ?? 0);
    nextSlot.set(host, t + cfg.minGapMs);
    const delay = t - now();
    if (delay > 0) await sleep(delay);
  }

  /** A fast, cached first look at the host (the transport's lookup is the wall; this gives the clear reason). */
  function checkHost(hostname) {
    let v = hostVerdict.get(hostname);
    if (!v) {
      v = resolve(hostname).then(
        (addrs) => (!addrs?.length ? REASONS.lookup : addrs.some((x) => isPrivateAddress(x.address)) ? REASONS.notPublic : null),
        () => REASONS.lookup,
      );
      hostVerdict.set(hostname, v);
    }
    return v;
  }

  /** One GET of an already validated URL. */
  async function hop(u, accept, maxBytes) {
    await pace(u.hostname);
    stats.requests++;
    try {
      return await transport(u.toString(), {
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en", "Accept-Encoding": "gzip, deflate, br" },
        timeoutMs: cfg.timeoutMs,
        maxBytes,
      });
    } catch (e) {
      const reason = Object.values(REASONS).includes(e?.message) ? e.message : REASONS.connect;
      return { failed: reason };
    }
  }

  /** Follow a chain of redirects by hand. `robots` = check each hop against its site's robots.txt first. */
  async function chain(url, { accept, maxBytes, robots, maxRedirects }) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, reason: REASONS.notPublic };
    }
    for (let redirects = 0; ; redirects++) {
      u.hash = "";
      const problem = urlProblem(u) ?? (await checkHost(u.hostname));
      if (problem) return { ok: false, reason: problem };
      if (robots) {
        const verdict = await robotsVerdict(u);
        if (verdict) return { ok: false, reason: verdict };
      }
      const r = await hop(u, accept, maxBytes);
      if (r.failed) return { ok: false, reason: r.failed };
      if (r.status >= 300 && r.status < 400 && r.location) {
        if (redirects >= maxRedirects) return { ok: false, reason: REASONS.tooManyRedirects };
        let next;
        try {
          next = new URL(r.location, u);
        } catch {
          return { ok: false, reason: REASONS.notPublic };
        }
        if (next.protocol !== "https:") return { ok: false, reason: REASONS.insecureRedirect };
        u = next;
        continue;
      }
      if (r.status < 200 || r.status >= 300) return { ok: false, reason: `HTTP ${Math.trunc(r.status) || 0}`, status: r.status };
      return { ok: true, url: u.toString(), status: r.status, contentType: r.contentType, text: decodeText(r.buffer, r.contentType), truncated: r.truncated };
    }
  }

  function robotsFor(origin) {
    let pending = robotsCache.get(origin);
    if (!pending) {
      pending = chain(`${origin}/robots.txt`, { accept: "text/plain, */*;q=0.1", maxBytes: cfg.maxRobotsBytes, robots: false, maxRedirects: 5 }).then((r) => {
        if (r.ok) return parseRobots(r.text);
        // RFC 9309: a missing file (4xx other than 429) allows everything; anything else means the
        // site's wishes are unknown, so the Reader stays away this run.
        if (r.status && r.status >= 400 && r.status < 500 && r.status !== 429) return { rules: [] };
        return { blocked: REASONS.robotsUnavailable };
      });
      robotsCache.set(origin, pending);
    }
    return pending;
  }

  async function robotsVerdict(u) {
    const robots = await robotsFor(u.origin);
    if (robots.blocked) return robots.blocked;
    return isAllowed(robots, u.pathname + u.search) ? null : REASONS.robotsBlocked;
  }

  /** GET a page, a feed or a calendar, politely. */
  function get(url, { accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" } = {}) {
    return chain(url, { accept, maxBytes: cfg.maxBytes, robots: true, maxRedirects: cfg.maxRedirects });
  }

  return { get, stats };
}
