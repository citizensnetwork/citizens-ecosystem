import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  {
    // eslint-config-next sets settings.react.version to "detect", which calls
    // context.getFilename(). ESLint 10 removed that method. 19.3 is the React
    // line this app installs, which is what detection would have found.
    settings: {
      react: {
        version: "19.3",
      },
    },
  },
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
    // (gitignored build output). .claude/** is session scratch.
    "src/frontend/**",
    "public/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
