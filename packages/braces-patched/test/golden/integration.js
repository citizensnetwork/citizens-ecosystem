'use strict';

/**
 * Real-consumer smoke data: what micromatch@4.0.8 and fast-glob@3.3.3 (the packages that pull braces
 * into our eslint/prettier tooling) return for globs taken from our own configs. The committed
 * integration-3.0.3.json was captured while those packages still used pristine braces@3.0.3, so
 * integration.test.js proves they give the same answers on the patched copy. (Its makeRe section was
 * regenerated with `windows: false` pinned, again against pristine braces, so it is the same on every OS.)
 *
 *   node test/golden/integration.js --generate   rewrite integration-3.0.3.json (only valid while
 *                                                micromatch resolves PRISTINE braces; it checks)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const micromatch = require('micromatch');
const fg = require('fast-glob');

const GOLDEN = path.join(__dirname, 'integration-3.0.3.json');

// Globs from our repo (prettier script, eslint/tsconfig/vitest includes) plus bash-style ranges.
const GLOBS = [
  '**/*.{ts,tsx,js,jsx,json,md,css}',
  'src/**/*.{ts,tsx}',
  'src/**/*.test.{ts,tsx}',
  'src/__tests__/**/*.test.{ts,tsx}',
  '{src,test}/**/*.ts',
  'apps/{connect,vision,wear}/src/**/*.{ts,tsx}',
  '**/*.{test,spec}.{ts,tsx}',
  'src/{a,b}/{c,d}/*.ts',
  'file-{1..3}.txt',
  'chunk-{a..c}.js',
  '{01..03}/index.ts',
  '@(a|{b,c})/*.ts',
  '!(node_modules)/**',
  '.next/**',
  'plain/no-braces.txt',
];

const PATHS = [
  'src/index.ts',
  'src/app.tsx',
  'src/util.js',
  'src/__tests__/app.test.tsx',
  'src/a/c/x.ts',
  'test/deep/b.spec.ts',
  'apps/vision/src/v.tsx',
  'apps/other/src/o.ts',
  'file-2.txt',
  'file-4.txt',
  'chunk-b.js',
  '01/index.ts',
  'README.md',
  'node_modules/dep/index.ts',
];

const TREE = [
  'package.json',
  'README.md',
  'data.json',
  'styles/main.css',
  'src/index.ts',
  'src/app.tsx',
  'src/util.js',
  'src/__tests__/index.test.ts',
  'src/__tests__/app.test.tsx',
  'src/a/c/x.ts',
  'src/b/d/y.ts',
  'test/a.ts',
  'test/deep/b.spec.ts',
  'apps/connect/src/c.ts',
  'apps/vision/src/v.tsx',
  'apps/wear/src/w.ts',
  'apps/other/src/o.ts',
  'node_modules/dep/index.ts',
  '.next/cache.ts',
  '.hidden/x.ts',
  'file-1.txt',
  'file-2.txt',
  'file-3.txt',
  'file-4.txt',
  'chunk-a.js',
  'chunk-b.js',
  'chunk-d.js',
  '01/index.ts',
  '02/index.ts',
  '04/index.ts',
];

const attempt = fn => {
  try {
    return fn();
  } catch (err) {
    return `!${err.constructor.name}: ${err.message}`;
  }
};

function compute() {
  const out = { braces: {}, makeRe: {}, match: {}, fastGlob: {} };

  for (const glob of GLOBS) {
    out.braces[glob] = {
      compile: attempt(() => micromatch.braces(glob)),
      expand: attempt(() => micromatch.braces(glob, { expand: true })),
    };
    // picomatch emits `[\\/]` on a Windows host and `\/` elsewhere unless `windows` is a boolean, so pin
    // it: the golden must not depend on which OS generated it (it did, and failed on CI's Linux).
    out.makeRe[glob] = attempt(() => micromatch.makeRe(glob, { windows: false }).source);
    out.match[glob] = attempt(() => micromatch(PATHS, glob));
  }

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'braces-patched-'));
  try {
    for (const file of TREE) {
      fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, file), '');
    }
    for (const glob of GLOBS) {
      out.fastGlob[glob] = attempt(() => fg.sync(glob, { cwd }).sort());
    }
    out.fastGlob['(all, with negation)'] = fg
      .sync(['**/*.{ts,tsx}', '!**/node_modules/**', '!**/*.{test,spec}.{ts,tsx}'], { cwd })
      .sort();
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
  return out;
}

// Where does the braces that micromatch (and the micromatch fast-glob uses) really load from?
function resolveBraces() {
  const from = file => path.dirname(file);
  const micromatchEntry = require.resolve('micromatch');
  const fgMicromatch = require.resolve('micromatch', { paths: [from(require.resolve('fast-glob'))] });
  return [micromatchEntry, fgMicromatch].map(entry =>
    fs.realpathSync(require.resolve('braces', { paths: [from(fs.realpathSync(entry))] })),
  );
}

module.exports = { GOLDEN, compute, resolveBraces };

if (require.main === module) {
  if (process.argv[2] !== '--generate') {
    console.error('usage: node test/golden/integration.js --generate');
    process.exit(2);
  }
  const resolved = resolveBraces();
  if (!resolved.every(p => p.includes(`braces@3.0.3${path.sep}`))) {
    console.error('Refusing to generate: micromatch does not resolve pristine braces@3.0.3:', resolved);
    process.exit(1);
  }
  fs.writeFileSync(GOLDEN, JSON.stringify(compute(), null, 2) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), GOLDEN)}`);
}
