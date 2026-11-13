/**
 * The leak check: reads the engine migration files as text and fails when anything that belongs
 * to the source world alone got through.
 *
 * The catalogue check looks at a built database. This one looks at the files, so it also sees
 * what a catalogue cannot show: a sentence inside a function body, a comment, an address, a row
 * of seed data.
 *
 * Internal names stay (ADR-001, decision 5), so a column called `contributor_slug`, a role value
 * 'citizen' or a function called `schedule_kingdom_project` is not a leak. A leak is:
 *   - the name of a table, column, function, view, trigger, job or bucket that stays out
 *   - a read of a sibling app's schema
 *   - a sentence a person could read (a string with a space in it) or a comment that carries the
 *     source world's framing words, a sibling app's name, or its kind of content
 *   - an address, an email address, or anything that looks like a key
 *   - seed data: a top-level INSERT into anything but the engine's own bookkeeping
 */

import { deniedNames, type Allowlist } from './allowlist.ts';
import { scanSql, type Segment } from './sql-scan.ts';

export type LeakRule =
  | 'name-that-stays-out'
  | 'sibling-schema'
  | 'framing-word'
  | 'sibling-app'
  | 'source-content'
  | 'address'
  | 'email-address'
  | 'key'
  | 'seed-data';

export interface LeakFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: LeakRule;
  /** The word or text that matched. */
  readonly match: string;
}

/** The only tables a migration may insert into at its top level. */
export const SEED_TARGETS: ReadonlySet<string> = new Set([
  'engine.schema_migrations',
  'storage.buckets',
  'public.engine_wording',
]);

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface TextRule {
  readonly rule: LeakRule;
  readonly pattern: RegExp;
  /** Which segments the rule reads. */
  readonly applies: (segment: Segment) => boolean;
}

const isSentence = (segment: Segment) => segment.kind === 'string' && /\s/.test(segment.text);
const isProse = (segment: Segment) => segment.kind === 'comment' || isSentence(segment);
const isText = (segment: Segment) => segment.kind === 'comment' || segment.kind === 'string';

const TEXT_RULES: readonly TextRule[] = [
  // In a sentence, the words in any letter case: "citizens may create one event".
  { rule: 'framing-word', pattern: /\b(citizens?|kingdom)\b/gi, applies: isSentence },
  // In a comment, lower case is the internal name (the role value 'citizen'); a capital is framing.
  {
    rule: 'framing-word',
    pattern: /\b(Citizens?|Kingdom)\b/g,
    applies: (s) => s.kind === 'comment',
  },
  { rule: 'framing-word', pattern: /\bContributors?\b/g, applies: isProse },
  { rule: 'sibling-app', pattern: /\b(Vision|Wear|Learn|Connect)\b/g, applies: isProse },
  {
    rule: 'source-content',
    pattern: /\b(church(?:es)?|ministr(?:y|ies)|faith|christian|pretoria|gauteng)\b/gi,
    applies: isText,
  },
  {
    rule: 'address',
    pattern: /supabase\.co|citizenscentral|219\.co\.za|vercel\.app/gi,
    applies: () => true,
  },
  {
    rule: 'key',
    pattern: /eyJ[A-Za-z0-9_-]{16,}|\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,
    applies: () => true,
  },
  {
    rule: 'email-address',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    applies: isText,
  },
];

export function findLeaks(file: string, sql: string, allowlist: Allowlist): LeakFinding[] {
  const findings: LeakFinding[] = [];
  const segments = scanSql(sql);
  const denied = deniedNames(allowlist);
  const deniedRe =
    denied.length === 0
      ? null
      : new RegExp(`(?<![A-Za-z0-9_])(?:${denied.map(escapeRe).join('|')})(?![A-Za-z0-9_])`, 'g');
  const schemaRe = new RegExp(
    `(?<![A-Za-z0-9_])(?:${allowlist.schemas.citizensOnly.map(escapeRe).join('|')})\\.(?=[A-Za-z_"])`,
    'g',
  );

  const report = (segment: Segment, rule: LeakRule, pattern: RegExp) => {
    for (const match of segment.text.matchAll(pattern)) {
      const before = segment.text.slice(0, match.index);
      const line = segment.line + (before.match(/\n/g)?.length ?? 0);
      findings.push({ file, line, rule, match: match[0] });
    }
  };

  for (const segment of segments) {
    if (deniedRe) report(segment, 'name-that-stays-out', deniedRe);
    if (segment.kind === 'code' || segment.kind === 'identifier')
      report(segment, 'sibling-schema', schemaRe);
    for (const rule of TEXT_RULES)
      if (rule.applies(segment)) report(segment, rule.rule, rule.pattern);
  }

  // Tables arrive empty: at the top level of a file, only the engine's own bookkeeping is filled.
  const topLevel = segments
    .filter((segment) => segment.depth === 0 && segment.kind === 'code')
    .map((segment) => ({ ...segment, text: segment.text.toLowerCase() }));
  for (const segment of topLevel) {
    for (const match of segment.text.matchAll(
      /\b(?:insert\s+into|copy)\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)/g,
    )) {
      const target = match[1] as string;
      if (!SEED_TARGETS.has(target)) {
        const before = segment.text.slice(0, match.index);
        findings.push({
          file,
          line: segment.line + (before.match(/\n/g)?.length ?? 0),
          rule: 'seed-data',
          match: target,
        });
      }
    }
  }
  return findings;
}

export function describeLeak(finding: LeakFinding): string {
  return `${finding.file}:${finding.line} ${finding.rule}: "${finding.match}"`;
}
