'use strict';

// GHSA-fc5q-39xc-vjpf / CVE-2026-112366: a repeated extglob whose body holds an unbounded star
// compiled to nested unbounded quantifiers (`+(*a)` -> `(?:[^/]*?a)+`), which backtrack
// exponentially. On pristine picomatch@2.3.2, `+(*a)` against 'a'.repeat(30) + '!' takes many
// seconds and every extra character doubles it.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const picomatch = require('..');

const posix = { windows: false };
const ATTACK = 'a'.repeat(64) + '!';

// Each case must finish far below what even a short attack string costs upstream.
function assertFast(pattern, input, options = posix) {
  const re = picomatch.makeRe(pattern, options);
  const start = process.hrtime.bigint();
  re.test(input);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 250, `${pattern} took ${ms.toFixed(1)} ms on ${JSON.stringify(input)}`);
}

// No `(...)+` or `(...)*` group that contains an unbounded `*?` survives in the regex.
function assertNoNestedRepetition(pattern, options = posix) {
  const source = picomatch.makeRe(pattern, options).source;
  assert.doesNotMatch(source, /\*\?[^()]*\)[+*]/, `${pattern} -> ${source}`);
}

describe('the advisory patterns no longer backtrack', () => {
  const cases = [
    ['+(*a)', ATTACK],
    ['*(*a)', ATTACK],
    ['+(*)', 'a'.repeat(64) + '/'],
    ['+(x*a)', 'xa'.repeat(32) + '!'],
    ['+(a*b)', 'ab'.repeat(32) + '!'],
    ['+(*.js)', '.js'.repeat(22) + '!'],
    ['+(*?a)', ATTACK],
    ['+(*a|*b)', ATTACK],
    ['+(a|*a)', ATTACK],
    ['+(*[ab])', ATTACK],
    ['+(@(*a))', ATTACK],
    ['+(!(*a)b)', ATTACK],
    ['+(**a)', ATTACK],
    ['+(!(b)!(b))', 'a'.repeat(24) + '/'],
    ['*(!(b))', 'a'.repeat(64) + '/'],
    ['src/+(*a)/x', 'src/' + ATTACK + '/x'],
  ];

  for (const [pattern, input] of cases) {
    it(`${pattern}`, () => {
      for (const options of [posix, { windows: true }, { windows: false, dot: true }, { windows: false, bash: true }]) {
        assertFast(pattern, input, options);
        assertNoNestedRepetition(pattern, options);
      }
    });
  }
});

describe('a single branch of plain characters, ? and * is collapsed, with the same matches', () => {
  it('+(*a) matches like @(*a) and *(*a) like ?(*a)', () => {
    assert.equal(picomatch.makeRe('+(*a)', posix).source, '^(?:(?=.)(?:[^/]*?a))$');
    assert.equal(picomatch.makeRe('*(*a)', posix).source, '^(?:(?=.)(?:[^/]*?a)?)$');
    for (const input of ['a', 'aa', 'ba', 'aba', 'ab', 'b', '', 'a/a', '.a']) {
      assert.equal(picomatch.isMatch(input, '+(*a)', posix), picomatch.isMatch(input, '@(*a)', posix), input);
    }
  });

  it('keeps everyday patterns working', () => {
    assert.ok(picomatch.isMatch('a.js', '+(*.js)', posix));
    assert.ok(picomatch.isMatch('a.js.js', '+(*.js)', posix));
    assert.ok(!picomatch.isMatch('a.ts', '+(*.js)', posix));
    assert.ok(picomatch.isMatch('src/a.test.ts', 'src/+(*.test).ts', posix));
    assert.ok(picomatch.isMatch('abc', '+(*)', posix));
    assert.ok(picomatch.isMatch('abc', '*(a*)', posix));
    assert.ok(picomatch.isMatch('', '*(a*)', { ...posix, dot: true }) === picomatch.isMatch('', '?(a*)', { ...posix, dot: true }));
  });

  it('captures the whole extglob, as before', () => {
    const re = picomatch.makeRe('+(*a)', { ...posix, capture: true });
    assert.equal(re.exec('aba')[1], 'aba');
  });
});

describe('everything else with an unbounded star is literalized, like other risky extglobs', () => {
  for (const pattern of ['+(*a|*b)', '+(a|*a)', '+(*[ab])', '+(*/a)', '+(**)', '+(@(*a))', '*(\\**a)', '+(!(b)!(b))', '+(a!(b))']) {
    it(`${pattern} matches only itself`, () => {
      assert.ok(picomatch.isMatch(pattern, pattern, posix));
      assert.ok(!picomatch.isMatch('aba', pattern, posix));
    });
  }

  it('leaves upstream\'s own rewrites alone', () => {
    // `+(*(a))` was already reduced to a character class by upstream's guard.
    assert.equal(picomatch.makeRe('+(*(a))', posix).source, '^(?:(?=.)a*)$');
    assert.ok(picomatch.isMatch('aaa', '+(*(a))', posix));
  });

  it('leaves extglobs without a star, and non-repeating ones, alone', () => {
    assert.ok(picomatch.isMatch('abab', '+(ab)', posix));
    assert.ok(picomatch.isMatch('a', '*(a|b)', posix));
    assert.ok(picomatch.isMatch('x.ts', '@(*.ts|*.js)', posix));
    assert.ok(picomatch.isMatch('x.md', '!(*.ts)', posix));
    assert.ok(picomatch.isMatch('x/a.d.ts', '**/*.d.ts', posix));
  });

  it('maxExtglobRecursion: false still turns every safeguard off (upstream\'s documented opt-out)', () => {
    const source = picomatch.makeRe('+(*a|*b)', { ...posix, maxExtglobRecursion: false }).source;
    assert.match(source, /\)\+\)\$$/);
  });
});
