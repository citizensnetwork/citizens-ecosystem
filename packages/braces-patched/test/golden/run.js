'use strict';

/**
 * Golden-master harness: proves the patched braces behaves exactly like upstream braces@3.0.3 on
 * the corpus in corpus.js, without keeping the vulnerable code in the tree.
 *
 *   node test/golden/run.js --generate <dir>   write upstream-3.0.3.json from the PRISTINE package
 *   node test/golden/run.js --diff <dir>       list the first patterns where patched != pristine
 *
 * <dir> is an extracted `npm pack braces@3.0.3` (its `package/` folder), placed INSIDE this package
 * (e.g. .upstream-3.0.3/package, which is gitignored) so it can resolve fill-range. See PATCHED.md.
 * golden.test.js compares digest(patched) against the committed upstream-3.0.3.json.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sections, VARIANTS } = require('./corpus');

const GOLDEN = path.join(__dirname, 'upstream-3.0.3.json');
const UPSTREAM = {
  package: 'braces@3.0.3',
  integrity:
    'sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==',
};

// upstream's compile() console.log()s for some invalid input (a leftover debug line). Capture it,
// once per run, so it is part of the compared result and never pollutes the test output.
let captured = [];
function capturingLog(fn) {
  const original = console.log;
  console.log = (...args) => captured.push(args.map(String).join(' '));
  try {
    return fn();
  } finally {
    console.log = original;
    captured = [];
  }
}

// One line per (variant, pattern): the JSON result, or `!Class: message` if it threw. Only call
// this inside capturingLog().
function evaluate(braces, variant, pattern) {
  captured.length = 0;
  let result;
  try {
    result = JSON.stringify(VARIANTS[variant](braces, pattern));
  } catch (err) {
    result = `!${err && err.constructor && err.constructor.name}: ${err && err.message}`;
  }
  return captured.length ? `${result} [console.log: ${JSON.stringify(captured)}]` : result;
}

// { section: { patterns, variants: { variant: sha256-of-all-lines } } }
function digest(braces) {
  return capturingLog(() => {
    const out = {};
    for (const [section, patterns] of sections) {
      const hashes = {};
      for (const variant of Object.keys(VARIANTS)) hashes[variant] = crypto.createHash('sha256');
      let count = 0;
      for (const pattern of patterns()) {
        count++;
        for (const variant of Object.keys(VARIANTS)) {
          hashes[variant].update(`${JSON.stringify(pattern)}	${evaluate(braces, variant, pattern)}
`);
        }
      }
      out[section] = {
        patterns: count,
        variants: Object.fromEntries(Object.entries(hashes).map(([v, h]) => [v, h.digest('hex')])),
      };
    }
    return out;
  });
}

function loadUpstream(dir) {
  return require(path.resolve(dir, 'index.js'));
}

function diff(upstream, patched, limit = 20) {
  return capturingLog(() => {
    const found = [];
    for (const [section, patterns] of sections) {
      for (const pattern of patterns()) {
        for (const variant of Object.keys(VARIANTS)) {
          const a = evaluate(upstream, variant, pattern);
          const b = evaluate(patched, variant, pattern);
          if (a !== b && found.push({ section, variant, pattern, upstream: a, patched: b }) >= limit) {
            return found;
          }
        }
      }
    }
    return found;
  });
}

module.exports = { GOLDEN, UPSTREAM, digest, diff };

if (require.main === module) {
  const [mode, dir] = process.argv.slice(2);
  if ((mode !== '--generate' && mode !== '--diff') || !dir) {
    console.error('usage: node test/golden/run.js --generate|--diff <extracted braces@3.0.3 package dir>');
    process.exit(2);
  }
  const upstream = loadUpstream(dir);
  if (mode === '--generate') {
    const golden = { upstream: UPSTREAM, sections: digest(upstream) };
    fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
    console.log(`wrote ${path.relative(process.cwd(), GOLDEN)}`);
  } else {
    const found = diff(upstream, require('../..'));
    for (const f of found) console.log(JSON.stringify(f, null, 2));
    console.log(found.length ? `${found.length} difference(s) shown (first 20 max)` : 'no differences');
    process.exitCode = found.length ? 1 : 0;
  }
}
