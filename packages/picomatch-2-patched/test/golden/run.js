'use strict';

/**
 * Golden-master harness: proves the patched picomatch matches exactly like upstream
 * picomatch@2.3.2 on the corpus in corpus.js, except for the patterns the patch deliberately
 * turns into a literal, without keeping the vulnerable code in the tree.
 *
 *   node test/golden/run.js --generate <dir>   write upstream-2.3.2.json from the PRISTINE package
 *   node test/golden/run.js --diff <dir>       list the first patterns where patched != pristine
 *
 * <dir> is an extracted `npm pack picomatch@2.3.2` (its `package/` folder), e.g.
 * .upstream-2.3.2/package (gitignored). See PATCHED.md. golden.test.js compares
 * digest(patched) against the committed upstream-2.3.2.json.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sections, inputs, VARIANTS } = require('./corpus');

const GOLDEN = path.join(__dirname, 'upstream-2.3.2.json');
const UPSTREAM = {
  package: 'picomatch@2.3.2',
  integrity: 'sha512-V7+vQEJ06Z+c5tSye8S+nHUfI51xoXIXjHQ99cQtKUkQqqO1kO/KCJUfZXuB47h/YBlDhah2H3hdUGXn8ie0oA==',
};
const INPUTS = inputs();

/**
 * The patch's contract, restated without lib/parse.js: does the patch turn this corpus pattern into
 * a literal? Corpus patterns hold one extglob, `${prefix}${op}(${body})${suffix}`, whose prefix and
 * suffix contain no parens. The patch literalizes a repeated extglob (`+(...)`, `*(...)`) whose body
 * holds an unbounded star (an unescaped `*` that does not open a nested `*(...)`, or a nested
 * `!(...)`, which compiles to one), unless the body
 * is a single branch of plain characters, `?` and single stars (that one is collapsed, and must
 * match exactly like upstream).
 */
function literalizedByPatch({ op, body, literal }) {
  if (literal !== undefined) return literal;
  if (op !== '+' && op !== '*') return false;
  // `+(?...)` and `*(?...)` are not extglobs at all in picomatch (`(?` reads as a regex group).
  if (body[0] === '?') return false;
  // picomatch 2.x's own guard runs first: as soon as one branch is a `*(x)` sequence it replaces the
  // whole body with a flat character class (e.g. `+(*(a)|!(b))` -> `a*`, dropping the other
  // branches; 4.x fixed that). The patch's check is never reached, so upstream's answer stands.
  if (body.split('|').some(branch => /^(\*\([ab]\))+$/.test(branch))) return false;

  let star = false;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') i++;
    else if (body[i] === '*' && body[i + 1] !== '(') star = true;
    else if (body[i] === '!' && body[i + 1] === '(') star = true;
  }
  if (!star) return false;

  const collapsible = /^[ab.?*]+$/.test(body) && !body.includes('**');
  return !collapsible;
}

// One line per (variant, pattern): which inputs match, as a 0/1 string, or `!Class: message` if
// compiling threw. A literalized pattern is recorded as LITERAL once it is proven to be one: it
// matches none of the inputs (no input contains an extglob opener) and matches its own text. The
// self-match is skipped when the pattern holds a backslash: upstream's literal fallback
// (utils.escapeRegex) does not escape backslashes, for its own risky extglobs as for these.
function evaluate(picomatch, variant, entry) {
  let re;
  try {
    re = picomatch.makeRe(entry.pattern, VARIANTS[variant]);
  } catch (err) {
    return `!${err && err.constructor && err.constructor.name}: ${err && err.message}`;
  }
  let bits = '';
  for (const input of INPUTS) bits += re.test(input) ? '1' : '0';
  return bits;
}

function isLiteral(picomatch, variant, entry, bits) {
  if (bits.includes('1') || bits.startsWith('!')) return false;
  if (entry.pattern.includes('\\')) return true;
  return picomatch.makeRe(entry.pattern, VARIANTS[variant]).test(entry.pattern);
}

// The line the digest is taken over. For the patched copy a literalized pattern must BE a literal
// (else the line says so, and the digest no longer matches); for pristine upstream the line is
// LITERAL regardless, since the patch is meant to change that pattern.
function line(picomatch, variant, entry, { patched }) {
  let result;
  if (!literalizedByPatch(entry)) {
    result = evaluate(picomatch, variant, entry);
  } else if (!patched) {
    // Never run upstream's regex for these: it is the vulnerable one and can take minutes.
    result = 'LITERAL';
  } else {
    const bits = evaluate(picomatch, variant, entry);
    result = isLiteral(picomatch, variant, entry, bits) ? 'LITERAL' : `NOT LITERAL ${bits}`;
  }
  return `${JSON.stringify(entry.pattern)}\t${result}\n`;
}

// { section: { patterns, literalized, variants: { variant: sha256-of-all-lines } } }
function digest(picomatch, { patched = true } = {}) {
  const out = {};
  for (const [section, entries] of sections) {
    const hashes = {};
    for (const variant of Object.keys(VARIANTS)) hashes[variant] = crypto.createHash('sha256');
    let count = 0;
    let literalized = 0;
    for (const entry of entries()) {
      count++;
      if (literalizedByPatch(entry)) literalized++;
      for (const variant of Object.keys(VARIANTS)) {
        hashes[variant].update(line(picomatch, variant, entry, { patched }));
      }
    }
    out[section] = {
      patterns: count,
      literalized,
      variants: Object.fromEntries(Object.entries(hashes).map(([v, h]) => [v, h.digest('hex')])),
    };
  }
  return out;
}

function loadUpstream(dir) {
  return require(path.resolve(dir, 'index.js'));
}

function diff(upstream, patched, limit = 20) {
  const found = [];
  for (const [section, entries] of sections) {
    for (const entry of entries()) {
      for (const variant of Object.keys(VARIANTS)) {
        const a = line(upstream, variant, entry, { patched: false });
        const b = line(patched, variant, entry, { patched: true });
        if (a !== b && found.push({ section, variant, pattern: entry.pattern, upstream: a, patched: b }) >= limit) {
          return found;
        }
      }
    }
  }
  return found;
}

// How many literalized (pattern, variant) pairs upstream actually matched something for: the
// patterns whose meaning the patch changes (the others upstream had already made literal). Only the
// inputs of up to 4 characters are used, so upstream's vulnerable regexes finish.
const SHORT_INPUTS = INPUTS.filter(input => input.length <= 4);

function changedMeaning(upstream) {
  let changed = 0;
  let total = 0;
  for (const [, entries] of sections) {
    for (const entry of entries()) {
      if (!literalizedByPatch(entry)) continue;
      for (const variant of Object.keys(VARIANTS)) {
        total++;
        const re = upstream.makeRe(entry.pattern, VARIANTS[variant]);
        if (SHORT_INPUTS.some(input => re.test(input))) changed++;
      }
    }
  }
  return { total, changed };
}

module.exports = { GOLDEN, UPSTREAM, INPUTS, digest, diff, literalizedByPatch };

if (require.main === module) {
  const [mode, dir] = process.argv.slice(2);
  if ((mode !== '--generate' && mode !== '--diff') || !dir) {
    console.error('usage: node test/golden/run.js --generate|--diff <extracted picomatch@2.3.2 package dir>');
    process.exit(2);
  }
  const upstream = loadUpstream(dir);
  if (require(path.resolve(dir, 'package.json')).version !== '2.3.2') {
    console.error(`Refusing: ${dir} is not picomatch@2.3.2`);
    process.exit(1);
  }
  if (mode === '--generate') {
    const golden = {
      upstream: UPSTREAM,
      inputs: INPUTS.length,
      literalizedPairs: changedMeaning(upstream),
      sections: digest(upstream, { patched: false }),
    };
    fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
    console.log(`wrote ${path.relative(process.cwd(), GOLDEN)}`);
  } else {
    const found = diff(upstream, require('../..'));
    for (const f of found) console.log(JSON.stringify(f, null, 2));
    console.log(found.length ? `${found.length} difference(s) shown (first 20 max)` : 'no differences');
    process.exitCode = found.length ? 1 : 0;
  }
}
