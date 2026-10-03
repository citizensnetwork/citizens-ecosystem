'use strict';

// Regression tests for GHSA-vfj7-8cjw-p6xm (stack exhaustion on deeply nested patterns): the patch
// caps nesting at MAX_DEPTH (100) and fails fast with a SyntaxError instead of a RangeError.
// Pristine braces@3.0.3 threw "RangeError: Maximum call stack size exceeded" from expand() at a
// nesting depth of about 3743 on Node 24 (about 3500 for compile() on the reporter's build).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const braces = require('..');

const MAX = 100;
const nest = (depth, open = '{', close = '}', body = 'a,b') =>
  open.repeat(depth) + body + close.repeat(depth);

// Every public entry point that takes a pattern string.
const ENTRY_POINTS = {
  'braces()': (pattern, options) => braces(pattern, options),
  'braces() with expand': (pattern, options) => braces(pattern, { ...options, expand: true }),
  'braces.parse': (pattern, options) => braces.parse(pattern, options),
  'braces.compile': (pattern, options) => braces.compile(pattern, options),
  'braces.expand': (pattern, options) => braces.expand(pattern, options),
  'braces.stringify': (pattern, options) => braces.stringify(pattern, options),
  'braces.create': (pattern, options) => braces.create(pattern, options),
};

// Alternate braces and parens: the parser's stack holds both, so both count towards the limit.
const SHAPES = {
  braces: depth => nest(depth),
  parens: depth => nest(depth, '(', ')'),
  'braces and parens': depth => {
    const opens = Array.from({ length: depth }, (_, i) => (i % 2 ? '(' : '{'));
    const closes = opens.map(open => (open === '{' ? '}' : ')')).reverse();
    return opens.join('') + 'a,b' + closes.join('');
  },
  'comma at every level': depth => '{a,'.repeat(depth) + 'x' + '}'.repeat(depth),
  'dollar braces': depth => '${'.repeat(depth) + 'a' + '}'.repeat(depth),
};

const isDepthError = (max, depth) => err =>
  err instanceof SyntaxError &&
  !(err instanceof RangeError) &&
  err.message === `Input nesting depth (${depth}), exceeds max depth (${max})`;

describe('nesting up to the limit still works', () => {
  for (const [name, call] of Object.entries(ENTRY_POINTS)) {
    for (const [shape, make] of Object.entries(SHAPES)) {
      it(`${name}: ${MAX} levels of ${shape}`, () => {
        assert.doesNotThrow(() => call(make(MAX)));
      });
    }
  }

  it('keeps ordinary results unchanged', () => {
    assert.deepEqual(braces('a/{b,c}/d'), ['a/(b|c)/d']);
    assert.deepEqual(braces('{a,{b,c}}', { expand: true }), ['a', 'b', 'c']);
    assert.deepEqual(braces('{a,b}{c,d}', { expand: true }), ['ac', 'ad', 'bc', 'bd']);
    assert.deepEqual(braces('{1..3}', { expand: true }), ['1', '2', '3']);
  });
});

describe('nesting beyond the limit is rejected with a SyntaxError', () => {
  for (const [name, call] of Object.entries(ENTRY_POINTS)) {
    for (const [shape, make] of Object.entries(SHAPES)) {
      it(`${name}: ${MAX + 1} levels of ${shape}`, () => {
        assert.throws(() => call(make(MAX + 1)), isDepthError(MAX, MAX + 1));
      });
    }
  }

  it('counts the 100th level as allowed and the 101st as too deep', () => {
    assert.doesNotThrow(() => braces(nest(MAX)));
    assert.throws(() => braces(nest(MAX + 1)), isDepthError(MAX, MAX + 1));
  });

  // The advisory's real-world sizes: well inside the 10 000-character input limit.
  for (const depth of [3500, 3743, 4990]) {
    it(`rejects the depth-${depth} pattern that used to exhaust the stack`, () => {
      const pattern = nest(depth);
      assert.ok(pattern.length < 10000);
      assert.throws(() => braces(pattern), isDepthError(MAX, MAX + 1));
      assert.throws(() => braces(pattern, { expand: true }), isDepthError(MAX, MAX + 1));
    });
  }

  it('rejects unbalanced openers too (a flat tree before, but absurd input)', () => {
    assert.throws(() => braces('{'.repeat(MAX + 1)), isDepthError(MAX, MAX + 1));
    assert.throws(() => braces('('.repeat(MAX + 1)), isDepthError(MAX, MAX + 1));
    assert.doesNotThrow(() => braces('{'.repeat(MAX)));
  });

  it('does not count closers or sequential (non-nested) groups', () => {
    assert.doesNotThrow(() => braces('}'.repeat(500)));
    assert.doesNotThrow(() => braces(')'.repeat(500)));
    assert.doesNotThrow(() => braces('{a,b}'.repeat(1500)));
    assert.doesNotThrow(() => braces('(a)'.repeat(3000)));
  });
});

describe('options.maxDepth', () => {
  it('can lower the limit', () => {
    assert.throws(() => braces('{{a,b},c}', { maxDepth: 1 }), isDepthError(1, 2));
    assert.deepEqual(braces('{{a,b},c}', { maxDepth: 2, expand: true }), ['a', 'b', 'c']);
  });

  it('applies to every entry point', () => {
    for (const [name, call] of Object.entries(ENTRY_POINTS)) {
      assert.throws(() => call(nest(5), { maxDepth: 4 }), isDepthError(4, 5), name);
      assert.doesNotThrow(() => call(nest(5), { maxDepth: 5 }), name);
    }
  });

  it('cannot raise the limit above 100', () => {
    for (const maxDepth of [101, 5000, Number.MAX_SAFE_INTEGER, Infinity]) {
      assert.throws(() => braces(nest(MAX + 1), { maxDepth }), isDepthError(MAX, MAX + 1));
    }
  });

  it('falls back to the default for values that are not a number >= 0', () => {
    for (const maxDepth of [NaN, -1, -Infinity, '5', null, undefined, {}, [], true]) {
      assert.throws(() => braces(nest(MAX + 1), { maxDepth }), isDepthError(MAX, MAX + 1));
      assert.doesNotThrow(() => braces(nest(10), { maxDepth }));
    }
  });

  it('maxDepth: 0 refuses any block but allows plain text', () => {
    assert.throws(() => braces('{a,b}', { maxDepth: 0 }), isDepthError(0, 1));
    assert.throws(() => braces('(a)', { maxDepth: 0 }), isDepthError(0, 1));
    assert.deepEqual(braces('a/b/c', { maxDepth: 0 }), ['a/b/c']);
    assert.doesNotThrow(() => braces('a}b)c', { maxDepth: 0 }));
  });
});

// compile/expand/stringify also accept an AST, which never goes through the parser's guard.
describe('an AST handed straight to the tree walkers', () => {
  const deepAst = depth => {
    const root = { type: 'root', nodes: [] };
    let current = root;
    for (let i = 0; i < depth; i++) {
      const child = { type: 'brace', nodes: [] };
      current.nodes.push(child);
      current = child;
    }
    return root;
  };
  const isAstError = (max, depth) => err =>
    err instanceof SyntaxError &&
    err.message === `AST nesting depth (${depth}), exceeds max depth (${max})`;

  for (const method of ['compile', 'expand', 'stringify']) {
    it(`braces.${method} refuses a 5000-deep AST instead of overflowing the stack`, () => {
      assert.throws(() => braces[method](deepAst(5000)), isAstError(MAX, MAX + 1));
    });

    it(`braces.${method} accepts a ${MAX}-deep AST`, () => {
      assert.doesNotThrow(() => braces[method](deepAst(MAX)));
    });

    it(`braces.${method} honours options.maxDepth for an AST`, () => {
      assert.throws(() => braces[method](deepAst(6), { maxDepth: 5 }), isAstError(5, 6));
    });
  }

  it('round-trips a parsed AST at the limit', () => {
    const ast = braces.parse(nest(MAX));
    assert.doesNotThrow(() => braces.compile(ast));
    assert.doesNotThrow(() => braces.expand(braces.parse(nest(MAX))));
    assert.doesNotThrow(() => braces.stringify(ast));
  });
});

// The point of the cap: the deepest pattern we still accept must be nowhere near a stack overflow.
// A child process with a 128 KB V8 stack (about an eighth of the default) is far smaller than any
// real caller leaves us, yet pristine braces already died there at depth ~450-1100, and the patched
// copy must neither overflow at depth 100 nor at the old exploit sizes.
describe('stack safety', () => {
  const run = script =>
    spawnSync(process.execPath, ['--stack-size=128', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, BRACES_ENTRY: path.resolve(__dirname, '..', 'index.js') },
    });

  const probe = depth => `
    const braces = require(process.env.BRACES_ENTRY);
    const pattern = '{'.repeat(${depth}) + 'a,b' + '}'.repeat(${depth});
    const calls = {
      compile: () => braces(pattern),
      expand: () => braces(pattern, { expand: true }),
      stringify: () => braces.stringify(pattern),
      parse: () => braces.parse(pattern),
    };
    const out = {};
    for (const [name, call] of Object.entries(calls)) {
      try { call(); out[name] = 'ok'; } catch (err) { out[name] = err.constructor.name; }
    }
    console.log(JSON.stringify(out));
  `;

  it(`${MAX} levels complete on a 128 KB stack`, () => {
    const result = run(probe(MAX));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      compile: 'ok',
      expand: 'ok',
      stringify: 'ok',
      parse: 'ok',
    });
  });

  it('4990 levels fail with SyntaxError (not RangeError) on a 128 KB stack', () => {
    const result = run(probe(4990));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      compile: 'SyntaxError',
      expand: 'SyntaxError',
      stringify: 'SyntaxError',
      parse: 'SyntaxError',
    });
  });
});
