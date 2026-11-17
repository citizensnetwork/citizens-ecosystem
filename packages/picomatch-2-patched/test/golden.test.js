'use strict';

// Behaviour identity: for every corpus pattern (see golden/corpus.js), compiled with every option
// set, the patched copy must match exactly the inputs pristine picomatch@2.3.2 matched, unless
// the patch's contract (literalizedByPatch in golden/run.js) says it turns that pattern into a
// literal, in which case it must now BE a literal. A mismatch means the patch changed behaviour
// beyond its contract. To see which pattern, run
// `node test/golden/run.js --diff <extracted picomatch@2.3.2>` (see PATCHED.md).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const picomatch = require('..');
const { INPUTS, digest } = require('./golden/run');
const golden = require('./golden/upstream-2.3.2.json');

describe('patched picomatch behaves exactly like picomatch@2.3.2 outside the patch', () => {
  const actual = digest(picomatch);

  it('tests the same inputs as the golden file', () => {
    assert.equal(INPUTS.length, golden.inputs);
  });

  it('covers the same sections as the golden file', () => {
    assert.deepEqual(Object.keys(actual), Object.keys(golden.sections));
  });

  for (const [section, expected] of Object.entries(golden.sections)) {
    it(`${section}: same pattern count (${expected.patterns}, ${expected.literalized} literalized)`, () => {
      assert.equal(actual[section].patterns, expected.patterns);
      assert.equal(actual[section].literalized, expected.literalized);
    });

    for (const [variant, sha] of Object.entries(expected.variants)) {
      it(`${section} / ${variant}: identical results`, () => {
        assert.equal(actual[section].variants[variant], sha);
      });
    }
  }
});
