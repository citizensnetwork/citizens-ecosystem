import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig says jsx: "preserve" (Next compiles it); the tests render pages with react-dom/server.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'config/hub-config.js',
        'src/lib/**/*.ts',
        'src/components/**/*.tsx',
        'src/pages/**/*.tsx',
      ],
      // _app and _document are Next's own wrappers (a stylesheet import and <Html lang>); the built HTML is
      // checked in test/pages.test.tsx and by scripts/proxy-proof.mjs.
      exclude: ['src/pages/_app.tsx', 'src/pages/_document.tsx'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
