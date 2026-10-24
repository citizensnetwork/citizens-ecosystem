// The Reader's client for Citizens Connect's own server-to-server routes:
//   GET  /api/automation/sources      (key scope automation:suggest)
//   POST /api/automation/suggestions  (key scope automation:suggest)
//   POST /api/automation/digest       (key scope automation:digest)
//
// The two keys are secrets. They are only ever placed in an Authorization header; they are never
// logged, and every message that leaves this module has any key-shaped text replaced first.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_KINDS = new Set(["website", "youtube", "calendar"]);
const BATCH = 50;
const RESULT_STATUSES = ["pending", "auto_published", "duplicate", "rejected"];

export const DEFAULT_BASE_URL = "https://www.citizenscentral.co.za";

/** An error whose message is safe to print. `fatal` means no source can be processed (a refused key). */
export class ConnectError extends Error {
  constructor(message, { status = 0, fatal = false } = {}) {
    super(message);
    this.name = "ConnectError";
    this.status = status;
    this.fatal = fatal;
  }
}

/** Replace anything that looks like one of our keys, and any of the exact secrets given. */
export function redact(text, secrets = []) {
  let out = String(text ?? "").replace(/cck_[A-Za-z0-9_-]{6,}/g, "cck_[redacted]");
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join("[redacted]");
  return out;
}

/** The base address: https, or http only for a server on this machine (a local test). No credentials. */
export function normaliseBaseUrl(raw) {
  const value = String(raw ?? "").trim() || DEFAULT_BASE_URL;
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new ConnectError("CONNECT_BASE_URL is not a web address.", { fatal: true });
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.username || u.password) throw new ConnectError("CONNECT_BASE_URL must not contain a user name or password.", { fatal: true });
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    throw new ConnectError("CONNECT_BASE_URL must start with https:// (http:// is only accepted for localhost).", { fatal: true });
  }
  return u.origin;
}

export function createConnectClient({ baseUrl, suggestKey, digestKey, fetchImpl = globalThis.fetch, timeoutMs = 30_000 }) {
  const origin = normaliseBaseUrl(baseUrl);
  const secrets = [suggestKey, digestKey];

  async function call(path, { method, key, body, what }) {
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
    if (res.status >= 300 && res.status < 400) {
      throw new ConnectError(`${what}: Citizens Connect answered with a redirect. Set CONNECT_BASE_URL to the final address.`, { status: res.status, fatal: true });
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* not JSON */
    }
    if (res.status === 401 || res.status === 403) {
      throw new ConnectError(`${what}: the key was refused (HTTP ${res.status}). Check the secret and that the key has the right scope.`, {
        status: res.status,
        fatal: true,
      });
    }
    if (!res.ok) {
      const code = typeof json?.error === "string" ? redact(json.error, secrets).slice(0, 60) : "";
      throw new ConnectError(`${what}: HTTP ${res.status}${code ? ` (${code})` : ""}.`, { status: res.status });
    }
    return json;
  }

  return {
    /** Sources that are due. Entries that are not exactly the documented shape are dropped. */
    async listSources() {
      const json = await call("/api/automation/sources", { method: "GET", key: suggestKey, what: "Listing sources" });
      const rows = Array.isArray(json?.sources) ? json.sources : [];
      return rows.filter(
        (r) =>
          r &&
          typeof r.source_id === "string" && UUID.test(r.source_id) &&
          typeof r.contributor_id === "string" && UUID.test(r.contributor_id) &&
          SOURCE_KINDS.has(r.kind) &&
          typeof r.url === "string",
      );
    },

    /**
     * Post one source's items (in batches of at most 50) with its status line. An empty `items`
     * records a check that found nothing. Returns { pending, auto_published, duplicate, rejected, reasons }.
     */
    async postSuggestions({ sourceId, contributorId, status, items }) {
      const tally = { pending: 0, auto_published: 0, duplicate: 0, rejected: 0, reasons: {} };
      const chunks = items.length ? Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) => items.slice(i * BATCH, (i + 1) * BATCH)) : [[]];
      for (const chunk of chunks) {
        const json = await call("/api/automation/suggestions", {
          method: "POST",
          key: suggestKey,
          what: "Posting suggestions",
          body: { source_id: sourceId, contributor_id: contributorId, source_status: status, items: chunk },
        });
        for (const r of Array.isArray(json?.results) ? json.results : []) {
          if (RESULT_STATUSES.includes(r?.status)) tally[r.status]++;
          if (r?.status === "rejected" && typeof r.reason === "string") {
            const reason = r.reason.slice(0, 40);
            tally.reasons[reason] = (tally.reasons[reason] ?? 0) + 1;
          }
        }
      }
      return tally;
    },

    /** The "you have new suggestions" email run. Returns the counts the server reports. */
    async runDigest() {
      const json = await call("/api/automation/digest", { method: "POST", key: digestKey, what: "Sending the digest", body: {} });
      const num = (v) => (Number.isFinite(v) ? v : 0);
      return { considered: num(json?.considered), sent: num(json?.sent), failed: num(json?.failed) };
    },
  };
}
