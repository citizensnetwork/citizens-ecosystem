import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends(
    "next/core-web-vitals",
    "next/typescript"
  ),
  {
    // src/frontend/** is the standalone HTML/React frontend (browser React + Babel
    // via CDN, no module imports). It is not part of the Next.js API build and must
    // not be linted by the API's TypeScript/React rules.
    ignores: [".next/**", "out/**", "build/**", "android/**", "ios/**", "src/frontend/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
