/**
 * Engine step E7: the Connect screens that read their words from the world.
 *
 * A screen on this list holds no framing word of its own: "Kingdom", "Citizen(s)" and
 * "Contributor(s)" reach it only through `window.WORLD` (`apps/connect/src/frontend/engine-world.js`).
 * The list grows one surface at a time; a screen the facelift is still rebuilding joins it after
 * that facelift pull request merges (founder, 2026-11-16).
 *
 * The count is the boundary inventory's (docs/engine/BOUNDARY_INVENTORY.md, section 1): whole
 * words with a capital first letter, on lines a person can see. A line that is a comment, or the
 * comment at the end of a line of code, is left out.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const FRONTEND = 'apps/connect/src/frontend';

const WIRED_SCREENS: readonly string[] = [
  'auth-client.js',
  'app/admin.jsx',
  'app/apply.jsx',
  'app/automation.jsx',
  'app/cohost-lib.jsx',
  'app/cohosts.jsx',
  'app/intake-upgrade.jsx',
  'app/kingdom-discovery.jsx',
  'app/listing-claim.jsx',
  'app/messages.jsx',
  'app/moments.jsx',
  'app/onboarding-presets-lib.jsx',
  'app/pending-application.jsx',
  'app/profiles.jsx',
  'app/routes.jsx',
  'app/store.jsx',
];

const FRAMING = /\b(?:Kingdom|Citizens?|Contributors?)\b/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|\{\/\*|<!--)/;
// A comment after code: two slashes with a space after them (a web address has none).
const TRAILING_COMMENT = /\s\/\/\s.*$/;

/** The lines of one file a person can see that still carry a framing word. */
function framingLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .filter((line) => !COMMENT_LINE.test(line))
    .map((line) => line.replace(TRAILING_COMMENT, ''))
    .filter((line) => FRAMING.test(line));
}

describe('screens wired to the world', () => {
  it.each(WIRED_SCREENS)('%s shows no framing word of its own', (file) => {
    const source = readFileSync(resolve(ROOT, FRONTEND, file), 'utf8');
    expect(framingLines(source)).toEqual([]);
  });

  it.each(WIRED_SCREENS.filter((file) => file.endsWith('.jsx')))('%s reads the world', (file) => {
    expect(readFileSync(resolve(ROOT, FRONTEND, file), 'utf8')).toMatch(/window\.WORLD\b/);
  });

  it('the count ignores comments and web addresses, and finds a word in a string', () => {
    expect(
      framingLines(
        [
          '// Citizens Connect — header',
          "  h('p', null, 'x'), // Kingdom Discovery in a comment",
          "  const url = 'https://example.org/Citizens';",
          "  toast('Become a Contributor');",
        ].join('\n'),
      ),
    ).toEqual([
      "  const url = 'https://example.org/Citizens';",
      "  toast('Become a Contributor');",
    ]);
  });
});
