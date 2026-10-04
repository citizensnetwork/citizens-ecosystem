-- 181 — Listing automation, Phase 1: consent, sources, a suggestions inbox.
--
-- What this is
-- ------------
-- With a Contributor's consent, Citizens reads their PUBLIC website, YouTube
-- channel and calendar feed and turns what it finds into SUGGESTIONS (events,
-- news posts, profile updates) in their dashboard. They approve, edit or dismiss
-- each one; if they chose "events_auto", future events are published for them
-- (labelled with where they came from, one tap to undo). Phase 1 is everything
-- except the reader: this migration is the data model and the owner-side rules.
-- The reader (Phase 2) only ever calls POST /api/automation/suggestions, which
-- writes through service_role after its own checks.
--
-- The principles the schema enforces (founder-approved, POPIA-driven)
-- ------------------------------------------------------------------
--  1. Consent gates everything, and the DEFAULT IS OFF. A level other than
--     'off' cannot exist without a recorded time and source of the consent
--     (profiles_auto_update_consent_recorded).
--  2. The consent columns (and the nudge timestamp) are PRIVATE and SERVER-OWNED. They are not in
--     profiles' public column allow-list (mig 176/177), and a BEFORE UPDATE guard
--     stops an authenticated, non-admin caller changing them through the REST
--     API (authenticated holds table-level UPDATE on profiles, mig 175). The
--     owner changes the level only through set_my_automation_level(), which
--     stamps the consent.
--  3. Withdrawal is instant: level 'off' disables every source and dismisses
--     every pending suggestion in the same transaction.
--  4. Losing the listing (role no longer 'contributor', e.g. an admin removal,
--     mig 178) resets the level and clears sources and suggestions.
--  5. Nobody but service_role can INSERT a suggestion (the reader's endpoint);
--     the owner reads their own and decides through decide_listing_suggestion().
--  6. Every suggestion keeps its source_url; an auto-published event keeps it in
--     events.source_url ("Imported from <domain>").
--
-- Footguns restated (RESUME §3, migs 165/166): every SECURITY DEFINER function
-- sets search_path to '' (so every reference is schema-qualified) and starts with
-- the `auth.uid() is null` guard; EXECUTE is revoked from public and anon and
-- granted to authenticated only. Policies use (select auth.uid()) and ONE policy
-- per command (no new multiple_permissive_policies debt).
--
-- Expected security-advisor delta: +3 WARN, all by design, the same class as the
-- existing 106 (authenticated SECURITY DEFINER EXECUTE): set_my_automation_level,
-- get_my_automation_settings, decide_listing_suggestion. 0 ERROR.

-- ── 1. profiles: the consent record (PRIVATE, server-owned) ──────────────────

alter table public.profiles
  add column if not exists auto_update_level text not null default 'off',
  add column if not exists auto_update_consent_at timestamptz,
  add column if not exists auto_update_consent_source text,
  add column if not exists auto_update_nudged_at timestamptz;

alter table public.profiles drop constraint if exists profiles_auto_update_level_check;
alter table public.profiles
  add constraint profiles_auto_update_level_check
  check (auto_update_level in ('off', 'suggest', 'events_auto'));

alter table public.profiles drop constraint if exists profiles_auto_update_consent_source_check;
alter table public.profiles
  add constraint profiles_auto_update_consent_source_check
  check (auto_update_consent_source is null or auto_update_consent_source in ('google_form', 'dashboard', 'admin'));

-- Consent first: automation cannot be on without a recorded time AND source.
alter table public.profiles drop constraint if exists profiles_auto_update_consent_recorded;
alter table public.profiles
  add constraint profiles_auto_update_consent_recorded
  check (auto_update_level = 'off'
         or (auto_update_consent_at is not null and auto_update_consent_source is not null));

comment on column public.profiles.auto_update_level is
  'Listing automation consent (mig 181): off | suggest | events_auto. PRIVATE and server-owned: changed only by set_my_automation_level(), the Form intake route (service_role) or an admin.';
comment on column public.profiles.auto_update_consent_at is
  'When the owner last made an automation decision (granted, changed or withdrawn). Server-stamped.';
comment on column public.profiles.auto_update_consent_source is
  'Where that decision was made: google_form | dashboard | admin. Server-stamped.';
comment on column public.profiles.auto_update_nudged_at is
  'When the owner was last emailed about new suggestions (at most one a day). Written only by POST /api/automation/digest (service_role).';

-- Guard: raw anon/authenticated non-admin callers cannot write the consent
-- record (or the nudge bookkeeping). A separate function + trigger from guard_profile_server_columns (mig
-- 175), which is left untouched so the two stay independent. SECURITY INVOKER on
-- purpose: current_user must be the caller's role. service_role, SECURITY DEFINER
-- bodies (set_my_automation_level) and admins pass.
create or replace function public.guard_profile_automation_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if new.auto_update_level is distinct from old.auto_update_level
     or new.auto_update_consent_at is distinct from old.auto_update_consent_at
     or new.auto_update_consent_source is distinct from old.auto_update_consent_source
     or new.auto_update_nudged_at is distinct from old.auto_update_nudged_at then
    raise exception 'profiles.auto_update_* is managed by the server'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_automation_columns() from public, anon, authenticated;

drop trigger if exists trg_guard_profile_automation_columns on public.profiles;
create trigger trg_guard_profile_automation_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_automation_columns();

-- ── 2. events.source_url: "Imported from <domain>" ───────────────────────────

alter table public.events add column if not exists source_url text;
alter table public.events drop constraint if exists events_source_url_https_check;
alter table public.events
  add constraint events_source_url_https_check
  check (source_url is null or (source_url ~ '^https://' and length(source_url) <= 500));
comment on column public.events.source_url is
  'Where an automatically published event was read from (mig 181). NULL for everything an owner created by hand.';

-- ── 3. listing_sources: what the owner lets us read ──────────────────────────

create table if not exists public.listing_sources (
  id              uuid primary key default gen_random_uuid(),
  contributor_id  uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('website', 'youtube', 'calendar', 'facebook', 'instagram', 'tiktok')),
  url             text not null check (url ~ '^https://' and length(url) <= 500),
  enabled         boolean not null default true,
  last_checked_at timestamptz,
  last_status     text check (last_status is null or length(last_status) <= 200),
  created_at      timestamptz not null default now(),
  unique (contributor_id, kind, url),
  -- Meta and TikTok do not allow reading a page without the page owner connecting an
  -- account, so those rows may EXIST ("coming soon") but can never be switched on.
  constraint listing_sources_readable_only_when_enabled
    check (kind in ('website', 'youtube', 'calendar') or enabled = false)
);

comment on table public.listing_sources is
  'Where a Contributor lets Citizens read their public updates (mig 181). Owner-managed; the reader (Phase 2) uses service_role.';

-- A modest cap per Contributor, so a runaway client cannot fill the table.
create or replace function public.enforce_listing_sources_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.listing_sources where contributor_id = new.contributor_id) >= 12 then
    raise exception 'too_many_sources' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_listing_sources_cap() from public, anon, authenticated;
drop trigger if exists trg_listing_sources_cap on public.listing_sources;
create trigger trg_listing_sources_cap
  before insert on public.listing_sources
  for each row
  execute function public.enforce_listing_sources_cap();

alter table public.listing_sources enable row level security;

revoke all on table public.listing_sources from public, anon;
revoke all on table public.listing_sources from authenticated;
-- The owner may read, add and remove their own rows, and switch one on or off. They
-- cannot rewrite a row's URL or kind (delete and add instead) or the reader's bookkeeping.
grant select, insert, delete on table public.listing_sources to authenticated;
grant update (enabled) on table public.listing_sources to authenticated;
grant all on table public.listing_sources to service_role;

drop policy if exists listing_sources_select on public.listing_sources;
create policy listing_sources_select on public.listing_sources
  for select to authenticated
  using (contributor_id = (select auth.uid()) or public.is_admin());

drop policy if exists listing_sources_insert on public.listing_sources;
create policy listing_sources_insert on public.listing_sources
  for insert to authenticated
  with check (
    contributor_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'contributor' and p.contributor_status = 'approved'
    )
  );

drop policy if exists listing_sources_update on public.listing_sources;
create policy listing_sources_update on public.listing_sources
  for update to authenticated
  using (contributor_id = (select auth.uid()) or public.is_admin())
  with check (contributor_id = (select auth.uid()) or public.is_admin());

drop policy if exists listing_sources_delete on public.listing_sources;
create policy listing_sources_delete on public.listing_sources
  for delete to authenticated
  using (contributor_id = (select auth.uid()) or public.is_admin());

-- ── 4. listing_suggestions: the owner's inbox ────────────────────────────────

create table if not exists public.listing_suggestions (
  id             uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.profiles (id) on delete cascade,
  source_id      uuid references public.listing_sources (id) on delete set null,
  kind           text not null check (kind in ('event', 'news', 'profile')),
  payload        jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16384),
  source_url     text check (source_url is null or (source_url ~ '^https://' and length(source_url) <= 500)),
  fingerprint    text not null check (length(fingerprint) = 64),
  status         text not null default 'pending'
                   check (status in ('pending', 'published', 'auto_published', 'dismissed', 'superseded')),
  -- The event / news post a suggestion became (NULL for a profile update).
  published_ref  uuid,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references public.profiles (id) on delete set null,
  -- The same item posted on two different days is ONE row.
  unique (contributor_id, fingerprint)
);

create index if not exists listing_suggestions_inbox_idx
  on public.listing_suggestions (contributor_id, status, created_at desc);
create index if not exists listing_suggestions_source_idx
  on public.listing_suggestions (source_id) where source_id is not null;
create index if not exists listing_suggestions_decided_by_idx
  on public.listing_suggestions (decided_by) where decided_by is not null;

comment on table public.listing_suggestions is
  'Updates read from a Contributor''s public sources, waiting for their decision (mig 181). Inserted only by service_role (POST /api/automation/suggestions); decided through decide_listing_suggestion().';

alter table public.listing_suggestions enable row level security;

revoke all on table public.listing_suggestions from public, anon;
revoke all on table public.listing_suggestions from authenticated;
-- Read only: every decision goes through the SECURITY DEFINER function below, so a
-- "publish" and the row it creates cannot drift apart.
grant select on table public.listing_suggestions to authenticated;
grant all on table public.listing_suggestions to service_role;

drop policy if exists listing_suggestions_select on public.listing_suggestions;
create policy listing_suggestions_select on public.listing_suggestions
  for select to authenticated
  using (contributor_id = (select auth.uid()) or public.is_admin());

-- ── 5. Losing the listing switches automation off and clears it ──────────────

create or replace function public.reset_automation_on_listing_loss()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if old.role = 'contributor' and new.role is distinct from 'contributor' then
    new.auto_update_level := 'off';
    new.auto_update_consent_at := null;
    new.auto_update_consent_source := null;
    new.auto_update_nudged_at := null;
    delete from public.listing_suggestions where contributor_id = new.id;
    delete from public.listing_sources where contributor_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.reset_automation_on_listing_loss() from public, anon, authenticated;

drop trigger if exists trg_profiles_reset_automation on public.profiles;
create trigger trg_profiles_reset_automation
  before update of role on public.profiles
  for each row
  execute function public.reset_automation_on_listing_loss();

-- ── 6. The owner's three calls ───────────────────────────────────────────────

-- Read the consent record (private columns, so not readable through the table).
create or replace function public.get_my_automation_settings()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_row record;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'reason', 'not_signed_in');
  end if;
  select auto_update_level, auto_update_consent_at, auto_update_consent_source
    into v_row
    from public.profiles
   where id = v_uid;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object(
    'success', true,
    'level', v_row.auto_update_level,
    'consent_at', v_row.auto_update_consent_at,
    'consent_source', v_row.auto_update_consent_source
  );
end;
$function$;

-- Change the level. Stamps the consent server-side (time + 'dashboard'). 'off' is
-- withdrawal: every source switches off and every pending suggestion is dismissed,
-- in this one transaction. Moving from off to on switches the READABLE sources on
-- (the owner has just chosen to let us read the sources they listed).
create or replace function public.set_my_automation_level(_level text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid     uuid := auth.uid();
  v_row     record;
  v_cleared int := 0;
  v_enabled int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'reason', 'not_signed_in');
  end if;
  if _level is null or _level not in ('off', 'suggest', 'events_auto') then
    return jsonb_build_object('success', false, 'reason', 'invalid_level');
  end if;

  select role, contributor_status, auto_update_level
    into v_row
    from public.profiles
   where id = v_uid
     for update;
  if not found or v_row.role is distinct from 'contributor' or v_row.contributor_status is distinct from 'approved' then
    return jsonb_build_object('success', false, 'reason', 'not_a_contributor');
  end if;
  if v_row.auto_update_level = _level then
    return jsonb_build_object('success', true, 'level', _level, 'unchanged', true);
  end if;

  update public.profiles
     set auto_update_level = _level,
         auto_update_consent_at = now(),
         auto_update_consent_source = 'dashboard'
   where id = v_uid;

  if _level = 'off' then
    update public.listing_sources set enabled = false where contributor_id = v_uid and enabled;
    update public.listing_suggestions
       set status = 'dismissed', decided_at = now(), decided_by = v_uid
     where contributor_id = v_uid and status = 'pending';
    get diagnostics v_cleared = row_count;
  elsif v_row.auto_update_level = 'off' then
    update public.listing_sources
       set enabled = true
     where contributor_id = v_uid and not enabled and kind in ('website', 'youtube', 'calendar');
    get diagnostics v_enabled = row_count;
  end if;

  return jsonb_build_object('success', true, 'level', _level, 'cleared', v_cleared, 'sources_enabled', v_enabled);
end;
$function$;

-- Decide one of the owner's suggestions.
--   dismiss    pending -> dismissed
--   published  pending -> published; _ref is the event / news post the owner just
--              created from it (verified to be theirs); NULL for a profile update
--   unpublish  auto_published -> dismissed, and the event it created is cancelled
create or replace function public.decide_listing_suggestion(_id uuid, _action text, _ref uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_s   record;
  v_n   int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'reason', 'not_signed_in');
  end if;
  if _action is null or _action not in ('dismiss', 'published', 'unpublish') then
    return jsonb_build_object('success', false, 'reason', 'invalid_action');
  end if;

  select id, kind, status, published_ref
    into v_s
    from public.listing_suggestions
   where id = _id and contributor_id = v_uid
     for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if _action = 'dismiss' then
    if v_s.status <> 'pending' then
      return jsonb_build_object('success', false, 'reason', 'not_pending');
    end if;
    update public.listing_suggestions
       set status = 'dismissed', decided_at = now(), decided_by = v_uid
     where id = _id;
    return jsonb_build_object('success', true, 'status', 'dismissed');
  end if;

  if _action = 'published' then
    if v_s.status <> 'pending' then
      return jsonb_build_object('success', false, 'reason', 'not_pending');
    end if;
    if v_s.kind = 'event' then
      if _ref is null or not exists (select 1 from public.events where id = _ref and created_by = v_uid) then
        return jsonb_build_object('success', false, 'reason', 'ref_not_yours');
      end if;
    elsif v_s.kind = 'news' then
      if _ref is null or not exists (select 1 from public.news_posts where id = _ref and contributor_id = v_uid) then
        return jsonb_build_object('success', false, 'reason', 'ref_not_yours');
      end if;
    elsif _ref is not null then
      return jsonb_build_object('success', false, 'reason', 'ref_not_allowed');
    end if;
    update public.listing_suggestions
       set status = 'published', published_ref = _ref, decided_at = now(), decided_by = v_uid
     where id = _id;
    return jsonb_build_object('success', true, 'status', 'published');
  end if;

  -- unpublish
  if v_s.status <> 'auto_published' or v_s.kind <> 'event' or v_s.published_ref is null then
    return jsonb_build_object('success', false, 'reason', 'not_auto_published');
  end if;
  update public.events
     set status = 'cancelled'
   where id = v_s.published_ref and created_by = v_uid and status = 'published';
  get diagnostics v_n = row_count;
  update public.listing_suggestions
     set status = 'dismissed', decided_at = now(), decided_by = v_uid
   where id = _id;
  return jsonb_build_object('success', true, 'status', 'dismissed', 'event_cancelled', v_n > 0);
end;
$function$;

revoke all on function public.get_my_automation_settings() from public, anon;
revoke all on function public.set_my_automation_level(text) from public, anon;
revoke all on function public.decide_listing_suggestion(uuid, text, uuid) from public, anon;
grant execute on function public.get_my_automation_settings() to authenticated;
grant execute on function public.set_my_automation_level(text) to authenticated;
grant execute on function public.decide_listing_suggestion(uuid, text, uuid) to authenticated;

comment on function public.set_my_automation_level(text) is
  'Mig 181: the owner changes their automation level; consent is stamped server-side; off = instant withdrawal (sources off, pending dismissed). Authenticated EXECUTE is by design (auth.uid() guard inside).';
comment on function public.decide_listing_suggestion(uuid, text, uuid) is
  'Mig 181: the owner dismisses, marks published (with the event/news ref they created) or unpublishes an auto-published event. Authenticated EXECUTE is by design (owner-scoped inside).';
comment on function public.get_my_automation_settings() is
  'Mig 181: the owner reads their private consent record. Authenticated EXECUTE is by design.';
