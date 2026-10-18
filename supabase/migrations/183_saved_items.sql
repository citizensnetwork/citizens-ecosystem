-- ════════════════════════════════════════════════════════════════════
--  183_saved_items: P2-04 Save. APPLIED 2026-10-17 through MCP apply_migration as `183_saved_items`, on Stephen's yes in chat
--  (pre-apply tag `connect-pre-mig183-saved-items`; security advisor unchanged: 0 ERROR, no new finding; rollback-only probe
--  docs/audit/probes/183_saved_items.probe.sql: 21 of 21 PASS before and after the apply).
--
--  A PRIVATE bookmark for a Contributor or a Place (an Event keeps Consider, a state of its rsvps row). Follow is a public
--  signal; a believer who only wants to remember a ministry can save it without being listed as its follower. Own rows only,
--  never counted, never shown to the listing. No UPDATE (a save is made or removed). At most 500 per person.
--  Authored as proposals/p2-04-saved-items.sql (2026-10-15, README question 1); this file is that proposal with one change:
--  authenticated has its default privileges revoked first (TRUNCATE is not subject to RLS), not only anon.
-- ════════════════════════════════════════════════════════════════════

begin;

-- One row per saved listing. Exactly one target, and each target is a real foreign key, so a deleted Contributor or
-- Place takes its saves with it (no orphans, no polymorphic id without an owner). Events are not here: Consider is theirs.
create table public.saved_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  contributor_id uuid references public.profiles(id) on delete cascade,
  place_id       uuid references public.places(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint saved_items_one_target check (num_nonnulls(contributor_id, place_id) = 1),
  constraint saved_items_not_self   check (contributor_id is null or contributor_id <> user_id)
);

-- saving the same thing twice is one row
create unique index saved_items_user_contributor_key on public.saved_items (user_id, contributor_id) where contributor_id is not null;
create unique index saved_items_user_place_key       on public.saved_items (user_id, place_id)       where place_id is not null;
-- "my saved list", newest first
create index saved_items_user_created_idx on public.saved_items (user_id, created_at desc);
-- the foreign keys that cascade need their own indexes so a delete does not scan the table
create index saved_items_contributor_idx on public.saved_items (contributor_id) where contributor_id is not null;
create index saved_items_place_idx       on public.saved_items (place_id)       where place_id is not null;

-- RLS is the wall: a person sees, adds and removes ONLY their own saves. No UPDATE (a save is made or removed), and
-- no policy for anon, so a visitor who is not signed in can neither read nor write.
alter table public.saved_items enable row level security;

create policy saved_items_select_own on public.saved_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy saved_items_insert_own on public.saved_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy saved_items_delete_own on public.saved_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- (Supabase grants every privilege on a new table to anon and authenticated by default, and TRUNCATE is not subject to
-- RLS: so take everything away first, from authenticated as well, and give back only what a save needs.)
revoke all on public.saved_items from anon, authenticated, public;
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
