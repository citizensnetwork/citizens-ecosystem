// The Reader's client for Citizens Connect's own server-to-server routes:
//   GET  /api/automation/sources      (key scope automation:suggest)
//   POST /api/automation/suggestions  (key scope automation:suggest)
//   POST /api/automation/digest       (key scope automation:digest)
//
// The keys are secrets: they only ever go in an Authorization header to CONNECT_BASE_URL, a
// redirect is refused (so a key never follows one to another host), and every message that leaves
// this module has key-shaped text replaced first.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_KINDS = new Set(["website", "youtube", "calendar"]);
const RESULT_STATUSES = ["pending", "auto_published", "duplicate", "rejected"];

export const BATCH = 50;
export const DEFAULT_BASE_URL = "https://www.citizenscentral.co.za";

/** An error whose message is safe to print. `fatal` means no source can be processed (a refused key, a bad address). */
export class ConnectError extends Error {
  constructor(message, { status = 0, fatal = false } = {}) {
    super(message);
    this.name = "ConnectError";
    this.status = status;
    this.fatal = fatal;
  }
}

/** Replace anything shaped like one of our keys, and every exact secret given. */
export function redact(text, secrets = []) {
  let out = String(text ?? "").replace(/cck_[A-Za-z0-9_-]{4,}/g, "cck_[redacted]");
  for (const s of secrets) if (typeof s === "string" && s.length >= 8) out = out.split(s).join("[redacted]");
  return out;
}

/** The base address: https, or http only for this machine (a local rehearsal). No credentials, no path. */
export function normaliseBaseUrl(raw) {
  const value = String(raw ?? "").trim() || DEFAULT_BASE_URL;
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new ConnectError("CONNECT_BASE_URL is not a web address.", { fatal: true });
  }
  if (u.username || u.password) throw new ConnectError("CONNECT_BASE_URL must not contain a user name or password.", { fatal: true });
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    throw new ConnectError("CONNECT_BASE_URL must start with https:// (http:// only for localhost).", { fatal: true });
  }
  return u.origin;
}

/**
 * @param {{ baseUrl?: string, suggestKey: string, digestKey?: string, fetchImpl?: typeof fetch, timeoutMs?: number, sleep?: (ms: number) => Promise<void> }} opts
 */
export function createConnectClient({ baseUrl, suggestKey, digestKey = "", fetchImpl = globalThis.fetch, timeoutMs = 30_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const origin = normaliseBaseUrl(baseUrl);
  const secrets = [suggestKey, digestKey];

  async function once(path, { method, key, body, what }) {
    let res;
    try {
      res = await fetchImpl(origin + path, {
        method,
        redirect: "manual",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "User-Agent": "CitizensConnectReader/1.0",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new ConnectError(`${what}: could not reach Citizens Connect (${e?.name === "TimeoutError" ? "timed out" : "network error"}).`);
    }
    let json = null;
    try {
      json = JSON.parse(await res.text());
    } catch {
      /* not JSON: judged by the status alone */
    }
    return { res, json };
  }

  async function call(path, opts) {
    let { res, json } = await once(path, opts);
    if (res.status === 429) {
      // One polite retry after the server's own Retry-After (capped), then give up on this call.
      const wait = Math.min(Math.max(Number(res.headers.get("retry-after")) || 5, 1), 60);
      await sleep(wait * 1000);
      ({ res, json } = await once(path, opts));
    }
    const what = opts.what;
    if (res.status >= 300 && res.status < 400) {
      throw new ConnectError(`${what}: Citizens Connect answered with a redirect; set CONNECT_BASE_URL to the final address.`, { status: res.status, fatal: true });
    }
    if (res.status === 401 || res.status === 403) {
      throw new ConnectError(`${what}: the key was refused (HTTP ${res.status}). Check the secret and that the key has the right scope.`, { status: res.status, fatal: true });
    }
    if (!res.ok) {
      const code = typeof json?.error === "string" ? redact(json.error, secrets).slice(0, 40) : "";
      throw new ConnectError(`${what}: HTTP ${res.status}${code ? ` (${code})` : ""}.`, { status: res.status });
    }
    return json;
  }

  return {
    /** Sources that are due. An entry that is not exactly the documented shape is dropped. */
    async listSources() {
      const json = await call("/api/automation/sources", { method: "GET", key: suggestKey, what: "Listing sources" });
      if (!Array.isArray(json?.sources)) throw new ConnectError("Listing sources: the answer was not a list of sources.", { fatal: true });
      return json.sources.filter(
        (r) =>
          r &&
          typeof r.source_id === "string" &&
          UUID.test(r.source_id) &&
          typeof r.contributor_id === "string" &&
          UUID.test(r.contributor_id) &&
          SOURCE_KINDS.has(r.kind) &&
          typeof r.url === "string" &&
          r.url.startsWith("https://"),
      );
    },

    /**
     * Post one source's items in batches of at most 50, each carrying the status line. No items
     * records a check that found nothing. Returns { pending, auto_published, duplicate, rejected, reasons, sourceCheck }.
     */
    async postSuggestions({ sourceId, contributorId, status, items }) {
      const tally = { pending: 0, auto_published: 0, duplicate: 0, rejected: 0, reasons: {}, sourceCheck: null };
      const chunks = [];
      for (let i = 0; i < items.length; i += BATCH) chunks.push(items.slice(i, i + BATCH));
      if (!chunks.length) chunks.push([]);
      for (const chunk of chunks) {
        const json = await call("/api/automation/suggestions", {
          method: "POST",
          key: suggestKey,
          what: "Posting suggestions",
          body: { source_id: sourceId, contributor_id: contributorId, source_status: status, items: chunk },
        });
        for (const r of Array.isArray(json?.results) ? json.results : []) {
          if (RESULT_STATUSES.includes(r?.status)) tally[r.status]++;
          if (r?.status === "rejected" && typeof r.reason === "string" && /^[a-z_]{1,40}$/.test(r.reason)) tally.reasons[r.reason] = (tally.reasons[r.reason] ?? 0) + 1;
        }
        if (typeof json?.source_check === "string" && /^[a-z_]{1,40}$/.test(json.source_check)) tally.sourceCheck = json.source_check;
      }
      return tally;
    },

    /** The "you have new suggestions" email run. Returns the counts the server reports. */
    async runDigest() {
      const json = await call("/api/automation/digest", { method: "POST", key: digestKey, what: "Sending the digest", body: {} });
      const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);
      return { considered: num(json?.considered), sent: num(json?.sent), failed: num(json?.failed) };
    },
  };
}
