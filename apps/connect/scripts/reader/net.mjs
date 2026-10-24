// The Reader's polite fetcher. Everything it fetches is an address an owner typed into a
// listing, so it is treated as untrusted from the first byte:
//
//   - https only, on the default port, and only to a public address (no IP literals, no
//     localhost, nothing that resolves to a private, loopback or link-local range, so a hostile
//     listing cannot point the job at an internal service or a cloud metadata endpoint);
//   - redirects are followed by hand, at most 3, each one re-checked for all of the above;
//   - robots.txt is read first and honoured; a page it disallows is never fetched;
//   - one request a second per host, a 10 s timeout, a 1 MB body cap, no cookies, no credentials,
//     and an honest User-Agent.
//
// It never throws: a failure comes back as { ok: false, reason } with a short, fixed phrase that is
// safe to show the owner on their dashboard ("HTTP 404", "blocked by robots.txt", ...).

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isAllowed, parseRobots } from "./robots.mjs";

export const USER_AGENT = "CitizensConnectReader/1.0 (+https://www.citizenscentral.co.za)";

const DEFAULTS = {
  minGapMs: 1000,
  timeoutMs: 10_000,
  maxBytes: 1_000_000,
  maxRobotsBytes: 500_000,
  maxRedirects: 3,
};

/**
 * Sites the Reader never reads, whatever kind of source points at them. Meta and TikTok do not allow
 * reading a page without the page owner connecting an account (and the sources table refuses to
 * switch those kinds on); this keeps a website or calendar link from reaching them by the back door.
 */
const NEVER_READ = ["facebook.com", "fb.com", "fb.me", "fbcdn.net", "instagram.com", "cdninstagram.com", "tiktok.com", "tiktokcdn.com", "whatsapp.com", "threads.net"];

export function isNeverReadHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, "");
  return NEVER_READ.some((d) => h === d || h.endsWith("." + d));
}

// ── is this a public address? ───────────────────────────────────────────────

/** True for an IPv4/IPv6 address that is NOT publicly routable. */
export function isPrivateAddress(address) {
  const a = String(address).toLowerCase();
  const family = isIP(a);
  if (family === 4) return isPrivateV4(a);
  if (family === 6) {
    if (a.startsWith("::ffff:")) {
      const tail = a.slice(7);
      if (tail.includes(".")) return isPrivateV4(tail);
      const [hi, lo] = tail.split(":").map((h) => parseInt(h, 16));
      return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    // Only global unicast (2000::/3) is public, and not the documentation or 6to4 ranges inside it.
    const first = parseInt(a.split(":")[0] || "0", 16);
    if (first < 0x2000 || first > 0x3fff) return true;
    if (a.startsWith("2001:db8:") || a.startsWith("2001:0db8:") || first === 0x2002) return true;
    return false;
  }
  return true; // not an address at all
}

function isPrivateV4(a) {
  const [p, q, r] = a.split(".").map(Number);
  if (p === 0 || p === 10 || p === 127) return true;
  if (p === 100 && q >= 64 && q <= 127) return true; // carrier-grade NAT
  if (p === 169 && q === 254) return true; // link local, cloud metadata
  if (p === 172 && q >= 16 && q <= 31) return true;
  if (p === 192 && q === 0 && (r === 0 || r === 2)) return true;
  if (p === 192 && q === 168) return true;
  if (p === 198 && (q === 18 || q === 19)) return true;
  if (p === 198 && q === 51 && r === 100) return true;
  if (p === 203 && q === 0 && r === 113) return true;
  if (p >= 224) return true; // multicast and reserved
  return false;
}

/** A hostname the Reader may even try to resolve: a real, dotted name, not an IP literal. */
export function isPlausiblePublicHostname(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, "");
  if (!h || h.length > 253 || !h.includes(".")) return false;
  if (isIP(h) !== 0 || h.startsWith("[")) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return false;
  return true;
}

// ── the fetcher ─────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {(host:string)=>Promise<{address:string}[]>} [opts.resolve]
 * @param {()=>number} [opts.now]
 * @param {(ms:number)=>Promise<void>} [opts.sleep]
 */
export function createFetcher(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const resolve = opts.resolve ?? ((host) => dnsLookup(host, { all: true }));
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const nextSlot = new Map(); // host -> earliest time of the next request
  const hostVerdict = new Map(); // host -> true | reason
  const robotsCache = new Map(); // origin -> Promise<{ rules } | { blocked: reason }>
  const stats = { requests: 0 };

  async function wait(host) {
    const t = Math.max(now(), nextSlot.get(host) ?? 0);
    nextSlot.set(host, t + cfg.minGapMs);
    const delay = t - now();
    if (delay > 0) await sleep(delay);
  }

  async function checkHost(hostname) {
    const cached = hostVerdict.get(hostname);
    if (cached !== undefined) return cached;
    let verdict = true;
    if (isNeverReadHost(hostname)) {
      verdict = "this site is never read";
    } else if (!isPlausiblePublicHostname(hostname)) {
      verdict = "not a public https address";
    } else {
      try {
        const addresses = await resolve(hostname);
        if (!addresses.length || addresses.some((x) => isPrivateAddress(x.address))) verdict = "not a public https address";
      } catch {
        verdict = "could not look up the address";
      }
    }
    hostVerdict.set(hostname, verdict);
    return verdict;
  }

  /** One validated hop. Returns { response } or { reason }. */
  async function hop(url, accept) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { reason: "not a public https address" };
    }
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) {
      return { reason: "not a public https address" };
    }
    const verdict = await checkHost(u.hostname);
    if (verdict !== true) return { reason: verdict };
    await wait(u.hostname);
    stats.requests++;
    try {
      const response = await fetchImpl(u.toString(), {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en" },
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      return { response, url: u.toString() };
    } catch (e) {
      return { reason: e?.name === "TimeoutError" || e?.name === "AbortError" ? "timed out" : "could not connect" };
    }
  }

  async function readBody(response, limit) {
    if (!response.body) return { text: "", truncated: false };
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    let truncated = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          chunks.push(value.subarray(0, value.byteLength - (size - limit)));
          truncated = true;
          reader.cancel().catch(() => {}); // not awaited: a cancelled body must never hold the run up
          break;
        }
        chunks.push(value);
      }
    } catch (e) {
      if (!chunks.length) return { failed: e?.name === "TimeoutError" ? "timed out" : "could not connect" };
      truncated = true;
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength)));
    return { text: decode(buf, response.headers.get("content-type")), truncated };
  }

  /**
   * GET with hand-followed redirects. With `checkRobots`, every hop (each redirect target
   * included) is checked against its own site's robots.txt before it is fetched.
   */
  async function fetchChain(url, { accept, limit, checkRobots }) {
    let current = url;
    for (let redirects = 0; ; redirects++) {
      if (checkRobots) {
        const verdict = await hostCheckedRobots(current);
        if (!verdict.ok) return verdict;
      }
      const h = await hop(current, accept);
      if (h.reason) return { ok: false, reason: h.reason };
      const { response } = h;
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        response.body?.cancel().catch(() => {});
        if (redirects >= cfg.maxRedirects) return { ok: false, reason: "too many redirects" };
        let next;
        try {
          next = new URL(location, h.url);
        } catch {
          return { ok: false, reason: "bad redirect" };
        }
        if (next.protocol !== "https:") return { ok: false, reason: "redirected to a non-https address" };
        current = next.toString();
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        response.body?.cancel().catch(() => {});
        return { ok: false, reason: `HTTP ${response.status}`, status: response.status };
      }
      const body = await readBody(response, limit);
      if (body.failed) return { ok: false, reason: body.failed };
      return {
        ok: true,
        url: h.url,
        status: response.status,
        contentType: String(response.headers.get("content-type") ?? "").toLowerCase(),
        text: body.text,
        truncated: body.truncated,
      };
    }
  }

  async function robotsFor(origin) {
    let pending = robotsCache.get(origin);
    if (!pending) {
      pending = (async () => {
        const r = await fetchChain(`${origin}/robots.txt`, { accept: "text/plain,*/*;q=0.1", limit: cfg.maxRobotsBytes, checkRobots: false });
        if (r.ok) return parseRobots(r.text);
        // RFC 9309: a missing file (4xx) means everything is allowed; any other failure means
        // the site's wishes are unknown, so the Reader stays away this run.
        if (r.status && r.status >= 400 && r.status < 500 && r.status !== 429) return { rules: [] };
        return { blocked: "robots.txt unavailable" };
      })();
      robotsCache.set(origin, pending);
    }
    return pending;
  }

  /** GET a page or feed, politely. */
  async function get(url, { accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" } = {}) {
    return fetchChain(url, { accept, limit: cfg.maxBytes, checkRobots: true });
  }

  /** May the Reader fetch this address? The host must be public BEFORE we even ask it for robots.txt. */
  async function hostCheckedRobots(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { ok: false, reason: "not a public https address" };
    }
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) {
      return { ok: false, reason: "not a public https address" };
    }
    const verdict = await checkHost(u.hostname);
    if (verdict !== true) return { ok: false, reason: verdict };
    const robots = await robotsFor(u.origin);
    if (robots.blocked) return { ok: false, reason: robots.blocked };
    return isAllowed(robots, u.pathname + u.search) ? { ok: true } : { ok: false, reason: "blocked by robots.txt" };
  }

  return { get, robotsAllows: hostCheckedRobots, stats };
}

/** Decode a response body using its declared charset, falling back to UTF-8. */
function decode(buf, contentType) {
  const m = /charset=["']?([\w.:-]{1,40})/i.exec(String(contentType ?? ""));
  const label = m ? m[1].toLowerCase() : "utf-8";
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}
