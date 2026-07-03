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
    // not be linted by the API's TypeScript/React rules. public/ and mobile-dist/
    // are scripts/build-frontend.js's generated copies/bundles of that same
    // frontend (gitignored build output) — same reasoning applies. .claude/** is
    // gitignored session scratch (offload notes, design-reference uploads) —
    // never product code.
    ignores: [".next/**", "out/**", "build/**", "android/**", "ios/**", "src/frontend/**", "public/**", "mobile-dist/**", ".claude/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
