# Citizens Wear — launch feed seed

Seeds the Wear social feed so it isn't empty at launch: **5 original,
Kingdom-aligned brands** (no real-company impersonation), 2 community personas,
posts with imagery, a follow graph, likes/comments, stories, and one realized
**Concepts-marketplace** item (proposed → awarded → released) so the in-feed
attribution chip renders.

The file carries two independently-guarded blocks: the **base seed** (above)
and the **§12 mig-161 engagement block** — two fresh community Concepts (their
inserts fire the concept-status promotion trigger, so the Concepts-page
stories bar is alive for 24h after seeding), threaded comments, and recorded
shares. Each block no-ops when its own marker rows exist, so re-running the
file on a prod that has only the base seed adds just the engagement content.

## Files

- [`seed-feed.sql`](./seed-feed.sql) — idempotent seed (no-op if already applied).
- [`teardown-feed.sql`](./teardown-feed.sql) — full, clean removal (cascades
  cover the mig-161 tables: statuses/views/comments/shares hang off concepts
  and the 7 seed users).

## What gets created

| Brand                | Handle                 | Verified   | Vibe                                       |
| -------------------- | ---------------------- | ---------- | ------------------------------------------ |
| Cornerstone Apparel  | `@cornerstoneapparel`  | ✅         | Streetwear "built on the Rock" (Pretoria)  |
| Lily & Field         | `@lilyandfield`        | ⏳ pending | Considered, modest womenswear              |
| Salt & Light Threads | `@saltandlightthreads` | ✅         | Conversation tees; 10% to city missions    |
| Ubuntu Kingdom Co.   | `@ubuntukingdomco`     | ✅         | Hand-knit by a Mamelodi makers' collective |
| Anchor & Crown       | `@anchorandcrown`      | ⏳ pending | Faith-forward caps & accessories           |

Plus citizens `@gracelethabo` (concept creator) and `@thabo_m`. The two
`pending` brand verifications land in the in-app **Admin queue** so the founder
can approve them live.

## Key design decisions

- **Zero cross-platform footprint.** Brand owners must exist in `auth.users`
  (`wear.users.id` FKs to it), and the `on_auth_user_created` trigger auto-adds
  a Connect `public.profiles` row. The seed **deletes those rows in the same
  transaction**, so seed identities live only in `wear.*` — matching the
  founder's "don't auto-add to other platforms" requirement. (The broader fix —
  making Connect create its profile lazily on first Connect sign-in — is
  recommended separately in `RESUME_HERE.md`.)
- **Faithful marketplace.** The Concept lifecycle runs through the real
  `wear.award_concept_claim` / `wear.advance_concept_status` SECURITY DEFINER
  RPCs under an impersonated `request.jwt.claims`, so the milestone-royalty,
  auto Completed-Concept post, and media-copy triggers fire exactly as in prod.
- **Media is URL-only** (no upload pipeline yet): Unsplash CDN photos for
  posts/concepts, ui-avatars for logos/avatars. Replace with real uploads once
  the storage pipeline ships.
- **Seed accounts have no password** → they cannot sign in; they exist purely to
  own the seeded content. Reassign `wear.brands.owner_user_id` to a real user to
  hand a brand over later.

## Run / remove (via Supabase MCP `execute_sql`, or psql as a superuser/owner)

```sql
\i seed-feed.sql      -- apply (idempotent)
\i teardown-feed.sql  -- remove (cascade-clean)
```
