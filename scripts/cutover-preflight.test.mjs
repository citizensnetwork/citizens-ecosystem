import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  APPS,
  COMING_SOON,
  STATUS_URL,
  assertReadOnlyRequest,
  checkAppCsp,
  checkHubCsp,
  checkRedirect,
  classifyAddresses,
  collectHeaders,
  classifyVercelStatuses,
  evaluateAddresses,
  evaluateCertificate,
  evaluateNameservers,
  exitCodeFor,
  findTags,
  hasIconLink,
  hasNoindexMeta,
  hasScriptTag,
  httpRequest,
  ipv4InCidr,
  isAllowedHubHost,
  isUnderPrefix,
  main,
  parseArgs,
  parseCsp,
  parseHubUrl,
  parseSubjectAltNames,
  runChecks,
  sanitizeExcerpt,
} from './cutover-preflight.mjs';

const require = createRequire(import.meta.url);
const ESC = String.fromCharCode(27);
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);

const RATE_LIMITED = `Deployment rate limited ${EM_DASH} retry in 24 hours.`;
const ICON_PAGE = '<html><head><link rel="icon" href="icons/icon.svg" type="image/svg+xml" /></head></html>';

describe('the app and coming-soon lists match the registry', () => {
  const registry = require('../packages/ecosystem');
  it('APPS is APP_SLUGS', () => assert.deepEqual([...APPS], [...registry.APP_SLUGS]));
  it('COMING_SOON is the registry list', () =>
    assert.deepEqual(
      [...COMING_SOON],
      registry.COMING_SOON.map((entry) => entry.slug),
    ));
});

describe('sanitizeExcerpt', () => {
  it('removes control characters and escape sequences and collapses spaces', () => {
    assert.equal(sanitizeExcerpt(`${ESC}[31mred${ESC}[0m\r\nline\ttwo`), '[31mred [0m line two');
    assert.equal(sanitizeExcerpt('a\u0085b c\u007fd'), 'a b c d');
  });
  it('bounds the length, including for huge input', () => {
    const out = sanitizeExcerpt('x'.repeat(5_000_000), 40);
    assert.equal(out.length, 40);
    assert.equal(out.slice(-3), '...');
    assert.equal(sanitizeExcerpt('short', 40), 'short');
  });
  it('turns anything into a string', () => {
    assert.equal(sanitizeExcerpt(undefined), '');
    assert.equal(sanitizeExcerpt(404), '404');
  });
});

describe('hub address and command line', () => {
  it('accepts only an https origin on 219.co.za or *.vercel.app', () => {
    for (const ok of ['https://citizens-ecosystem-hub.vercel.app', 'https://219.co.za/', 'https://a-b.c-d.vercel.app']) {
      assert.equal(parseHubUrl(ok).ok, true, ok);
    }
    assert.equal(parseHubUrl('https://citizens-ecosystem-hub.vercel.app/').origin, 'https://citizens-ecosystem-hub.vercel.app');
  });

  it('rejects look-alike hosts, other schemes, logins, ports, paths and queries', () => {
    const bad = [
      'http://citizens-ecosystem-hub.vercel.app',
      'https://vercel.app',
      'https://evilvercel.app',
      'https://vercel.app.example.org',
      'https://x.vercel.app.example.org',
      'https://x.evilvercel.app',
      'https://219.co.za.example.org',
      'https://www.219.co.za',
      'https://user:pw@x.vercel.app',
      'https://x.vercel.app:8443',
      'https://x.vercel.app/citizens',
      'https://x.vercel.app/?a=1',
      'https://x.vercel.app/#top',
      'ftp://x.vercel.app',
      'not a url',
      '',
    ];
    for (const value of bad) assert.equal(parseHubUrl(value).ok, false, value);
  });

  it('compares host labels exactly', () => {
    assert.equal(isAllowedHubHost('219.co.za'), true);
    assert.equal(isAllowedHubHost('x.vercel.app'), true);
    assert.equal(isAllowedHubHost('vercel.app'), false);
    assert.equal(isAllowedHubHost('x.vercel.app.'), false);
    assert.equal(isAllowedHubHost('x.vercel.apps'), false);
    assert.equal(isAllowedHubHost('x.evilvercel.app'), false);
    assert.equal(isAllowedHubHost(undefined), false);
  });

  it('parses the options and refuses the rest', () => {
    assert.deepEqual(parseArgs([]), { ok: true, phase: 'before', hubUrl: null, help: false });
    assert.equal(parseArgs(['--phase', 'after']).phase, 'after');
    assert.equal(parseArgs(['--phase=after']).phase, 'after');
    assert.equal(parseArgs(['--hub-url', 'https://h.vercel.app']).hubUrl, 'https://h.vercel.app');
    assert.equal(parseArgs(['--hub-url=https://h.vercel.app/']).hubUrl, 'https://h.vercel.app');
    assert.equal(parseArgs(['--help']).help, true);
    for (const argv of [['--phase', 'during'], ['--phase'], ['--hub-url', 'http://h.vercel.app'], ['--post'], ['extra']]) {
      assert.equal(parseArgs(argv).ok, false, argv.join(' '));
    }
  });

  it('does not echo a long or hostile argument back in full', () => {
    const result = parseArgs([`--${ESC}[2J${'z'.repeat(500)}`]);
    assert.equal(result.ok, false);
    assert.ok(result.error.length < 600);
    assert.equal(result.error.split(ESC).length, 1);
  });
});

describe('DNS answers (runbook P1)', () => {
  it('matches addresses against a block exactly', () => {
    assert.equal(ipv4InCidr('64.29.17.65', '64.29.17.0/24'), true);
    assert.equal(ipv4InCidr('64.29.18.1', '64.29.17.0/24'), false);
    assert.equal(ipv4InCidr('216.198.79.255', '216.198.79.0/24'), true);
    assert.equal(ipv4InCidr('216.198.80.0', '216.198.79.0/24'), false);
    assert.equal(ipv4InCidr('10.0.0.1', '10.0.0.1/32'), true);
    assert.equal(ipv4InCidr('10.0.0.2', '10.0.0.1/32'), false);
    assert.equal(ipv4InCidr('300.1.1.1', '0.0.0.0/0'), false);
    assert.equal(ipv4InCidr('1.2.3.4', 'garbage'), false);
  });

  it('separates the parking address, Vercel and the rest', () => {
    assert.deepEqual(classifyAddresses(['102.214.8.148', '76.76.21.21', '203.0.113.9']), {
      parking: ['102.214.8.148'],
      vercel: ['76.76.21.21'],
      other: ['203.0.113.9'],
    });
  });

  it('passes different Vercel pools, fails on the parking address, informs on the unknown', () => {
    assert.equal(evaluateAddresses(['64.29.17.1', '64.29.17.65']).level, 'PASS');
    assert.equal(evaluateAddresses(['216.198.79.1']).level, 'PASS');
    const parked = evaluateAddresses(['216.198.79.1', '102.214.8.148']);
    assert.equal(parked.level, 'FAIL');
    assert.match(parked.reason, /parking/);
    assert.equal(evaluateAddresses([]).level, 'FAIL');
    assert.equal(evaluateAddresses(['203.0.113.9']).level, 'INFO');
  });

  it('wants exactly the two Vercel nameservers', () => {
    assert.equal(evaluateNameservers(['ns2.vercel-dns.com', 'NS1.VERCEL-DNS.COM.']).level, 'PASS');
    for (const bad of [
      ['ns1.vercel-dns.com'],
      ['ns1.vercel-dns.com', 'ns2.vercel-dns.com', 'parking1.zadns.co.za'],
      ['parking1.zadns.co.za', 'parking2.zadns.co.za'],
      [],
    ]) {
      assert.equal(evaluateNameservers(bad).level, 'FAIL', bad.join(','));
    }
  });
});

describe('certificate (runbook Step 4)', () => {
  const good = {
    authorized: true,
    identityOk: true,
    subjectCn: '219.co.za',
    names: ['219.co.za'],
    validFrom: 'Nov  1 05:56:32 2026 GMT',
    validTo: 'Jan 30 05:56:31 2027 GMT',
    issuer: "Let's Encrypt",
  };
  const now = new Date('2026-11-02T00:00:00Z');

  it('passes a trusted certificate that names the host and has time left', () => {
    const result = evaluateCertificate(good, now);
    assert.equal(result.level, 'PASS');
    assert.match(result.reason, /valid 2026-11-01 to 2027-01-30 \(89 days left\)/);
  });

  it('fails an untrusted, mismatched, expired or nearly expired certificate', () => {
    assert.equal(evaluateCertificate({ ...good, authorized: false, authorizationError: 'CERT_HAS_EXPIRED' }, now).level, 'FAIL');
    assert.equal(evaluateCertificate({ ...good, identityOk: false }, now).level, 'FAIL');
    assert.equal(evaluateCertificate(good, new Date('2027-02-01T00:00:00Z')).level, 'FAIL');
    assert.equal(evaluateCertificate(good, new Date('2027-01-20T00:00:00Z')).level, 'FAIL');
    assert.equal(evaluateCertificate({ ...good, validTo: 'nonsense' }, now).level, 'FAIL');
  });

  it('reads the names out of the alternative-name text', () => {
    assert.deepEqual(parseSubjectAltNames('DNS:219.co.za, DNS:www.219.co.za, IP Address:1.2.3.4'), ['219.co.za', 'www.219.co.za']);
    assert.deepEqual(parseSubjectAltNames(undefined), []);
  });
});

describe('the relative icon link (runbook P6)', () => {
  it('finds the link the apps ship, whatever the attribute order or quotes', () => {
    assert.equal(hasIconLink(ICON_PAGE), true);
    assert.equal(hasIconLink('<LINK HREF=\'icons/icon.svg\' REL=icon>'), true);
    assert.equal(hasIconLink('<link href="icons/icon.svg" rel="shortcut icon">'), true);
  });

  it('does not accept an absolute, different or missing icon', () => {
    assert.equal(hasIconLink('<link rel="icon" href="/icons/icon.svg">'), false);
    assert.equal(hasIconLink('<link rel="icon" href="icons/other.svg">'), false);
    assert.equal(hasIconLink('<link rel="stylesheet" href="icons/icon.svg">'), false);
    assert.equal(hasIconLink('<link rel="icon">'), false);
    assert.equal(hasIconLink('<html><head></head></html>'), false);
    assert.equal(hasIconLink(undefined), false);
  });

  it('ignores a link inside a comment and a tag that only starts with the same letters', () => {
    assert.equal(hasIconLink('<!-- <link rel="icon" href="icons/icon.svg"> -->'), false);
    assert.equal(hasIconLink('<!-- note --><link rel="icon" href="icons/icon.svg">'), true);
    assert.equal(hasIconLink('<linked rel="icon" href="icons/icon.svg">'), false);
  });

  it('is not fooled by a ">" inside a quoted value, and survives broken markup', () => {
    assert.equal(hasIconLink('<link title="a>b" rel="icon" href="icons/icon.svg">'), true);
    assert.equal(hasIconLink('<link rel="icon" href="icons/icon.svg'), false);
    assert.equal(hasIconLink('<link'), false);
    assert.equal(hasIconLink('<!-- never closed <link rel="icon" href="icons/icon.svg">'), false);
  });

  it('stays fast on a huge page full of unfinished tags', () => {
    const started = Date.now();
    hasIconLink('<link a'.repeat(100_000));
    hasIconLink(`<link ${'a'.repeat(500_000)}`);
    assert.ok(Date.now() - started < 2000);
  });

  it('reads robots meta and script tags the same way', () => {
    assert.equal(hasNoindexMeta('<meta name="robots" content="noindex">'), true);
    assert.equal(hasNoindexMeta('<meta name="Robots" content="index, NoIndex, nofollow">'), true);
    assert.equal(hasNoindexMeta('<meta name="robots" content="index">'), false);
    assert.equal(hasNoindexMeta('<meta name="description" content="noindex">'), false);
    assert.equal(hasScriptTag('<p>hi</p><SCRIPT>1</SCRIPT>'), true);
    assert.equal(hasScriptTag('<p>no scripts here</p><!-- <script> -->'), false);
    assert.equal(findTags('<a x=1><a y=2>', 'a').length, 2);
  });
});

describe('headers', () => {
  const res = (headers, status = 200) => ({ status, headers, body: '' });
  const hubPolicy =
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
  const connectPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net";

  it('parses a policy into directives', () => {
    const parsed = parseCsp("default-src 'self'; script-src 'self' https://a.example ; ;");
    assert.deepEqual([...parsed.keys()], ['default-src', 'script-src']);
    assert.deepEqual(parsed.get('script-src'), ["'self'", 'https://a.example']);
  });

  it('accepts the front door policy and rejects anything looser', () => {
    assert.equal(checkHubCsp(res({ 'content-security-policy': [hubPolicy] })).ok, true);
    assert.equal(checkHubCsp(res({})).ok, false);
    assert.equal(checkHubCsp(res({ 'content-security-policy': [hubPolicy, hubPolicy] })).ok, false);
    assert.equal(checkHubCsp(res({ 'content-security-policy': [connectPolicy] })).ok, false);
    assert.equal(checkHubCsp(res({ 'content-security-policy': [`${hubPolicy.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")}`] })).ok, false);
    // unsafe-inline anywhere in the policy fails it, even when script-src itself is clean
    const looseStyle = hubPolicy.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
    assert.notEqual(looseStyle, hubPolicy);
    assert.equal(checkHubCsp(res({ 'content-security-policy': [looseStyle] })).ok, false);
    // frame-ancestors must be the last directive; a repeated directive is ignored by browsers, so it does not move it.
    assert.equal(checkHubCsp(res({ 'content-security-policy': [`${hubPolicy}; font-src 'self'`] })).ok, false);
    assert.equal(checkHubCsp(res({ 'content-security-policy': [`${hubPolicy}; img-src 'none'`] })).ok, true);
    assert.equal(checkHubCsp(res({ 'content-security-policy': ["script-src 'self'; frame-ancestors 'self'"] })).ok, false);
  });

  it('wants exactly one app policy, and Connect\'s lists unpkg', () => {
    assert.equal(checkAppCsp(res({ 'content-security-policy': [connectPolicy] }), { requireScriptSource: 'https://unpkg.com' }).ok, true);
    assert.equal(checkAppCsp(res({ 'content-security-policy': [hubPolicy] }), { requireScriptSource: 'https://unpkg.com' }).ok, false);
    assert.equal(checkAppCsp(res({ 'content-security-policy': [connectPolicy, connectPolicy] })).ok, false);
    assert.equal(checkAppCsp(res({})).ok, false);
  });

  it('compares a redirect as parsed addresses, relative or absolute', () => {
    const base = new URL('https://h.vercel.app/');
    assert.equal(checkRedirect(res({ location: ['/citizens'] }, 302), base, 302, '/citizens').ok, true);
    assert.equal(checkRedirect(res({ location: ['https://h.vercel.app/citizens'] }, 302), base, 302, '/citizens').ok, true);
    assert.equal(checkRedirect(res({ location: ['/citizens'] }, 307), base, 302, '/citizens').ok, false);
    assert.equal(checkRedirect(res({ location: ['/citizens/'] }, 302), base, 302, '/citizens').ok, false);
    assert.equal(checkRedirect(res({ location: ['https://h.vercel.app.example.org/citizens'] }, 302), base, 302, '/citizens').ok, false);
    assert.equal(checkRedirect(res({}, 302), base, 302, '/citizens').ok, false);
    const query = new URL('https://old.example/index.html?c=x');
    assert.equal(checkRedirect(res({ location: ['https://new.example/p/index.html?c=x'] }, 308), query, 308, 'https://new.example/p/index.html?c=x').ok, true);
    assert.equal(checkRedirect(res({ location: ['https://new.example/p/index.html'] }, 308), query, 308, 'https://new.example/p/index.html?c=x').ok, false);
  });

  it('checks a prefix by whole path segments', () => {
    assert.equal(isUnderPrefix('/citizens/vision', '/citizens/vision'), true);
    assert.equal(isUnderPrefix('/citizens/vision/index.html', '/citizens/vision'), true);
    assert.equal(isUnderPrefix('/citizens/visionary', '/citizens/vision'), false);
    assert.equal(isUnderPrefix('/citizens', '/citizens/vision'), false);
    assert.equal(isUnderPrefix('/index.html', '/citizens/vision'), false);
  });
});

describe('deployment status of main (the "do not start" gate)', () => {
  const sha = 'a67da3d788aa73f796c0298517f376a2293188e6';
  const status = (app, state, description) => ({ context: `Vercel ${EN_DASH} citizens-ecosystem-${app}`, state, description });
  const completed = (app) => status(app, 'success', 'Deployment has completed');
  const byName = (results, name) => results.find((result) => result.name === name);

  it('passes only when every project completed a real deployment', () => {
    const results = classifyVercelStatuses({ sha, statuses: APPS.map(completed) });
    assert.deepEqual(
      results.map((r) => r.level),
      ['PASS', 'PASS', 'PASS', 'PASS'],
    );
    assert.equal(exitCodeFor(results), 0);
  });

  it('fails a rate-limited project and says "do not start"', () => {
    const results = classifyVercelStatuses({
      sha,
      statuses: [completed('connect'), status('wear', 'failure', RATE_LIMITED), completed('vision')],
    });
    assert.equal(byName(results, 'deployments/wear').level, 'FAIL');
    assert.match(byName(results, 'deployments/wear').reason, /do not start/);
    assert.equal(byName(results, 'deployments/connect').level, 'PASS');
    assert.equal(byName(results, 'deployment gate').level, 'FAIL');
    assert.match(byName(results, 'deployment gate').reason, /do not start/);
    assert.equal(exitCodeFor(results), 1);
  });

  it('flags the cap whatever the reported state or wording case', () => {
    const results = classifyVercelStatuses({ sha, statuses: [status('connect', 'success', 'DEPLOYMENT RATE LIMITED, retry later')] });
    assert.equal(byName(results, 'deployments/connect').level, 'FAIL');
  });

  it('treats skipped and cancelled builds as information, not proof', () => {
    const results = classifyVercelStatuses({
      sha,
      statuses: [status('connect', 'success', 'Canceled by Ignored Build Step'), status('vision', 'success', 'Skipped - Not affected'), completed('wear')],
    });
    assert.equal(byName(results, 'deployments/connect').level, 'INFO');
    assert.equal(byName(results, 'deployments/vision').level, 'INFO');
    assert.equal(byName(results, 'deployment gate').level, 'INFO');
    assert.equal(exitCodeFor(results), 0);
  });

  it('treats a build in progress as information and any other failure as a FAIL', () => {
    const results = classifyVercelStatuses({
      sha,
      statuses: [status('connect', 'pending', 'Vercel is deploying your app'), status('vision', 'error', 'Build failed'), completed('wear')],
    });
    assert.equal(byName(results, 'deployments/connect').level, 'INFO');
    assert.equal(byName(results, 'deployments/vision').level, 'FAIL');
    assert.doesNotMatch(byName(results, 'deployments/vision').reason, /do not start/);
  });

  it('copes with a missing project, a foreign status and unexpected input', () => {
    const results = classifyVercelStatuses({ sha, statuses: [completed('connect'), { context: 'CI / verify', state: 'failure', description: 'x' }] });
    assert.equal(byName(results, 'deployments/vision').level, 'INFO');
    assert.equal(exitCodeFor(results), 0);
    for (const body of [null, undefined, 'text', {}, { statuses: 'no' }, { message: 'API rate limit exceeded' }]) {
      const out = classifyVercelStatuses(body);
      assert.equal(out.length, 1);
      assert.equal(out[0].level, 'INFO');
    }
  });

  it('prints only a short plain excerpt of the description', () => {
    const results = classifyVercelStatuses({ sha, statuses: [status('connect', 'failure', `${ESC}[31m${'boom '.repeat(100)}`)] });
    const line = byName(results, 'deployments/connect').reason;
    assert.equal(line.split(ESC).length, 1);
    assert.ok(line.length < 200);
  });
});

describe('response headers', () => {
  it('keeps only the wanted names, lower-cased, and keeps repeated headers apart', () => {
    const raw = ['Content-Security-Policy', 'a', 'content-security-policy', 'b', 'LOCATION', '/x', 'Set-Cookie', 'secret=1', 'X-Other', 'y'];
    assert.deepEqual(collectHeaders(raw), { 'content-security-policy': ['a', 'b'], location: ['/x'] });
  });

  it('cannot be poisoned or crashed by a hostile header name', () => {
    const out = collectHeaders(['__proto__', 'x', 'constructor', 'y', 'toString', 'z', 'Location', '/ok']);
    assert.deepEqual(Object.keys(out), ['location']);
    assert.equal(Object.getPrototypeOf(out), Object.prototype);
    assert.equal({}.polluted, undefined);
    assert.deepEqual(collectHeaders([]), {});
    assert.deepEqual(collectHeaders(['odd']), {});
  });
});

describe('read-only guard', () => {
  it('allows GET, HEAD and OPTIONS only', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.doesNotThrow(() => assertReadOnlyRequest(method, { origin: 'capacitor://localhost' }));
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'TRACE', 'get', '']) assert.throws(() => assertReadOnlyRequest(method), /refused/, method);
  });

  it('never sends a credential header', () => {
    for (const name of ['Authorization', 'cookie', 'Proxy-Authorization', 'X-Api-Key']) {
      assert.throws(() => assertReadOnlyRequest('GET', { [name]: 'x' }), /credential/, name);
    }
  });

  it('refuses before opening a socket', () => {
    assert.throws(() => httpRequest('https://example.invalid/', { method: 'POST' }), /refused/);
    assert.throws(() => httpRequest('https://example.invalid/', { headers: { Authorization: 'x' } }), /refused/);
    return assert.rejects(() => httpRequest('http://example.invalid/'), /only plain https/);
  });
});

// A small fake of the network, keyed by "METHOD address". An address nobody planned for throws, so a test
// also proves the script asks for nothing else (and never with a method that writes).
function world() {
  const answers = new Map();
  const calls = [];
  const put = (method, url, status, headers = {}, body = '') => answers.set(`${method} ${new URL(url).href}`, { status, headers, body });
  const request = async (url, { method = 'GET' } = {}) => {
    const key = `${method} ${new URL(url).href}`;
    calls.push(key);
    const answer = answers.get(key);
    if (!answer) throw new Error(`unplanned request ${key}`);
    return answer;
  };
  const lookup = async (server, kind) => (kind === 'NS' ? ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'] : ['64.29.17.1', '216.198.79.1']);
  const certificate = async (host) => ({
    authorized: true,
    identityOk: true,
    subjectCn: host,
    names: [host],
    validFrom: 'Nov  1 05:56:32 2026 GMT',
    validTo: 'Jan 30 05:56:31 2027 GMT',
    issuer: "Let's Encrypt",
  });
  return { put, calls, deps: { request, lookup, certificate, now: () => new Date('2026-11-02T00:00:00Z') } };
}

const json = (value) => JSON.stringify(value);
const STATUS_BODY = (description, state = 'success') =>
  json({
    sha: 'a67da3d788aa73f796c0298517f376a2293188e6',
    statuses: APPS.map((app) => ({ context: `Vercel ${EN_DASH} citizens-ecosystem-${app}`, state, description })),
  });

function beforeWorld({ statusBody = STATUS_BODY('Deployment has completed'), wearPage = ICON_PAGE } = {}) {
  const w = world();
  w.put('GET', STATUS_URL, 200, {}, statusBody);
  w.put('GET', 'https://citizens-ecosystem-connect.vercel.app/index.html', 200, {}, ICON_PAGE);
  w.put('GET', 'https://citizens-ecosystem-vision.vercel.app/index.html', 200, {}, ICON_PAGE);
  w.put('GET', 'https://citizens-ecosystem-wear.vercel.app/index.html', 200, {}, wearPage);
  w.put('GET', 'https://219.co.za/', 200);
  w.put('GET', 'https://www.citizenscentral.co.za/', 200);
  return w;
}

const HUB_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'";
const CONNECT_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com";

function afterWorld() {
  const w = beforeWorld();
  const apps = ['connect', 'vision', 'wear'];
  for (const app of apps) {
    w.put('GET', `https://citizens-ecosystem-${app}.vercel.app/citizens/${app}/index.html`, 200, {}, ICON_PAGE);
    w.put('HEAD', `https://citizens-ecosystem-${app}.vercel.app/`, 307, { location: [`/citizens/${app}`] });
  }
  const old = 'https://www.citizenscentral.co.za';
  const target = 'https://219.co.za/citizens/connect';
  w.put('HEAD', `${old}/c/preflight-check`, 308, { location: [`${target}/c/preflight-check`] });
  w.put('HEAD', `${old}/index.html?c=preflight-check`, 308, { location: [`${target}/index.html?c=preflight-check`] });
  w.put('HEAD', `${old}/dashboard`, 308, { location: [`${target}/dashboard`] });
  w.put('HEAD', `${old}/`, 308, { location: [target] });
  w.put('HEAD', target, 200, { 'content-security-policy': [CONNECT_CSP] });
  w.put('OPTIONS', `${old}/api/events`, 204, { 'access-control-allow-origin': ['capacitor://localhost'] });
  w.put('HEAD', 'https://www.219.co.za/', 308, { location: ['https://219.co.za/'] });
  w.put('HEAD', 'https://219.co.za/', 302, { location: ['/citizens'] });
  w.put('GET', 'https://219.co.za/citizens', 200, { 'content-security-policy': [HUB_CSP] }, '<html><body>hi</body></html>');
  for (const slug of COMING_SOON) w.put('GET', `https://219.co.za/citizens/${slug}`, 200, { 'x-robots-tag': ['noindex'] }, '<html></html>');
  w.put('GET', 'https://219.co.za/citizens/x', 404);
  w.put('GET', 'https://219.co.za/robots.txt', 200);
  w.put('GET', 'https://219.co.za/sitemap.xml', 200);
  return w;
}

describe('the whole run, against a fake network', () => {
  it('before: a healthy world has no FAIL, and every request is read-only', async () => {
    const w = beforeWorld();
    const results = await runChecks({ phase: 'before', hubUrl: null }, w.deps);
    assert.deepEqual(results.filter((r) => r.level === 'FAIL'), []);
    assert.ok(results.length > 12);
    for (const call of w.calls) assert.match(call, /^(GET|HEAD|OPTIONS) /);
  });

  it('before: an app without the icon link is a FAIL that names P6', async () => {
    const w = beforeWorld({ wearPage: '<html><head></head></html>' });
    const results = await runChecks({ phase: 'before', hubUrl: null }, w.deps);
    const wear = results.find((r) => r.name === 'app/wear');
    assert.equal(wear.level, 'FAIL');
    assert.match(wear.reason, /P6/);
    assert.equal(exitCodeFor(results), 1);
  });

  it('before: a refused deployment is a FAIL and the run exits 1 with "do not start"', async () => {
    const w = beforeWorld({ statusBody: STATUS_BODY(RATE_LIMITED, 'failure') });
    const lines = [];
    const code = await main([], w.deps, (line) => lines.push(line));
    assert.equal(code, 1);
    assert.ok(lines.some((line) => /^FAIL .*do not start/.test(line)));
  });

  it('before: GitHub\'s own limit or a failed lookup is information, not a failure of the cutover', async () => {
    const w = beforeWorld();
    w.put('GET', STATUS_URL, 403, { 'x-ratelimit-remaining': ['0'] }, json({ message: 'API rate limit exceeded' }));
    const results = await runChecks({ phase: 'before', hubUrl: null }, w.deps);
    assert.equal(results.find((r) => r.name === 'deployments').level, 'INFO');
    assert.equal(exitCodeFor(results), 0);
  });

  it('after: a healthy world passes, never sends the form POST, and says so', async () => {
    const w = afterWorld();
    const results = await runChecks({ phase: 'after', hubUrl: null }, w.deps);
    assert.deepEqual(results.filter((r) => r.level === 'FAIL'), []);
    assert.ok(results.some((r) => r.name === 'step3/7 form POST' && r.level === 'INFO'));
    assert.ok(w.calls.some((call) => call.startsWith('OPTIONS ')));
    for (const call of w.calls) assert.match(call, /^(GET|HEAD|OPTIONS) /);
  });

  it('after: a missing forward fails the matching Step 3 check only', async () => {
    const w = afterWorld();
    w.put('HEAD', 'https://www.citizenscentral.co.za/dashboard', 404);
    const results = await runChecks({ phase: 'after', hubUrl: null }, w.deps);
    const failed = results.filter((r) => r.level === 'FAIL').map((r) => r.name);
    assert.deepEqual(failed, ['step3/3 /dashboard']);
  });

  it('with --hub-url the Step 1 checks run against it, and Connect not being under its prefix yet is information', async () => {
    const w = beforeWorld();
    const hub = 'https://citizens-ecosystem-hub.vercel.app';
    w.put('HEAD', `${hub}/`, 302, { location: ['/citizens'] });
    w.put('GET', `${hub}/citizens`, 200, { 'content-security-policy': [HUB_CSP] }, '<html></html>');
    for (const slug of COMING_SOON) w.put('GET', `${hub}/citizens/${slug}`, 200, {}, '<meta name="robots" content="noindex">');
    w.put('GET', `${hub}/citizens/x`, 404);
    w.put('GET', `${hub}/robots.txt`, 200);
    w.put('GET', `${hub}/sitemap.xml`, 200);
    w.put('HEAD', `${hub}/citizens/connect`, 404);
    const results = await runChecks({ phase: 'before', hubUrl: hub }, w.deps);
    assert.deepEqual(results.filter((r) => r.level === 'FAIL'), []);
    const hubLines = results.filter((r) => r.name.startsWith('hub/'));
    // /, /citizens, one per coming-soon page, /citizens/x, /robots.txt, /sitemap.xml, /citizens/connect
    assert.equal(hubLines.length, 6 + COMING_SOON.length);
    assert.equal(hubLines.find((r) => r.name.endsWith('/citizens/connect')).level, 'INFO');
  });

  it('a hub page that has a script tag or a Vercel login wall fails', async () => {
    const w = beforeWorld();
    const hub = 'https://citizens-ecosystem-hub.vercel.app';
    w.put('HEAD', `${hub}/`, 401);
    w.put('GET', `${hub}/citizens`, 200, { 'content-security-policy': [HUB_CSP] }, '<script>1</script>');
    for (const slug of COMING_SOON) w.put('GET', `${hub}/citizens/${slug}`, 200, {}, '<html></html>');
    w.put('GET', `${hub}/citizens/x`, 200);
    w.put('GET', `${hub}/robots.txt`, 404);
    w.put('GET', `${hub}/sitemap.xml`, 200);
    w.put('HEAD', `${hub}/citizens/connect`, 500);
    const results = await runChecks({ phase: 'before', hubUrl: hub }, w.deps);
    const hubFails = results.filter((r) => r.level === 'FAIL' && r.name.startsWith('hub/'));
    // everything except /sitemap.xml: the login wall, the script tag, the missing noindex, a 200 for an unknown page, a 404 and a 500
    assert.equal(hubFails.length, 5 + COMING_SOON.length);
    assert.match(hubFails.find((r) => r.name.endsWith(' /')).reason, /login/);
  });

  it('a lookup that throws becomes a FAIL line, not a crash', async () => {
    const w = beforeWorld();
    w.deps.lookup = async () => {
      const error = new Error('x');
      error.code = 'ETIMEOUT';
      throw error;
    };
    const results = await runChecks({ phase: 'before', hubUrl: null }, w.deps);
    const dns = results.filter((r) => r.name.startsWith('dns/'));
    assert.equal(dns.length, 6);
    assert.ok(dns.every((r) => r.level === 'FAIL' && /ETIMEOUT/.test(r.reason)));
  });

  it('prints usage and exits 2 for a bad option, 0 for --help', async () => {
    const lines = [];
    assert.equal(await main(['--post'], world().deps, (line) => lines.push(line)), 2);
    assert.equal(await main(['--help'], world().deps, (line) => lines.push(line)), 0);
    assert.ok(lines.some((line) => /Usage:/.test(line)));
  });
});
