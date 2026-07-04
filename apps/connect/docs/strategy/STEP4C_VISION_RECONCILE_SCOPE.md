# Step 4c — Vision reconcile + HTML frontend: SCOPE

> **Status: ✅ EXECUTED 2026-07-02** (citizens-vision `e39aa88` → `3602a86`; brief
> row 4c stamped). Founder answers: Q1 = the `Citizens Vision Design.zip` handoff
> (2026-07-02, `_ds` tokens + VISION_BUILD_PLAN.md — build-from-plan); Q2 = mig 145
> applied (146 became the Wear grants fix → **Vision DDL numbers from 147**);
> Q3 = RSC discard reconfirmed (delegated + executed). Units 2→4 shipped as three
> gated increments; the §3 sequence below is retained as the record. Remaining
> Vision work = demo→live wiring of the 45 handlers into the frontend screens
> (the narrative-engine `data` objects are the contract) + deploy gates (§1).
>
> Companions: [`docs/VISION_BACKEND_WIRING_SPEC.md`](../VISION_BACKEND_WIRING_SPEC.md)
> (the unit-of-work reference for the backend half),
> [`docs/ECOSYSTEM_PROFILE_LEVELS.md`](../ECOSYSTEM_PROFILE_LEVELS.md) (Step 4b — Vision's
> API gates consume its P-rules), [`docs/SHARED_DB_CONTRACT.md`](../SHARED_DB_CONTRACT.md).

---

## 1. Where Vision stands (verified on disk, 2026-07-02)

- `../citizens-vision` main @ **e39aa88** — already cut onto the shared project (Step 2 app
  half, RESUME §3F): `supabase-js` with `db.schema='vision'`, sync subsystem deleted, Connect
  read live via `/api/v1` (`src/lib/connect/api.ts` + `feed.ts`), claims model live
  (`vision.cc_event_claims`/`cc_place_claims`), identity bridge ✅ mig 142.
- Stack: **Next 16.2.3 / React 19.2.4, SSR/RSC** — 39 `.tsx` files under `src/app` (pages +
  layouts) and **45 `/api/*` route handlers already on disk**. The API-only endgame is closer
  than Wear's was: a large part of the consumption surface already exists as route handlers.
- **⛔ Vision deploy gates still pending (founder, §3F):** Vercel env (shared project URL +
  publishable key), PostgREST **Exposed schemas += `vision`**, `CONNECT_API_BASE_URL`
  (+ optional `CONNECT_API_KEY`). Prod has been down since the old eu-west project was paused —
  nothing regresses while we build.

## 2. Design-asset finding (changes the founder question)

`App Planning Docs/Vision/Citizens Vision.zip` (353 KB, 2026-06-15) was inspected read-only —
**it is NOT an importable app-source handoff** like Wear's 8.6 MB design zip (which carried
`app/*.jsx` screens). Contents:

- `Citizens Vision.dc.html` (156 KB) + `support.js` + `Canvas.dc.html` — a **single-file
  Claude-design canvas** (Schibsted Grotesk/Newsreader fonts, maplibre, `<x-dc>` runtime);
- 5 screenshots: `datalayer`, `event-detail`, `home-pweng`, `login-test`, `spaces`;
- `uploads/` copies of the Product Blueprint PDF, **UI Diagram PDF**, backend-architecture MDs
  (already committed to this repo or present in the planning folder).

⇒ It is a **design reference/prototype**, not the Vision equivalent of the Wear handoff. The
HTML-frontend swap (§3 step 3) therefore needs either (a) a fuller design export from the
Claude-design project, or (b) screens built by hand against this canvas + the UI Diagram PDF +
[`CATEGORIES.md`](../../CATEGORIES.md) tokens. **Founder question — see §5 Q1.**

## 3. The sequence (Wear-proven §6a, adapted)

Each unit is independently shippable, gated (`tsc · eslint · vitest · build · coverage`), and
pushed to the relevant `main` before the next starts.

1. **Backend wiring units** — work through `VISION_BACKEND_WIRING_SPEC` section by section
   (§0.3 bridge already ✅ mig 142). Any DDL ships as numbered Connect migrations (**next # =
   145 is RESERVED for the Wear admin draft** — Vision DDL starts at 146, or renumber the Wear
   draft if the founder declines it). Vision's role gates implement the profile-levels P-rules
   (`vision.user_org_roles` RBAC = the creating tier; `platform_admin` = admin — no new
   mechanism needed, spec §0.4 already conforms).
2. **`/api/*` surface** — audit the 45 existing route handlers against the wiring spec; add the
   missing operations; port Connect/Wear's **`route-context` Bearer-token pattern** (static
   frontend + `localStorage` session ⇒ `Authorization: Bearer`, cookie fallback — memory
   `static-frontend-cross-origin-auth`) and **rate limiting from day one** (Connect's Upstash
   fixed-window `src/lib/rate-limit.ts` — do NOT repeat Wear debt #1).
3. **HTML frontend swap** — standalone app in `src/frontend/` built by a thin
   `scripts/build-frontend.js` over **`@citizens/frontend-build`** (Step 4 ✅): Vision becomes
   the 3rd consumer via **Connect's vendoring pattern** (`vendor/citizens-frontend-build` +
   `file:` dep + sync script + drift test), `envGlobalName: '__CV_ENV'`. Adaptations to flag:
   Vision is **desktop back-office** (D2) — no Capacitor shell planned, so either ship a stub
   `capacitor-bridge.js`/`auth-client.js` pair (pipeline expects both) or add an opt-out option
   to the package (bump version + re-vendor). Desktop-first layouts, unlike Connect/Wear.
4. **Vision Next.js → API-only** — delete the RSC page tree (the 39 `.tsx` surfaces; same
   trade Connect and Wear made), keep the 45+ route handlers, `/` → `/index.html` redirect.
   **Note the size of the discard honestly:** Vision's RSC UI is the most built-out of the
   three (phases 0–21b). The founder ratified the direction (brief row 4c) — reconfirm at
   execution kickoff (§5 Q3).

## 4. Dependencies & risks

| Item | State |
|---|---|
| `@citizens/frontend-build` (Step 4) | ✅ shipped; vendoring pattern proven on Connect |
| Profile-levels contract (Step 4b) | ✅ docs shipped; Vision RBAC already conforms; Wear mig 145 pending founder (not a Vision blocker) |
| Vision deploy gates (founder) | ⛔ outstanding — needed before anything built here is *visible* in prod, but not for building |
| Design asset | ⚠ §2 finding — importable handoff does not exist yet (§5 Q1) |
| React version | Vision HTML frontend should pin the same CDN React 18 UMD pattern as Connect/Wear (the RSC React 19 dependency leaves with the RSC tree); flag only if a screen needs a React-19-only feature |

## 5. Founder questions (blocking execution, not scoping)

- **Q1 (design asset):** The zip is a canvas/reference, not an app-source handoff (§2). Should
  we (a) export a fuller design handoff from the Claude-design project (Wear-style), or
  (b) build Vision's screens directly from the canvas + UI Diagram PDF + CATEGORIES.md tokens?
- **Q2 (mig 145):** Confirm the Wear admin/moderation draft
  ([`docs/wear/145_wear_admin_moderation.sql`](../wear/145_wear_admin_moderation.sql)) so the
  migration number lands before Vision DDL starts — or decline it and Vision takes 145.
- **Q3 (RSC discard):** Reconfirm discarding Vision's RSC UI (the largest of the three) at
  execution kickoff.
- **Q4 (deploy gates):** The §3F gates remain the fastest path to a *visible* Vision.

*Author: Claude (Fable 5), ecosystem Step 4c prep, 2026-07-02.*
