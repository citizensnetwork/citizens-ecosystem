# `@citizens/utils`

**Responsibility:** Pure utility functions reused across every Citizens app. No I/O. No framework dependencies.

**Exports (planned):**
- `rateLimit(key, max, windowMs)` — in-memory + Redis-ready rate limiter. Connect's `src/lib/rate-limit*.ts` is the seed.
- `isValidUuid(s)` — strict UUID v4/v7 check.
- `escapeHtml(s)`, `escapeIlike(s)` — DB / DOM safety primitives.
- `cn(...classes)` — Tailwind class-merge helper.
- `haversineKm(a, b)` — geospatial distance.
- `formatTimeAgo(date)`, `formatDateRange(start, end)` — i18n-friendly formatters.

**Out of scope:** Anything that talks to a network, database, or browser API.

**Bootstrap order:** Extract last among the "level 0" packages (after database + auth + config). Smallest blast radius.
