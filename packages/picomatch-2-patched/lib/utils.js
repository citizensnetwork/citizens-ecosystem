'use strict';

const path = require('path');
const win32 = process.platform === 'win32';
const {
  REGEX_BACKSLASH,
  REGEX_SPECIAL_CHARS,
  REGEX_SPECIAL_CHARS_GLOBAL
} = require('./constants');

exports.isObject = val => val !== null && typeof val === 'object' && !Array.isArray(val);
exports.hasRegexChars = str => REGEX_SPECIAL_CHARS.test(str);
exports.isRegexChar = str => str.length === 1 && exports.hasRegexChars(str);
exports.escapeRegex = str => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$1');
exports.toPosixSlashes = str => str.replace(REGEX_BACKSLASH, '/');

/**
 * Citizens patch (CodeQL js/polynomial-redos), see PATCHED.md.
 *
 * Returns exactly what `str.replace(REGEX_REMOVE_BACKSLASH, m => m === '\\' ? '' : m)`
 * returned, in one linear pass. That regex, `/(?:\[.*?[^\\]\]|\\(?=.))/g`,
 * tries its bracket branch at every `[`, scanning to the end of the line, so a
 * long run of `[` without a closing `]` took quadratic time.
 *
 * At a `[` (index i) the bracket branch matches up to the first `]` at j >= i + 2
 * whose previous character is not a backslash, provided no line terminator sits
 * in i + 1 .. j - 2 (`.` stops there; `[^\\]` at j - 1 may be one). Such a
 * stretch is kept as is. Otherwise a backslash followed by a character other
 * than a line terminator is dropped. Everything else is kept.
 */

const isLineTerminator = code => code === 10 || code === 13 || code === 0x2028 || code === 0x2029;

exports.removeBackslashes = str => {
  const n = str.length;
  // nextClose[p]: the first j >= p where str[j] is a `]` not preceded by a backslash (else n).
  // nextBreak[p]: the first j >= p holding a line terminator (else n).
  const nextClose = new Array(n + 2).fill(n);
  const nextBreak = new Array(n + 2).fill(n);

  for (let p = n - 1; p >= 0; p--) {
    nextClose[p] = str[p] === ']' && p >= 1 && str[p - 1] !== '\\' ? p : nextClose[p + 1];
    nextBreak[p] = isLineTerminator(str.charCodeAt(p)) ? p : nextBreak[p + 1];
  }

  let out = '';
  let i = 0;

  while (i < n) {
    const ch = str[i];

    if (ch === '[' && i + 2 < n) {
      const j = nextClose[i + 2];
      if (j < n && nextBreak[i + 1] >= j - 1) {
        out += str.slice(i, j + 1);
        i = j + 1;
        continue;
      }
    }

    if (ch === '\\' && i + 1 < n && !isLineTerminator(str.charCodeAt(i + 1))) {
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
};

exports.supportsLookbehinds = () => {
  const segs = process.version.slice(1).split('.').map(Number);
  if (segs.length === 3 && segs[0] >= 9 || (segs[0] === 8 && segs[1] >= 10)) {
    return true;
  }
  return false;
};

exports.isWindows = options => {
  if (options && typeof options.windows === 'boolean') {
    return options.windows;
  }
  return win32 === true || path.sep === '\\';
};

exports.escapeLast = (input, char, lastIdx) => {
  const idx = input.lastIndexOf(char, lastIdx);
  if (idx === -1) return input;
  if (input[idx - 1] === '\\') return exports.escapeLast(input, char, idx - 1);
  return `${input.slice(0, idx)}\\${input.slice(idx)}`;
};

exports.removePrefix = (input, state = {}) => {
  let output = input;
  if (output.startsWith('./')) {
    output = output.slice(2);
    state.prefix = './';
  }
  return output;
};

exports.wrapOutput = (input, state = {}, options = {}) => {
  const prepend = options.contains ? '' : '^';
  const append = options.contains ? '' : '$';

  let output = `${prepend}(?:${input})${append}`;
  if (state.negated === true) {
    output = `(?:^(?!${output}).*$)`;
  }
  return output;
};
