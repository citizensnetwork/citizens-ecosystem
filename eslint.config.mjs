import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import { citizensPackageConfig } from './packages/config/eslint-preset.mjs';

export default [
  ...citizensPackageConfig({ js, tsPlugin, prettier }),
  {
    // The root config must not lint workspace packages. Each of those has
    // its own eslint.config.mjs. ESLint 10 stops at the nearest config, so
    // this ignore only matters for a lint run started at the repo root.
    ignores: ['apps', 'packages'],
  },
];
