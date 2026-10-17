-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL S13c (gate G1, G6, and Stephen's decision): NOT APPLIED. Step 4 of 4, the last.
--  Written 2026-10-17. Take the next free migration number at apply time.
--
--  APPLY ONLY AFTER s13a (functions) and s13b (search) are applied AND the app code that
--  calls those functions is deployed (see s13-follows-privacy.md, "Order"). Applied earlier it
--  would make the public follower counts read 0 and POST /api/conversations refuse every message.
--
--  What it does: today anyone holding the public key every browser carries can list who follows
--  whom (SELECT policy `true`, SELECT granted to anon). After this, a person can read only their
--  OWN follow rows; the public key reads none. Everything else goes through the s13a functions
--  (counts) or the existing SECURITY DEFINER functions (mutual followers, Vision, digests).
--
--  Not touched: INSERT and DELETE policies (already own rows), the Edge Functions (service role),
--  every Vision / analytics SECURITY DEFINER function (they bypass RLS as the owner), wear.follows
--  (a separate table in the wear schema, see the write-up).
-- ════════════════════════════════════════════════════════════════════

begin;

-- follows: my own rows only
drop policy if exists "Follows are viewable by everyone" on public.follows;
create policy follows_select_own on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()));

-- place_follows: my own rows only
drop policy if exists place_follows_select on public.place_follows;
create policy place_follows_select_own on public.place_follows
  for select to authenticated
  using (user_id = (select auth.uid()));

-- the public key has no business here at all (it also held INSERT / UPDATE / DELETE / TRUNCATE
-- grants that RLS was the only thing stopping: belt and braces)
revoke all on public.follows from anon;
revoke all on public.place_follows from anon;

commit;

-- ── ROLLBACK (keep with the migration) ──────────────────────────────
-- begin;
--   drop policy follows_select_own on public.follows;
--   create policy "Follows are viewable by everyone" on public.follows for select using (true);
--   drop policy place_follows_select_own on public.place_follows;
--   create policy place_follows_select on public.place_follows for select using (true);
--   grant select on public.follows, public.place_follows to anon;
-- commit;
