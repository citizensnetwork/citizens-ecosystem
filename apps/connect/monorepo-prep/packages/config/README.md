# `@citizens/config`

**Responsibility:** Shared tool configs — ESLint, TypeScript base, Tailwind preset, Prettier.

**Exports (planned):**
- `@citizens/config/eslint` — flat-config base extended per app.
- `@citizens/config/tsconfig/base.json` — strict TypeScript baseline.
- `@citizens/config/tsconfig/nextjs.json` — Next.js-specific extension of base.
- `@citizens/config/tailwind` — preset with white-black-gold theme tokens.
- `@citizens/config/prettier` — minimal Prettier preset (if/when introduced).

**Out of scope:** Per-app overrides — those live in the consuming app's config and `extends` the shared one.

**Bootstrap order:** Extract alongside `@citizens/database` so the shared types and shared compiler settings move in tandem.
