import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // src/frontend/** is the standalone HTML/React frontend (browser React via
    // CDN UMD globals, window.*-wired IIFEs, no module imports) — not part of
    // the Next.js API build; the API's TypeScript/React rules don't apply.
    // public/ is scripts/build-frontend.js's generated copy of that frontend
    // (gitignored build output). vendor/** is the vendored
    // @citizens/frontend-build package (canonical source + lint live in
    // citizens-wear — see vendor/README.md). .claude/** is session scratch.
    "src/frontend/**",
    "public/**",
    "vendor/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
