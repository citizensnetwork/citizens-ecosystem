-- MASTER_DIRECTION Batch 6 — Part 7: Global Content Label System
-- ═══════════════════════════════════════════════════════════════
-- A cross-app tagging substrate so every event / place / profile can
-- be assigned to one or more platform contexts ("apparel" → Citizens
-- Wear, "education" → Citizens Learn, etc.). Connect itself does not
-- read these labels yet — they exist for the wider Citizens
-- ecosystem to consume once those channels come online.
--
-- Auto-label rules implemented here:
--   - event.category = 'markets-expos'        → label 'market'
--   - event.category in ('education-equipping',
--                        'education',
--                        'equip')            → label 'education'
--   - profile.contributor_kind = 'organization'
--     AND profile.role = 'contributor' with a school/learn-coded
--     ancestor → DEFERRED (no clean signal yet, see FUTURE_IDEAS).
--
-- Deferred (no clean signal): apparel labels from contributor posts
-- (NLP) and the "educational" contributor_kind (it does not exist;
-- contributor_kind is ministry / organization / business).
--
-- See: .github/MASTER_DIRECTION.md Part 7 "Global Content Label System".

-- ────────────────────────────────────────────────────────────
-- 1. Table
-- ────────────────────────────────────────────────────────────
create table if not exists public.content_labels (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('event', 'place', 'profile')),
  entity_id   uuid not null,
  label       text not null check (length(label) between 1 and 64),
  created_at  timestamptz not null default now(),
  unique (entity_type, entity_id, label)
);

create index if not exists content_labels_entity_idx
  on public.content_labels (entity_type, entity_id);

create index if not exists content_labels_label_idx
  on public.content_labels (label);

comment on table public.content_labels is
  'Cross-app content tagging. Drives discovery in Citizens Wear, Learn, etc. Connect does not read these directly.';

-- ────────────────────────────────────────────────────────────
-- 2. RLS — public read; only the platform (triggers) writes.
-- ────────────────────────────────────────────────────────────
alter table public.content_labels enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'content_labels_select_all'
      and tablename  = 'content_labels'
  ) then
    create policy content_labels_select_all
      on public.content_labels
      for select
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'content_labels_admin_write'
      and tablename  = 'content_labels'
  ) then
    create policy content_labels_admin_write
      on public.content_labels
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

-- ────────────────────────────────────────────────────────────
-- 3. Auto-label trigger on events
-- ────────────────────────────────────────────────────────────
-- SECURITY DEFINER + hardened search_path per project standard
-- (see migration 051). Owner is `postgres` (BYPASSRLS) so it can
-- write into content_labels regardless of who created the event.
create or replace function public.apply_event_content_labels()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Markets / expos → 'market' (Citizens Wear collaboration tab)
  if new.category = 'markets-expos' then
    insert into public.content_labels (entity_type, entity_id, label)
    values ('event', new.id, 'market')
    on conflict (entity_type, entity_id, label) do nothing;
  end if;

  -- Education-coded categories → 'education' (Citizens Learn directory).
  -- Covers the legacy `education-equipping` slug *and* the consolidated
  -- v2 slugs `education` and `equip`. Defensive against either taxonomy.
  if new.category in ('education-equipping', 'education', 'equip') then
    insert into public.content_labels (entity_type, entity_id, label)
    values ('event', new.id, 'education')
    on conflict (entity_type, entity_id, label) do nothing;
  end if;

  return new;
end;
$$;

-- Trigger function — triggers run as owner (postgres) regardless of caller
-- EXECUTE grants. Only service_role retains EXECUTE for admin tooling /
-- future backfills; do not grant to anon or authenticated (raises a
-- "security_definer_function_executable" advisor — see migration 076).
revoke all on function public.apply_event_content_labels() from public;
grant execute on function public.apply_event_content_labels() to service_role;

drop trigger if exists trg_apply_event_content_labels on public.events;
create trigger trg_apply_event_content_labels
  after insert or update of category on public.events
  for each row
  execute function public.apply_event_content_labels();

-- ────────────────────────────────────────────────────────────
-- 4. Backfill existing events
-- ────────────────────────────────────────────────────────────
insert into public.content_labels (entity_type, entity_id, label)
select 'event', id, 'market'
  from public.events
  where category = 'markets-expos'
on conflict (entity_type, entity_id, label) do nothing;

insert into public.content_labels (entity_type, entity_id, label)
select 'event', id, 'education'
  from public.events
  where category in ('education-equipping', 'education', 'equip')
on conflict (entity_type, entity_id, label) do nothing;
