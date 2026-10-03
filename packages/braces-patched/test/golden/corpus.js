'use strict';

/**
 * Deterministic pattern corpus used to prove the patched copy behaves exactly like upstream
 * braces@3.0.3 for every pattern that is not pathologically nested. Nothing here is random: the
 * same corpus always yields the same patterns, so a digest taken from pristine upstream stays
 * comparable forever (see run.js and ../../PATCHED.md).
 */

// Characters that drive the parser's branches: braces, parens, brackets, commas, dots (ranges),
// `$` (dollar braces), backslash (escapes), quotes, plus plain text and digits.
const TOKENS = ['{', '}', '(', ')', ',', '..', 'a', 'b', '1', '3', '$', '\\', '[', ']', '"', '-'];

// Every string of exactly `length` tokens, in lexicographic order of the token indexes.
function* exhaustive(length) {
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

// Real-world shapes: our own eslint/prettier/tailwind/tsconfig globs, README examples, bash cases.
const REALISTIC = [
  '**/*.{js,jsx,ts,tsx}',
  '**/*.{ts,tsx}',
  '**/*.{ts,tsx,js,jsx,json,md,css}',
  '{src,test}/**/*.ts',
  'src/**/*.test.{ts,tsx}',
  './src/**/*.{js,ts,jsx,tsx,mdx}',
  'apps/{connect,vision,wear}/src/**/*.{ts,tsx}',
  'packages/*/src/**/*.ts',
  '!(node_modules)/**',
  '+(a|b)/**',
  '@(a|{b,c})',
  'a/{b,c}/d',
  'a{b,c{d,e}f}g',
  '{a,b}{c,d}',
  '{a,b,c}{1,2,3}{x,y}',
  '{a,{b,c}}',
  '{{a,b},c}',
  '{a,b}',
  '{a}',
  '{}',
  '{,}',
  '{,a}b',
  'a{,b}',
  '${a,b}',
  '${a,b}/{c,d}',
  '{1..10}',
  '{1..10..2}',
  '{10..1}',
  '{-5..5}',
  '{a..e}',
  '{a..z..3}',
  '{A..e}',
  '{01..10}',
  'file-{001..100}.txt',
  'a/{1..3}/b',
  '{1..2000}',
  '{1..3}{a..c}',
  '{a,(b|c)}',
  '{(a,b),c}',
  '"{a,b}"',
  "'{a,b}'",
  '`{a,b}`',
  '\\{a,b}',
  '{a\\,b,c}',
  '{a,b\\}',
  '[{a,b}]',
  '{[a,b],c}',
  'src\\{a,b}',
  '{é,ü}',
  '{ a,b}',
  '{﻿a,b}',
  '{a,b',
  'a,b}',
  '{{a,b}',
  '{a,b}}',
  '(a,b)',
  '((a,b))',
  '{a..}',
  '{..a}',
  '{a.b,c}',
  '{a..b..c..d}',
  'a{b..c}d{e,f}',
  'x{a,b}y{1..3}z',
  '',
  'a',
  'ab',
  'plain/path/with/no/braces.txt',
];

// Legal-but-deep nesting (the brief's "patterns at depth 1-20"), in several shapes: plain, comma at
// every level, comma after, parens, mixed brace/paren, dollar, range, and prefixed.
const NESTED_MAX = 20;

function* nested() {
  for (let d = 1; d <= NESTED_MAX; d++) {
    yield '{'.repeat(d) + 'a,b' + '}'.repeat(d);
    yield '{a,'.repeat(d) + 'x' + '}'.repeat(d);
    yield '{'.repeat(d) + 'x' + ',y}'.repeat(d);
    yield '('.repeat(d) + 'a|b' + ')'.repeat(d);
    yield '{('.repeat(d) + 'a,b' + ')}'.repeat(d);
    yield '${'.repeat(d) + 'a' + '}'.repeat(d);
    yield '{1..'.repeat(d) + '3' + '}'.repeat(d);
    yield 'p{q,r'.repeat(d) + '}'.repeat(d);
  }
}

const sections = [
  ['exhaustive-1', () => exhaustive(1)],
  ['exhaustive-2', () => exhaustive(2)],
  ['exhaustive-3', () => exhaustive(3)],
  ['exhaustive-4', () => exhaustive(4)],
  ['realistic', () => REALISTIC],
  ['nested-1-to-20', () => nested()],
];

// The API surface, each called the way real consumers (micromatch, picomatch) call it. A thrown
// error is part of the result: the patched copy must throw the very same error for these inputs.
const VARIANTS = {
  compile: (b, p) => b(p),
  expand: (b, p) => b(p, { expand: true }),
  'expand-nodupes-noempty': (b, p) => b(p, { expand: true, nodupes: true, noempty: true }),
  'compile-escapeInvalid': (b, p) => b(p, { escapeInvalid: true }),
  'expand-keepQuotes-keepEscaping': (b, p) =>
    b(p, { expand: true, keepQuotes: true, keepEscaping: true }),
  stringify: (b, p) => b.stringify(p),
  parse: (b, p) => describeAst(b.parse(p)),
};

// A plain-data view of the AST (parent/prev links are cycles, and are derived from the rest).
const FLAGS = [
  'open',
  'close',
  'isOpen',
  'isClose',
  'invalid',
  'dollar',
  'escaped',
  'commas',
  'ranges',
  'depth',
  'args',
  'range',
];

function describeAst(node) {
  const out = { type: node.type };
  if (node.value !== undefined) out.value = node.value;
  if (node.input !== undefined) out.input = node.input;
  for (const flag of FLAGS) if (node[flag] !== undefined) out[flag] = node[flag];
  if (node.nodes) out.nodes = node.nodes.map(describeAst);
  return out;
}

module.exports = { TOKENS, sections, VARIANTS };
