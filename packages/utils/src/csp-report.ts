/**
 * Content-Security-Policy violation reports (QA fix plan PR F3). A browser that meets a CSP header with a report
 * address POSTs what it blocked (or, for a `Content-Security-Policy-Report-Only` header, what it WOULD have blocked)
 * to that address. Two wire formats exist and browsers send either:
 *
 *   - `report-uri`: `Content-Type: application/csp-report`, body `{ "csp-report": { "violated-directive": ..., ... } }`
 *   - `report-to` (the Reporting API): `Content-Type: application/reports+json`, body
 *     `[{ "type": "csp-violation", "body": { "effectiveDirective": ..., "blockedURL": ..., ... } }, ...]`
 *
 * The endpoint is public by nature (any page, any visitor, no session), so everything here assumes a hostile body:
 * size-capped before parsing, never throws, keeps a fixed handful of fields, and strips URLs to origin and path. A
 * document URL can carry a sign-in callback's `?code=`, so query strings and fragments are never kept or logged.
 */
import type { RateLimitConfig } from './rate-limit';

/** One violation, reduced to what is needed to fix the policy or the page. */
export interface CspViolation {
  /** The directive that blocked, e.g. "script-src-elem"; "unknown" when the browser sent nothing usable. */
  directive: string;
  /** What was blocked: "inline", "eval", "data", "blob", or an origin + path (no query). */
  blocked: string;
  /** The page it happened on: origin + path (no query). */
  page: string;
  /** "report" for a Report-Only header, "enforce" for an enforced one. */
  disposition: 'report' | 'enforce' | 'unknown';
  /** The script file and line that caused it, when the browser says (origin + path). */
  source?: string;
  line?: number;
}

/** Bodies above this are refused unread: a real report is a few hundred bytes, a batch a few kilobytes. */
export const CSP_REPORT_MAX_BYTES = 16_384;
/** Per IP: a page with a broken policy can send a burst, but never a flood. */
export const CSP_REPORT_LIMIT: RateLimitConfig = { limit: 30, windowMs: 60_000 };
/** At most this many violations are kept from one request. */
const MAX_PER_REQUEST = 20;
const MAX_URL = 200;

const KEYWORDS = new Set([
  'inline',
  'eval',
  'data',
  'blob',
  'self',
  'wasm-eval',
  'trusted-types-policy',
  'trusted-types-sink',
]);

/** A URL reduced to origin + path, a known keyword, or "invalid"; never a query string or fragment. */
export function safeUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '') return '';
  const word = raw.toLowerCase();
  if (KEYWORDS.has(word)) return word;
  if (/^(data|blob):/i.test(raw)) return word.slice(0, word.indexOf(':'));
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      return url.protocol.replace(/:$/, '');
    return `${url.origin}${url.pathname}`.slice(0, MAX_URL);
  } catch {
    return 'invalid';
  }
}

const directiveOf = (raw: unknown): string => {
  const first = typeof raw === 'string' ? raw.trim().split(/\s+/)[0]?.toLowerCase() : '';
  return first && /^[a-z-]{1,40}$/.test(first) ? first : 'unknown';
};

const dispositionOf = (raw: unknown): CspViolation['disposition'] =>
  raw === 'report' || raw === 'enforce' ? raw : 'unknown';

const lineOf = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < 10_000_000
    ? raw
    : undefined;

function violation(fields: {
  directive: unknown;
  blocked: unknown;
  page: unknown;
  disposition: unknown;
  source: unknown;
  line: unknown;
}): CspViolation {
  const v: CspViolation = {
    directive: directiveOf(fields.directive),
    blocked: safeUrl(fields.blocked),
    page: safeUrl(fields.page),
    disposition: dispositionOf(fields.disposition),
  };
  const source = safeUrl(fields.source);
  if (source) v.source = source;
  const line = lineOf(fields.line);
  if (line !== undefined) v.line = line;
  return v;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The violations in a report body, by its content type. Never throws: an unreadable or unexpected body gives [].
 * The content type's parameters (`; charset=utf-8`) are ignored.
 */
export function parseCspReports(body: string, contentType: string | null): CspViolation[] {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (
    type === 'application/csp-report' ||
    (type === 'application/json' && isObject(data) && 'csp-report' in data)
  ) {
    const r = isObject(data) ? data['csp-report'] : undefined;
    if (!isObject(r)) return [];
    return [
      violation({
        directive: r['effective-directive'] ?? r['violated-directive'],
        blocked: r['blocked-uri'],
        page: r['document-uri'],
        disposition: r['disposition'],
        source: r['source-file'],
        line: r['line-number'],
      }),
    ];
  }
  if (type === 'application/reports+json' || (type === 'application/json' && Array.isArray(data))) {
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (r): r is Record<string, unknown> =>
          isObject(r) && r['type'] === 'csp-violation' && isObject(r['body']),
      )
      .slice(0, MAX_PER_REQUEST)
      .map((r) => {
        const b = r['body'] as Record<string, unknown>;
        return violation({
          directive: b['effectiveDirective'] ?? b['violatedDirective'],
          blocked: b['blockedURL'],
          page: b['documentURL'] ?? r['url'],
          disposition: b['disposition'],
          source: b['sourceFile'],
          line: b['lineNumber'],
        });
      });
  }
  return [];
}

/**
 * Read a request body as text, but give up (null) once it passes `maxBytes`, without buffering the rest. A declared
 * Content-Length over the cap is refused before reading.
 */
export async function readBodyCapped(
  request: {
    headers: { get(name: string): string | null };
    body: ReadableStream<Uint8Array> | null;
  },
  maxBytes: number,
): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
