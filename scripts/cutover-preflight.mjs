#!/usr/bin/env node
/**
 * Read-only pre-flight for the 219.co.za cutover (apps/connect/docs/CUTOVER_219.md).
 *
 * It runs the runbook's own Check commands and prints one line each: PASS, FAIL or INFO, with the
 * reason. It exits 1 only when something FAILs (2 for a bad command line).
 *
 *   node scripts/cutover-preflight.mjs                     # --phase before: nothing has moved yet
 *   node scripts/cutover-preflight.mjs --phase after       # after Step 4 (the domain is on the front door)
 *   node scripts/cutover-preflight.mjs --hub-url https://citizens-ecosystem-hub.vercel.app
 *
 * What it will and will not do:
 *   - DNS lookups, one TLS handshake per name, and GET / HEAD / OPTIONS requests. Nothing else:
 *     assertReadOnlyRequest() refuses any other method and any credential header before a socket opens.
 *   - It reads no secret and needs no token. The GitHub call is the public, unauthenticated status API.
 *   - It never POSTs. Step 3's POST check (the Contributor form) is a line that says "run it by hand".
 *   - Anything it prints that came from the network is cut to a short, plain-text excerpt.
 *
 * Dependency-free (Node 22+). The pure parts are exported and unit-tested in cutover-preflight.test.mjs.
 */

import dns from 'node:dns';
import https from 'node:https';
import tls from 'node:tls';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------------
// Constants (each one is taken from the runbook, the hub README or packages/ecosystem)
// ---------------------------------------------------------------------------------------------------

/** The built apps. A test keeps this equal to APP_SLUGS in @citizens/ecosystem. */
export const APPS = ['connect', 'vision', 'wear'];
/** The hub's "coming soon" pages. A test keeps this equal to COMING_SOON in @citizens/ecosystem. */
export const COMING_SOON = ['learn', 'play', 'move', 'impact'];

export const SITE_HOST = '219.co.za';
export const OLD_HOST = 'www.citizenscentral.co.za';
export const NEW_CONNECT_URL = 'https://219.co.za/citizens/connect';

export const STATUS_URL =
  'https://api.github.com/repos/citizensnetwork/citizens-ecosystem/commits/main/status';

export const RESOLVERS = [
  { name: 'Cloudflare 1.1.1.1', ip: '1.1.1.1' },
  { name: 'Google 8.8.8.8', ip: '8.8.8.8' },
];
export const VERCEL_NAMESERVERS = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'];
/** The parking address the registry's parking nameservers answered with (runbook P1). */
export const PARKING_ADDRESS = '102.214.8.148';
/** Address blocks Vercel's nameservers hand out (seen 2026-11-01). An address outside them is INFO, not FAIL. */
export const VERCEL_RANGES = ['76.76.21.0/24', '64.29.17.0/24', '216.198.79.0/24'];

/** The icon link every app's index.html carries once the front-door code is live (runbook P6). */
export const ICON_HREF = 'icons/icon.svg';
/** A real Contributor address word is not needed: the old-address redirect answers before routing. */
export const PROBE_SLUG = 'preflight-check';

const MAX_BODY_BYTES = 262_144;
const REQUEST_TIMEOUT_MS = 12_000;
const MIN_CERT_DAYS = 14;

// ---------------------------------------------------------------------------------------------------
// Output hygiene
// ---------------------------------------------------------------------------------------------------

/** Plain, short text for anything that came from the network: no control characters, bounded length. */
export function sanitizeExcerpt(value, max = 100) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    const printable =
      code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f) && code !== 0x2028 && code !== 0x2029;
    out += printable ? ch : ' ';
    if (out.length >= max * 2) break;
  }
  const plain = out.split(' ').filter(Boolean).join(' ');
  return plain.length > max ? `${plain.slice(0, max - 3)}...` : plain;
}

const pass = (name, reason) => ({ level: 'PASS', name, reason });
const fail = (name, reason) => ({ level: 'FAIL', name, reason });
const info = (name, reason) => ({ level: 'INFO', name, reason });

export function formatResult(result) {
  return `${result.level.padEnd(4)}  ${result.name}: ${result.reason}`;
}

export function exitCodeFor(results) {
  return results.some((result) => result.level === 'FAIL') ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------------

/** Only an https address of the front door's own domain or a *.vercel.app project, compared label by label. */
export function isAllowedHubHost(hostname) {
  if (typeof hostname !== 'string') return false;
  if (hostname === SITE_HOST) return true;
  const labels = hostname.split('.');
  if (labels.length < 3) return false;
  if (labels.at(-1) !== 'app' || labels.at(-2) !== 'vercel') return false;
  return labels.every((label) => label.length > 0 && /^[a-z0-9-]+$/.test(label));
}

/** An https origin only: no login, port, path, query or fragment. Returns the normalised origin. */
export function parseHubUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a web address' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'must start with https://' };
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'must not contain a login' };
  if (url.port !== '') return { ok: false, reason: 'must not contain a port' };
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return { ok: false, reason: 'give the address only, with no path, query or fragment' };
  }
  if (!isAllowedHubHost(url.hostname)) {
    return { ok: false, reason: 'must be 219.co.za or a *.vercel.app address' };
  }
  return { ok: true, origin: url.origin };
}

export const USAGE = [
  'Usage: node scripts/cutover-preflight.mjs [--phase before|after] [--hub-url https://<name>.vercel.app]',
  '  --phase before  (default) nothing has moved yet',
  '  --phase after   after Step 4: also checks the old-address forwards and the front door on 219.co.za',
  '  --hub-url       the front door project\'s own address, to run the Step 1 checks against it',
  'Read-only: DNS lookups and GET / HEAD / OPTIONS requests. It never POSTs and reads no secret.',
].join('\n');

export function parseArgs(argv) {
  const options = { phase: 'before', hubUrl: null, help: false };
  const bad = (what) => ({ ok: false, error: `${what}\n${USAGE}` });
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    let name = arg;
    let value = null;
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq > 0) {
      name = arg.slice(0, eq);
      value = arg.slice(eq + 1);
    }
    if (name !== '--phase' && name !== '--hub-url') {
      return bad(`Unknown argument: ${sanitizeExcerpt(arg, 40)}`);
    }
    if (value === null) {
      i += 1;
      value = argv[i];
      if (typeof value !== 'string') return bad(`${name} needs a value`);
    }
    if (name === '--phase') {
      if (value !== 'before' && value !== 'after') return bad('--phase must be before or after');
      options.phase = value;
    } else {
      const parsed = parseHubUrl(value);
      if (!parsed.ok) return bad(`--hub-url ${parsed.reason}`);
      options.hubUrl = parsed.origin;
    }
  }
  return { ok: true, ...options };
}

// ---------------------------------------------------------------------------------------------------
// DNS and certificate evaluation (pure)
// ---------------------------------------------------------------------------------------------------

export function ipv4ToInt(ip) {
  if (typeof ip !== 'string') return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    n = n * 256 + value;
  }
  return n;
}

export function ipv4InCidr(ip, cidr) {
  const [base, bitsText] = String(cidr).split('/');
  const bits = Number(bitsText);
  const a = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(a / size) === Math.floor(b / size);
}

/** Splits answers into the parking address, Vercel's blocks, and anything else. */
export function classifyAddresses(addresses) {
  const parking = [];
  const vercel = [];
  const other = [];
  for (const address of addresses) {
    if (address === PARKING_ADDRESS) parking.push(address);
    else if (VERCEL_RANGES.some((range) => ipv4InCidr(address, range))) vercel.push(address);
    else other.push(address);
  }
  return { parking, vercel, other };
}

const dnsName = (name) => String(name).toLowerCase().replace(/\.$/, '');

/** Runbook P1: the delegation is exactly Vercel's two nameservers. */
export function evaluateNameservers(names) {
  const got = [...new Set(names.map(dnsName))].sort();
  const want = [...VERCEL_NAMESERVERS].sort();
  if (got.length === want.length && got.every((name, i) => name === want[i])) {
    return { level: 'PASS', reason: `only ${want.join(' and ')}` };
  }
  const shown = got.length === 0 ? 'none' : got.map((name) => sanitizeExcerpt(name, 40)).join(', ');
  return { level: 'FAIL', reason: `expected only ${want.join(' and ')}, got ${shown}` };
}

/**
 * Runbook P1: no parking address. The runbook used to say both resolvers must give the same addresses;
 * Vercel's nameservers hand out a rotating pool, so the real test is "all Vercel's, none the parking one".
 */
export function evaluateAddresses(addresses) {
  if (addresses.length === 0) return { level: 'FAIL', reason: 'no address answered' };
  const { parking, vercel, other } = classifyAddresses(addresses);
  if (parking.length > 0) {
    return { level: 'FAIL', reason: `still answers the parking address ${PARKING_ADDRESS} (P1 is not done)` };
  }
  if (other.length > 0) {
    const shown = other.map((address) => sanitizeExcerpt(address, 20)).join(', ');
    return { level: 'INFO', reason: `${shown} is outside the known Vercel blocks; check it by hand` };
  }
  return { level: 'PASS', reason: `${vercel.join(', ')} (all Vercel's, none is the parking address)` };
}

export function parseSubjectAltNames(text) {
  if (typeof text !== 'string') return [];
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('DNS:'))
    .map((part) => part.slice('DNS:'.length));
}

const day = (date) => date.toISOString().slice(0, 10);

/** The certificate a name presents: trusted, names the host, and not about to lapse. */
export function evaluateCertificate(cert, now = new Date()) {
  const from = new Date(cert.validFrom);
  const to = new Date(cert.validTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { level: 'FAIL', reason: 'the certificate dates could not be read' };
  }
  const subject = sanitizeExcerpt(cert.subjectCn ?? 'unknown', 60);
  if (cert.authorized !== true) {
    return {
      level: 'FAIL',
      reason: `not trusted (${sanitizeExcerpt(cert.authorizationError ?? 'unknown reason', 40)}), subject ${subject}`,
    };
  }
  if (cert.identityOk !== true) {
    return { level: 'FAIL', reason: `the certificate (subject ${subject}) does not name this host` };
  }
  if (now > to) return { level: 'FAIL', reason: `expired on ${day(to)}` };
  const daysLeft = Math.floor((to.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < MIN_CERT_DAYS) {
    return { level: 'FAIL', reason: `only ${daysLeft} days left (expires ${day(to)}); renewal looks stuck` };
  }
  const names = (cert.names ?? []).map((name) => sanitizeExcerpt(name, 40)).join(', ');
  const issuer = sanitizeExcerpt(cert.issuer ?? 'unknown', 40);
  return {
    level: 'PASS',
    reason: `subject ${subject}, names ${names || 'none'}, valid ${day(from)} to ${day(to)} (${daysLeft} days left), issued by ${issuer}`,
  };
}

// ---------------------------------------------------------------------------------------------------
// HTML and header evaluation (pure). Hand-written scanners: no pattern is built from, or run
// over, unbounded input in a way that can backtrack.
// ---------------------------------------------------------------------------------------------------

function stripComments(html) {
  let out = '';
  let pos = 0;
  while (pos < html.length) {
    const open = html.indexOf('<!--', pos);
    if (open === -1) {
      out += html.slice(pos);
      break;
    }
    out += html.slice(pos, open);
    const close = html.indexOf('-->', open + 4);
    if (close === -1) break;
    pos = close + 3;
  }
  return out;
}

const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

/** Index of the '>' that ends the tag starting at `from`, ignoring a '>' inside quotes. -1 if none. */
function findTagEnd(source, from) {
  let quote = '';
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/** Attributes of one tag's text (after the tag name) as a Map of lower-case name to value. First one wins. */
export function parseAttributes(text) {
  const attributes = new Map();
  let i = 0;
  while (i < text.length) {
    while (i < text.length && (isSpace(text[i]) || text[i] === '/')) i += 1;
    const nameStart = i;
    while (i < text.length && !isSpace(text[i]) && text[i] !== '=' && text[i] !== '/') i += 1;
    const name = text.slice(nameStart, i).toLowerCase();
    while (i < text.length && isSpace(text[i])) i += 1;
    let value = '';
    if (text[i] === '=') {
      i += 1;
      while (i < text.length && isSpace(text[i])) i += 1;
      const quote = text[i];
      if (quote === '"' || quote === "'") {
        const close = text.indexOf(quote, i + 1);
        const end = close === -1 ? text.length : close;
        value = text.slice(i + 1, end);
        i = end + 1;
      } else {
        const valueStart = i;
        while (i < text.length && !isSpace(text[i])) i += 1;
        value = text.slice(valueStart, i);
      }
    }
    if (name !== '' && !attributes.has(name)) attributes.set(name, value);
  }
  return attributes;
}

/** Every <tagName ...> in the page (comments removed), as attribute Maps. */
export function findTags(html, tagName) {
  if (typeof html !== 'string') return [];
  const source = stripComments(html.slice(0, MAX_BODY_BYTES));
  const found = [];
  let pos = 0;
  while (pos < source.length) {
    const start = source.indexOf('<', pos);
    if (start === -1) break;
    const nameEnd = start + 1 + tagName.length;
    const next = source[nameEnd];
    const named = source.slice(start + 1, nameEnd).toLowerCase() === tagName;
    if (named && (next === undefined || isSpace(next) || next === '/' || next === '>')) {
      const end = findTagEnd(source, nameEnd);
      if (end === -1) break;
      found.push(parseAttributes(source.slice(nameEnd, end)));
      pos = end + 1;
    } else {
      pos = start + 1;
    }
  }
  return found;
}

const tokens = (value, separator) =>
  String(value ?? '')
    .split(separator)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== '');

/** Runbook P6: the proof that the front-door code is live in an app is its relative icon link. */
export function hasIconLink(html) {
  return findTags(html, 'link').some((attributes) => {
    const rel = tokens(attributes.get('rel'), ' ');
    return rel.some((token) => token === 'icon') && attributes.get('href') === ICON_HREF;
  });
}

export function hasNoindexMeta(html) {
  return findTags(html, 'meta').some(
    (attributes) =>
      String(attributes.get('name') ?? '').toLowerCase() === 'robots' &&
      tokens(attributes.get('content'), ',').some((token) => token === 'noindex'),
  );
}

export function hasScriptTag(html) {
  return findTags(html, 'script').length > 0;
}

/** A response is { status, headers: { lower-case name: [values] }, body }. */
export const headerValues = (response, name) => response.headers?.[name] ?? [];

/** Content-Security-Policy value to a Map of directive name to its source tokens. */
export function parseCsp(value) {
  const directives = new Map();
  for (const part of String(value ?? '').split(';')) {
    const pieces = part.trim().split(/\s+/).filter(Boolean);
    if (pieces.length === 0) continue;
    const name = pieces[0].toLowerCase();
    if (!directives.has(name)) directives.set(name, pieces.slice(1));
  }
  return directives;
}

/** Runbook Step 4 / Step 1: one policy; the front door's has no unsafe-inline and ends frame-ancestors 'none'. */
export function checkHubCsp(response) {
  const values = headerValues(response, 'content-security-policy');
  if (values.length !== 1) return { ok: false, reason: `${values.length} content-security-policy headers, expected 1` };
  const directives = parseCsp(values[0]);
  const all = [...directives.values()].flat();
  if (all.some((token) => token.toLowerCase() === "'unsafe-inline'")) {
    return { ok: false, reason: "the policy contains 'unsafe-inline'" };
  }
  const script = directives.get('script-src');
  if (!script || script.length !== 1 || script[0] !== "'self'") {
    return { ok: false, reason: "script-src is not exactly 'self'" };
  }
  const last = [...directives.entries()].at(-1);
  if (!last || last[0] !== 'frame-ancestors' || last[1].length !== 1 || last[1][0] !== "'none'") {
    return { ok: false, reason: "the policy does not end with frame-ancestors 'none'" };
  }
  return { ok: true, reason: "one policy, script-src 'self', no unsafe-inline, ends frame-ancestors 'none'" };
}

/** Runbook Step 3 / Step 4: one policy, and it is the app's own (Connect's lists unpkg.com). */
export function checkAppCsp(response, { requireScriptSource = null } = {}) {
  const values = headerValues(response, 'content-security-policy');
  if (values.length !== 1) return { ok: false, reason: `${values.length} content-security-policy headers, expected 1` };
  if (requireScriptSource !== null) {
    const script = new Set(parseCsp(values[0]).get('script-src') ?? []);
    if (!script.has(requireScriptSource)) {
      return { ok: false, reason: `script-src does not list ${requireScriptSource} (not the app's own policy)` };
    }
  }
  return { ok: true, reason: 'exactly one policy, the app\'s own' };
}

/** Where a redirect points, resolved against the address that was asked. null when there is no usable Location. */
export function redirectTarget(response, base) {
  const [location] = headerValues(response, 'location');
  if (typeof location !== 'string' || location === '') return null;
  try {
    return new URL(location, base);
  } catch {
    return null;
  }
}

/** A redirect with this status to exactly this address (both compared as parsed addresses). */
export function checkRedirect(response, base, status, expected) {
  if (response.status !== status) return { ok: false, reason: `status ${response.status}, expected ${status}` };
  const target = redirectTarget(response, base);
  if (target === null) return { ok: false, reason: 'no readable Location header' };
  const want = new URL(expected, base);
  if (target.href !== want.href) {
    return { ok: false, reason: `Location is ${sanitizeExcerpt(target.href, 90)}, expected ${want.href}` };
  }
  return { ok: true, reason: `${status} to ${want.href}` };
}

/** True when a path is the app's prefix or below it, compared segment by segment. */
export function isUnderPrefix(pathname, prefix) {
  const path = pathname.split('/').filter(Boolean);
  const want = prefix.split('/').filter(Boolean);
  return want.length <= path.length && want.every((segment, i) => path[i] === segment);
}

// ---------------------------------------------------------------------------------------------------
// Vercel's deployment status for the newest commit on main (public GitHub API, no token)
// ---------------------------------------------------------------------------------------------------

/**
 * Reads the combined status GitHub shows for main's newest commit. A refused deployment reads
 * "Deployment rate limited" and is a FAIL that says "do not start". "Skipped" and "Canceled by Ignored
 * Build Step" are INFO: they prove nothing about the cap, only a deployment that completed does.
 */
export function classifyVercelStatuses(body, apps = APPS) {
  const name = 'deployments';
  if (body === null || typeof body !== 'object' || !Array.isArray(body.statuses)) {
    return [info(name, 'GitHub answered something unexpected; open each project\'s Deployments tab instead')];
  }
  const sha = typeof body.sha === 'string' && /^[0-9a-f]{40}$/.test(body.sha) ? body.sha.slice(0, 7) : 'unknown';
  const marker = 'citizens-ecosystem-';
  const byApp = new Map();
  for (const status of body.statuses) {
    const context = typeof status?.context === 'string' ? status.context : '';
    if (!context.startsWith('Vercel')) continue;
    const at = context.lastIndexOf(marker);
    if (at >= 0) byApp.set(context.slice(at + marker.length), status);
  }

  const results = [];
  let completed = 0;
  let refused = 0;
  for (const app of apps) {
    const label = `deployments/${app}`;
    const status = byApp.get(app);
    if (!status) {
      results.push(info(label, `no Vercel status for main ${sha}`));
      continue;
    }
    const description = sanitizeExcerpt(status.description ?? '', 80);
    const lower = description.toLowerCase();
    if (lower.includes('rate limited')) {
      refused += 1;
      results.push(fail(label, `main ${sha}: "${description}" Vercel is refusing deployments: do not start`));
    } else if (status.state === 'pending') {
      results.push(info(label, `main ${sha}: still deploying ("${description}")`));
    } else if (status.state === 'success' && lower === 'deployment has completed') {
      completed += 1;
      results.push(pass(label, `main ${sha}: a real deployment completed`));
    } else if (status.state === 'success') {
      results.push(info(label, `main ${sha}: "${description}"; skipped builds say nothing about the cap`));
    } else {
      results.push(fail(label, `main ${sha}: the deployment ${sanitizeExcerpt(status.state, 12)}: "${description}"`));
    }
  }

  if (refused > 0) {
    results.push(
      fail(
        'deployment gate',
        `Vercel's daily deployment cap refused ${refused} of ${apps.length} projects: do not start Step 1 (see "Deployment budget")`,
      ),
    );
  } else if (completed === apps.length) {
    results.push(pass('deployment gate', 'every project completed a real deployment on main\'s newest commit'));
  } else {
    results.push(
      info(
        'deployment gate',
        'no proof yet that every project accepts a new deployment; make a real one first (see "Deployment budget")',
      ),
    );
  }
  return results;
}

// ---------------------------------------------------------------------------------------------------
// Network (the only code that touches a socket)
// ---------------------------------------------------------------------------------------------------

export const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CREDENTIAL_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'x-api-key']);

/** Throws for any method that could change something and for any header that could carry a credential. */
export function assertReadOnlyRequest(method, headers = {}) {
  if (!READ_ONLY_METHODS.has(method)) throw new Error(`refused: ${sanitizeExcerpt(method, 12)} is not a read-only method`);
  for (const name of Object.keys(headers)) {
    if (CREDENTIAL_HEADERS.has(name.toLowerCase())) throw new Error('refused: credential headers are never sent');
  }
}

const agent = new https.Agent({ keepAlive: false });

/** The header names the checks read. Only these are kept, so a hostile header name never becomes a property key. */
const WANTED_HEADERS = new Set([
  'content-security-policy',
  'location',
  'x-robots-tag',
  'access-control-allow-origin',
  'x-ratelimit-remaining',
]);

/** Node's flat [name, value, name, value ...] list to { lower-case name: [values] } for the wanted names only. */
export function collectHeaders(rawHeaders) {
  const collected = {};
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const name = String(rawHeaders[i]).toLowerCase();
    if (WANTED_HEADERS.has(name)) (collected[name] ??= []).push(String(rawHeaders[i + 1]));
  }
  return collected;
}

/** One https request. Redirects are not followed. The body is read up to a fixed size and then dropped. */
export function httpRequest(rawUrl, { method = 'GET', headers = {} } = {}) {
  assertReadOnlyRequest(method, headers);
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    return Promise.reject(new Error('refused: only plain https addresses'));
  }
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        agent,
        method,
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        headers: { 'user-agent': 'citizens-cutover-preflight (read-only)', accept: '*/*', ...headers },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const collected = collectHeaders(res.rawHeaders);
        const chunks = [];
        let size = 0;
        const finish = () => resolve({ status: res.statusCode ?? 0, headers: collected, body: Buffer.concat(chunks).toString('utf8') });
        res.on('data', (chunk) => {
          size += chunk.length;
          chunks.push(chunk);
          if (size >= MAX_BODY_BYTES) {
            res.destroy();
            finish();
          }
        });
        res.on('end', finish);
        res.on('error', finish);
      },
    );
    request.on('timeout', () => request.destroy(new Error('timed out')));
    request.on('error', reject);
    request.end();
  });
}

function dnsLookup(server, kind, name) {
  const resolver = new dns.promises.Resolver({ timeout: 5000, tries: 2 });
  resolver.setServers([server]);
  return kind === 'NS' ? resolver.resolveNs(name) : resolver.resolve4(name);
}

/**
 * One TLS handshake. Verification stays ON: a certificate that is expired, untrusted or for another name makes the
 * handshake fail, and the error code of that failure is the FAIL line.
 */
function peekCertificate(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: REQUEST_TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      const identityError = tls.checkServerIdentity(host, cert);
      resolve({
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : '',
        identityOk: identityError === undefined,
        subjectCn: cert.subject?.CN,
        names: parseSubjectAltNames(cert.subjectaltname),
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        issuer: cert.issuer?.O,
      });
      socket.end();
    });
    socket.on('timeout', () => socket.destroy(new Error('timed out')));
    socket.on('error', reject);
  });
}

export const defaultDeps = { request: httpRequest, lookup: dnsLookup, certificate: peekCertificate, now: () => new Date() };

// ---------------------------------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------------------------------

const errorText = (error) => sanitizeExcerpt(error?.code ?? error?.message ?? error, 60);

async function attempt(name, work) {
  try {
    return await work();
  } catch (error) {
    return [fail(name, `could not check: ${errorText(error)}`)];
  }
}

/** Runbook P1. */
async function dnsChecks(deps) {
  const lines = await Promise.all(
    RESOLVERS.flatMap((resolver) => [
      attempt(`dns/ns/${resolver.ip}`, async () => {
        const result = evaluateNameservers(await deps.lookup(resolver.ip, 'NS', SITE_HOST));
        return [{ ...result, name: `dns/ns/${resolver.ip}` }];
      }),
      ...[SITE_HOST, `www.${SITE_HOST}`].map((host) =>
        attempt(`dns/a/${host}/${resolver.ip}`, async () => {
          const result = evaluateAddresses(await deps.lookup(resolver.ip, 'A', host));
          return [{ ...result, name: `dns/a/${host}/${resolver.ip}` }];
        }),
      ),
    ]),
  );
  return lines.flat();
}

/** Runbook Step 4: both names present a certificate (they are separate certificates). */
async function certificateChecks(deps) {
  const hosts = [SITE_HOST, `www.${SITE_HOST}`];
  const lines = await Promise.all(
    hosts.map((host) =>
      attempt(`tls/${host}`, async () => {
        const result = evaluateCertificate(await deps.certificate(host), deps.now());
        return [{ ...result, name: `tls/${host}` }];
      }),
    ),
  );
  return lines.flat();
}

/** Runbook P6 (before) and Step 2 / Step 3 (after): each app answers and carries the relative icon link. */
async function appChecks(phase, deps) {
  const lines = await Promise.all(
    APPS.map((app) =>
      attempt(`app/${app}`, async () => {
        const origin = `https://citizens-ecosystem-${app}.vercel.app`;
        const path = phase === 'after' ? `/citizens/${app}/index.html` : '/index.html';
        const response = await deps.request(`${origin}${path}`);
        if (response.status !== 200) return [fail(`app/${app}`, `GET ${path} answered ${response.status}, expected 200`)];
        if (!hasIconLink(response.body)) {
          return [
            fail(
              `app/${app}`,
              `answers, but index.html has no <link rel="icon" href="${ICON_HREF}">: the front-door code is not live here (P6)`,
            ),
          ];
        }
        return [pass(`app/${app}`, `GET ${path} is 200 and carries the relative icon link (the front-door code is live)`)];
      }),
    ),
  );
  return lines.flat();
}

async function deploymentChecks(deps) {
  return attempt('deployments', async () => {
    const response = await deps.request(STATUS_URL, { headers: { accept: 'application/vnd.github+json' } });
    const remaining = headerValues(response, 'x-ratelimit-remaining')[0];
    if (response.status === 429 || (response.status === 403 && remaining === '0')) {
      return [info('deployments', 'GitHub\'s own request limit was reached; try again later or read the Deployments tabs by hand')];
    }
    if (response.status !== 200) return [info('deployments', `GitHub answered ${response.status}; could not read the status`)];
    let body;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = null;
    }
    return classifyVercelStatuses(body);
  });
}

/** The addresses that serve people today (before the move). */
async function todayChecks(deps) {
  const targets = [
    ['today/219.co.za', `https://${SITE_HOST}/`],
    ['today/old-address', `https://${OLD_HOST}/`],
  ];
  const lines = await Promise.all(
    targets.map(([name, url]) =>
      attempt(name, async () => {
        const response = await deps.request(url);
        if (response.status === 200) return [pass(name, 'GET / answers 200 (Connect, as it does today)')];
        return [fail(name, `GET / answered ${response.status}, expected 200 before the move`)];
      }),
    ),
  );
  return lines.flat();
}

/** Runbook Step 1 (and Step 4/5 on the real domain): the front door's own pages. */
async function hubChecks(origin, phase, deps) {
  const at = (path) => new URL(path, origin);
  const label = new URL(origin).hostname;
  const name = (part) => `hub/${label}${part}`;
  const loginHint = (response) =>
    response.status === 401 ? 'Vercel asked for a login (Deployment Protection; see Step 1)' : null;

  const run = (part, work) =>
    attempt(name(part), async () => {
      const result = await work();
      return [{ ...result, name: name(part) }];
    });

  const get = async (path, options) => deps.request(at(path).href, options);

  const lines = await Promise.all([
    run(' /', async () => {
      const response = await get('/', { method: 'HEAD' });
      const hint = loginHint(response);
      if (hint) return fail('', hint);
      const check = checkRedirect(response, at('/'), 302, '/citizens');
      return check.ok ? pass('', check.reason) : fail('', check.reason);
    }),
    run(' /citizens', async () => {
      const response = await get('/citizens');
      const hint = loginHint(response);
      if (hint) return fail('', hint);
      if (response.status !== 200) return fail('', `status ${response.status}, expected 200`);
      const csp = checkHubCsp(response);
      if (!csp.ok) return fail('', csp.reason);
      if (hasScriptTag(response.body)) return fail('', 'the page contains a <script> tag; the front door has none');
      return pass('', `200, ${csp.reason}, no <script> tag`);
    }),
    ...COMING_SOON.map((slug) =>
      run(` /citizens/${slug}`, async () => {
        const response = await get(`/citizens/${slug}`);
        if (response.status !== 200) return fail('', `status ${response.status}, expected 200`);
        const header = headerValues(response, 'x-robots-tag').some((value) => tokens(value, ',').some((token) => token === 'noindex'));
        const meta = hasNoindexMeta(response.body);
        if (!header && !meta) return fail('', '200, but neither X-Robots-Tag nor a robots meta tag says noindex');
        return pass('', `200, noindex (${[header ? 'header' : '', meta ? 'meta tag' : ''].filter(Boolean).join(' and ')})`);
      }),
    ),
    run(' /citizens/x', async () => {
      const response = await get('/citizens/x');
      return response.status === 404 ? pass('', 'an unknown address is 404') : fail('', `status ${response.status}, expected 404`);
    }),
    run(' /robots.txt', async () => {
      const response = await get('/robots.txt');
      return response.status === 200 ? pass('', '200') : fail('', `status ${response.status}, expected 200`);
    }),
    run(' /sitemap.xml', async () => {
      const response = await get('/sitemap.xml');
      return response.status === 200 ? pass('', '200') : fail('', `status ${response.status}, expected 200`);
    }),
    run(' /citizens/connect', async () => {
      const response = await get('/citizens/connect', { method: 'HEAD' });
      if (phase === 'after') {
        if (response.status !== 200) return fail('', `status ${response.status}, expected 200 after Step 4`);
        const csp = checkAppCsp(response, { requireScriptSource: 'https://unpkg.com' });
        return csp.ok ? pass('', `200, Connect's own page (${csp.reason})`) : fail('', csp.reason);
      }
      if (response.status === 404) return info('', '404, as expected until Step 3 puts Connect under its prefix');
      if (response.status === 200) return info('', '200: Connect already answers under its prefix (Step 3 is done)');
      return fail('', `status ${response.status}, expected 404 or 200`);
    }),
  ]);
  return lines.flat();
}

/** Runbook Step 2: after the move each app's bare address sends visitors to its prefix. */
async function barePrefixChecks(deps) {
  const lines = await Promise.all(
    APPS.map((app) =>
      attempt(`bare/${app}`, async () => {
        const base = new URL(`https://citizens-ecosystem-${app}.vercel.app/`);
        const response = await deps.request(base.href, { method: 'HEAD' });
        const target = redirectTarget(response, base);
        const ok = response.status >= 300 && response.status < 400 && target !== null && isUnderPrefix(target.pathname, `/citizens/${app}`);
        return [
          ok
            ? pass(`bare/${app}`, `GET / is ${response.status} to ${target.pathname}`)
            : fail(`bare/${app}`, `GET / answered ${response.status}; expected a redirect to /citizens/${app}`),
        ];
      }),
    ),
  );
  return lines.flat();
}

/** Runbook Step 3, commands 1 to 6 and 8 (command 7 is a POST and is never sent). */
async function oldAddressChecks(deps) {
  const old = `https://${OLD_HOST}`;
  const redirects = [
    ['1 /c/<slug>', `${old}/c/${PROBE_SLUG}`, 308, `${NEW_CONNECT_URL}/c/${PROBE_SLUG}`],
    ['2 /index.html?c=<slug>', `${old}/index.html?c=${PROBE_SLUG}`, 308, `${NEW_CONNECT_URL}/index.html?c=${PROBE_SLUG}`],
    ['3 /dashboard', `${old}/dashboard`, 308, `${NEW_CONNECT_URL}/dashboard`],
    ['4 /', `${old}/`, 308, NEW_CONNECT_URL],
    ['5 connect project /', 'https://citizens-ecosystem-connect.vercel.app/', 307, '/citizens/connect'],
  ];
  const lines = await Promise.all([
    ...redirects.map(([part, url, status, expected]) =>
      attempt(`step3/${part}`, async () => {
        const response = await deps.request(url, { method: 'HEAD' });
        const check = checkRedirect(response, new URL(url), status, expected);
        return [check.ok ? pass(`step3/${part}`, check.reason) : fail(`step3/${part}`, check.reason)];
      }),
    ),
    attempt('step3/6 219.co.za/citizens/connect', async () => {
      const response = await deps.request(NEW_CONNECT_URL, { method: 'HEAD' });
      if (response.status !== 200) return [fail('step3/6 219.co.za/citizens/connect', `status ${response.status}, expected 200`)];
      const csp = checkAppCsp(response, { requireScriptSource: 'https://unpkg.com' });
      return [csp.ok ? pass('step3/6 219.co.za/citizens/connect', `200, ${csp.reason}`) : fail('step3/6 219.co.za/citizens/connect', csp.reason)];
    }),
    Promise.resolve([
      info('step3/7 form POST', 'not sent: it is a POST and this script never writes; run the runbook\'s command 7 by hand'),
    ]),
    attempt('step3/8 pass-through preflight', async () => {
      const name = 'step3/8 pass-through preflight';
      const response = await deps.request(`${old}/api/events`, {
        method: 'OPTIONS',
        headers: { origin: 'capacitor://localhost', 'access-control-request-method': 'GET' },
      });
      const allowed = headerValues(response, 'access-control-allow-origin')[0];
      if (response.status === 204 && allowed === 'capacitor://localhost') {
        return [pass(name, '204 with access-control-allow-origin: capacitor://localhost')];
      }
      return [fail(name, `status ${response.status}, allow-origin ${sanitizeExcerpt(allowed ?? 'missing', 40)}; expected 204 and capacitor://localhost`)];
    }),
  ]);
  return lines.flat();
}

/** Runbook Step 4: the real domain, from the front door. */
async function domainChecks(deps) {
  const apex = `https://${SITE_HOST}/`;
  const www = `https://www.${SITE_HOST}/`;
  const lines = await Promise.all([
    attempt('step4/www', async () => {
      const response = await deps.request(www, { method: 'HEAD' });
      const check = checkRedirect(response, new URL(www), 308, apex);
      return [check.ok ? pass('step4/www', check.reason) : fail('step4/www', check.reason)];
    }),
  ]);
  return lines.flat();
}

/** Runs the checks for the phase and returns every line, in a fixed order. */
export async function runChecks({ phase, hubUrl }, deps = defaultDeps) {
  const sections = [dnsChecks(deps), certificateChecks(deps), appChecks(phase, deps), deploymentChecks(deps)];
  if (phase === 'before') sections.push(todayChecks(deps));
  // The front door's own pages: on --hub-url when given, and on the real domain once it has moved.
  const hubOrigins = [hubUrl, phase === 'after' ? `https://${SITE_HOST}` : null].filter(Boolean);
  for (const origin of new Set(hubOrigins)) sections.push(hubChecks(origin, phase, deps));
  if (phase === 'after') sections.push(barePrefixChecks(deps), oldAddressChecks(deps), domainChecks(deps));
  return (await Promise.all(sections)).flat();
}

export function summarize(results) {
  const count = (level) => results.filter((result) => result.level === level).length;
  const text = `${count('PASS')} PASS, ${count('FAIL')} FAIL, ${count('INFO')} INFO`;
  return exitCodeFor(results) === 1 ? `${text}. Fix or explain every FAIL before going on.` : `${text}.`;
}

export async function main(argv = process.argv.slice(2), deps = defaultDeps, out = console.log) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    out(parsed.error);
    return 2;
  }
  if (parsed.help) {
    out(USAGE);
    return 0;
  }
  out(`Citizens cutover pre-flight, phase: ${parsed.phase}. Read-only: DNS lookups and GET / HEAD / OPTIONS only.`);
  const results = await runChecks(parsed, deps);
  for (const result of results) out(formatResult(result));
  out(summarize(results));
  return exitCodeFor(results);
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolvePath(entry) === resolvePath(fileURLToPath(import.meta.url));
}

if (invokedDirectly()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.log(`FAIL  pre-flight itself: ${errorText(error)}`);
      process.exitCode = 1;
    },
  );
}
