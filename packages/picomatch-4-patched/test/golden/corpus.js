'use strict';

/**
 * Deterministic pattern corpus used to prove the patched copy matches exactly like upstream
 * picomatch@4.0.7 for every pattern the patch does not literalize. Nothing here is random: the
 * same corpus always yields the same patterns, so a digest taken from pristine upstream stays
 * comparable forever (see run.js and ../../PATCHED.md).
 *
 * Every generated pattern is `${prefix}${op}(${body})${suffix}`: one extglob, with a body built from
 * TOKENS. That shape is what lets run.js state, independently of lib/parse.js, which patterns the
 * patch turns into a literal (literalizedByPatch).
 */

// Extglob body tokens: plain characters, the dot, both wildcards, a path separator, a bracket
// expression, an alternation, an escaped star and the three nested extglob shapes upstream's own
// repeated-extglob analysis already handles.
const TOKENS = ['a', 'b', '.', '*', '?', '/', '[ab]', '|', '\\*', '@(a)', '*(a)', '!(b)'];
const OPS = ['+', '*', '@', '?', '!'];

// Text around the extglob: none, a literal, a parent directory and a globstar before it; a literal,
// a separator, an extension and a globstar after it.
const PREFIXES = ['', 'a', 'x/', '**/'];
const SUFFIXES = ['', 'b', '/', '.js', '/**'];

// Every string of exactly `length` tokens, in lexicographic order of the token indexes.
function* bodies(length) {
  const counters = new Array(length).fill(0);
  for (;;) {
    yield counters.map(i => TOKENS[i]).join('');
    let pos = length - 1;
    while (pos >= 0 && ++counters[pos] === TOKENS.length) {
      counters[pos] = 0;
      pos--;
    }
    if (pos < 0) return;
  }
}

function* extglobs(maxLength, prefixes, suffixes) {
  for (let length = 1; length <= maxLength; length++) {
    for (const body of bodies(length)) {
      for (const op of OPS) {
        for (const prefix of prefixes) {
          for (const suffix of suffixes) {
            yield { pattern: `${prefix}${op}(${body})${suffix}`, op, body };
          }
        }
      }
    }
  }
}

// Real-world shapes: globs from our own configs (vitest, eslint, prettier, tsconfig), picomatch's
// README extglob examples and the advisory's own patterns. `literal: true` marks the ones the patch
// turns into a literal (the rest must match exactly like upstream).
const REALISTIC = [
  '**/*.{js,jsx,ts,tsx}',
  '**/*.{ts,tsx,js,jsx,json,md,css}',
  'src/**/*.test.{ts,tsx}',
  'src/__tests__/**/*.test.{ts,tsx}',
  '**/*.{test,spec}.?(c|m)[jt]s?(x)',
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '!(node_modules)/**',
  '**/!(*.d).ts',
  '**/*.d.ts',
  'apps/*/src/**/*.ts',
  '@(a|b)/*.ts',
  '*.+(js|ts)',
  '*.@(js|ts)',
  '*.*(js|ts)',
  'foo/!(abc)',
  'foo/*(abc|xyz)/bar',
  '+(a|b)',
  '+(*)',
  '*(*)',
  '+(*a)',
  '*(*a)',
  '+(*.js)',
  'src/+(*.test).ts',
  '+(a*)',
  '+(*?a)',
  '+(?*a)',
  { pattern: '+(*a|b)', literal: true },
  '+(x*a)',
  { pattern: '+(*[ab])', literal: true },
  { pattern: '+(**)', literal: true },
  { pattern: '+(*/a)', literal: true },
].map(entry => (typeof entry === 'string' ? { pattern: entry } : entry));

// Inputs every pattern is tested against: every string of up to 4 characters over `a`, `b`, `.` and
// `/`, plus longer shapes that exercise repetition, the prefixes and the extensions above.
function inputs() {
  const chars = ['a', 'b', '.', '/'];
  const out = [''];
  for (let length = 1; length <= 4; length++) {
    const counters = new Array(length).fill(0);
    for (;;) {
      out.push(counters.map(i => chars[i]).join(''));
      let pos = length - 1;
      while (pos >= 0 && ++counters[pos] === chars.length) {
        counters[pos] = 0;
        pos--;
      }
      if (pos < 0) break;
    }
  }
  out.push(
    'aaaaaa', 'ababab', 'abba', 'a.b.a.b', '.a.a', 'ab/ab/ab', 'a/b/a/b/a',
    'x/a', 'x/ab', 'x/b/a', 'x/.a', 'x/a.js', 'x/ab/a.js', 'ab.js', 'a.b.js', '.a.js',
    'src/a.test.ts', 'src/a.ts', 'src/x.d.ts', 'a.js', 'a.ts', 'a.jsx', 'foo/abc', 'foo/xyz/bar',
    'node_modules/a/b.ts', 'apps/x/src/a/b.ts', 'a.test.cjs', 'a.spec.tsx'
  );
  return out;
}

const sections = [
  ['extglob-bodies-1-3', () => extglobs(3, [''], [''])],
  [
    'extglob-bodies-1-2-in-context',
    () => {
      const contexts = [];
      for (const p of PREFIXES) for (const s of SUFFIXES) if (p || s) contexts.push([p, s]);
      return (function* () {
        for (const [p, s] of contexts) yield* extglobs(2, [p], [s]);
      })();
    },
  ],
  ['realistic', () => REALISTIC[Symbol.iterator]()],
];

// Option sets every pattern is compiled with. `windows` is always pinned: picomatch otherwise picks
// it from the host OS, and the golden file must be the same on Windows and on CI's Linux.
const VARIANTS = {
  default: { windows: false },
  dot: { windows: false, dot: true },
  windows: { windows: true },
  bash: { windows: false, bash: true },
};

module.exports = { TOKENS, sections, inputs, VARIANTS };
