import { createRequire } from 'node:module';
import globals from 'globals';

/**
 * Flat config equivalent of eslint-config-next 15's `next/core-web-vitals`
 * (and, when `typescript` is set, `next/typescript`).
 *
 * eslint-config-next 15's entry file applies @rushstack/eslint-patch, which
 * throws on ESLint 10 ("the calling module was not recognized"). Next 16's
 * native flat export is out of scope, so the rules are composed here from the
 * same plugins that package already depends on. Rule text is copied from
 * eslint-config-next@15.5 index.js, core-web-vitals.js and typescript.js.
 *
 * `settings.react.version` is a concrete version rather than "detect":
 * detection calls context.getFilename(), which ESLint 10 removed. The version
 * is the app's installed React line, which is what "detect" would have found.
 *
 * @param {{
 *   eslintConfigNextPkg: string,
 *   reactVersion: string,
 *   typescript?: boolean,
 * }} options
 */
export function next15FlatConfig({ eslintConfigNextPkg, reactVersion, typescript = false }) {
  const requireFromNext = createRequire(eslintConfigNextPkg);
  const react = requireFromNext('eslint-plugin-react');
  const hooks = requireFromNext('eslint-plugin-react-hooks');
  const nextPlugin = requireFromNext('@next/eslint-plugin-next');
  const jsxA11y = requireFromNext('eslint-plugin-jsx-a11y');
  const importPlugin = requireFromNext('eslint-plugin-import');
  const tsParser = requireFromNext('@typescript-eslint/parser');

  const scriptFiles = ['**/*.{js,mjs,cjs,jsx}'];
  const typeFiles = ['**/*.{ts,tsx,mts,cts}'];
  const allFiles = ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'];

  const config = [
    {
      files: allFiles,
      ...react.configs.flat.recommended,
      settings: {
        react: { version: reactVersion },
      },
    },
    {
      files: allFiles,
      // `recommended` is still the eslintrc shape (plugins: string[]).
      // `recommended-latest` is the same two rules in flat config.
      ...hooks.configs['recommended-latest'],
    },
    {
      files: allFiles,
      ...nextPlugin.flatConfig.coreWebVitals,
    },
    {
      // eslint-config-next's parser.js is Next's bundled @babel/eslint-parser.
      // Its scope manager predates ESLint 10's ScopeManager#addGlobals and
      // throws on every file. Espree (the flat-config default) parses the
      // same JS/JSX these apps already compile with SWC. When `typescript`
      // is set, typescript-eslint's flat/recommended replaces this parser
      // for every file, which is what next/typescript did.
      files: scriptFiles,
      languageOptions: {
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        globals: { ...globals.browser, ...globals.node },
      },
    },
    {
      files: typeFiles,
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        globals: { ...globals.browser, ...globals.node },
      },
    },
    {
      files: allFiles,
      plugins: {
        'jsx-a11y': jsxA11y,
        import: importPlugin,
      },
      settings: {
        'import/parsers': {
          [requireFromNext.resolve('@typescript-eslint/parser')]: [
            '.ts',
            '.mts',
            '.cts',
            '.tsx',
            '.d.ts',
          ],
        },
        'import/resolver': {
          [requireFromNext.resolve('eslint-import-resolver-node')]: {
            extensions: ['.js', '.jsx', '.ts', '.tsx'],
          },
          [requireFromNext.resolve('eslint-import-resolver-typescript')]: {
            alwaysTryTypes: true,
          },
        },
      },
      rules: {
        'import/no-anonymous-default-export': 'warn',
        'react/no-unknown-property': 'off',
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react/jsx-no-target-blank': 'off',
        'jsx-a11y/alt-text': ['warn', { elements: ['img'], img: ['Image'] }],
        'jsx-a11y/aria-props': 'warn',
        'jsx-a11y/aria-proptypes': 'warn',
        'jsx-a11y/aria-unsupported-elements': 'warn',
        'jsx-a11y/role-has-required-aria-props': 'warn',
        'jsx-a11y/role-supports-aria-props': 'warn',
      },
    },
  ];

  if (typescript) {
    const tsPlugin = requireFromNext('@typescript-eslint/eslint-plugin');
    // flat/recommended already limits its type-aware-incompatible rules to
    // TS files and registers the plugin globally, matching eslintrc
    // `plugin:@typescript-eslint/recommended` (which is what next/typescript
    // extended). Do not narrow the global block: .js files rely on
    // @typescript-eslint/no-require-imports existing.
    config.push(...tsPlugin.configs['flat/recommended'], {
      rules: {
        // next/typescript downgrades these two from recommended's error.
        '@typescript-eslint/no-unused-vars': 'warn',
        '@typescript-eslint/no-unused-expressions': 'warn',
      },
    });
  }

  return config;
}
