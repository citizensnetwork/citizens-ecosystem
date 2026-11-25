/**
 * Connect's compiled frontend stylesheet (QA fix plan PR F1, item S3): Tailwind 3.4.17 from ../tailwind.config.cjs,
 * the three self-hosted font families, and the pre-React boot screen, minified into ONE stylesheet that
 * @citizens/frontend-build writes as assets/tailwind.<hash>.css. It replaces the Tailwind Play CDN (which compiled the
 * same utilities in every visitor's browser) and the Google Fonts stylesheet (a blocking request to two more origins).
 *
 * Fonts: the families index.html loaded from Google (founder, 2026-11-25: self-host all three), from the
 * @fontsource-variable packages (SIL Open Font License), Latin and Latin Extended only, as variable woff2 files.
 * Each file is copied beside the build as vendor/fonts/<name>.<hash>.woff2. A browser downloads a face only when the
 * page uses it, so listing a face costs nothing until then. The family names stay the ones the CSS already uses
 * ('Plus Jakarta Sans', 'Playfair Display', 'Manrope').
 */
'use strict';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { hashOf } = require('@citizens/frontend-build');

/** The faces Google served before (index.html, until 2026-11-25): family, package, the css files of its styles. */
const FONT_FACES = [
  { family: 'Plus Jakarta Sans', pkg: '@fontsource-variable/plus-jakarta-sans', styles: ['wght.css'] },
  { family: 'Playfair Display', pkg: '@fontsource-variable/playfair-display', styles: ['wght.css', 'wght-italic.css'] },
  { family: 'Manrope', pkg: '@fontsource-variable/manrope', styles: ['wght.css'] },
];
const SUBSETS = new Set(['latin', 'latin-ext']);
/** Where the font files go, relative to the output root; the stylesheet lives in assets/, one level down. */
const FONT_DIR = 'vendor/fonts';

/**
 * The pre-React boot screen: the same crown, ring and wash as the React LoadingSplash (app/auth.jsx), so the hand-over
 * is still. It is in #root, so React's first render replaces it. "Connecting the Kingdom" sits low, out of the way.
 */
const BOOT_CSS = `
.cc-boot{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
  background:radial-gradient(120% 70% at 50% 0%,#FBF8F1 0%,#F3ECDB 55%,#ECE1C4 100%)}
.cc-boot img{display:block;width:72px;height:39px}
.cc-boot-ring{width:24px;height:24px;box-sizing:border-box;border-radius:50%;border:2.5px solid rgba(242,189,34,.25);
  border-top-color:#F2BD22;animation:cc-boot-spin 1s linear infinite}
.cc-boot-words{position:absolute;left:0;right:0;bottom:max(10dvh,24px);margin:0;text-align:center;
  font:600 13px/1.4 Manrope,ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;color:#836100}
@keyframes cc-boot-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.cc-boot-ring{animation-duration:3s}}
`;

/** Resolve a package directory from the app root (pnpm links every direct dependency into node_modules). */
function packageDir(rootDir, pkg) {
  return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [rootDir] }));
}

/**
 * The @font-face rules for every face, pointing at hashed copies, and the list of files to copy.
 * Reads the packages' own rules (their unicode-range per subset) and keeps the Latin ones.
 */
function fontFaces(rootDir) {
  const rules = [];
  const files = [];
  for (const { family, pkg, styles } of FONT_FACES) {
    const dir = packageDir(rootDir, pkg);
    for (const style of styles) {
      const css = fs.readFileSync(path.join(dir, style), 'utf8');
      for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
        const src = /url\(\.\/files\/([a-z0-9-]+?-(latin-ext|latin|cyrillic-ext|cyrillic|greek-ext|greek|vietnamese|[a-z]+)-wght-(?:normal|italic)\.woff2)\)/.exec(body);
        if (!src) throw new Error(`[frontend-styles] ${pkg}/${style}: a face with no woff2 file of the expected name`);
        if (!SUBSETS.has(src[2])) continue;
        const from = path.join(dir, 'files', src[1]);
        const name = `${src[1].replace(/\.woff2$/, '')}.${hashOf(fs.readFileSync(from))}.woff2`;
        files.push({ from, to: `${FONT_DIR}/${name}` });
        rules.push(
          `@font-face{${body
            .replace(/font-family:\s*'[^']+';/, `font-family:'${family}';`)
            .replace(/url\(\.\/files\/[a-z0-9-]+\.woff2\)/, `url(../${FONT_DIR}/${name})`)
            .replace(/\s+/g, ' ')
            .trim()}}`,
        );
      }
    }
  }
  const expected = FONT_FACES.reduce((n, f) => n + f.styles.length * SUBSETS.size, 0);
  if (rules.length !== expected) {
    throw new Error(`[frontend-styles] expected ${expected} font faces (Latin and Latin Extended), found ${rules.length}`);
  }
  return { css: rules.join('\n'), files };
}

/**
 * Compile the stylesheet. Returns { css, fontFiles } where fontFiles are { from: absolute path, to: output path }.
 * `esbuild` is the app's own instance (it minifies the CSS); tailwindcss and postcss are loaded from the app root.
 */
/** Load a module as the app resolves it (the app's own pinned tailwindcss, postcss and config). */
function fromApp(rootDir, request) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(require.resolve(request, { paths: [rootDir] }));
}

async function compileFrontendStyles({ rootDir, esbuild }) {
  const postcss = fromApp(rootDir, 'postcss');
  const tailwindcss = fromApp(rootDir, 'tailwindcss');
  const tailwindVersion = fromApp(rootDir, 'tailwindcss/package.json').version;
  if (tailwindVersion !== '3.4.17') {
    throw new Error(
      `[frontend-styles] tailwindcss ${tailwindVersion} is installed; the frontend's classes were written against the Play CDN's 3.4.17. Pin it exactly, or check every screen before moving.`,
    );
  }
  const fonts = fontFaces(rootDir);
  const input = `${fonts.css}\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n${BOOT_CSS}`;
  const config = fromApp(rootDir, path.join(rootDir, 'tailwind.config.cjs'));
  const result = await postcss([tailwindcss({ ...config, content: config.content.map((g) => path.join(rootDir, g)) })]).process(input, {
    from: undefined,
  });
  const { code } = await esbuild.transform(result.css, { loader: 'css', minify: true });
  return { css: code, fontFiles: fonts.files };
}

/** Copy the font files into the output root (public/ or mobile-dist/), removing earlier hashed copies. */
function copyFontFiles(dest, fontFiles) {
  const dir = path.join(dest, ...FONT_DIR.split('/'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const { from, to } of fontFiles) fs.copyFileSync(from, path.join(dest, ...to.split('/')));
}

module.exports = { compileFrontendStyles, copyFontFiles, FONT_DIR };
