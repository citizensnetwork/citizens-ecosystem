// Mockup validator: the rules of docs/routines/designer.md section 2 ("Mockups are our own and sandboxed").
// A Designer card's `mockup` is one HTML snippet built from our tokens. The Decision Inbox shows it inside an
// iframe with an empty `sandbox` attribute, so it cannot run code; this check is the second wall. A snippet with a
// violation is not filed.
//
//   node scripts/design/lint-mockup.mjs <snippet.html> [more files]      (exit 1 when any file has a violation)
//
// The rules: at most 24 KB; no <script>, <iframe>, <object>, <embed>, <link>, <meta> or <base>; no on* attribute; no javascript:
// URL; no external URL of any kind (a scheme other than data:, or a protocol-relative //host, in an attribute,
// url(), @import or srcset, or an http(s)/ftp/ws address written anywhere in the text); data: images only, at most
// 60 KB in total. The check is deliberately stricter than a browser (a false alarm costs a rewrite; a miss costs a
// card the founder cannot trust). Read-only; no dependency.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MAX_BYTES = 24 * 1024;
export const MAX_DATA_IMAGE_BYTES = 60 * 1024;
const URL_WORK_LIMIT = 1024 * 1024; // characters of URL text examined in one lint (see checkUrl)
// meta and base are forbidden too: `<meta http-equiv="refresh" content="0;url=//host">` would send the frame to another
// site without any attribute the URL rules read, and `<base>` rewrites every relative address in the snippet.
const FORBIDDEN_TAG = /<\/?(script|iframe|object|embed|link|meta|base)(?=[\s/>]|$)/gi;
const EVENT_ATTRIBUTE = /(?:^|[\s"'/])(on[a-z][a-z0-9_-]*)\s*=/gi;
// The lookbehind keeps this linear: a match can only start at the beginning of a word, so a long run of letters
// (or a 20 KB base64 string) is scanned once, not once per character.
const ATTRIBUTE = /(?<![\w:.-])([a-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+))/gi;
const CSS_IMPORT = /@import\s+(?:"([^"]*)"|'([^']*)')/gi;
const WRITTEN_ADDRESS = /\b(?:https?|ftp|wss?):\/\/[^\s"'<>)]+/gi;
const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src', 'poster', 'action', 'formaction', 'data', 'cite', 'background', 'manifest', 'ping', 'codebase']);

const NAMED_ENTITIES = { colon: ':', tab: '\t', newline: '\n', sol: '/', lpar: '(', rpar: ')', quot: '"', apos: "'", amp: '&' };

const codePoint = (n) => (Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

/** The attribute value as a browser reads it: character references decoded once. */
function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/** CSS reads `\68 ttps` as `https`: decode its escapes before looking for url() and @import. */
const unescapeCss = (text) => text.replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => codePoint(parseInt(h, 16)));

/** What a URL parser sees: tabs, newlines and other control characters are dropped, leading blanks trimmed. */
function urlForm(value) {
  // the quotes of a url("...") that was written with character references (&quot;) are part of the decoded text
  return unescapeCss(decodeEntities(value)).replace(/[\x00-\x20\x7f]+/g, '').replace(/^["']+|["']+$/g, '').toLowerCase();
}

const clip = (s) => (s.length > 80 ? s.slice(0, 77) + '...' : s);

/**
 * Every url(...) body in `css`, in one linear pass. A regex that tries each `url(` against the rest of the text is
 * quadratic when no closing bracket follows (24 KB of `url(` took over a second on the CI runner), so this walks the
 * text once and remembers where the next `)` is.
 */
function* cssUrls(css) {
  const open = /url\(/gi;
  let close = -1; // the first ')' at or after the last position asked; -2 once none is left
  const closeAfter = (from) => {
    if (close !== -2 && close < from) close = css.indexOf(')', from);
    if (close === -1) close = -2;
    return close;
  };
  for (let m = open.exec(css); m; m = open.exec(css)) {
    let i = m.index + m[0].length;
    while (i < css.length && /\s/.test(css[i])) i++;
    const quote = css[i];
    let end;
    if (quote === '"' || quote === "'") {
      const stop = css.indexOf(quote, i + 1);
      if (stop < 0) continue;
      yield css.slice(i + 1, stop);
      end = closeAfter(stop + 1);
    } else {
      end = closeAfter(i);
      if (end !== -2) yield css.slice(i, end);
    }
    // no ')' is left anywhere, so no later url( can be complete. Otherwise the next url( is visited even when it sits
    // inside the body just read: an unclosed quote must not be able to swallow a real url() that follows it.
    if (end === -2) break;
  }
}

/**
 * @param {string} html
 * @returns {{ok: boolean, bytes: number, dataImageBytes: number, violations: {rule: string, detail: string}[]}}
 */
export function lintMockup(html) {
  const text = String(html);
  const violations = [];
  const seen = new Set();
  const add = (rule, detail) => {
    const key = rule + '\u0000' + detail;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ rule, detail: clip(detail) });
  };

  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_BYTES) add('size', `${bytes} bytes, the limit is ${MAX_BYTES}`);

  for (const m of text.matchAll(FORBIDDEN_TAG)) add('forbidden-tag', `<${m[1].toLowerCase()}>`);
  for (const m of text.matchAll(EVENT_ATTRIBUTE)) add('event-attribute', m[1].toLowerCase());

  let dataImageBytes = 0;
  // A work budget keeps the check fast on hostile input: a snippet that repeats url( thousands of times hands the
  // normaliser a huge body per start. Past the budget the check stops and the snippet fails as "too-complex" (it
  // fails closed; a real mockup carries a handful of URLs and never gets near the limit).
  let examined = 0;
  let overBudget = false;
  const checkUrl = (raw, where) => {
    if (overBudget) return;
    examined += raw.length;
    if (examined > URL_WORK_LIMIT) {
      overBudget = true;
      add('too-complex', 'so much URL text to examine that the snippet cannot be checked quickly; simplify it');
      return;
    }
    const url = urlForm(raw);
    if (!url || url.startsWith('#')) return;
    if (url.startsWith('javascript:') || url.startsWith('vbscript:')) return add('javascript-url', `${where}: ${raw}`);
    if (url.startsWith('data:')) {
      if (url.startsWith('data:image/')) {
        dataImageBytes += Buffer.byteLength(raw, 'utf8');
        return;
      }
      return add('data-url-not-image', `${where}: ${raw}`);
    }
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//.test(url) || /^[a-z][a-z0-9+.-]*:/.test(url)) add('external-url', `${where}: ${raw}`);
  };

  for (const m of text.matchAll(ATTRIBUTE)) {
    if (overBudget) break;
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    if (URL_ATTRIBUTES.has(name)) checkUrl(value, name);
    else if (name === 'srcset') for (const part of value.split(',')) checkUrl(part.trim().split(/\s+/)[0] ?? '', 'srcset');
  }
  // url() in a <style> block and in a style attribute alike: one pass over the whole text, so a data: image is counted once
  const css = unescapeCss(text);
  for (const body of cssUrls(css)) {
    if (overBudget) break;
    checkUrl(body, 'url()');
  }
  for (const m of css.matchAll(CSS_IMPORT)) add('external-url', `@import: ${m[1] ?? m[2]}`);
  for (const m of text.matchAll(WRITTEN_ADDRESS)) add('external-url', `text: ${m[0]}`);

  if (dataImageBytes > MAX_DATA_IMAGE_BYTES) add('data-images-size', `${dataImageBytes} bytes of data: images, the limit is ${MAX_DATA_IMAGE_BYTES}`);
  return { ok: violations.length === 0, bytes, dataImageBytes, violations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: node scripts/design/lint-mockup.mjs <snippet.html> [more files]');
    process.exit(2);
  }
  let failed = false;
  for (const file of files) {
    const r = lintMockup(readFileSync(file, 'utf8'));
    if (r.ok) console.log(`ok    ${file} (${r.bytes} bytes, ${r.dataImageBytes} bytes of data: images)`);
    else {
      failed = true;
      console.log(`FAIL  ${file}`);
      for (const v of r.violations) console.log(`      ${v.rule}: ${v.detail}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
