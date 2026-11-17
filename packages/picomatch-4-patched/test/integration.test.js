'use strict';

// The real consumers of the 4.x line: tinyglobby (typescript-eslint, vite) and fdir, plus vite and
// vitest themselves, must load THIS copy of picomatch, wired in through the root pnpm.overrides, and
// no npm picomatch may remain in the lockfile that OSV-Scanner reads.

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
  it('tinyglobby, and the fdir it uses, load picomatch from this package', () => {
    const tinyglobby = require.resolve('tinyglobby');
    const fdir = resolveFrom(tinyglobby, 'fdir');
    for (const entry of [tinyglobby, fdir]) {
      assert.equal(path.dirname(resolveFrom(entry, 'picomatch')), packageRoot);
    }
  });

  it('pnpm-lock.yaml has no picomatch package entry (what OSV-Scanner reads)', () => {
    // A hit means an override was dropped, or a new dependency brought its own picomatch:
    // re-check `pnpm why picomatch -r`.
    const lockfile = fs.readFileSync(path.join(repoRoot, 'pnpm-lock.yaml'), 'utf8').replace(/\r\n/g, '\n');
    assert.deepEqual(lockfile.match(/^ {2}picomatch@\d.*$/gm), null);
    const snapshots = lockfile.slice(lockfile.indexOf('\nsnapshots:'));
    for (const consumer of ['tinyglobby@0.2', 'vite@8', 'vitest@5']) {
      const block = snapshots.slice(snapshots.indexOf(`\n  ${consumer}`));
      assert.match(block.slice(0, block.indexOf('\n\n')), /^ +picomatch: link:packages\/picomatch-4-patched$/m, consumer);
    }
    // The root override must never be written into a package's peer range as an absolute path
    // (it was, before the fdir>picomatch override): that would leak a machine path and break CI.
    assert.doesNotMatch(lockfile, /link:[A-Za-z]:[\\/]|link:\/(home|Users)\//);
  });

  it('tinyglobby gives the expected answers through the patched copy', async () => {
    const { globSync } = require('tinyglobby');
    const found = globSync(['test/*.test.js', '!test/golden*'], { cwd: packageRoot }).sort();
    const expected = fs
      .readdirSync(path.join(packageRoot, 'test'))
      .filter(name => name.endsWith('.test.js') && !name.startsWith('golden'))
      .map(name => `test/${name}`)
      .sort();
    assert.ok(expected.includes('test/integration.test.js'));
    assert.deepEqual(found, expected);
  });
});
