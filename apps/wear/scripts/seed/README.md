# Citizens Wear — launch feed seed

Seeds the Wear social feed so it isn't empty at launch: **5 original,
Kingdom-aligned brands** (no real-company impersonation), 2 community personas,
posts with imagery, a follow graph, likes/comments, stories, and one realized
**Concepts-marketplace** item (proposed → awarded → released) so the in-feed
attribution chip renders.

The file carries four independently-guarded blocks: the **base seed** (above),
the **§12 mig-161 engagement block** — two fresh community Concepts (their
inserts fire the concept-status promotion trigger, so the Concepts-page
stories bar is alive for 24h after seeding), threaded comments, and recorded
shares; the **§13 mig-162 block** — one pending Become-a-Brand application for
the Admin queue; and the **§14 mig-163 block** — one completed, audited admin
sign-in-as of `@gracelethabo` (see below). Each block no-ops when its own
marker rows exist, so re-running the file on a prod that has only the base seed
adds just the newer content.

### §14 — impersonation Phase 1 demo

One **closed, fully audited** admin sign-in-as session targeting
`@gracelethabo`: three audit actions (`view_profile`, `view_feed`, and a
`view_dm_thread` carrying its own access reason) plus the target's
after-the-fact inbox notification _"An administrator accessed your account for
support…"_ (institutional voice — null actor). The admin is resolved
dynamically from `wear.user_roles` (the founder), and the session is left
**closed** so it never occupies the founder's one-active-session slot or throws
up a surprise banner — the live flow is walked by clicking **"View as user
(admin)"** on any profile in the running app. The session is inserted open then
closed so the `AFTER UPDATE` close-notify trigger actually delivers the
notification (an insert-as-closed would not).

## Files

- [`seed-feed.sql`](./seed-feed.sql) — idempotent seed (no-op if already applied).
- [`teardown-feed.sql`](./teardown-feed.sql) — full, clean removal (cascades
  cover the mig-161 tables: statuses/views/comments/shares hang off concepts
  and the 7 seed users; the §14 impersonation session + its actions + the
  target notification cascade from `@gracelethabo`).

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
- **Media never points at a third-party host.** Wear's Content-Security-Policy
  (`apps/wear/next.config.js`) lets pictures load only from our Supabase host
  and Google avatars, so the seed uses our own storage: the 12 demo photos are
  objects in the public `wear-media` bucket under `wear-demo-photos/` (see
  [Demo photos](#demo-photos)), and brand logos / citizen avatars are left
  **empty** (the app draws the crown disc for a brand and an initials disc for
  a person). Replace the photos with real uploads once real brands post.
- **Seed accounts have no password** → they cannot sign in; they exist purely to
  own the seeded content. Reassign `wear.brands.owner_user_id` to a real user to
  hand a brand over later.

## Demo photos

The seed expects these 12 files in `wear-media/wear-demo-photos/` (a public bucket; the
seed builds `https://<project>.supabase.co/storage/v1/object/public/wear-media/wear-demo-photos/<file>`).
They are free stock photos under the
[Unsplash License](https://unsplash.com/license) (free to download, copy and
use, commercial use included, no attribution needed; they may not be sold
unmodified or compiled into a competing photo service). They were downloaded
once on 2026-10-15 from `https://images.unsplash.com/<name>?auto=format&fit=crop&w=800&q=70`
(the file name without `.jpg` is the `<name>`), then uploaded by hand in the
Supabase dashboard (Storage → `wear-media` → `wear-demo-photos`):

`photo-1434389677669-e08b4cac3105.jpg`, `photo-1489987707025-afc232f7ea0f.jpg`,
`photo-1503341504253-dff4815485f1.jpg`, `photo-1521572163474-6864f9cf17ab.jpg`,
`photo-1523381210434-271e8be1f52b.jpg`, `photo-1539185441755-769473a23570.jpg`,
`photo-1556905055-8f358a7a47b2.jpg`, `photo-1576871337622-98d48d1cf531.jpg`,
`photo-1588099768523-f4e6a5679d88.jpg`, `photo-1588850561407-ed78c282e89b.jpg`,
`photo-1618354691373-d851c5c3a990.jpg`, `photo-1620799140408-edc6dcb6d633.jpg`.

Re-seeding on a project without these objects gives broken pictures (the seed
raises no error). `teardown-feed.sql` removes the rows but not the storage objects; delete
the `wear-demo-photos/` folder in the dashboard if you want them gone too.

## Run / remove (via Supabase MCP `execute_sql`, or psql as a superuser/owner)

```sql
\i seed-feed.sql      -- apply (idempotent)
\i teardown-feed.sql  -- remove (cascade-clean)
```
