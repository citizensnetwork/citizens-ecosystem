'use strict';

// utils.removeBackslashes (used by scan() with `unescape: true`) was rewritten as a linear scan,
// because upstream's regex took quadratic time on many `[` without a `]` (CodeQL
// js/polynomial-redos). It must return exactly what upstream's regex replace returned.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../lib/utils');
const { REGEX_REMOVE_BACKSLASH } = require('../lib/constants');

const BS = String.fromCharCode(92);

// Upstream's implementation, kept here only as the reference (inputs below are short constants).
function upstream(str) {
  return str.replace(REGEX_REMOVE_BACKSLASH, match => (match === BS ? '' : match));
}

describe('removeBackslashes', () => {
  it('matches upstream on every string of up to 7 characters over [ ] \\ a and line breaks', () => {
    const alphabet = ['[', ']', BS, 'a', '\n', '\r', String.fromCharCode(0x2028)];
    let checked = 0;
    for (let length = 0; length <= 7; length++) {
      const counters = new Array(length).fill(0);
      for (;;) {
        const str = counters.map(i => alphabet[i]).join('');
        assert.equal(utils.removeBackslashes(str), upstream(str), JSON.stringify(str));
        checked++;
        let pos = length - 1;
        while (pos >= 0 && ++counters[pos] === alphabet.length) {
          counters[pos] = 0;
          pos--;
        }
        if (pos < 0) break;
      }
    }
    assert.equal(checked, 960800);
  });

  it('matches upstream on real globs', () => {
    for (const str of [
      'foo/' + BS + '*.js',
      'a/[b' + BS + ']c]/d',
      BS + '[abc' + BS + ']/x',
      '**/[!a-z]' + BS + '?.ts',
      'src/' + BS + '(group' + BS + ')/page.tsx',
      '[]]',
      '[' + BS + ']',
    ]) {
      assert.equal(utils.removeBackslashes(str), upstream(str), str);
    }
  });

  it('is linear on a long run of [ without ]', () => {
    const start = Date.now();
    assert.equal(utils.removeBackslashes('['.repeat(200000)), '['.repeat(200000));
    assert.ok(Date.now() - start < 1000);
  });
});
