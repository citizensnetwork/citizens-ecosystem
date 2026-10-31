import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import { citizensPackageConfig } from '@citizens/config/eslint-preset.mjs';

export default citizensPackageConfig({
  js,
  tsPlugin,
  prettier,
  extra: [
    {
      // index.js is intentionally plain CommonJS — each host app requires it
      // directly, with no transpile step.
      files: ['**/*.{js,cjs}'],
      languageOptions: {
        sourceType: 'commonjs',
        globals: globals.node,
      },
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
});
