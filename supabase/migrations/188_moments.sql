-- ════════════════════════════════════════════════════════════════════
--  188_moments: P2-05 Moments, ADAPTED. Authored as docs/proposals/p2-05-moments.sql on 2026-10-17; applied the same day
--  through MCP apply_migration as `188_moments` on Stephen's yes in chat (one yes per file; pre-apply tag
--  `connect-pre-mig188-moments`). The live reports_target_type_check was re-read first (five targets, as the file assumes).
--
--  A Moment is a short note (up to 280 characters, one optional image) that clears itself after a day. It has NO unseen ring and
--  NO countdown (tracker Q4, the attention test): nothing records who has seen what, and a Contributor is never shown who or how
--  many saw it. Immutable (take it down and post again), at most 5 live per Contributor, readable by anyone while live, only an
--  approved Contributor or an admin can post, and it can be reported like any other content.
--  One change from the proposal: the daily clean-up job (`moments-cleanup`, 02:17, deletes Moments a week after they end) is
--  registered INSIDE the migration, so the lineage rebuilds the whole feature; the proposal left it as a note.
--  Evidence: rollback-only probe docs/audit/probes/188_moments.probe.sql, 24 of 24 PASS against the live table, nothing left
--  behind; security advisor identical to the one before (0 ERROR, 130 WARN; the cap function is not callable by anon or
--  signed-in users). cron jobs 14 -> 15.
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

-- Clean-up: expired Moments are invisible at once (the read policy) and are deleted a week later by a daily job. A plain SQL
-- job, no HTTP and no key (pg_cron is enabled since 120).
select cron.schedule('moments-cleanup', '17 2 * * *', $cron$delete from public.moments where expires_at < now() - interval '7 days'$cron$);

commit;

-- (The clean-up job is registered above, inside the migration.)
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
