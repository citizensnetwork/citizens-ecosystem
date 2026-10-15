-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL, NOT APPLIED. Tracker P2-04 (Follow and Save), gates G1 and G6.
--  Written 2026-10-15 against live head 181. Needs Stephen's yes in chat before anything is applied.
--
--  What exists today (read from the live database, 2026-10-15):
--    follows        profile -> profile (a Contributor is a profile, so "follow a Contributor" already has a table)
--    place_follows  user -> place
--    Events         following one is what an RSVP already does (notify_event_field_changes, set_rsvp_notify_updates)
--  So Follow needs no new table. What is missing is SAVE: a private bookmark of a Contributor, Place or Event
--  ("I want to come back to this"), visible only to the person who saved it, never counted, never shown to the listing.
--
--  This file is the Save table only. Follow notifications are a separate sketch (docs/proposals/README.md, item 2),
--  because they need a decision about preferences first.
--
--  If approved: pre-apply git tag, MCP apply_migration (name it 182_saved_items), then get_advisors (0 ERROR, 0 new
--  findings), then move this file to supabase/migrations/182_saved_items.sql in the same PR.
-- ════════════════════════════════════════════════════════════════════

begin;

-- One row per saved listing. Exactly one target, and each target is a real foreign key, so a deleted Contributor, Place
-- or Event takes its saves with it (no orphans, no polymorphic id without an owner).
create table public.saved_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  contributor_id uuid references public.profiles(id) on delete cascade,
  place_id       uuid references public.places(id) on delete cascade,
  event_id       uuid references public.events(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint saved_items_one_target check (num_nonnulls(contributor_id, place_id, event_id) = 1),
  constraint saved_items_not_self   check (contributor_id is null or contributor_id <> user_id)
);

-- saving the same thing twice is one row
create unique index saved_items_user_contributor_key on public.saved_items (user_id, contributor_id) where contributor_id is not null;
create unique index saved_items_user_place_key       on public.saved_items (user_id, place_id)       where place_id is not null;
create unique index saved_items_user_event_key       on public.saved_items (user_id, event_id)       where event_id is not null;
-- "my saved list", newest first
create index saved_items_user_created_idx on public.saved_items (user_id, created_at desc);
-- the foreign keys that cascade need their own indexes so a delete does not scan the table
create index saved_items_contributor_idx on public.saved_items (contributor_id) where contributor_id is not null;
create index saved_items_place_idx       on public.saved_items (place_id)       where place_id is not null;
create index saved_items_event_idx       on public.saved_items (event_id)       where event_id is not null;

-- RLS is the wall: a person sees, adds and removes ONLY their own saves. No UPDATE (a save is made or removed), and
-- no policy for anon, so a visitor who is not signed in can neither read nor write.
alter table public.saved_items enable row level security;

create policy saved_items_select_own on public.saved_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy saved_items_insert_own on public.saved_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy saved_items_delete_own on public.saved_items
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.saved_items from anon, public;
grant select, insert, delete on public.saved_items to authenticated;

-- A ceiling, so one account cannot grow the table without bound: 500 saves each (adjustable here, in one place).
create function public.saved_items_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_items where user_id = new.user_id) >= 500 then
    raise exception 'saved_items_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.saved_items_cap() from public, anon, authenticated;

create trigger saved_items_cap_before_insert
  before insert on public.saved_items
  for each row execute function public.saved_items_cap();

commit;

-- Rollback (the table holds only private bookmarks, nothing else depends on it):
--   drop table public.saved_items; drop function public.saved_items_cap();
--
-- What follows in the front end, once approved (none of it is built): a "Save" button on the sheet next to Share, a
-- saved list under the account, and the saved state read with one SELECT for the signed-in person. Tests to write with
-- the migration: a policy test that user A cannot read, insert or delete user B's saves and anon gets nothing, the
-- one-target check, the unique indexes, the 500 cap, and cascade on listing delete.
