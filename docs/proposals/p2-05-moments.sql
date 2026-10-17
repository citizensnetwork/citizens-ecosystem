-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL, NOT APPLIED. Tracker P2-05 (Moments), ADAPTED per Stephen's answer of 2026-10-17. Gate G1.
--  Take the next free migration number at apply time. Needs Stephen's yes in chat for THIS (adapted) file.
--
--  The decision (tracker Q4 is the ATTENTION test: "does it respect people's time? reject or defer if it relies on streaks,
--  urgency, endless scroll or rankings"): ADAPT. A Moment is a short note, up to 280 characters and one image, that clears
--  itself after a day. It has NO unseen ring and NO countdown. So nothing about it says "hurry" or "you missed this":
--    * the first draft's `moment_views` table and its two policies are GONE (nothing records who has seen what);
--    * the front end must not show a time left, a progress bar or a ring, only "Posted 3 h ago" like every other post;
--    * a Contributor is never shown who or how many saw a Moment (no vanity number; nothing that makes a small ministry
--      feel small, VISION litmus 3).
--
--  Where it shows (to build once approved): a "Today" tab on a Contributor's sheet, only when that Contributor has a live
--  note, after Events and News. Not on pins, not in a feed, not in notifications.
--
--  Other choices, each one for Stephen to change:
--    * Immutable: no edit, only take it down and post again (an edited urgent notice is a moderation problem).
--    * At most 5 live Moments per Contributor (an admin is not exempt: a flood is a flood).
--    * Only an approved Contributor (or an admin) can post; anyone, signed in or not, can read a LIVE Moment.
--    * A Moment can be reported like any other content: 'moment' joins reports_target_type_check.
--
--  DRY-RUN DONE (2026-10-17, nothing was applied): these statements were run inside a transaction that always rolls back,
--  with synthetic users: 21 of 21 checks passed (listed at the foot of this file).
--
--  If approved: pre-apply git tag, MCP apply_migration (<next free number>_moments), get_advisors (0 ERROR; list any new
--  WARN), rollback-only probe, move this file to supabase/migrations/ in the same PR. RE-READ the live
--  reports_target_type_check first (five targets on 2026-10-17: event, user, place, comment, conversation).
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

alter table public.moments enable row level security;

-- Read: a Moment is public while it is live. The author also sees their own (until the clean-up below removes it), so the
-- dashboard can say "this one has ended".
create policy moments_select_live on public.moments
  for select using (expires_at > now() or contributor_id = (select auth.uid()) or (select public.is_admin()));

-- Post: only as yourself, only an approved Contributor (is_approved_contributor() also admits an admin).
create policy moments_insert_own on public.moments
  for insert to authenticated
  with check (contributor_id = (select auth.uid()) and (select public.is_approved_contributor()));

-- Take one down: the author, or an admin. There is no UPDATE policy and no UPDATE grant (immutable).
create policy moments_delete_own on public.moments
  for delete to authenticated
  using (contributor_id = (select auth.uid()) or (select public.is_admin()));

-- Supabase grants every privilege on a new table to anon and authenticated by default, and TRUNCATE is not subject to
-- RLS: take everything away first, then give back only what is needed.
revoke all on public.moments from anon, authenticated, public;
grant select on public.moments to anon, authenticated;
grant insert, delete on public.moments to authenticated;

-- At most 5 live Moments per Contributor.
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

-- A Moment can be reported like any other content.
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['event', 'user', 'place', 'comment', 'conversation', 'moment']::text[]));

commit;

-- Clean-up: expired Moments are invisible at once (the read policy), and are deleted a week later by a daily job.
-- Register it the way migrations 121 and 125 registered the existing crons (pg_cron is enabled since 120); the SQL is:
--   select cron.schedule('moments-cleanup', '17 2 * * *', $$delete from public.moments where expires_at < now() - interval '7 days'$$);
--
-- Rollback: unschedule the job, drop table public.moments, drop function public.moments_cap(), and put
-- reports_target_type_check back to its five targets (delete any reports about a moment first).
--
-- The dry run checked (all PASS): a visitor reads live ones only; a stranger sees only live ones; the author also sees
-- their own ended one; a citizen cannot post; an approved Contributor can; 0 and 281 characters are refused; an expiry
-- of more than 24 hours is refused; the 6th live one is refused with 'moments_limit' (an ended one does not count); there
-- is no UPDATE and no TRUNCATE for anyone; the author deletes their own, a stranger deletes none; the table grants are
-- exactly select for anon and select + insert + delete for authenticated; the cap function is not callable by either; a
-- 'moment' report target is accepted and an unknown one is still refused; deleting the Contributor takes their Moments.
--
-- Front end once approved (not built): a "Post a note" box in the Contributor Portal (280 characters, one optional image,
-- plain "This clears itself after a day." as the only mention of time), and the "Today" tab on the sheet. No ring, no
-- countdown, no view count, no notification.
