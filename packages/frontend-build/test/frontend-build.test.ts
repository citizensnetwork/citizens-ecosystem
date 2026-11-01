import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as esbuild from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SPECIAL_FILES,
  buildFrontend,
  hashOf,
  isBasePath,
  isHttpsOrigin,
  renderConfigJs,
  resolveConfigValues,
  rewriteIndexHtml,
  sriOf,
  verifyCdnIntegrity,
} from '../index.js';
import type { BuildFrontendOptions, ConfigVar } from '../index.js';

// buildFrontend runs esbuild synchronously, which takes a few seconds when every app's
// suite runs in parallel on a busy machine; vitest's 5 s default made the end-to-end
// tests flaky (they pass alone in about 1 s).
vi.setConfig({ testTimeout: 30_000 });

const INDEX_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>
  <script src="https://cdn.example.com/react.js"></script>
</head>
<body>
  <div id="root"></div>
  <script src="config.js"></script>
  <script src="auth-client.js?v=42"></script>
  <script type="text/babel" src="app/one.jsx"></script>
  <script type="text/babel" src="app/two.jsx"></script>
</body>
</html>
`;

/** Build a minimal-but-real src/frontend fixture tree. */
function writeFixture(rootDir: string): void {
  const src = path.join(rootDir, 'src', 'frontend');
  fs.mkdirSync(path.join(src, 'app'), { recursive: true });
  fs.mkdirSync(path.join(src, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(src, 'index.html'), INDEX_HTML);
  fs.writeFileSync(
    path.join(src, 'app', 'one.jsx'),
    '(() => { window.FIXTURE_ONE = () => <div id="one">one</div>; })();\n',
  );
  fs.writeFileSync(
    path.join(src, 'app', 'two.jsx'),
    '(() => { window.FIXTURE_TWO = () => <span>{window.FIXTURE_ONE ? "two" : "no"}</span>; })();\n',
  );
  fs.writeFileSync(
    path.join(src, 'auth-client.js'),
    '(() => { /* stripped comment */ window.FIXTURE_AUTH = true; })();\n',
  );
  fs.writeFileSync(
    path.join(src, 'capacitor-bridge.js'),
    'const bridge = { native: false };\nwindow.FIXTURE_CAP = bridge;\n',
  );
  fs.writeFileSync(path.join(src, 'styles.css'), 'body { color: rebeccapurple; }\n');
  fs.writeFileSync(
    path.join(src, 'assets', 'logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
  );
  fs.writeFileSync(path.join(src, 'config.example.js'), 'window.__T_ENV = { EXAMPLE: true };\n');
}

const CONFIG_VARS: ConfigVar[] = [
  { key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' },
  { key: 'SUPABASE_ANON_KEY', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' },
  {
    key: 'API_BASE_URL',
    env: 'NEXT_PUBLIC_API_BASE_URL',
    mobileEnv: 'MOBILE_API_BASE_URL',
    mobileDefault: 'https://app.example.org',
  },
  { key: 'STYLE', env: 'NEXT_PUBLIC_STYLE', defaultValue: 'streets-v2' },
];

function makeOptions(
  rootDir: string,
  overrides: Partial<BuildFrontendOptions> = {},
): BuildFrontendOptions {
  return {
    esbuild,
    rootDir,
    appFileOrder: ['one.jsx', 'two.jsx'],
    envGlobalName: '__T_ENV',
    configVars: CONFIG_VARS,
    extraSpecialFiles: ['config.example.js'],
    mobileRequiredKeys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    mobileMissingLabel: 'Supabase',
    env: {},
    log: vi.fn(),
    warn: vi.fn(),
    ...overrides,
  };
}

/** Everything buildFrontend wrote, as one map, so "no change" is a byte comparison. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}

let rootDir: string;

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-build-'));
  writeFixture(rootDir);
});

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe('buildFrontend (end-to-end, web)', () => {
  it('produces hashed outputs, rewrites index.html, and copies static files', () => {
    const result = buildFrontend(
      makeOptions(rootDir, { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://sb.example' } }),
    );

    expect(result.dest).toBe(path.join(rootDir, 'public'));
    expect(result.bundleFile).toMatch(/^bundle\.[0-9a-f]{10}\.js$/);
    expect(result.authClientFile).toMatch(/^auth-client\.[0-9a-f]{10}\.js$/);
    expect(result.capacitorBridgeFile).toMatch(/^capacitor-bridge\.[0-9a-f]{10}\.js$/);

    // Hashed artifacts exist.
    expect(fs.existsSync(path.join(result.dest, 'app', result.bundleFile))).toBe(true);
    expect(fs.existsSync(path.join(result.dest, result.authClientFile))).toBe(true);
    expect(fs.existsSync(path.join(result.dest, result.capacitorBridgeFile))).toBe(true);

    // Static files copied; special files NOT copied raw.
    expect(fs.existsSync(path.join(result.dest, 'styles.css'))).toBe(true);
    expect(fs.existsSync(path.join(result.dest, 'assets', 'logo.svg'))).toBe(true);
    expect(fs.existsSync(path.join(result.dest, 'auth-client.js'))).toBe(false);
    expect(fs.existsSync(path.join(result.dest, 'capacitor-bridge.js'))).toBe(false);
    expect(fs.existsSync(path.join(result.dest, 'config.example.js'))).toBe(false);

    const html = fs.readFileSync(path.join(result.dest, 'index.html'), 'utf8');
    expect(html).not.toContain('@babel/standalone');
    expect(html).not.toContain('text/babel');
    // Exactly one bundle tag; bridge precedes auth-client (window.Cap* must exist first).
    expect(html.match(new RegExp(`app/${result.bundleFile}`, 'g'))).toHaveLength(1);
    expect(html.indexOf(result.capacitorBridgeFile)).toBeGreaterThan(-1);
    expect(html.indexOf(result.capacitorBridgeFile)).toBeLessThan(
      html.indexOf(result.authClientFile),
    );
    // Untouched scripts survive.
    expect(html).toContain('https://cdn.example.com/react.js');

    // config.js: env value used, default applied, web API base = '' (same origin).
    const configJs = fs.readFileSync(path.join(result.dest, 'config.js'), 'utf8');
    expect(configJs).toBe(
      renderConfigJs('__T_ENV', {
        SUPABASE_URL: 'https://sb.example',
        SUPABASE_ANON_KEY: '',
        API_BASE_URL: '',
        STYLE: 'streets-v2',
      }),
    );
  });

  it('keeps screen load order in the concatenated bundle', () => {
    const result = buildFrontend(makeOptions(rootDir));
    const bundle = fs.readFileSync(path.join(result.dest, 'app', result.bundleFile), 'utf8');
    expect(bundle.indexOf('FIXTURE_ONE')).toBeGreaterThan(-1);
    expect(bundle.indexOf('FIXTURE_ONE')).toBeLessThan(bundle.indexOf('FIXTURE_TWO'));
    // JSX was compiled to the classic runtime, not shipped raw.
    expect(bundle).toContain('React.createElement');
    expect(bundle).not.toContain('<div id="one">');
  });

  it('removes stale hashed outputs from previous builds', () => {
    const dest = path.join(rootDir, 'public');
    fs.mkdirSync(path.join(dest, 'app'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'auth-client.aaaaaaaaaa.js'), 'stale');
    fs.writeFileSync(path.join(dest, 'capacitor-bridge.bbbbbbbbbb.js'), 'stale');
    fs.writeFileSync(path.join(dest, 'app', 'bundle.cccccccccc.js'), 'stale');
    fs.writeFileSync(path.join(dest, 'keep.me.js'), 'kept');

    const result = buildFrontend(makeOptions(rootDir));

    expect(fs.existsSync(path.join(dest, 'auth-client.aaaaaaaaaa.js'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'capacitor-bridge.bbbbbbbbbb.js'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'app', 'bundle.cccccccccc.js'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'keep.me.js'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'app', result.bundleFile))).toBe(true);
  });

  it('is deterministic — same input, same hashes', () => {
    const a = buildFrontend(makeOptions(rootDir));
    const b = buildFrontend(makeOptions(rootDir));
    expect(a.bundleFile).toBe(b.bundleFile);
    expect(a.authClientFile).toBe(b.authClientFile);
    expect(a.capacitorBridgeFile).toBe(b.capacitorBridgeFile);
  });
});

describe('buildFrontend (mobile)', () => {
  it('targets mobile-dist/, forces the absolute API base, and falls back to local config', () => {
    fs.writeFileSync(
      path.join(rootDir, 'src', 'frontend', 'config.js'),
      '// local dev config\nwindow.__T_ENV = { SUPABASE_URL: "https://local.example", SUPABASE_ANON_KEY: "local-anon", API_BASE_URL: "http://localhost:3000" };\n',
    );
    const warn = vi.fn();
    const result = buildFrontend(makeOptions(rootDir, { mobile: true, warn }));

    expect(result.dest).toBe(path.join(rootDir, 'mobile-dist'));
    // Local fallback for normal keys; API base FORCED to mobileDefault (localhost ignored).
    expect(result.config.SUPABASE_URL).toBe('https://local.example');
    expect(result.config.SUPABASE_ANON_KEY).toBe('local-anon');
    expect(result.config.API_BASE_URL).toBe('https://app.example.org');
    expect(warn).not.toHaveBeenCalled();
  });

  it('prefers MOBILE_API_BASE_URL env over the mobile default', () => {
    const result = buildFrontend(
      makeOptions(rootDir, {
        mobile: true,
        env: { MOBILE_API_BASE_URL: 'https://staging.example.org' },
      }),
    );
    expect(result.config.API_BASE_URL).toBe('https://staging.example.org');
  });

  it('warns when required mobile values are missing (no local config.js)', () => {
    const warn = vi.fn();
    buildFrontend(makeOptions(rootDir, { mobile: true, warn }));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('mobile config is missing Supabase values'),
    );
  });
});

describe('option validation', () => {
  it.each([
    ['missing esbuild', { esbuild: undefined }, /options\.esbuild is required/],
    ['missing rootDir', { rootDir: '' }, /options\.rootDir/],
    ['empty appFileOrder', { appFileOrder: [] }, /appFileOrder/],
    ['invalid envGlobalName', { envGlobalName: 'window.__X__; alert(1)' }, /envGlobalName/],
    ['empty configVars', { configVars: [] }, /configVars/],
  ] as const)('rejects %s', (_label, override, message) => {
    expect(() =>
      buildFrontend({ ...makeOptions(rootDir), ...(override as object) } as BuildFrontendOptions),
    ).toThrow(message);
  });

  it('rejects a missing options object', () => {
    expect(() => (buildFrontend as unknown as () => void)()).toThrow(/options object is required/);
  });
});

describe('pure helpers', () => {
  it('hashOf returns the first 10 hex chars of sha256', () => {
    expect(hashOf('hello')).toMatch(/^[0-9a-f]{10}$/);
    expect(hashOf('hello')).toBe(hashOf('hello'));
    expect(hashOf('hello')).not.toBe(hashOf('goodbye'));
  });

  it('renderConfigJs emits the exact generated shape', () => {
    expect(renderConfigJs('__CC_ENV', { A: '1' })).toBe(
      '// AUTO-GENERATED — do not edit; set env vars and rebuild.\nwindow.__CC_ENV = {\n  "A": "1"\n};\n',
    );
  });

  it('resolveConfigValues: env beats local beats default; key order preserved', () => {
    const cfg = resolveConfigValues({
      mobile: true,
      configVars: CONFIG_VARS,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'from-env' },
      local: { SUPABASE_URL: 'from-local', SUPABASE_ANON_KEY: 'local-anon' },
    });
    expect(cfg).toEqual({
      SUPABASE_URL: 'from-env',
      SUPABASE_ANON_KEY: 'local-anon',
      API_BASE_URL: 'https://app.example.org',
      STYLE: 'streets-v2',
    });
    expect(Object.keys(cfg)).toEqual([
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'API_BASE_URL',
      'STYLE',
    ]);
  });

  it('resolveConfigValues: web build uses env/local/default for mobileEnv vars too', () => {
    const cfg = resolveConfigValues({ mobile: false, configVars: CONFIG_VARS, env: {}, local: {} });
    expect(cfg.API_BASE_URL).toBe('');
  });

  it('rewriteIndexHtml collapses all babel tags into one bundle tag', () => {
    const html = rewriteIndexHtml(INDEX_HTML, {
      bundleFile: 'bundle.0123456789.js',
      authClientFile: 'auth-client.0123456789.js',
      capacitorBridgeFile: 'capacitor-bridge.0123456789.js',
    });
    expect(html.match(/bundle\.0123456789\.js/g)).toHaveLength(1);
    expect(html).not.toContain('text/babel');
    expect(html).not.toContain('@babel/standalone');
    expect(html).not.toContain('auth-client.js?v=');
  });

  it('rewriteIndexHtml drops a raw capacitor-bridge tag — only the hashed bridge ships', () => {
    const src = INDEX_HTML.replace(
      '<script src="auth-client.js?v=42"></script>',
      '<script src="capacitor-bridge.js?v=1"></script>\n  <script src="auth-client.js?v=42"></script>',
    );
    const html = rewriteIndexHtml(src, {
      bundleFile: 'bundle.0123456789.js',
      authClientFile: 'auth-client.0123456789.js',
      capacitorBridgeFile: 'capacitor-bridge.0123456789.js',
    });
    expect(html).not.toContain('capacitor-bridge.js');
    expect(html.match(/capacitor-bridge\.0123456789\.js/g)).toHaveLength(1);
    expect(html.indexOf('capacitor-bridge.0123456789.js')).toBeLessThan(
      html.indexOf('auth-client.0123456789.js'),
    );
  });

  it('sriOf emits the standard sha384 SRI form', () => {
    // Well-known SRI of the empty string.
    expect(sriOf('')).toBe(
      'sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb',
    );
    expect(sriOf(Buffer.from('x'))).toBe(sriOf('x'));
  });

  it('DEFAULT_SPECIAL_FILES matches the historical set', () => {
    expect([...DEFAULT_SPECIAL_FILES]).toEqual([
      'app',
      'config.js',
      'auth-client.js',
      'index.html',
      'capacitor-bridge.js',
    ]);
  });
});

// ── CDN pinning, SRI verification, production twins ─────────────────────────

const REACT_DEV = '/* react dev build */ window.React = {};\n';
const REACT_PROD = '/* react prod build */ window.React={};\n';
const SUPA_UMD = '/* supabase umd */ window.supabase = {};\n';

/** Independent oracle — deliberately not sriOf(). */
function sri(content: string): string {
  return `sha384-${crypto.createHash('sha384').update(content).digest('base64')}`;
}

/** Fake an installed npm package: <dir>/node_modules/<name>/{package.json, …files}. */
function installPackage(
  dir: string,
  name: string,
  version: string,
  files: Record<string, string>,
): void {
  const pkgDir = path.join(dir, 'node_modules', ...name.split('/'));
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version }));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(pkgDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, rel), content);
  }
}

const REACT_DEV_URL = 'https://unpkg.com/react@18.3.1/umd/react.development.js';
const REACT_PROD_URL = 'https://unpkg.com/react@18.3.1/umd/react.production.min.js';
const SUPA_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.js';

const reactTag = (extra = '') =>
  `<script src="${REACT_DEV_URL}" integrity="${sri(REACT_DEV)}" crossorigin="anonymous" data-prod-src="${REACT_PROD_URL}" data-prod-integrity="${sri(REACT_PROD)}"${extra}></script>`;
const supaTag = (url = SUPA_URL, attrs = `integrity="${sri(SUPA_UMD)}" crossorigin="anonymous"`) =>
  `<script src="${url}" ${attrs}></script>`;

function installCdnPackages(dir: string): void {
  installPackage(dir, 'react', '18.3.1', {
    'umd/react.development.js': REACT_DEV,
    'umd/react.production.min.js': REACT_PROD,
  });
  installPackage(dir, '@supabase/supabase-js', '2.110.0', { 'dist/umd/supabase.js': SUPA_UMD });
}

const SRI_PACKAGES = ['react', '@supabase/supabase-js'];

describe('verifyCdnIntegrity', () => {
  beforeEach(() => installCdnPackages(rootDir));

  const verify = (html: string, packages: string[] = SRI_PACKAGES) =>
    verifyCdnIntegrity(html, { rootDir, packages });

  it('accepts exact pins whose hashes match the installed bytes (src + data-prod-src)', () => {
    expect(verify(`${reactTag()}\n${supaTag()}`)).toEqual([
      { name: 'react', version: '18.3.1', file: '/umd/react.development.js' },
      { name: 'react', version: '18.3.1', file: '/umd/react.production.min.js' },
      { name: '@supabase/supabase-js', version: '2.110.0', file: '/dist/umd/supabase.js' },
    ]);
  });

  it('resolves packages from a parent node_modules (monorepo hoisting)', () => {
    const child = path.join(rootDir, 'apps', 'child');
    fs.mkdirSync(child, { recursive: true });
    expect(
      verifyCdnIntegrity(supaTag(), { rootDir: child, packages: ['@supabase/supabase-js'] }),
    ).toHaveLength(1);
  });

  it('is a no-op without packages, and ignores unlisted packages + non-npm URLs', () => {
    const html = `${supaTag('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2')}\n<script src="https://cdn.tailwindcss.com"></script>`;
    expect(verify(html, [])).toEqual([]);
    expect(verify(`${reactTag()}\n${html}`, ['react'])).toHaveLength(2);
  });

  const SUPA_BASE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js';
  it.each([
    ['a floating major', `${SUPA_BASE}@2`, /pin an exact version/],
    ['a range', `${SUPA_BASE}@^2.110.0/dist/umd/supabase.js`, /pin an exact version/],
    [
      'no version',
      'https://unpkg.com/@supabase/supabase-js/dist/umd/supabase.js',
      /pin an exact version/,
    ],
    ['no file path', `${SUPA_BASE}@2.110.0`, /explicit file path/],
    ['a directory path', `${SUPA_BASE}@2.110.0/dist/`, /explicit file path/],
    ['version drift', `${SUPA_BASE}@2.117.2/dist/umd/supabase.js`, /lockfile installs 2\.110\.0/],
    ['a file absent from the package', `${SUPA_BASE}@2.110.0/dist/umd/nope.js`, /does not exist/],
    [
      'a path escaping the package',
      `${SUPA_BASE}@2.110.0/../../react/package.json`,
      /does not exist/,
    ],
    ['a directory inside the package', `${SUPA_BASE}@2.110.0/dist/umd`, /does not exist/],
  ])('rejects %s', (_label, url, message) => {
    expect(() => verify(supaTag(url), ['@supabase/supabase-js'])).toThrow(message);
  });

  it('rejects a wrong hash and names the expected one', () => {
    const html = supaTag(SUPA_URL, `integrity="${sri('tampered')}" crossorigin="anonymous"`);
    expect(() => verify(html, ['@supabase/supabase-js'])).toThrow(
      `expected integrity="${sri(SUPA_UMD)}"`,
    );
  });

  it('rejects a missing hash', () => {
    const html = supaTag(SUPA_URL, 'crossorigin="anonymous"');
    expect(() => verify(html, ['@supabase/supabase-js'])).toThrow(/integrity="" does not match/);
  });

  it('rejects a wrong production-twin hash', () => {
    const html = reactTag().replace(sri(REACT_PROD), sri('stale'));
    expect(() => verify(html, ['react'])).toThrow(/data-prod-integrity=".*" does not match/);
  });

  it('rejects a src tag without crossorigin="anonymous"', () => {
    const html = supaTag(SUPA_URL, `integrity="${sri(SUPA_UMD)}"`);
    expect(() => verify(html, ['@supabase/supabase-js'])).toThrow(/crossorigin="anonymous"/);
  });

  it('rejects a listed package that is not installed', () => {
    const html =
      '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>';
    expect(() => verify(html, ['react-dom'])).toThrow(/react-dom is not installed/);
  });

  it('checks tags written in any case (no <SCRIPT> bypass)', () => {
    const upper = `<SCRIPT SRC="${SUPA_URL}" INTEGRITY="${sri('tampered')}" CROSSORIGIN="anonymous"></SCRIPT>`;
    expect(() => verify(upper, ['@supabase/supabase-js'])).toThrow(/does not match/);
    const ok = `<SCRIPT SRC="${SUPA_URL}" INTEGRITY="${sri(SUPA_UMD)}" CROSSORIGIN="anonymous"></SCRIPT>`;
    expect(verify(ok, ['@supabase/supabase-js'])).toHaveLength(1);
  });

  it('rethrows read failures other than "no such file" instead of masking them', () => {
    const realRead = fs.readFileSync;
    const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(((
      file: fs.PathOrFileDescriptor,
      ...rest: unknown[]
    ) => {
      if (String(file).endsWith('supabase.js')) {
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      }
      return (realRead as (...a: unknown[]) => unknown)(file, ...rest);
    }) as typeof fs.readFileSync);
    try {
      expect(() => verify(supaTag(), ['@supabase/supabase-js'])).toThrow(/EACCES/);
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects a listed package that index.html never loads', () => {
    expect(() => verify(supaTag())).toThrow(/sriPackages lists "react" but index\.html has no/);
  });
});

describe('rewriteIndexHtml — production twins', () => {
  const files = {
    bundleFile: 'bundle.0123456789.js',
    authClientFile: 'auth-client.0123456789.js',
    capacitorBridgeFile: 'capacitor-bridge.0123456789.js',
  };

  it('swaps the development tag for its production twin, keeping other attributes', () => {
    const html = rewriteIndexHtml(`${reactTag(' defer id="react"')}\n${INDEX_HTML}`, files);
    expect(html).toContain(
      `<script src="${REACT_PROD_URL}" integrity="${sri(REACT_PROD)}" crossorigin="anonymous" defer id="react"></script>`,
    );
    expect(html).not.toContain('react.development.js');
    expect(html).not.toContain('data-prod-');
  });

  it('swaps upper-case tags and a spaced closing tag too', () => {
    const tag = `<SCRIPT SRC="${REACT_DEV_URL}" DATA-PROD-SRC="${REACT_PROD_URL}" DATA-PROD-INTEGRITY="${sri(REACT_PROD)}"></script >`;
    expect(rewriteIndexHtml(tag, files)).toBe(
      `<script src="${REACT_PROD_URL}" integrity="${sri(REACT_PROD)}" crossorigin="anonymous"></script>`,
    );
  });

  it('forces crossorigin="anonymous" on the twin even when the dev tag omitted it', () => {
    const tag = `<script src="${REACT_DEV_URL}" data-prod-src="${REACT_PROD_URL}" data-prod-integrity="${sri(REACT_PROD)}"></script>`;
    expect(rewriteIndexHtml(tag, files)).toBe(
      `<script src="${REACT_PROD_URL}" integrity="${sri(REACT_PROD)}" crossorigin="anonymous"></script>`,
    );
  });

  it('leaves tags without a twin untouched', () => {
    expect(rewriteIndexHtml(supaTag(), files)).toBe(supaTag());
  });

  it.each([
    [
      'data-prod-src alone',
      `<script src="${REACT_DEV_URL}" data-prod-src="${REACT_PROD_URL}"></script>`,
    ],
    [
      'data-prod-integrity alone',
      `<script src="${REACT_DEV_URL}" data-prod-integrity="${sri(REACT_PROD)}"></script>`,
    ],
  ])('rejects %s', (_label, tag) => {
    expect(() => rewriteIndexHtml(tag, files)).toThrow(/must be declared together/);
  });
});

describe('buildFrontend — CDN scripts', () => {
  const srcIndex = () => path.join(rootDir, 'src', 'frontend', 'index.html');
  const withCdnTags = (tags: string) =>
    fs.writeFileSync(
      srcIndex(),
      INDEX_HTML.replace('<div id="root"></div>', `<div id="root"></div>\n  ${tags}`),
    );

  beforeEach(() => installCdnPackages(rootDir));

  it('verifies pins, ships the production twin, and logs what it checked', () => {
    withCdnTags(`${reactTag()}\n  ${supaTag()}`);
    const log = vi.fn();
    const result = buildFrontend(makeOptions(rootDir, { sriPackages: SRI_PACKAGES, log }));

    expect(result.sriVerified).toHaveLength(3);
    const html = fs.readFileSync(path.join(result.dest, 'index.html'), 'utf8');
    expect(html).toContain(`src="${REACT_PROD_URL}" integrity="${sri(REACT_PROD)}"`);
    expect(html).toContain(supaTag());
    expect(html).not.toContain('.development.js');
    expect(log).toHaveBeenCalledWith(
      '[build-frontend] Verified 3 CDN SRI hashes against installed react@18.3.1, @supabase/supabase-js@2.110.0',
    );
    // The source keeps the development build for local no-build dev.
    expect(fs.readFileSync(srcIndex(), 'utf8')).toContain(REACT_DEV_URL);
  });

  it('fails fast — nothing is written when a hash is wrong', () => {
    withCdnTags(supaTag(SUPA_URL, `integrity="${sri('tampered')}" crossorigin="anonymous"`));
    expect(() =>
      buildFrontend(makeOptions(rootDir, { sriPackages: ['@supabase/supabase-js'] })),
    ).toThrow(/does not match the installed package bytes/);
    expect(fs.existsSync(path.join(rootDir, 'public'))).toBe(false);
  });

  it('refuses an upper-case development tag too', () => {
    withCdnTags(`<SCRIPT SRC="${REACT_DEV_URL}"></SCRIPT>`);
    expect(() => buildFrontend(makeOptions(rootDir))).toThrow(/still loads a development build/);
  });

  it('refuses to ship a development build that declares no production twin', () => {
    withCdnTags(
      `<script src="${REACT_DEV_URL}" integrity="${sri(REACT_DEV)}" crossorigin="anonymous"></script>`,
    );
    expect(() => buildFrontend(makeOptions(rootDir))).toThrow(
      /built index\.html still loads a development build/,
    );
    expect(fs.existsSync(path.join(rootDir, 'public'))).toBe(false);
  });

  it('uses the singular for a single verified hash', () => {
    withCdnTags(supaTag());
    const log = vi.fn();
    buildFrontend(makeOptions(rootDir, { sriPackages: ['@supabase/supabase-js'], log }));
    expect(log).toHaveBeenCalledWith(
      '[build-frontend] Verified 1 CDN SRI hash against installed @supabase/supabase-js@2.110.0',
    );
  });

  it('logs nothing about SRI when no packages are listed', () => {
    const log = vi.fn();
    const result = buildFrontend(makeOptions(rootDir, { log }));
    expect(result.sriVerified).toEqual([]);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('SRI'));
  });

  it.each([
    ['a non-array', 'react'],
    ['an empty name', ['react', '']],
  ])('rejects sriPackages given as %s', (_label, sriPackages) => {
    expect(() =>
      buildFrontend(makeOptions(rootDir, { sriPackages: sriPackages as unknown as string[] })),
    ).toThrow(/options\.sriPackages/);
  });
});

describe('basePath (serving under /citizens/<app>)', () => {
  const FILES = {
    bundleFile: 'bundle.0123456789.js',
    authClientFile: 'auth-client.0123456789.js',
    capacitorBridgeFile: 'capacitor-bridge.0123456789.js',
  };
  const WITH_BASE = INDEX_HTML.replace('<head>', '<head>\n  <base href="/" />');
  const BASE = '/citizens/connect';

  it('is a no-op when empty or omitted: the whole output is byte-identical', () => {
    const omitted = snapshot(buildFrontend(makeOptions(rootDir)).dest);
    const empty = snapshot(buildFrontend(makeOptions(rootDir, { basePath: '' })).dest);
    expect(empty).toEqual(omitted);
    expect(omitted['config.js']).not.toContain('BASE_PATH');
  });

  it('rewrites <base href="/"> to the prefix, whatever the tag looks like', () => {
    for (const tag of ['<base href="/" />', '<base href="/">', '<BASE  HREF="/"/>']) {
      const html = rewriteIndexHtml(WITH_BASE.replace('<base href="/" />', tag), {
        ...FILES,
        basePath: BASE,
      });
      expect(html, tag).toMatch(/<base\s+href="\/citizens\/connect\/"/i);
      expect(html, tag).not.toMatch(/href="\/"/);
    }
  });

  it('touches ONLY the base tag, and leaves a page without one alone', () => {
    const withPrefix = rewriteIndexHtml(WITH_BASE, { ...FILES, basePath: BASE });
    const without = rewriteIndexHtml(WITH_BASE, FILES);
    expect(withPrefix.replace('<base href="/citizens/connect/" />', '<base href="/" />')).toBe(
      without,
    );
    expect(rewriteIndexHtml(INDEX_HTML, { ...FILES, basePath: BASE })).toBe(
      rewriteIndexHtml(INDEX_HTML, FILES),
    );
  });

  it('does not rewrite a base tag that already points somewhere else', () => {
    const elsewhere = INDEX_HTML.replace('<head>', '<head>\n  <base href="/other/" />');
    expect(rewriteIndexHtml(elsewhere, { ...FILES, basePath: BASE })).toContain(
      '<base href="/other/" />',
    );
  });

  it('a "$" in the page is never read as a replacement pattern', () => {
    const tricky = "<p>$1 $& $` $'</p>";
    const html = rewriteIndexHtml(
      WITH_BASE.replace('</body>', () => `${tricky}</body>`),
      {
        ...FILES,
        basePath: BASE,
      },
    );
    expect(html).toContain(tricky);
  });

  it('config.js: empty API_BASE_URL defaults to the prefix, BASE_PATH is the LAST key', () => {
    const cfg = resolveConfigValues({
      mobile: false,
      configVars: CONFIG_VARS,
      env: {},
      local: {},
      basePath: BASE,
    });
    expect(cfg.API_BASE_URL).toBe(BASE);
    expect(cfg.BASE_PATH).toBe(BASE);
    expect(Object.keys(cfg)).toEqual([
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'API_BASE_URL',
      'STYLE',
      'BASE_PATH',
    ]);
  });

  it('config.js: an API_BASE_URL set on purpose is never overridden', () => {
    const cfg = resolveConfigValues({
      mobile: false,
      configVars: CONFIG_VARS,
      env: { NEXT_PUBLIC_API_BASE_URL: 'https://api.example.org' },
      local: {},
      basePath: BASE,
    });
    expect(cfg.API_BASE_URL).toBe('https://api.example.org');
    expect(cfg.BASE_PATH).toBe(BASE);
  });

  it('config.js: an app with no API_BASE_URL var still gets BASE_PATH, and no invented API base', () => {
    const cfg = resolveConfigValues({
      mobile: false,
      configVars: [{ key: 'SUPABASE_URL', env: 'NEXT_PUBLIC_SUPABASE_URL' }],
      env: {},
      local: {},
      basePath: BASE,
    });
    expect(cfg).toEqual({ SUPABASE_URL: '', BASE_PATH: BASE });
  });

  it('buildFrontend (web) applies it to index.html and config.js and says so in the log', () => {
    fs.writeFileSync(path.join(rootDir, 'src', 'frontend', 'index.html'), WITH_BASE);
    const log = vi.fn();
    const result = buildFrontend(makeOptions(rootDir, { basePath: BASE, log }));

    expect(fs.readFileSync(path.join(result.dest, 'index.html'), 'utf8')).toContain(
      '<base href="/citizens/connect/" />',
    );
    expect(result.config.API_BASE_URL).toBe(BASE);
    expect(result.config.BASE_PATH).toBe(BASE);
    expect(fs.readFileSync(path.join(result.dest, 'config.js'), 'utf8')).toContain(
      `"BASE_PATH": "${BASE}"`,
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Base path /citizens/connect'));
  });

  it('buildFrontend (mobile) ignores it, with a warning: the shell serves the bundle at its own root', () => {
    fs.writeFileSync(path.join(rootDir, 'src', 'frontend', 'index.html'), WITH_BASE);
    const warn = vi.fn();
    const plain = buildFrontend(makeOptions(rootDir, { mobile: true, warn: vi.fn() }));
    const plainHtml = fs.readFileSync(path.join(plain.dest, 'index.html'), 'utf8');
    const plainConfig = fs.readFileSync(path.join(plain.dest, 'config.js'), 'utf8');

    const result = buildFrontend(makeOptions(rootDir, { mobile: true, basePath: BASE, warn }));

    expect(fs.readFileSync(path.join(result.dest, 'index.html'), 'utf8')).toBe(plainHtml);
    expect(fs.readFileSync(path.join(result.dest, 'config.js'), 'utf8')).toBe(plainConfig);
    expect(result.config).not.toHaveProperty('BASE_PATH');
    expect(result.config.API_BASE_URL).toBe('https://app.example.org');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('basePath /citizens/connect ignored'),
    );
  });

  it.each([
    'citizens/connect',
    '/',
    '/citizens/connect/',
    '//evil.example',
    '/citizens//connect',
    '/Citizens/Connect',
    '/citizens/connect"><script>',
    '/citizens/../connect',
    '/citizens/connect?x=1',
    '/citizens/connect#x',
    '/citizens\\connect',
    'https://219.co.za/citizens/connect',
    ' /citizens/connect',
  ])('rejects %j everywhere it is accepted, before anything is written', (bad) => {
    expect(() => buildFrontend(makeOptions(rootDir, { basePath: bad }))).toThrow(
      /options\.basePath must be '' or a path like "\/citizens\/connect"/,
    );
    expect(() => rewriteIndexHtml(WITH_BASE, { ...FILES, basePath: bad })).toThrow(
      /options\.basePath/,
    );
    expect(() =>
      resolveConfigValues({
        mobile: false,
        configVars: CONFIG_VARS,
        env: {},
        local: {},
        basePath: bad,
      }),
    ).toThrow(/options\.basePath/);
    expect(fs.existsSync(path.join(rootDir, 'public'))).toBe(false);
  });

  it('rejects a non-string basePath', () => {
    expect(() => buildFrontend(makeOptions(rootDir, { basePath: 5 as unknown as string }))).toThrow(
      /options\.basePath/,
    );
    expect(() =>
      buildFrontend(makeOptions(rootDir, { basePath: null as unknown as string })),
    ).toThrow(/options\.basePath/);
  });
});

describe('mobileOnly and validate (native public links)', () => {
  const PUBLIC_VARS: ConfigVar[] = [
    ...CONFIG_VARS,
    {
      key: 'PUBLIC_ORIGIN',
      env: 'MOBILE_PUBLIC_ORIGIN',
      mobileEnv: 'MOBILE_PUBLIC_ORIGIN',
      mobileDefault: 'https://www.example.org',
      mobileOnly: true,
      validate: 'https-origin',
    },
    {
      key: 'PUBLIC_BASE_PATH',
      env: 'MOBILE_PUBLIC_BASE_PATH',
      mobileEnv: 'MOBILE_PUBLIC_BASE_PATH',
      mobileDefault: '',
      mobileOnly: true,
      validate: 'base-path',
    },
  ];
  const resolve = (mobile: boolean, env: Record<string, string> = {}, local = {}) =>
    resolveConfigValues({ mobile, configVars: PUBLIC_VARS, env, local });

  it('a web build leaves them out: its output is byte-identical to one without the vars', () => {
    const without = snapshot(buildFrontend(makeOptions(rootDir)).dest);
    const withVars = snapshot(
      buildFrontend(makeOptions(rootDir, { configVars: PUBLIC_VARS })).dest,
    );
    expect(withVars).toEqual(without);
    expect(withVars['config.js']).not.toContain('PUBLIC_');
  });

  it('a web build ignores even a malformed MOBILE_* value: it never reads it', () => {
    const cfg = resolve(false, {
      MOBILE_PUBLIC_ORIGIN: 'http://nope',
      MOBILE_PUBLIC_BASE_PATH: 'x',
    });
    expect(cfg).not.toHaveProperty('PUBLIC_ORIGIN');
    expect(cfg).not.toHaveProperty('PUBLIC_BASE_PATH');
    expect(Object.keys(cfg)).toEqual([
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'API_BASE_URL',
      'STYLE',
    ]);
  });

  it('a mobile build carries the defaults, after the existing keys', () => {
    const cfg = resolve(true);
    expect(cfg.PUBLIC_ORIGIN).toBe('https://www.example.org');
    expect(cfg.PUBLIC_BASE_PATH).toBe('');
    expect(Object.keys(cfg)).toEqual([
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'API_BASE_URL',
      'STYLE',
      'PUBLIC_ORIGIN',
      'PUBLIC_BASE_PATH',
    ]);
  });

  it('a mobile build takes the env values, and never the local config', () => {
    const cfg = resolve(
      true,
      { MOBILE_PUBLIC_ORIGIN: 'https://219.co.za', MOBILE_PUBLIC_BASE_PATH: '/citizens/connect' },
      { PUBLIC_ORIGIN: 'https://evil.example', PUBLIC_BASE_PATH: '/evil' },
    );
    expect(cfg.PUBLIC_ORIGIN).toBe('https://219.co.za');
    expect(cfg.PUBLIC_BASE_PATH).toBe('/citizens/connect');
    const local = resolve(true, {}, { PUBLIC_ORIGIN: 'https://evil.example' });
    expect(local.PUBLIC_ORIGIN).toBe('https://www.example.org');
  });

  it('an empty env value falls back to the default, like every other mobile var', () => {
    const cfg = resolve(true, { MOBILE_PUBLIC_ORIGIN: '', MOBILE_PUBLIC_BASE_PATH: '' });
    expect(cfg.PUBLIC_ORIGIN).toBe('https://www.example.org');
    expect(cfg.PUBLIC_BASE_PATH).toBe('');
  });

  it('writes the values into the mobile config.js and says so in the log', () => {
    const log = vi.fn();
    const result = buildFrontend(
      makeOptions(rootDir, {
        mobile: true,
        configVars: PUBLIC_VARS,
        log,
        env: {
          MOBILE_PUBLIC_ORIGIN: 'https://219.co.za',
          MOBILE_PUBLIC_BASE_PATH: '/citizens/connect',
        },
      }),
    );
    const configJs = fs.readFileSync(path.join(result.dest, 'config.js'), 'utf8');
    expect(configJs).toContain('"PUBLIC_ORIGIN": "https://219.co.za"');
    expect(configJs).toContain('"PUBLIC_BASE_PATH": "/citizens/connect"');
    expect(log).toHaveBeenCalledWith(
      '[build-frontend] Mobile-only config: PUBLIC_ORIGIN=https://219.co.za, PUBLIC_BASE_PATH=/citizens/connect',
    );
  });

  it('logs an empty base path as none, and nothing at all when no var is mobileOnly', () => {
    const log = vi.fn();
    buildFrontend(makeOptions(rootDir, { mobile: true, configVars: PUBLIC_VARS, log }));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("PUBLIC_BASE_PATH='' (none)"));
    const quiet = vi.fn();
    buildFrontend(makeOptions(rootDir, { mobile: true, log: quiet }));
    expect(quiet).not.toHaveBeenCalledWith(expect.stringContaining('Mobile-only'));
  });

  it.each([
    'https://219.co.za',
    'https://www.citizenscentral.co.za',
    'https://citizens-ecosystem-connect.vercel.app',
    'https://a.b.c.d.example.org',
    'https://xn--80ak6aa92e.com',
    'https://a1.co',
  ])('accepts the origin %j', (origin) => {
    expect(resolve(true, { MOBILE_PUBLIC_ORIGIN: origin }).PUBLIC_ORIGIN).toBe(origin);
  });

  it.each([
    'http://219.co.za',
    'ftp://219.co.za',
    '//219.co.za',
    '219.co.za',
    'https://',
    'https://219.co.za/',
    'https://219.co.za/citizens/connect',
    'https://219.co.za?x=1',
    'https://219.co.za#top',
    'https://user@219.co.za',
    'https://user:pw@219.co.za',
    'https://219.co.za@evil.example',
    'https://evil.example\\@219.co.za',
    'https://219.co.za:8443',
    'https://219.co.za:443',
    'https://219.CO.ZA',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://[::1]',
    'https://219.co.za.',
    'https://219..co.za',
    'https://-219.co.za',
    'https://219-.co.za',
    'https://219.co.za\n',
    ' https://219.co.za',
    'https://219.co.za ',
    'https://21 9.co.za',
    'https://219.co.za"><script>',
    "https://219.co.za'",
    `https://${'a'.repeat(64)}.co.za`,
    `https://${`${'a'.repeat(63)}.`.repeat(4)}com`,
  ])('rejects the origin %j', (origin) => {
    expect(() => resolve(true, { MOBILE_PUBLIC_ORIGIN: origin })).toThrow(
      /PUBLIC_ORIGIN \(MOBILE_PUBLIC_ORIGIN\) must be an https origin such as "https:\/\/219\.co\.za"/,
    );
  });

  it.each(['/citizens/connect', '/citizens/wear', '/a', '/a-b/c-d/e1'])(
    'accepts the base path %j',
    (basePath) => {
      expect(resolve(true, { MOBILE_PUBLIC_BASE_PATH: basePath }).PUBLIC_BASE_PATH).toBe(basePath);
    },
  );

  it.each([
    '/',
    'citizens/connect',
    '/citizens/connect/',
    '//citizens',
    '/citizens//connect',
    '/Citizens/Connect',
    '/citizens/../connect',
    '/citizens/./connect',
    '/citizens/connect?x=1',
    '/citizens/connect#x',
    '/citizens\\connect',
    '/citizens/connect"><script>',
    '/-a',
    '/a-',
    '/a b',
    ' /citizens/connect',
    '/citizens/connect\n',
    'https://219.co.za/citizens/connect',
    // What Git Bash turns "/citizens/connect" into when MSYS path conversion is not switched off.
    'C:/Program Files/Git/citizens/connect',
  ])('rejects the base path %j', (basePath) => {
    expect(() => resolve(true, { MOBILE_PUBLIC_BASE_PATH: basePath })).toThrow(
      /PUBLIC_BASE_PATH \(MOBILE_PUBLIC_BASE_PATH\) must be a path such as "\/citizens\/connect"/,
    );
  });

  it('fails before anything is written, so a bad value never leaves a half-built mobile-dist', () => {
    expect(() =>
      buildFrontend(
        makeOptions(rootDir, {
          mobile: true,
          configVars: PUBLIC_VARS,
          env: { MOBILE_PUBLIC_ORIGIN: 'http://219.co.za' },
        }),
      ),
    ).toThrow(/PUBLIC_ORIGIN/);
    expect(fs.existsSync(path.join(rootDir, 'mobile-dist'))).toBe(false);
  });

  it('truncates a very long bad value in the message', () => {
    let message = '';
    try {
      resolve(true, { MOBILE_PUBLIC_ORIGIN: `https://${'x'.repeat(5000)}` });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('must be an https origin');
    expect(message.length).toBeLessThan(500);
  });

  it('validates a default too: a bad mobileDefault cannot ship', () => {
    const badDefault: ConfigVar[] = [
      {
        key: 'PUBLIC_ORIGIN',
        env: 'MOBILE_PUBLIC_ORIGIN',
        mobileEnv: 'MOBILE_PUBLIC_ORIGIN',
        mobileDefault: 'http://www.example.org',
        mobileOnly: true,
        validate: 'https-origin',
      },
    ];
    expect(() =>
      resolveConfigValues({ mobile: true, configVars: badDefault, env: {}, local: {} }),
    ).toThrow(/PUBLIC_ORIGIN/);
  });

  it('validate also guards an ordinary var, in a web build, from env or local config', () => {
    const vars: ConfigVar[] = [{ key: 'SITE', env: 'NEXT_PUBLIC_SITE', validate: 'https-origin' }];
    const run = (env: Record<string, string>, local: Record<string, string> = {}) =>
      resolveConfigValues({ mobile: false, configVars: vars, env, local });
    expect(run({ NEXT_PUBLIC_SITE: 'https://219.co.za' })).toEqual({ SITE: 'https://219.co.za' });
    expect(run({})).toEqual({ SITE: '' });
    expect(() => run({ NEXT_PUBLIC_SITE: 'http://219.co.za' })).toThrow(
      /SITE \(NEXT_PUBLIC_SITE\)/,
    );
    expect(() => run({}, { SITE: 'https://219.co.za/x' })).toThrow(/SITE \(NEXT_PUBLIC_SITE\)/);
  });

  it('rejects an unknown validate kind and a mobileOnly var with no mobileEnv, before building', () => {
    const unknown = [{ key: 'X', env: 'X', validate: 'https-url' }] as unknown as ConfigVar[];
    expect(() => buildFrontend(makeOptions(rootDir, { configVars: unknown }))).toThrow(
      /configVars "X": validate must be one of https-origin, base-path/,
    );
    const noEnv = [{ key: 'X', env: 'X', mobileOnly: true }] as ConfigVar[];
    expect(() => buildFrontend(makeOptions(rootDir, { configVars: noEnv }))).toThrow(
      /configVars "X": a mobileOnly var needs a mobileEnv/,
    );
    expect(fs.existsSync(path.join(rootDir, 'public'))).toBe(false);
  });

  it('isHttpsOrigin and isBasePath are exported and never throw on a non-string', () => {
    for (const v of [undefined, null, 5, {}, ['https://219.co.za']]) {
      expect(isHttpsOrigin(v)).toBe(false);
      expect(isBasePath(v)).toBe(false);
    }
    expect(isHttpsOrigin('https://219.co.za')).toBe(true);
    expect(isHttpsOrigin(`https://${`${'a'.repeat(63)}.`.repeat(3)}com`)).toBe(true);
    expect(isBasePath('/citizens/connect')).toBe(true);
    expect(isBasePath('')).toBe(false);
  });
});
