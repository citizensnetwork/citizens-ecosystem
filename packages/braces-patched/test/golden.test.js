'use strict';

// Behaviour identity: for every corpus pattern (~70k, see golden/corpus.js) the patched copy must
// give exactly the result pristine braces@3.0.3 gave, down to error messages and console output.
// A mismatch here means the depth guard changed behaviour for a "normal" pattern. To see which
// pattern, run `node test/golden/run.js --diff <extracted braces@3.0.3>` (see PATCHED.md).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const braces = require('..');
const { digest } = require('./golden/run');
const golden = require('./golden/upstream-3.0.3.json');

describe('patched braces behaves exactly like braces@3.0.3', () => {
  const actual = digest(braces);

  it('covers the same sections as the golden file', () => {
    assert.deepEqual(Object.keys(actual), Object.keys(golden.sections));
  });

  for (const [section, expected] of Object.entries(golden.sections)) {
    it(`${section}: same pattern count (${expected.patterns})`, () => {
      assert.equal(actual[section].patterns, expected.patterns);
    });

    for (const [variant, sha] of Object.entries(expected.variants)) {
      it(`${section} / ${variant}: identical results`, () => {
        assert.equal(actual[section].variants[variant], sha);
      });
    }
  }
});
