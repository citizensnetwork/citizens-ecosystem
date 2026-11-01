import { createRequire } from 'node:module';
import globals from 'globals';
import prettier from 'eslint-config-prettier/flat';
import { next15FlatConfig } from '../../packages/config/eslint-next15.mjs';

const require = createRequire(import.meta.url);

// Same preset as Wear (next/core-web-vitals + prettier). The two plain-CommonJS files, next.config.js and
// config/hub-config.js, are Node scripts: they need the Node globals and may use require().
export default [
  ...next15FlatConfig({
    eslintConfigNextPkg: require.resolve('eslint-config-next'),
    reactVersion: '19.3',
    typescript: false,
  }),
  {
    files: ['next.config.js', 'config/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
  prettier,
];
