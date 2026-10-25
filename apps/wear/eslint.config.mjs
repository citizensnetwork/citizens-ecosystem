import { createRequire } from 'node:module';
import prettier from 'eslint-config-prettier/flat';
import { next15FlatConfig } from '../../packages/config/eslint-next15.mjs';

const require = createRequire(import.meta.url);

// Wear extends next/core-web-vitals and prettier, not next/typescript.
export default [
  ...next15FlatConfig({
    eslintConfigNextPkg: require.resolve('eslint-config-next/package.json'),
    reactVersion: '18.3',
    typescript: false,
  }),
  prettier,
];
