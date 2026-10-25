/**
 * Shared flat ESLint config for Citizens packages.
 *
 * Replaces eslint-preset.cjs. The rule set is the same:
 *   eslint:recommended
 *   plugin:@typescript-eslint/recommended  (flat/recommended in v8)
 *   prettier
 * and the two local warnings. Callers pass the plugin objects so Node
 * resolves them from the package that runs ESLint.
 *
 * @param {{
 *   js: { configs: { recommended: object } },
 *   tsPlugin: { configs: { 'flat/recommended': object[] } },
 *   prettier: object,
 *   extra?: object[],
 * }} options
 */
export function citizensPackageConfig({ js, tsPlugin, prettier, extra = [] }) {
  return [
    {
      ignores: ['dist', 'build', '.next', '.turbo', 'node_modules', 'coverage'],
    },
    js.configs.recommended,
    ...tsPlugin.configs['flat/recommended'],
    {
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'warn',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': 'warn',
      },
    },
    prettier,
    ...extra,
  ];
}
