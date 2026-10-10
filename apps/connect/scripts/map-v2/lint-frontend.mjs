// src/frontend/** is excluded from ESLint (the standalone browser frontend), so lint says nothing about
// unused variables there (RESUME_HERE §3). This is the one-off no-unused-vars / no-undef-free check
// for the files Map v2 touches:   node scripts/map-v2/lint-frontend.mjs [files...]
// Defaults to every map-v2*.jsx plus map.jsx, home.jsx and entity-card.jsx.
import { ESLint } from 'eslint';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve('src/frontend/app');
const files = process.argv.length > 2
  ? process.argv.slice(2).map((f) => resolve(f))
  : [...readdirSync(dir).filter((f) => f.startsWith('map-v2')), 'map.jsx', 'home.jsx', 'entity-card.jsx'].map((f) => join(dir, f));

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.jsx'],
      languageOptions: { ecmaVersion: 2022, sourceType: 'script', parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: { 'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'all' }], 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
    },
  ],
  warnIgnored: false,
});
const results = await eslint.lintFiles(files);
let problems = 0;
for (const r of results) {
  for (const m of r.messages) {
    // the files carry disable comments for react-hooks rules that this one-off config does not load
    if (/exhaustive-deps/.test(m.message)) continue;
    problems++;
    console.log(`${r.filePath.replace(process.cwd() + '\\', '')}:${m.line}:${m.column} ${m.ruleId || 'parse'} ${m.message}`);
  }
}
console.log(problems ? `${problems} problem(s)` : `clean (${results.length} files)`);
process.exit(problems ? 1 : 0);
