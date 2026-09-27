-- 175 — public.profiles: server-owned columns guard + write-grant tightening.
--
-- The finding (companion to 176, verified live 2026-09-26)
-- --------------------------------------------------------
-- authenticated holds table-level UPDATE on profiles and RLS lets a user
-- update their OWN row. protect_role_column() only polices role and
-- contributor_status, so straight through the public REST API a user could:
--   * set billing_tier (bill themselves as a paid tier) or rewrite
--     billing_trial_started_at (restart the trial);
--   * clear contributor_hidden / deleted_at (undo admin moderation);
--   * clear force_reauth_at (dodge an admin-forced re-login);
--   * raise community_contributor_score, clear needs_re_review;
--   * rewrite email (desync from auth.users) or the claim columns;
--   * change contributor_kind without the admin-reviewed type-change flow;
--   * change contributor_slug with no format check and no 30-day cooldown
--     (the cooldown lived only in /api/contributor/[handle]/slug).
--
-- The fix
-- -------
-- A new BEFORE UPDATE trigger that only polices RAW API callers: the
-- statement runs as anon/authenticated AND the caller is not an admin.
-- Trusted writers pass untouched:
--   * service_role (server routes via createAdminClient, edge functions);
--   * SECURITY DEFINER bodies — current_user there is the function owner
--     (postgres), so claim / self-approve / tally / admin RPCs keep working;
--   * admins (is_admin()), who legitimately edit any column.
-- The function is SECURITY INVOKER on purpose: current_user must be the
-- caller's role, which a SECURITY DEFINER trigger would hide.
--
-- Trigger order: BEFORE triggers fire alphabetically. The name
-- trg_guard_profile_server_columns sorts AFTER protect_role_on_update and
-- trg_enforce_one_admin_update (neither changes NEW) and BEFORE
-- trg_profiles_role_change_side_effects (sets force_reauth_at /
-- bio_setup_required on a role change) and
-- trg_stamp_billing_trial_on_approval (sets billing_trial_started_at), so
-- values those triggers set legitimately are never mistaken for user input.
--
-- Deliberately NOT touched: protect_role_column() (last rewritten by 173
-- with its service_role carve-out). This is a separate function + trigger,
-- so the two guards stay independent. 173's intake / claim RPCs are
-- SECURITY DEFINER and its intake route uses service_role — both pass.
--
-- Also: INSERT is revoked from anon + authenticated (every profile row is
-- created by handle_new_user(), a SECURITY DEFINER trigger on auth.users;
-- no client inserts one), and anon loses UPDATE/DELETE it could never use
-- under RLS anyway. The now-unusable "Users can insert own profile" policy
-- is dropped so the policy list stays honest.

-- ── 1. Write grants ───────────────────────────────────────────────────
revoke insert, update, delete on table public.profiles from anon;
revoke insert on table public.profiles from authenticated;
drop policy if exists "Users can insert own profile" on public.profiles;

-- ── 2. Guard function ─────────────────────────────────────────────────
create or replace function public.guard_profile_server_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Columns only the server (service_role, SECURITY DEFINER flows, admins)
  -- may change. role / contributor_status are policed by
  -- protect_role_column(); contributor_slug / handle_changed_at below.
  server_owned constant text[] := array[
    'email',
    'created_at',
    'deleted_at',
    'billing_tier',
    'billing_trial_started_at',
    'contributor_hidden',
    'needs_re_review',
    'community_contributor_score',
    'force_reauth_at',
    'contributor_kind',
    'contributor_claim_email',
    'contributor_claimed_at',
    'contributor_created_by_admin'
  ];
  new_row jsonb;
  old_row jsonb;
  col text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  new_row := to_jsonb(new);
  old_row := to_jsonb(old);
  foreach col in array server_owned loop
    if (new_row -> col) is distinct from (old_row -> col) then
      raise exception 'profiles.% is managed by the server', col
        using errcode = '42501';
    end if;
  end loop;

  -- Handle (contributor_slug): the owner may change it once every 30 days,
  -- to a well-formed slug, and only while they are a Contributor. Same
  -- format as admin_change_contributor_slug() and the slug route's SLUG_RE.
  -- handle_changed_at is always stamped here, never taken from the client.
  if new.contributor_slug is distinct from old.contributor_slug then
    if old.role is distinct from 'contributor' then
      raise exception 'only Contributors have a handle'
        using errcode = '42501';
    end if;
    if new.contributor_slug is null
       or new.contributor_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' then
      raise exception 'invalid_slug_format'
        using errcode = '22023';
    end if;
    if old.handle_changed_at is not null
       and old.handle_changed_at > now() - interval '30 days' then
      raise exception 'handle can only be changed once every 30 days'
        using errcode = 'P0001';
    end if;
    new.handle_changed_at := now();
  elsif new.handle_changed_at is distinct from old.handle_changed_at then
    raise exception 'profiles.handle_changed_at is managed by the server'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_profile_server_columns() is
  'BEFORE UPDATE guard on public.profiles (mig 175): raw anon/authenticated non-admin callers cannot change server-owned columns, and handle changes get a DB-enforced format + 30-day cooldown. service_role, SECURITY DEFINER bodies and admins pass.';

-- Trigger functions need no role grant (they fire as part of the statement).
revoke all on function public.guard_profile_server_columns() from public, anon, authenticated;

drop trigger if exists trg_guard_profile_server_columns on public.profiles;
create trigger trg_guard_profile_server_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_server_columns();
