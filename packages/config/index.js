/**
 * @citizens/config
 *
 * Shared TypeScript base config: tsconfig.base.json.
 * Shared ESLint flat config: eslint-preset.mjs (ESM; import citizensPackageConfig).
 *
 * This CJS entry stays so the package has a valid "main". It does not
 * re-export the preset — require() cannot load that ESM file.
 */
module.exports = {};
