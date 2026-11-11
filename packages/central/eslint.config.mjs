import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import { citizensPackageConfig } from '@citizens/config/eslint-preset.mjs';

export default citizensPackageConfig({ js, tsPlugin, prettier });
