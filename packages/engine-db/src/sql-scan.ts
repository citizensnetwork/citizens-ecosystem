/**
 * A small scanner for SQL text. It splits a file into code, string literals, comments and
 * quoted identifiers, so a check can tell a sentence a person may read (a string) from an
 * internal name (code). The body of a dollar-quoted block is scanned again, one level deeper,
 * because a function body is itself SQL.
 *
 * It is not a parser. It knows exactly the lexical rules that matter here: '' inside a string,
 * backslash escapes inside an E'' string, "" inside a quoted identifier, line comments, nested
 * block comments, and dollar quotes with or without a tag.
 */

export type SegmentKind = 'code' | 'string' | 'comment' | 'identifier';

export interface Segment {
  readonly kind: SegmentKind;
  /** The text without its quotes or comment markers. */
  readonly text: string;
  /** 1-based line of the segment's first character in the scanned file. */
  readonly line: number;
  /** 0 at the top level of the file; 1 inside a dollar-quoted body, and so on. */
  readonly depth: number;
}

const DOLLAR_TAG_RE = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

function countLines(text: string): number {
  let lines = 0;
  for (const char of text) if (char === '\n') lines += 1;
  return lines;
}

export function scanSql(source: string, startLine = 1, depth = 0): Segment[] {
  const segments: Segment[] = [];
  let line = startLine;
  let i = 0;
  let code = '';
  let codeLine = line;

  const flushCode = () => {
    if (code !== '') segments.push({ kind: 'code', text: code, line: codeLine, depth });
    code = '';
  };
  const push = (kind: SegmentKind, text: string, atLine: number) => {
    flushCode();
    segments.push({ kind, text, line: atLine, depth });
  };

  while (i < source.length) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (code === '') codeLine = line;

    // line comment
    if (char === '-' && next === '-') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      push('comment', source.slice(i + 2, end), line);
      i = end;
      continue;
    }
    // block comment (they nest in Postgres)
    if (char === '/' && next === '*') {
      let level = 1;
      let j = i + 2;
      while (j < source.length && level > 0) {
        if (source[j] === '/' && source[j + 1] === '*') {
          level += 1;
          j += 2;
        } else if (source[j] === '*' && source[j + 1] === '/') {
          level -= 1;
          j += 2;
        } else j += 1;
      }
      const whole = source.slice(i, j);
      push('comment', whole.slice(2, level === 0 ? -2 : undefined), line);
      line += countLines(whole);
      i = j;
      continue;
    }
    // string literal, with an optional E prefix for backslash escapes
    if (char === "'") {
      const escapes = /[eE]$/.test(code) && !isWordChar(code[code.length - 2]);
      let j = i + 1;
      let text = '';
      while (j < source.length) {
        const c = source[j] as string;
        if (escapes && c === '\\' && j + 1 < source.length) {
          text += c + (source[j + 1] as string);
          j += 2;
        } else if (c === "'" && source[j + 1] === "'") {
          text += "'";
          j += 2;
        } else if (c === "'") {
          break;
        } else {
          text += c;
          j += 1;
        }
      }
      const atLine = line;
      line += countLines(source.slice(i, j + 1));
      push('string', text, atLine);
      i = j + 1;
      continue;
    }
    // quoted identifier
    if (char === '"') {
      let j = i + 1;
      let text = '';
      while (j < source.length) {
        const c = source[j] as string;
        if (c === '"' && source[j + 1] === '"') {
          text += '"';
          j += 2;
        } else if (c === '"') {
          break;
        } else {
          text += c;
          j += 1;
        }
      }
      const atLine = line;
      line += countLines(source.slice(i, j + 1));
      push('identifier', text, atLine);
      i = j + 1;
      continue;
    }
    // dollar-quoted body: scanned again, one level deeper
    if (char === '$' && !isWordChar(source[i - 1])) {
      const tag = DOLLAR_TAG_RE.exec(source.slice(i, i + 80))?.[0];
      if (tag !== undefined) {
        const bodyStart = i + tag.length;
        let bodyEnd = source.indexOf(tag, bodyStart);
        if (bodyEnd === -1) bodyEnd = source.length;
        flushCode();
        segments.push(...scanSql(source.slice(bodyStart, bodyEnd), line, depth + 1));
        line += countLines(source.slice(i, bodyEnd + tag.length));
        i = bodyEnd + tag.length;
        continue;
      }
    }

    code += char;
    if (char === '\n') line += 1;
    i += 1;
  }
  flushCode();
  return segments;
}

/** The statements at the top level of a file, split on semicolons outside quotes and bodies. */
export function topLevelCode(source: string): string {
  return scanSql(source)
    .filter((segment) => segment.depth === 0 && segment.kind === 'code')
    .map((segment) => segment.text)
    .join(' ');
}
