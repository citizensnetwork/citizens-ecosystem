/**
 * Builds docs/central/reference/central-reference.html from the template beside it.
 *
 *   node docs/central/reference/build.mjs           write the page
 *   node docs/central/reference/build.mjs --check   exit 1 if the committed page is out of date
 *
 * It inlines the REAL layout engine (packages/central/src/layout.ts, transpiled, not copied by
 * hand) and the sample data (packages/central/src/fixtures.ts), so the page cannot drift from the
 * code. No network, no dependencies beyond the repo's own TypeScript.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', '..', 'packages', 'central', 'src');
const ts = createRequire(import.meta.url)('typescript');

/** TypeScript source of one module of @citizens/central, as CommonJS. */
function transpile(name) {
  const code = readFileSync(join(source, `${name}.ts`), 'utf8');
  return ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

/** Evaluate a module of the package (and what it imports from the package) and return its exports. */
const loaded = new Map();
function load(name) {
  if (!loaded.has(name)) {
    const exports = {};
    loaded.set(name, exports);
    const run = new Function('exports', 'require', transpile(name));
    run(exports, (request) => load(request.replace(/^\.\//, '')));
  }
  return loaded.get(name);
}

const fixtures = load('fixtures');
const data = {
  apps: fixtures.SAMPLE_APPS,
  feed: fixtures.SAMPLE_FEED,
  encouragement: fixtures.SAMPLE_ENCOURAGEMENT,
};
// "<" is written as an escape so that no sample string can close the script element.
const lessThan = String.fromCharCode(92) + 'u003c';
const dataJson = JSON.stringify(data).replace(/</g, lessThan);
const engine = `(function () { const exports = {}; ${transpile('layout')}\nreturn exports; })()`;

const template = readFileSync(join(here, 'central-reference.template.html'), 'utf8');
for (const marker of ['/*__ENGINE__*/ null', '/*__DATA__*/ null']) {
  if (template.split(marker).length !== 2) throw new Error(`Template must contain ${marker} once.`);
}
const page = template
  .replace('/*__ENGINE__*/ null', () => engine)
  .replace('/*__DATA__*/ null', () => dataJson)
  .replace(/\r\n/g, '\n');

const target = join(here, 'central-reference.html');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    current = '';
  }
  if (current !== page) {
    console.error('central-reference.html is out of date. Run: node docs/central/reference/build.mjs');
    process.exit(1);
  }
  console.log('central-reference.html is up to date.');
} else {
  writeFileSync(target, page);
  console.log(`Wrote ${target.length ? 'central-reference.html' : ''} (${page.length} characters).`);
}
