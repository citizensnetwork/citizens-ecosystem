#!/usr/bin/env node
/**
 * Proof that the front door really proxies, against two fake upstream servers.
 *
 *   node scripts/proxy-proof.mjs            (from apps/hub, or: pnpm --filter citizens-hub proof:proxy)
 *
 * Next bakes the rewrites into the build, so this script (1) starts two fake upstream Node servers, (2) BUILDS the hub
 * with HUB_ORIGIN_CONNECT / _VISION / _WEAR pointing at them, (3) starts `next start`, (4) sends real HTTP requests
 * and checks the raw response headers, (5) stops everything. It overwrites apps/hub/.next, so run `pnpm build`
 * again afterwards if you want a default build. Exit code 0 only if every check passes.
 *
 *   upstream 1 (connect, wear): sends its own CSP and other security headers, two Set-Cookie headers, CORS answers.
 *   upstream 2 (vision):        sends NO security headers, so any such header on the answer would be the hub's.
 *
 * Needs only Node; it does not touch the network beyond 127.0.0.1.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const hubDir = fileURLToPath(new URL('..', import.meta.url));
const nextBin = require.resolve('next/dist/bin/next');

const UPSTREAM_CSP = "default-src 'self'; script-src 'self' https://unpkg.com; x-marker-upstream-1";

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

/** A fake app. Every request is answered with a JSON description of what the app received. */
function startUpstream(label, { securityHeaders }) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://upstream.invalid');
      seen.push({ method: req.method, url: req.url });
      const status = Number(url.searchParams.get('__status')) || 200;
      const headers = { 'Content-Type': 'application/json', 'X-Upstream': label };
      if (securityHeaders) {
        headers['Content-Security-Policy'] = UPSTREAM_CSP;
        headers['X-Frame-Options'] = 'DENY';
        headers['X-Content-Type-Options'] = 'nosniff';
        headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
      }
      if (url.pathname.endsWith('/redirect-me')) {
        res.writeHead(302, {
          ...headers,
          Location: url.pathname.replace('/redirect-me', '/index.html'),
        });
        res.end();
        return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          ...headers,
          'Access-Control-Allow-Origin': req.headers.origin ?? '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          Vary: 'Origin',
        });
        res.end();
        return;
      }
      // Two Set-Cookie headers on purpose: both must reach the browser, and as two headers.
      const setCookie = ['sb-a=1; Path=/; HttpOnly', 'sb-b=2; Path=/; Secure'];
      // Named on its own so a reader (and CodeQL) can see the body is JSON, never HTML: it echoes the request.
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(status, { ...headers, 'Set-Cookie': setCookie });
      res.end(
        JSON.stringify({
          upstream: label,
          method: req.method,
          url: req.url,
          host: req.headers.host,
          xForwardedHost: req.headers['x-forwarded-host'] ?? null,
          xForwardedProto: req.headers['x-forwarded-proto'] ?? null,
          cookie: req.headers.cookie ?? null,
          authorization: req.headers.authorization ?? null,
          contentType: req.headers['content-type'] ?? null,
          bodyBytes: body.length,
          bodySha256: createHash('sha256').update(body).digest('hex'),
          bodyText: body.length <= 2000 ? body.toString('utf8') : null,
        }),
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port }));
  });
}

/** One raw HTTP request; keeps the raw header list so a duplicated header cannot hide. */
function request(port, { method = 'GET', path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const byName = {};
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          (byName[res.rawHeaders[i].toLowerCase()] ??= []).push(res.rawHeaders[i + 1]);
        }
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // not JSON: a hub page
        }
        resolve({ status: res.statusCode, headers: byName, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd: hubDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({ code, output }));
  });
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}

async function waitFor(port, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      await request(port, { path: '/robots.txt' });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

const only = (r, name) => r.headers[name]?.length === 1;

/** A currently free TCP port on 127.0.0.1, chosen by the operating system. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function main() {
  const up1 = await startUpstream('upstream-1', { securityHeaders: true });
  const up2 = await startUpstream('upstream-2', { securityHeaders: false });
  // A port the operating system just handed out, never a guess: a guessed one could be another session's server,
  // and waitFor() would then happily probe THAT.
  const hubPort = await freePort();
  const env = {
    HUB_ORIGIN_CONNECT: `http://127.0.0.1:${up1.port}`,
    HUB_ORIGIN_VISION: `http://127.0.0.1:${up2.port}`,
    HUB_ORIGIN_WEAR: `http://127.0.0.1:${up1.port}`,
    NODE_ENV: 'production',
  };

  console.log(
    `upstream-1 :${up1.port} (connect, wear)   upstream-2 :${up2.port} (vision)   hub :${hubPort}`,
  );
  const build = await run(['build'], env);
  check('hub builds with the fake upstream origins', build.code === 0, `exit ${build.code}`);
  if (build.code !== 0) {
    console.log(build.output.slice(-3000));
    return finish(null, up1, up2);
  }

  const hub = spawn(process.execPath, [nextBin, 'start', '-p', String(hubPort)], {
    cwd: hubDir,
    env: { ...process.env, ...env },
    stdio: 'ignore',
  });
  if (!(await waitFor(hubPort))) {
    check('hub starts', false);
    return finish(hub, up1, up2);
  }

  const get = (path, extra = {}) => request(hubPort, { path, ...extra });

  // 1. path, query, method and headers reach the right upstream untouched
  let r = await get('/citizens/connect/e/123?x=1&x=2&y=%20z');
  check(
    'GET path and query are preserved',
    r.json?.url === '/citizens/connect/e/123?x=1&x=2&y=%20z',
    r.json?.url,
  );
  check('GET goes to the connect upstream', r.json?.upstream === 'upstream-1');

  r = await get('/citizens/connect');
  check(
    'the bare prefix reaches the app as /citizens/connect',
    r.json?.url === '/citizens/connect',
    r.json?.url,
  );

  r = await get('/citizens/vision/index.html');
  check(
    'vision goes to the second upstream',
    r.json?.upstream === 'upstream-2' && r.json?.url === '/citizens/vision/index.html',
  );

  r = await get('/citizens/wear/api/me', {
    headers: { Authorization: 'Bearer abc', Cookie: 'sb-token=xyz; other=1' },
  });
  check(
    'Authorization and Cookie reach the app',
    r.json?.authorization === 'Bearer abc' && r.json?.cookie === 'sb-token=xyz; other=1',
  );
  check(
    'the app sees its own host (changeOrigin) and the original host in x-forwarded-host',
    r.json?.host === `127.0.0.1:${up1.port}` && r.json?.xForwardedHost === `127.0.0.1:${hubPort}`,
    `host=${r.json?.host} xfh=${r.json?.xForwardedHost}`,
  );

  // 2. POST body, byte for byte
  const payload = Buffer.from(JSON.stringify({ title: 'Quarter finals', note: 'café ✓' }));
  r = await get('/citizens/connect/api/intake/google-form', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
      'X-Intake-Secret': 's3cret',
    },
    body: payload,
  });
  check(
    'POST reaches the app as a POST',
    r.json?.method === 'POST' && r.json?.url === '/citizens/connect/api/intake/google-form',
  );
  check(
    'POST body arrives byte for byte',
    r.json?.bodySha256 === createHash('sha256').update(payload).digest('hex') &&
      r.json?.contentType === 'application/json',
    `${r.json?.bodyBytes} bytes`,
  );

  const big = Buffer.alloc(3 * 1024 * 1024, 'a');
  r = await get('/citizens/vision/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': big.length },
    body: big,
  });
  check(
    'a 3 MB POST body arrives byte for byte',
    r.json?.bodySha256 === createHash('sha256').update(big).digest('hex'),
    `${r.json?.bodyBytes} bytes`,
  );

  for (const method of ['PATCH', 'DELETE', 'PUT']) {
    r = await get('/citizens/connect/api/x', {
      method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': 2 },
      body: '{}',
    });
    check(
      `${method} reaches the app as ${method} with its body`,
      r.json?.method === method && r.json?.bodyText === '{}',
    );
  }

  // 3. CORS preflight
  r = await get('/citizens/wear/api/me', {
    method: 'OPTIONS',
    headers: {
      Origin: 'capacitor://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  check('OPTIONS preflight: 204 from the app', r.status === 204, String(r.status));
  check(
    "OPTIONS preflight: the app's CORS headers arrive, once each",
    r.headers['access-control-allow-origin']?.join() === 'capacitor://localhost' &&
      only(r, 'access-control-allow-origin') &&
      only(r, 'access-control-allow-methods') &&
      only(r, 'access-control-allow-headers'),
    JSON.stringify(r.headers['access-control-allow-origin']),
  );

  // 4. headers: exactly the upstream's, nothing added by the hub
  r = await get('/citizens/connect/index.html');
  check(
    'proxied response carries the upstream CSP, once, unchanged',
    only(r, 'content-security-policy') && r.headers['content-security-policy'][0] === UPSTREAM_CSP,
    JSON.stringify(r.headers['content-security-policy']),
  );
  for (const name of ['x-frame-options', 'x-content-type-options', 'strict-transport-security']) {
    check(`proxied response: ${name} appears once`, only(r, name), JSON.stringify(r.headers[name]));
  }
  check(
    'proxied response: no hub-only header (referrer-policy, permissions-policy, x-robots-tag)',
    !r.headers['referrer-policy'] && !r.headers['permissions-policy'] && !r.headers['x-robots-tag'],
  );
  check(
    'proxied response: both Set-Cookie headers arrive as two headers',
    r.headers['set-cookie']?.length === 2 &&
      r.headers['set-cookie'][0] === 'sb-a=1; Path=/; HttpOnly' &&
      r.headers['set-cookie'][1] === 'sb-b=2; Path=/; Secure',
    JSON.stringify(r.headers['set-cookie']),
  );

  r = await get('/citizens/vision/index.html');
  const hubOnly = [
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'strict-transport-security',
    'referrer-policy',
    'permissions-policy',
  ];
  check(
    'proxied response from an app that sends no security headers gets NONE from the hub',
    hubOnly.every((name) => !r.headers[name]),
    hubOnly.filter((name) => r.headers[name]).join(','),
  );

  r = await get('/citizens/wear/redirect-me');
  check(
    'an upstream redirect is passed on as is (302, relative Location)',
    r.status === 302 && r.headers.location?.[0] === '/citizens/wear/index.html',
    `${r.status} ${r.headers.location}`,
  );

  r = await get('/citizens/connect/x?__status=503');
  check('an upstream error status is passed on (503)', r.status === 503);

  // 5. the hub's own pages
  r = await get('/', { headers: {} });
  check(
    '/ is a 302 to /citizens',
    r.status === 302 && r.headers.location?.[0] === '/citizens',
    `${r.status} ${r.headers.location}`,
  );

  r = await get('/citizens');
  check(
    '/citizens is 200 HTML',
    r.status === 200 && /<h1[^>]*>Connecting the Kingdom<\/h1>/.test(r.text),
  );
  check(
    '/citizens carries the hub CSP exactly once, with no inline allowance',
    only(r, 'content-security-policy') &&
      !/unsafe-inline|unsafe-eval/.test(r.headers['content-security-policy'][0]),
    r.headers['content-security-policy']?.[0],
  );
  check(
    '/citizens carries the other security headers once',
    hubOnly.every((name) => only(r, name)),
  );
  check('/citizens has no <script> tag at all', !/<script/i.test(r.text));
  check('/citizens is not marked noindex', !/noindex/i.test(r.text) && !r.headers['x-robots-tag']);

  for (const slug of ['learn', 'play', 'move']) {
    r = await get(`/citizens/${slug}`);
    check(
      `/citizens/${slug} is 200 and noindex (meta and header)`,
      r.status === 200 &&
        /<meta name="robots" content="noindex"/.test(r.text) &&
        r.headers['x-robots-tag']?.join() === 'noindex',
      `${r.status} ${r.headers['x-robots-tag']}`,
    );
    check(`/citizens/${slug} carries the hub CSP once`, only(r, 'content-security-policy'));
  }

  for (const path of ['/citizens/nope', '/citizens/learn/extra', '/citizens/impact', '/nope']) {
    r = await get(path);
    check(
      `${path} is a 404 from the hub (with the hub CSP)`,
      r.status === 404 && only(r, 'content-security-policy') && !r.headers['x-upstream'],
      `${r.status}`,
    );
  }

  // 5b. what Next compiled. `next start` does not put the hub's header rules on a proxied answer, but Vercel builds its
  // routing table from this very manifest and may, so the rule's compiled pattern itself must keep off the apps' paths.
  const manifest = JSON.parse(readFileSync(join(hubDir, '.next', 'routes-manifest.json'), 'utf8'));
  const withCsp = manifest.headers.filter((rule) =>
    rule.headers.some((h) => h.key === 'Content-Security-Policy'),
  );
  check(
    'the build has exactly one header rule that carries the CSP',
    withCsp.length === 1,
    String(withCsp.length),
  );
  const cspRule = new RegExp(withCsp[0]?.regex ?? '$^', 'i');
  for (const slug of ['connect', 'vision', 'wear']) {
    for (const path of [
      `/citizens/${slug}`,
      `/citizens/${slug}/`,
      `/citizens/${slug}/index.html`,
      `/citizens/${slug}/api/v1/x`,
    ]) {
      check(`compiled CSP rule does NOT match the proxied path ${path}`, !cspRule.test(path));
    }
  }
  for (const path of [
    '/',
    '/citizens',
    '/citizens/learn',
    '/citizens/nope',
    '/nope',
    '/robots.txt',
  ]) {
    check(`compiled CSP rule matches the hub's own path ${path}`, cspRule.test(path));
  }
  const noindexSources = manifest.headers
    .filter((rule) => rule.headers.some((h) => h.key === 'X-Robots-Tag'))
    .map((rule) => new RegExp(rule.regex, 'i'));
  check(
    'three X-Robots-Tag rules, one per coming-soon page',
    noindexSources.length === 3 &&
      ['learn', 'play', 'move'].every((slug) =>
        noindexSources.some((re) => re.test(`/citizens/${slug}`)),
      ),
  );
  check(
    'no X-Robots-Tag rule matches the landing page or a proxied path',
    noindexSources.every((re) => !re.test('/citizens') && !re.test('/citizens/connect')),
  );

  // 6. static files
  r = await get('/robots.txt');
  check(
    '/robots.txt is 200 text with a Sitemap line',
    r.status === 200 && /^Sitemap: https:\/\/219\.co\.za\/sitemap\.xml$/m.test(r.text),
  );
  r = await get('/sitemap.xml');
  check(
    '/sitemap.xml lists /citizens only',
    r.status === 200 &&
      (r.text.match(/<loc>/g) ?? []).length === 1 &&
      /<loc>https:\/\/219\.co\.za\/citizens<\/loc>/.test(r.text),
  );
  r = await get('/icon.svg');
  check(
    '/icon.svg is an SVG',
    r.status === 200 && /^image\/svg\+xml/.test(r.headers['content-type']?.[0] ?? ''),
    r.headers['content-type']?.[0],
  );
  r = await get('/favicon.ico');
  check(
    '/favicon.ico is an icon',
    r.status === 200 && /icon|octet-stream/.test(r.headers['content-type']?.[0] ?? ''),
    r.headers['content-type']?.[0],
  );
  r = await get('/.well-known/assetlinks.json');
  check(
    '/.well-known/assetlinks.json is NOT invented by the hub (404)',
    r.status === 404,
    String(r.status),
  );

  // 7. things worth knowing (reported, not asserted)
  r = await get('/citizens/connect/');
  console.log(
    `INFO  trailing slash /citizens/connect/ -> ${r.status} ${r.headers.location ?? ''} (upstream saw ${r.json?.url ?? 'nothing'})`,
  );
  r = await get('/citizens/connect/p/a%20b%2Fc');
  console.log(
    `INFO  encoded path /citizens/connect/p/a%20b%2Fc -> upstream saw ${r.json?.url ?? r.status}`,
  );

  check(
    'the upstreams saw no request for a hub-only path',
    ![...up1.seen, ...up2.seen].some(
      (s) =>
        s.url.startsWith('/citizens/learn') ||
        s.url.startsWith('/citizens/play') ||
        s.url.startsWith('/citizens/move') ||
        s.url === '/' ||
        s.url.startsWith('/robots'),
    ),
  );

  return finish(hub, up1, up2);
}

function finish(hub, up1, up2) {
  killTree(hub);
  up1.server.close();
  up2.server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

await main();
