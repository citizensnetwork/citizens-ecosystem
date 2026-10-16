-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL, NOT APPLIED. Tracker P2-05 ("Moments": 24-hour Contributor updates with a seen / unseen ring), gate G1.
--  Written 2026-10-15 against live head 181; the live head is now 182 (another session's Vision migration), so the
--  number is NOT fixed: take the next free one after list_migrations at apply time. Needs Stephen's yes in chat first,
--  and the tracker says "Q4 review first": Q4 is the ATTENTION test of tracker section 4 ("does it respect people's
--  time? reject or defer if it relies on streaks, urgency, endless scroll or rankings"). A post that disappears in
--  24 hours with an unseen ring is the urgency pattern Q4 warns about, so do not build this before that decision.
--  (An earlier version of this header called Q4 the moderation question. That was wrong; corrected 2026-10-16.)
--  If Stephen chooses ADAPT (a short note with no ring and no countdown), drop moment_views and its policies below.
--
--  A Moment is a short post (up to 280 characters and one image) that disappears after 24 hours. It is for the small,
--  everyday thing a ministry would not write a news post for ("doors open early tonight", "the soup kitchen needs two more
--  hands today"). News posts stay (news_posts is untouched). The ring on a pin shows only that a Contributor has a live
--  Moment the signed-in person has not seen yet.
--
--  Choices made in this draft, each one for Stephen to change:
--    * Views are PRIVATE to the viewer (the ring). A Contributor is never shown who or how many saw a Moment: no
--      vanity metric, nothing that makes a small ministry feel small (VISION).
--    * Immutable: no edit, only delete and post again (an edited urgent notice is a moderation problem).
--    * At most 5 live Moments per Contributor, so one account cannot flood the map.
--    * Only an approved Contributor (or an admin) can post; anyone, signed in or not, can read a LIVE Moment.
--
--  If approved: pre-apply git tag, MCP apply_migration (<next free number>_moments), get_advisors (0 ERROR,
--  0 new findings), move this file to supabase/migrations/<number>_moments.sql in the same PR.
--  Re-read the live reports_target_type_check before applying (five targets on 2026-10-16).
-- ════════════════════════════════════════════════════════════════════

begin;

create table public.moments (
  id             uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 280),
  image_url      text check (image_url is null or char_length(image_url) <= 500),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '24 hours'),
  -- the window is fixed by the database, not by the caller: never longer than 24 hours
  constraint moments_window check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);
create index moments_contributor_live_idx on public.moments (contributor_id, expires_at desc);
create index moments_expires_idx on public.moments (expires_at);

create table public.moment_views (
  moment_id uuid not null references public.moments(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  seen_at   timestamptz not null default now(),
  primary key (moment_id, viewer_id)
);
create index moment_views_viewer_idx on public.moment_views (viewer_id);

alter table public.moments enable row level security;
alter table public.moment_views enable row level security;

-- Read: a Moment is public while it is live. The author also sees their own (a short while after it expires, until the
-- clean-up below removes it), so the dashboard can say "this one has ended".
create policy moments_select_live on public.moments
  for select using (expires_at > now() or contributor_id = (select auth.uid()) or (select public.is_admin()));

-- Post: only as yourself, only an approved Contributor (is_approved_contributor() also admits an admin).
create policy moments_insert_own on public.moments
  for insert to authenticated
  with check (contributor_id = (select auth.uid()) and (select public.is_approved_contributor()));

-- Take one down: the author, or an admin. There is no UPDATE policy (immutable).
create policy moments_delete_own on public.moments
  for delete to authenticated
  using (contributor_id = (select auth.uid()) or (select public.is_admin()));

-- Views: you read and write only your own, and only for a Moment that is still live.
create policy moment_views_select_own on public.moment_views
  for select to authenticated using (viewer_id = (select auth.uid()));
create policy moment_views_insert_own on public.moment_views
  for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and exists (select 1 from public.moments m where m.id = moment_id and m.expires_at > now())
  );

revoke all on public.moments, public.moment_views from anon, public;
grant select on public.moments to anon, authenticated;
grant insert, delete on public.moments to authenticated;
grant select, insert on public.moment_views to authenticated;

-- At most 5 live Moments per Contributor (an admin is not exempt: a flood is a flood).
create function public.moments_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.moments where contributor_id = new.contributor_id and expires_at > now()) >= 5 then
    raise exception 'moments_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.moments_cap() from public, anon, authenticated;

create trigger moments_cap_before_insert
  before insert on public.moments
  for each row execute function public.moments_cap();

-- A Moment can be reported like any other content: add it to the targets the reports table accepts.
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['event', 'user', 'place', 'comment', 'conversation', 'moment']::text[]));

commit;

-- Clean-up: expired Moments are invisible at once (the read policy), and are deleted a week later by a daily job.
-- Register it the way migrations 121 and 125 registered the existing crons (pg_cron is enabled since 120); the SQL is:
--   select cron.schedule('moments-cleanup', '17 2 * * *', $$delete from public.moments where expires_at < now() - interval '7 days'$$);
--
-- Rollback: unschedule the job, drop table public.moment_views, drop table public.moments, drop function public.moments_cap(),
-- and put reports_target_type_check back to its five targets (delete any reports about a moment first).
--
-- What follows in the front end, once approved (none of it is built): a "Post a Moment" box in the Contributor Portal, the
-- ring on a pin that has a live Moment you have not seen, and a full-screen viewer (swipe through, age stamp). Tests to
-- write with the migration: policy tests (a visitor reads live ones only; a citizen cannot post; nobody reads another
-- person's views; a Contributor cannot see a count), the 280 and 24-hour checks, the cap of 5, expiry, and the report target.
