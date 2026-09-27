// React canary types, resolved from Connect's OWN @types/react.
//
// `src/lib/contributors/resolveSlug.ts` uses React's `cache` — a canary API
// that Next ships in its vendored React. With @types/react 18.3 its type lives
// only in `react/canary`, which Next pulls in through its own
// `/// <reference types="react/experimental" />` in next/dist/types.d.ts.
// That reference resolves from Next's *shared* pnpm install, i.e. whichever
// @types/react pnpm hoisted into node_modules/.pnpm/node_modules — and this
// monorepo carries three (18.3.3 wear/ui, 18.3.31 connect, 19.2.17 vision).
// When a restored Vercel build cache hoists another version, the augmentation
// lands on the wrong copy and `next build` fails with
//   Type error: Module '"react"' has no exported member 'cache'.
// on code nobody touched (the PR #63 prod build, §3AQ; PR #68 preview, §3AS).
// Reproduced locally by re-pointing that hoisted link to 18.3.3 / 19.2.17.
// Referencing it from here resolves via apps/connect/node_modules, so the
// augmentation always lands on the copy Connect's own imports use.
//
// Since the React-types alignment (PR #72, 2026-09-27), root package.json
// `pnpm.packageExtensions` gives `next` optional peers on @types/react(-dom),
// so Next's own references resolve to each app's copy too. This file is now
// belt-and-braces: it keeps Connect's canary types explicit.
/// <reference types="react/canary" />
