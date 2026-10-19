import { createRequire } from "node:module";
import { next15FlatConfig } from "../../packages/config/eslint-next15.mjs";

const require = createRequire(import.meta.url);

const eslintConfig = [
  ...next15FlatConfig({
    eslintConfigNextPkg: require.resolve("eslint-config-next/package.json"),
    // Installed React is 18.3. "detect" would resolve the same line, but it
    // calls context.getFilename(), which ESLint 10 removed.
    reactVersion: "18.3",
    typescript: true,
  }),
  {
    // src/frontend/** is the standalone HTML/React frontend (browser React + Babel
    // via CDN, no module imports). It is not part of the Next.js API build and must
    // not be linted by the API's TypeScript/React rules. public/ and mobile-dist/
    // are scripts/build-frontend.js's generated copies/bundles of that same
    // frontend (gitignored build output) — same reasoning applies. .claude/** is
    // gitignored session scratch (offload notes, design-reference uploads) —
    // never product code.
    ignores: [".next/**", "out/**", "build/**", "android/**", "ios/**", "src/frontend/**", "public/**", "mobile-dist/**", "coverage/**", ".claude/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
