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
