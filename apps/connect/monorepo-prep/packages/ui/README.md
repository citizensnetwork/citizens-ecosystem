# `@citizens/ui`

**Responsibility:** Shared, pure-presentational design-system components used across every Citizens app.

**Examples (future):**
- `<GlassPanel />` — the frosted right-panel container.
- `<GoldButton />`, `<GhostButton />` — branded button variants.
- `<CategoryBadge slug=... />` — category pill driven by the shared category list.
- `<BrandWordmark />` — "Kingdom Commons" / "Citizens *Connect / Wear / Vision*".

**Out of scope:** Data fetching, Supabase clients, Next.js-specific code. Anything that imports `next/*` does not belong here.

**Bootstrap order:** Extracted only when a second app (Wear) needs the same component. Connect-only UI stays in `apps/connect/src/components/` until then.
