'use strict';

// The real consumers: micromatch and fast-glob (what eslint-config-next and typescript-eslint use)
// must (1) load THIS copy of braces, wired in through root pnpm.overrides, and (2) return exactly
// what they returned on pristine braces@3.0.3 for globs from our own configs.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GOLDEN, compute, resolveBraces } = require('./golden/integration');

const packageRoot = fs.realpathSync(path.resolve(__dirname, '..'));

describe('the override is wired in', () => {
  it('micromatch, and the micromatch inside fast-glob, load braces from this package', () => {
    for (const resolved of resolveBraces()) {
      assert.equal(path.dirname(resolved), packageRoot);
    }
  });

  it('pnpm-lock.yaml has no braces package entry (what OSV-Scanner reads)', () => {
    // All consumers (every eslint-config-next / typescript-eslint path) share one micromatch
    // snapshot, so the lockfile alone proves it. A hit means the override was dropped, or a new
    // dependency brought its own braces: re-check `pnpm why braces -r`.
    const lockfile = fs.readFileSync(path.resolve(packageRoot, '..', '..', 'pnpm-lock.yaml'), 'utf8');
    assert.deepEqual(lockfile.match(/^ {2}braces@.*$/gm), null);
    assert.match(lockfile, /^ +braces: link:packages\/braces-patched$/m);
  });
});

describe('micromatch and fast-glob give the same answers as on braces@3.0.3', () => {
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const actual = compute();

  for (const section of Object.keys(golden)) {
    it(`${section}`, () => {
      assert.deepEqual(actual[section], golden[section]);
    });
  }

  it('covers the same sections', () => {
    assert.deepEqual(Object.keys(actual), Object.keys(golden));
  });
});
