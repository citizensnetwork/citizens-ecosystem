// Card validator: the whole-card check of docs/routines/designer.md sections 2 and 5 (Designer build, phase 3).
// A Designer card is one JSON document for the Decision Inbox. This is the wall that runs before every filing (step 8):
// a card with a violation is not filed. It applies the mockup rules of lint-mockup.mjs to the `mockup`, and adds the
// field caps, the public-repository rule for the text that becomes a public issue, the reference-picture limits, the
// comparison and trend evidence rules and the appeal-claims rule.
//
//   node scripts/design/validate-card.mjs [--ref-images] <card.json> [more files]     (exit 1 when any card has a violation)
//
// `--ref-images` is passed only while the inbox card `d-design-reference-images` is answered "yes"; without it a
// `refImage` field is a violation. The check is deliberately stricter than a reader (a false alarm costs a rewrite; a
// miss costs a card the founder cannot trust). Read-only; no dependency.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { lintMockup } from './lint-mockup.mjs';
import { parseWebpDataUrl } from './webp.mjs';

export const BRIEF_MAX_CHARS = 3000;
export const BEFORE_MAX_CHARS = 60 * 1024;
export const REF_IMAGE_MAX_CHARS = 40 * 1024;
export const REF_IMAGE_MAX_COUNT = 3;
export const REF_IMAGE_LABEL = 'reference, not ours';
export const COMPARISON_MAX_ROWS = 3;
export const TRENDS_MAX_ITEMS = 5;
/** What the Decision Inbox's database accepts for one document, measured on 2026-10-17 (accepted at this size, refused at one byte more). */
export const DOCUMENT_LIMIT_BYTES = 262144;
/** A filed card stays under this, so the founder's answer, a note and a Dispatcher echo still fit in the same document. */
export const CARD_MAX_BYTES = 240 * 1024;

const KINDS = new Set(['idea', 'direction']);
const LENSES = new Set(['consistency', 'relevance', 'findability', 'reference', 'craft', 'trend']);
const VERDICTS = new Set(['ADOPT', 'ADAPT', 'DEFER', 'REJECT']);
const OUTCOMES = new Set(['adapt', 'watch', 'dropped']);
// Fields whose text can end up in a public issue (the Dispatcher builds an issue from the card's title, summary, why,
// size, risk, evidence, links and, for a design card, its brief). They carry no contact detail and no private link.
const PUBLIC_TEXT_FIELDS = ['title', 'summary', 'why', 'risk', 'evidence', 'brief'];

const ENGAGEMENT_WORDS = /\b(?:engag\w*|addict\w*|streaks?|urgen\w*|scarc\w*|countdowns?)\b/i;
const CLAIM_LINE = /^\s*(?:[-*>]\s*)*(?:\*\*|__)?claim\b[^:\n]{0,40}:/i;
// Phone-like: an international number, a South African national number (0xx xxx xxxx), a bracketed area code, or a
// run of nine or more digits. Dates (2026-10-17), sizes (375, 768, 1280) and ids do not look like any of these.
const PHONE_PATTERNS = [/\+\d[\d ().-]{7,}\d/, /(?<![\w.])0\d{2}[ .-]?\d{3}[ .-]?\d{4}(?!\w)/, /\(\d{2,4}\)[ .-]?\d{3}[ .-]?\d{3,4}/, /\d{9,}/];
const DATA_URL = /data:(?:[a-z0-9.+-]+\/[a-z0-9.+-]+)?[;,]/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;

/** A real calendar date written yyyy-mm-dd (a time after it is allowed): "2026-13-45" is not one. */
function isDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const day = value.slice(0, 10);
  const parsed = new Date(day + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}
const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const clip = (s) => (s.length > 80 ? s.slice(0, 77) + '...' : s);
const bytesOf = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');

/** The first e-mail address in `text`, found by walking the '@' signs (linear; no backtracking regex). */
function findEmail(text) {
  const localChar = /[A-Za-z0-9._%+-]/;
  const domainChar = /[A-Za-z0-9.-]/;
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    let start = at;
    while (start > 0 && localChar.test(text[start - 1])) start--;
    let end = at + 1;
    while (end < text.length && domainChar.test(text[end])) end++;
    if (start === at) continue;
    const labels = text.slice(at + 1, end).replace(/[.-]+$/, '').split('.');
    const last = labels[labels.length - 1];
    if (labels.length >= 2 && labels.every((l) => /^[A-Za-z0-9-]+$/.test(l)) && /^[A-Za-z]{2,}$/.test(last)) return text.slice(start, end);
  }
  return null;
}

/** The registrable part of a host, so two sub-domains of one publisher count once ("docs.example.co.za" -> "example.co.za"). */
export function publisherKey(host) {
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  return labels.slice(tld.length === 2 && SECOND_LEVEL_LABELS.has(second) ? -3 : -2).join('.');
}

/** `{host, key}` of an https URL naming a site, otherwise null (a script URL, a plain http one, an IP address, nonsense). */
function publicUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null; // the inbox page links https addresses only
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host.includes('.') || /^\d+(?:\.\d+){3}$/.test(host) || host.includes(':')) return null;
  return { host, key: publisherKey(host) };
}

/** Strings inside `value` (a string or a flat array of strings), for the public-text scan. */
function textsOf(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  return [];
}

/**
 * @param {unknown} card the card as the JSON document that would be written to the inbox
 * @param {{refImages?: boolean}} [options] `refImages`: the switch (inbox card d-design-reference-images answered "yes")
 * @returns {{ok: boolean, bytes: number, violations: {rule: string, detail: string}[]}}
 */
export function validateCard(card, options = {}) {
  const refImages = options.refImages === true;
  const violations = [];
  const seen = new Set();
  const add = (rule, detail) => {
    const key = rule + '\u0000' + detail;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ rule, detail: clip(String(detail)) });
  };
  if (!isObject(card)) {
    add('shape', 'the card is not a JSON object');
    return { ok: false, bytes: 0, violations };
  }

  const bytes = bytesOf(card);
  if (bytes > CARD_MAX_BYTES) add('card-size', `${bytes} bytes, the limit is ${CARD_MAX_BYTES} (the inbox refuses a document over ${DOCUMENT_LIMIT_BYTES})`);

  // --- shape: the few fields the other rules, the inbox page and the Dispatcher depend on ---------------------------
  if (card.area !== 'design') add('shape', 'area must be "design"');
  if (!KINDS.has(card.kind)) add('shape', 'kind must be "idea" or "direction"');
  if (!LENSES.has(card.lens)) add('shape', 'lens must be consistency, relevance, findability, reference, craft or trend');
  if ((card.lens === 'trend' || card.surface === 'all') && card.kind !== 'direction') {
    add('direction-only', 'a trend digest, or a card for surface "all" (the style charter), must be a direction');
  }

  // --- public text: copied into a public issue ----------------------------------------------------------------------
  for (const field of PUBLIC_TEXT_FIELDS) {
    for (const text of textsOf(card[field])) {
      const email = findEmail(text);
      if (email) add('public-email', `${field} carries an e-mail address: ${email}`);
      if (PHONE_PATTERNS.some((re) => re.test(text))) add('public-phone', `${field} carries a phone-like number`);
      if (/claude\.ai/i.test(text)) add('public-private-link', `${field} carries a claude.ai link`);
      if (DATA_URL.test(text)) add('public-data-url', `${field} carries a data: URL`);
    }
  }
  if (Array.isArray(card.links) && card.links.some((l) => typeof l === 'string' && /claude\.ai/i.test(l))) {
    add('public-private-link', 'links carries a claude.ai link');
  }

  // --- brief ---------------------------------------------------------------------------------------------------------
  if (card.brief !== undefined) {
    if (typeof card.brief !== 'string') add('shape', 'brief must be text');
    else {
      const chars = Array.from(card.brief).length;
      if (chars > BRIEF_MAX_CHARS) add('brief-length', `${chars} characters, the limit is ${BRIEF_MAX_CHARS}`);
      const lines = card.brief.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!CLAIM_LINE.test(lines[i])) continue;
        let claim = lines[i];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) claim += '\n' + lines[++i]; // the template's indented continuation
        if (!/hypothesis/i.test(claim)) add('claim-not-hypothesis', `a Claim line must say "hypothesis": ${claim}`);
        const word = ENGAGEMENT_WORDS.exec(claim);
        if (word) add('claim-engagement', `a Claim is about findability, legibility or effort, not "${word[0]}"`);
      }
    }
  }

  // --- mockup (the lint-mockup.mjs rules) ----------------------------------------------------------------------------
  if (card.mockup !== undefined) {
    if (typeof card.mockup !== 'string') add('shape', 'mockup must be text');
    else for (const v of lintMockup(card.mockup).violations) add(`mockup-${v.rule}`, v.detail);
  }

  // --- before: our own screenshot ------------------------------------------------------------------------------------
  if (card.before !== undefined) {
    const image = parseWebpDataUrl(card.before);
    if (!image.ok) add('before-not-webp', image.reason);
    else if (image.chars > BEFORE_MAX_CHARS) add('before-size', `${image.chars} characters, the limit is ${BEFORE_MAX_CHARS}`);
  }

  // --- refs: public sources, no images ---------------------------------------------------------------------------------
  const refNames = new Set();
  if (card.refs !== undefined) {
    if (!Array.isArray(card.refs)) add('shape', 'refs must be a list');
    else {
      card.refs.forEach((ref, i) => {
        if (!isObject(ref)) return add('shape', `refs[${i}] must be an object`);
        if (isText(ref.name)) refNames.add(ref.name);
        else add('shape', `refs[${i}] needs a name`);
        if (!publicUrl(ref.url)) add('bad-url', `refs[${i}].url must be a public https address`);
      });
    }
  }

  // --- refImage: private reference crops, off unless the switch is on ------------------------------------------------
  const refImage = card.refImage;
  const hasRefImage = Array.isArray(refImage) ? refImage.length > 0 : refImage !== undefined && refImage !== null;
  if (hasRefImage) {
    if (!refImages) add('ref-image-switch-off', 'refImage is present but the switch is off (inbox card d-design-reference-images is not answered "yes"); omit the field');
    else if (!Array.isArray(refImage)) add('shape', 'refImage must be a list');
    else {
      if (refImage.length > REF_IMAGE_MAX_COUNT) add('ref-image-count', `${refImage.length} reference pictures, the limit is ${REF_IMAGE_MAX_COUNT}`);
      const used = new Set();
      refImage.forEach((item, i) => {
        if (!isObject(item)) return add('shape', `refImage[${i}] must be an object`);
        if (item.label !== REF_IMAGE_LABEL) add('ref-image-label', `refImage[${i}].label must be exactly "${REF_IMAGE_LABEL}"`);
        if (!refNames.has(item.ref)) add('ref-image-ref', `refImage[${i}].ref must be the name of one of the card's refs`);
        else if (used.has(item.ref)) add('ref-image-per-reference', `more than one reference picture for "${item.ref}"`);
        else used.add(item.ref);
        const image = parseWebpDataUrl(item.image);
        if (!image.ok) add('ref-image-not-webp', `refImage[${i}]: ${image.reason}`);
        else if (image.chars > REF_IMAGE_MAX_CHARS) add('ref-image-size', `refImage[${i}] is ${image.chars} characters, the limit is ${REF_IMAGE_MAX_CHARS}`);
      });
    }
  }

  // --- comparison: at most 3 rows, every cell a seen fact or "not shown" / "not measured" -------------------------------
  if (card.comparison !== undefined) {
    if (!Array.isArray(card.comparison)) add('shape', 'comparison must be a list');
    else {
      if (card.comparison.length > COMPARISON_MAX_ROWS) add('comparison-rows', `${card.comparison.length} rows, the limit is ${COMPARISON_MAX_ROWS}`);
      card.comparison.forEach((row, i) => {
        if (!isObject(row)) return add('shape', `comparison[${i}] must be an object`);
        for (const cell of ['task', 'them', 'us']) {
          if (!isText(row[cell])) add('comparison-cell', `comparison[${i}].${cell} is empty (write "not shown" or "not measured" where it was not seen or measured)`);
        }
        const evidence = row.evidence;
        if (isObject(evidence)) {
          if (!publicUrl(evidence.url) || !isDate(evidence.readAt)) add('comparison-evidence', `comparison[${i}].evidence needs a public link and the date read`);
        } else if (!isText(evidence)) add('comparison-cell', `comparison[${i}].evidence is empty`);
        else if (!/https:\/\/\S+/i.test(evidence) || !/\d{4}-\d{2}-\d{2}/.test(evidence)) {
          add('comparison-evidence', `comparison[${i}].evidence needs a public link and the date read`);
        }
      });
    }
  }

  // --- trends: the digest only; the evidence rule ---------------------------------------------------------------------
  if (card.trends !== undefined) {
    if (card.lens !== 'trend') add('trends-wrong-lens', 'trends belongs to the trend digest only (lens "trend")');
    if (!Array.isArray(card.trends)) add('shape', 'trends must be a list');
    else {
      if (card.trends.length === 0) add('trends-missing', 'a trend digest needs at least one qualified trend (if none qualified, file nothing)');
      if (card.trends.length > TRENDS_MAX_ITEMS) add('trends-items', `${card.trends.length} items, the limit is ${TRENDS_MAX_ITEMS}`);
      card.trends.forEach((item, i) => checkTrend(item, i, add));
    }
  } else if (card.lens === 'trend') add('trends-missing', 'a trend digest needs its trends list (if no trend qualified, file nothing)');

  return { ok: violations.length === 0, bytes, violations };
}

/** One trend item: its shape, and the evidence rule for `adapt` and `watch` (designer.md section 4a, T2). */
function checkTrend(item, i, add) {
  const at = `trends[${i}]`;
  if (!isObject(item)) return add('shape', `${at} must be an object`);
  for (const field of ['name', 'what', 'why']) if (!isText(item[field])) add('shape', `${at}.${field} is empty`);
  if (!OUTCOMES.has(item.outcome)) add('shape', `${at}.outcome must be adapt, watch or dropped`);
  const fit = item.fit;
  if (!isObject(fit) || !VERDICTS.has(fit.verdict) || !Number.isInteger(fit.litmus) || fit.litmus < 1 || fit.litmus > 6) {
    add('shape', `${at}.fit needs a verdict (ADOPT, ADAPT, DEFER or REJECT) and the litmus question number 1 to 6`);
  }
  if (!Array.isArray(item.sources) || item.sources.length === 0) return add('trend-evidence', `${at} lists no source`);

  const publishers = new Set();
  let guideline = false;
  item.sources.forEach((source, j) => {
    const where = `${at}.sources[${j}]`;
    const site = isObject(source) ? publicUrl(source.url) : null;
    if (!site) return add('bad-url', `${where}.url must be a public https address`);
    if (!isDate(source.readAt)) return add('shape', `${where}.readAt must be the date read (yyyy-mm-dd)`);
    if (source.publishedAt !== undefined && !isDate(source.publishedAt)) return add('shape', `${where}.publishedAt must be a date (yyyy-mm-dd)`);
    // a page dated more than 24 months before it was read is background, not evidence (designer.md appendix B)
    if (source.publishedAt !== undefined) {
      const cutoff = new Date(source.readAt.slice(0, 10) + 'T00:00:00Z');
      cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
      if (new Date(source.publishedAt.slice(0, 10) + 'T00:00:00Z') < cutoff) return;
    }
    publishers.add(site.key);
    if (source.guideline === true) guideline = true;
  });
  if ((item.outcome === 'adapt' || item.outcome === 'watch') && publishers.size < 2 && !guideline) {
    add('trend-evidence', `${at} is "${item.outcome}" but rests on ${publishers.size} publisher(s) and no platform guideline; a trend needs two independent public sources or a platform's own guideline`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const refImages = args.includes('--ref-images');
  const files = args.filter((a) => a !== '--ref-images');
  if (!files.length) {
    console.error('usage: node scripts/design/validate-card.mjs [--ref-images] <card.json> [more files]');
    process.exit(2);
  }
  let failed = false;
  for (const file of files) {
    let card;
    try {
      card = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      failed = true;
      console.log(`FAIL  ${file}`);
      console.log(`      unreadable: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const r = validateCard(card, { refImages });
    if (r.ok) console.log(`ok    ${file} (${r.bytes} bytes)`);
    else {
      failed = true;
      console.log(`FAIL  ${file}`);
      for (const v of r.violations) console.log(`      ${v.rule}: ${v.detail}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
