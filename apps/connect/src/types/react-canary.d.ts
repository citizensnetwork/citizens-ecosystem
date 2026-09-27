// React's server `cache()` (used by src/lib/contributors/resolveSlug.ts) is only
// declared in @types/react 18's canary/experimental typings. Next's own types
// reference `react/experimental`, but TypeScript resolves that reference from
// inside the pnpm store — through pnpm's hidden hoist
// (node_modules/.pnpm/node_modules/@types/react), which holds whichever ONE of
// this monorepo's @types/react versions (Connect 18.3.31, Wear 18.3.3, Vision
// 19.x) pnpm happened to hoist. Whenever that wasn't Connect's copy, `cache`
// vanished and identical code failed typecheck with TS2305 "no exported member
// 'cache'" (CI on PR #66; very likely also the 2026-09-26 Vercel "phantom", §3AQ).
// Referenced from here, it resolves through apps/connect/node_modules — Connect's
// own pinned @types/react — so the result no longer depends on hoisting.
/// <reference types="react/canary" />
