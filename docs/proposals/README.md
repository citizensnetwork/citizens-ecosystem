# Migration proposals (gate G1): nothing here is applied

Written 2026-10-15 against the live migration head **181**. Each `.sql` file is a complete, reviewable migration that has **not** been run. A migration is applied only after Stephen says yes in chat, with the usual steps: a pre-apply git tag, MCP `apply_migration`, the security advisor (0 ERROR and 0 new findings), and the file moved to `supabase/migrations/` in the same PR.

Everything below was checked against the live database first (tables, constraints, policies and helper functions were read, not assumed).

| File                                                           | Tracker | What it adds                                                                 | State                                                                            |
| -------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`182_p2_04_saved_items.sql`](./182_p2_04_saved_items.sql)     | P2-04   | A private "Save" bookmark for a Contributor, Place or Event                  | Ready to review. Follow needs no new table (see below).                          |
| [`183_p2_09_event_cohosts.sql`](./183_p2_09_event_cohosts.sql) | P2-09   | Up to 3 co-hosts on an event, by invitation, with two new notification kinds | Ready to review. Writes go through three functions only; the table is read-only. |
| [`184_p2_05_moments.sql`](./184_p2_05_moments.sql)             | P2-05   | 24-hour "Moments" with a private seen ring                                   | Ready to review, but the tracker says **Q4 (moderation) review first**.          |

## What I found while writing them

1. **Follow already has its tables.** `follows` (profile to profile, and a Contributor is a profile) and `place_follows` exist; an Event is "followed" by an RSVP. So P2-04 is really **Save** plus **notifications to followers**, not a new follow system. Adding an `event_follows` table would duplicate the RSVP.
2. **Follow notifications are a sketch, not a migration.** They need a decision about preferences first (question 3). The shape: two new notification types (`followed_new_event`, `followed_new_news`), and an `AFTER INSERT` trigger on `events` and on `news_posts` that inserts one `notifications` row per follower, capped per post, skipped for a person who turned that preference off, and never for a blocked pair. It will be written as `185_follow_notifications.sql` once question 3 is answered.
3. **A privacy gap that already exists, and that P2-08 depends on.** `follows` and `place_follows` have a `SELECT` policy of `true` for the public role, and the `anon` role has `SELECT` on both (checked with `has_table_privilege`, 2026-10-15). Anyone holding the public key that every browser carries can list who follows whom. Two consequences: (a) the "show a follower count only from 100" rule (P2-08, so a small ministry is never shown a low number) can be sidestepped by counting the rows directly; (b) in a Christian community platform, a list of which people follow which ministry is a sensitive thing to leave readable by anyone. **Not changed**: tightening it (own rows only, with the bucketed count served by a function) needs an audit of everything that reads these tables first. It is a separate decision, listed below as question 4.

## Questions for Stephen (one line each, my recommendation first)

1. **Save** (`182`): a private bookmark, never counted and never shown to the listing. Yes? _Recommended: yes._
2. **Co-hosting** (`183`): the organiser invites, the other Contributor accepts, at most 3 co-hosts. Is 3 the right ceiling? _Recommended: 3._
3. **Follower notifications**: when a Contributor you follow posts an event or news, should you be notified by default, or only after you switch it on? _Recommended: on by default for a Contributor you chose to follow, with one switch in Settings._
4. **The follows privacy gap**: audit and tighten who can read `follows` and `place_follows` (and serve follower counts only in buckets)? _Recommended: yes, before P2-04 ships anything that makes following more visible._
5. **Moments** (`184`): are the three draft choices right (views private to the viewer, no editing, at most 5 live per Contributor), and when is the Q4 moderation review? _Recommended: hold `184` until Q4._

Open `184` first if you only read one: it is the only one that changes what a small ministry can publish.
