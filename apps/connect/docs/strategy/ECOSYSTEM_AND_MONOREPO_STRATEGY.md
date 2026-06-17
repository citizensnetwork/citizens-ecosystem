# Citizens Ecosystem — Strategy & Monorepo Decision Brief

> ⚠️ **SUPERSEDED (2026-06-16) by [`ECOSYSTEM_DECISION_BRIEF.md`](ECOSYSTEM_DECISION_BRIEF.md).**
> This was the *questions* doc for the strategy session. Those questions are now answered (decisions
> locked: single shared Supabase project + schema-per-app; Vision = back-office only; Wear is the
> monorepo seed; pure-TS sharing first). Its §5 leaned toward autonomous-DBs+sync — that direction
> was **not** taken. **Still useful as background:** the monorepo trade-off table (§3) and the
> data-architecture option write-ups (§5). Read the decision brief for what we're actually doing.

> **Status:** DRAFT for a dedicated strategy/"grilling" session.
> **Created:** 2026-05-29 (end of the migrations + hardening session).
> **Source of truth for intent:** the 2026-05-29 conversation supersedes the older
> in-repo docs (`citizens-vision/ARCHITECTURE.md`, `VISION.md`, `PROJECT_STATUS.md`),
> which the founder has flagged as possibly outdated. This doc captures the *current*
> intent and the open questions to resolve before any monorepo/integration work begins.
>
> **This doc asks more than it answers — by design.** Nothing here is decided.

---

## 0. How to use this doc

Next session we go question-by-question (§6). Answer in-line or verbally; I'll convert
the decisions into a phased implementation plan + a migration/repo-restructure proposal.
Until then, **no code or repo restructuring happens.**

---

## 1. Where we actually are (verified this session)

### Citizens Connect (this repo)
- **Live, near-launch.** Next.js 15 (App Router, RSC) · React 18.3 · Supabase (PG 17) ·
  MapLibre · Tailwind 4 · **Capacitor 8** (iOS/Android). Map-first consumer app for
  citizens + contributors.
- DB now **fully migrated through 118** (this session applied the missing 107→118 and
  ran the analytics backfill). `contributor_analytics_snapshots` exists and is populated
  yearly by `snapshot_contributor_analytics_for_vision()`.
- 790 tests green, lint/tsc clean.
- Supabase project: **`Citizens-Connect` (`xyiajtrvhlxaeplsiajj`)**, region eu-central-1, ACTIVE.

### Citizens Vision (`../citizens-vision`)
- **Far more built than "to be built."** PROJECT_STATUS shows **Phases 0–21b complete**
  (foundation, activities, map, dashboards, goals/alignment, projects, timeline,
  **Connect integration + incremental sync**, advisory engine, geo-boundaries,
  analytics/export, multi-org federation, tree-aware RLS, trigram search, cache-tag wiring).
- Stack: **Next.js 16 · React 19** · Supabase (PG 17) · MapLibre · **Recharts** · **Zustand** ·
  **Zod** · Playwright E2E. Design: dark-grey/blue/white, no-emoji, data-dense dashboards.
- Supabase project: **`Citizens-Vision` (`ijdmcudcrncmaprmzgfk`)**, region eu-west-1,
  currently **INACTIVE** (paused).
- 21 migrations. Its `README.md` is still create-next-app boilerplate (ignore it).

### The mismatch that triggered this brief
- **Vision's existing design** (ARCHITECTURE §7): *separate* Supabase project; a
  `sync-from-connect` Edge Function pulls Connect data every 15 min into `cc_*_mirror`
  tables via a read-only service role.
- **Connect's snapshot** was built as an *in-Connect* table that "Vision pulls from, no
  external HTTP."
- These two assumptions don't fully agree, and they predate the broader ecosystem vision
  below. The data-architecture question (§6.B) is the linchpin.

---

## 2. The reframed vision (from the 2026-05-29 conversation — latest truth)

> "An ecosystem of applications that all share data across their platforms. Vision will be
> a **back-end app for contributors and organisations** to glean analytics and map activity
> from **all the ecosystem apps** (selectable inside Vision) — to receive recommendations,
> develop findings and improvements, see trends, etc. that businesses need to improve their
> efficiency and impact."

Distilled into working assumptions (to confirm in §6.A):
1. **Connect is one of several** consumer apps. More will join the ecosystem over time.
2. **Vision is the analytics/intelligence back-office** — not a consumer app. Audience =
   contributors + organisations (and internal/admin), *not* everyday citizens.
3. **Data flows many→one** into Vision: Vision reads from every ecosystem app, with the
   *source app* selectable inside Vision.
4. Vision's outputs are **insight**: recommendations, findings, trend analysis, impact/
   efficiency scoring — decision support for orgs/businesses.
5. **Every consumer app must stay lightweight** and scale independently (Connect ships to
   phones via Capacitor *and* runs in browsers at scale).

---

## 3. The monorepo question — discussion (not a decision)

The founder leaned **Turborepo** but then raised the right concern: *"if every app must be
lightweight and scale independently, is a monorepo still a good idea?"*

**Key clarification: a monorepo does not make any app heavier.** Repo layout is a
*source-organisation* choice; it is orthogonal to runtime/bundle size. In a Turborepo,
each app still:
- builds its **own** independent bundle (tree-shaken; only what it imports ships),
- deploys **independently** (separate Vercel projects / separate Capacitor builds),
- versions its own runtime concerns.

So "lightweight at scale" is **not** a reason to avoid a monorepo. The real trade-offs are:

| Dimension | Monorepo (Turborepo) | Polyrepo (separate repos) |
|---|---|---|
| Shared code (UI kit, types, `db` types, auth helpers, design tokens) | One source, atomic refactors | Duplicated or published as private npm pkgs (overhead) |
| Cross-app change (e.g. shared analytics contract) | One PR, one CI run | Coordinated multi-repo PRs |
| Onboarding / discoverability | Everything in one place | Scattered |
| CI cost/time | Mitigated by Turbo caching + affected-only builds | Naturally isolated |
| Access control / open-sourcing one app | Coarser (whole repo) | Per-repo granularity |
| Tooling/version drift | Forced alignment (pro *and* con) | Each repo free to differ |
| Independent deploy & scale | ✅ unaffected | ✅ unaffected |

**My provisional lean:** for a multi-app ecosystem that **shares data contracts, auth, and
design language**, a **Turborepo monorepo with independently-deployed apps + shared
packages** is the stronger fit — *provided* we resolve the version-skew (Connect React 18 /
Next 15 vs Vision React 19 / Next 16; see §4). The shared packages that would pay for
themselves immediately: `@citizens/types` (DB + cross-app analytics contracts),
`@citizens/ui` (design system), `@citizens/supabase` (client factories/auth), `@citizens/config`.

But this is the founder's call — captured as a question in §6.E.

**Alternative worth weighing:** "shared-contract polyrepo" — keep repos separate but publish
a tiny versioned `@citizens/contracts` package (the analytics/event schemas) that every app
depends on. Lower coupling, more release overhead.

---

## 4. Tech reconciliation (founder Q2 — "Next versions depend on functions")

The founder recalls **legacy versions were pinned to keep certain functions working** and
asked me to advise based on what we actually use. **I have not yet done the dependency
audit** — flagging it as a task, with the known pin-points to investigate:

- **Connect:** Next **15.5**, React **18.3**, **Capacitor 8** (native iOS/Android),
  `@supabase/ssr` 0.10, MapLibre 5, Tailwind 4. The most likely React-18 anchor is
  **Capacitor + native plugins** and any React-18-only peer deps.
- **Vision:** Next **16.2**, React **19.2** (no Capacitor — web-only analytics surface),
  Recharts 2, Zustand 5, Zod 4.

**Open risks to audit before any upgrade:**
1. Does Capacitor 8 (and the push/geolocation/share plugins) fully support **React 19** +
   **Next 16**? (Likely the real blocker that pinned Connect.)
2. Next 15→16 breaking changes touching Connect's middleware/`force-dynamic` routes, image
   handling, and RSC patterns.
3. Whether shared `@citizens/ui` components can target a React version both apps accept
   (React 19 is largely back-compatible, but hooks/types differ).

**Provisional paths (to choose in §6.F):**
- **(A) Independent versions, share only pure TS** (types/contracts/validators) — safest,
  ships now, no React coupling.
- **(B) Unify on React 19 / Next 16** — do a dedicated Connect upgrade (gated on the
  Capacitor audit) so a shared UI kit becomes possible.
- **(C) Hold** until the monorepo decision, then decide.

I will run the concrete dependency/Capacitor audit and bring findings to the session.

---

## 5. The data architecture (the real linchpin)

Vision must "read from all ecosystem apps, source selectable." Options to weigh (§6.B):

- **(1) Per-app sync → Vision warehouse** *(Vision's current model, generalised):* each app
  exposes read access; Vision's Edge Functions pull into per-source mirror/warehouse tables.
  Source-selectable falls out naturally (filter by `source_app`). Loose coupling; Vision owns
  its analytics schema; apps stay ignorant of Vision. Cost: sync lag + duplication.
- **(2) Shared analytics contract + push:** each app writes to a common analytics schema
  (e.g. the `contributor_analytics_snapshots` shape, generalised to `source_app`) that Vision
  reads. Connect already produces snapshots — this extends that. Tighter contract, fresher data.
- **(3) Single shared Supabase project:** all apps + Vision in one DB with RLS. Simplest reads,
  but couples schemas and concentrates blast radius/scaling — likely wrong for "many apps at scale."

**Provisional lean:** a hybrid of **(1)+(2)** — a versioned **analytics contract** every app
emits (snapshot-style), pulled/mirrored into Vision's warehouse with a `source_app` dimension.
Keeps apps autonomous and lightweight while giving Vision a clean, source-selectable warehouse.

This intersects the monorepo decision but is **separable**: the contract can live in a shared
package (monorepo) or a published package (polyrepo).

---

## 6. Questions for the strategy session

### A. Ecosystem & intent
1. Besides Connect, what other apps are real/planned (names, audience, timeframe)? What's the
   2nd app, and how soon?
2. Is Vision strictly **back-office** (contributors/orgs/admins), or will any citizen-facing
   surface exist? (Affects auth, hosting, design system sharing.)
3. Who are Vision's paying/primary users — individual contributors, organisations, or both?
   What decision does a user most want Vision to answer first?
4. "Recommendations / findings / improvements" — rule-based/deterministic (Vision's current
   ethos), or are we introducing ML/LLM analysis? How important is explainability vs. depth?

### B. Data architecture (linchpin)
5. Do you want apps to stay **autonomous** (each its own DB, Vision pulls) or move toward a
   **shared data layer**? (See §5 options 1/2/3.)
6. Is `contributor_analytics_snapshots` the **template** for the cross-app analytics contract,
   or do we design a fresh ecosystem-wide schema with a `source_app` dimension?
7. Freshness requirement: is yearly/daily snapshotting enough, or does Vision need
   near-real-time (minutes)? This decides snapshot vs. CDC/streaming.
8. Data residency/sensitivity: Connect is eu-central, Vision eu-west — any compliance/region
   constraints on moving data between them?

### C. Vision's scope & role
9. "Map activity from all ecosystem apps" — is the map a **first-class** Vision surface across
   all sources, or per-source? What's the unit being mapped (events, places, activities)?
10. Which existing Vision capabilities (alignment scoring, advisory engine, federation,
    timeline) are still wanted vs. legacy/cut under the new framing?
11. Does the org/department hierarchy in Vision map to Connect's "contributor" concept, or are
    "organisation" (Vision) and "contributor" (Connect) different entities we must reconcile?

### D. Audiences (citizens vs contributors vs orgs)
12. What does a **citizen** get from the ecosystem that they don't today? (Confirm citizens are
    out of Vision's direct scope.)
13. What's the single most valuable thing a **contributor** should see in Vision on day one?
14. What's the single most valuable thing an **organisation/business** should see?

### E. Repo strategy
15. Confirm direction: **Turborepo monorepo** (apps + shared packages), **shared-contract
    polyrepo**, or status-quo separate repos? (See §3.)
16. If monorepo: do we migrate both existing git histories in, or start fresh with subtrees?
    Any need to keep one app's repo private/open separately?
17. Shared packages you want first: `@citizens/types`, `@citizens/ui` (design system),
    `@citizens/supabase`, `@citizens/contracts`? Any you explicitly *don't* want shared?

### F. Tech reconciliation
18. Appetite for upgrading **Connect to React 19 / Next 16** (gated on a Capacitor audit), or
    keep versions independent and share only pure-TS packages? (§4 paths A/B/C.)
19. Design system: unify Connect's white/black/gold with Vision's dark-grey/blue, or keep
    distinct per-app themes over a shared component primitives layer?

### G. Sequencing (the first deliverable)
20. After decisions: do we want **(a)** repo plumbing first, **(b)** a thin
    snapshot-consumer slice in Vision proving the data path end-to-end, or **(c)** the
    generalised cross-app analytics contract first?

---

## 7. What I'll prepare before/at the session
- A **dependency & Capacitor compatibility audit** (Connect vs Vision) to answer Q18 concretely.
- A proposed **cross-app analytics contract** sketch (generalising the snapshot shape).
- A **Turborepo layout proposal** (apps/, packages/) + a migration approach for both git
  histories — presented only as an option, pending §6.E.

---

## 8. Reference pointers
- Connect: `RESUME_HERE.md`, `.github/MASTER_DIRECTION.md`, `docs/plans/contributor-dashboard.md`.
- Vision: `citizens-vision/ARCHITECTURE.md` (esp. §7 integration, §9 roadmap),
  `.github/VISION.md`, `.github/PROJECT_STATUS.md`, `.github/DECISIONS.md`,
  `.github/copilot-instructions.md`.
- Snapshot producer: `supabase/migrations/116_analytics_sources_and_vision_snapshot.sql`
  (`snapshot_contributor_analytics_for_vision`, `contributor_analytics_snapshots`).
