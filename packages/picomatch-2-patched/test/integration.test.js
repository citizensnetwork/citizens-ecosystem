'use strict';

// The real consumers of the 2.x line: micromatch@4 (and the micromatch inside fast-glob, which
// eslint/typescript-eslint tooling uses) must load THIS copy of picomatch, wired in through the root
// pnpm.overrides, and no npm picomatch may remain in the lockfile that OSV-Scanner reads.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = fs.realpathSync(path.resolve(__dirname, '..'));
const repoRoot = path.resolve(packageRoot, '..', '..');

function resolveFrom(entry, request) {
  return fs.realpathSync(require.resolve(request, { paths: [path.dirname(fs.realpathSync(entry))] }));
}

describe('the override is wired in', () => {
  it('micromatch, and the micromatch inside fast-glob, load picomatch from this package', () => {
    const micromatch = require.resolve('micromatch');
    const fgMicromatch = require.resolve('micromatch', { paths: [path.dirname(require.resolve('fast-glob'))] });
    for (const entry of [micromatch, fgMicromatch]) {
      assert.equal(path.dirname(resolveFrom(entry, 'picomatch')), packageRoot);
    }
  });

  it('pnpm-lock.yaml has no picomatch package entry (what OSV-Scanner reads)', () => {
    // A hit means an override was dropped, or a new dependency brought its own picomatch:
    // re-check `pnpm why picomatch -r`.
    const lockfile = fs.readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8').replace(/\r\n/g, '\n');
    assert.deepEqual(lockfile.match(/^ {2}picomatch@\d.*$/gm), null);
    assert.match(lockfile, /^ +picomatch: link:packages\/picomatch-2-patched$/m);
  });

  it('micromatch gives the expected answers through the patched copy', () => {
    const micromatch = require('micromatch');
    const posix = { windows: false };
    assert.ok(micromatch.isMatch('src/a/b.test.ts', 'src/**/*.test.{ts,tsx}', posix));
    assert.ok(!micromatch.isMatch('node_modules/a.ts', '!(node_modules)/**', posix));
    assert.deepEqual(micromatch(['a.js', 'a.js.js', 'a.ts'], '+(*.js)', posix), ['a.js', 'a.js.js']);

    const start = Date.now();
    assert.equal(micromatch.isMatch('a'.repeat(64) + '!', '+(*a)', posix), false);
    assert.ok(Date.now() - start < 250);
  });
});
