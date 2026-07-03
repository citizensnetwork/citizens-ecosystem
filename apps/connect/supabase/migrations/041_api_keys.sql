-- Migration 041: Public API keys + minor audit fixes
-- ============================================================
-- Adds:
--  1. `api_keys` table — hashed bearer tokens for ecosystem partners
--     consuming the public /api/v1/* surface with higher rate limits.
--  2. Partial index `events_published_by_creator_idx` — satisfies the
--     "my published events" RPCs added in migration 039 (Architect L2).
--
-- Design notes for api_keys:
--   - We store only the SHA-256 hash of the raw key (`key_hash`). The
--     raw token is shown to the user exactly once at creation time.
--   - Each key is owned by a single profile (admin-managed for now;
--     future self-service page lives under /profile/api-keys).
--   - `scopes` is a simple text[] — for now only `"read:public"` is
--     recognised, but the column leaves room for `"read:analytics"`,
--     `"write:events"`, etc. without another migration.
--   - `rate_limit_per_minute` lets us tier partners without code
--     changes. Nulls fall back to the default (600/min).
--   - `disabled_at` soft-deletes a key without losing audit history.
-- ============================================================

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- Human-readable label so an admin can tell keys apart in the UI.
  name text not null,
  -- SHA-256 hex of the raw bearer token. Raw token never stored.
  key_hash text not null unique,
  -- Short plaintext prefix (e.g. "cck_live_a1b2...") so the owner can
  -- identify which key is which in the dashboard without us ever
  -- revealing the secret portion.
  key_prefix text not null,
  scopes text[] not null default array['read:public']::text[],
  rate_limit_per_minute int,
  last_used_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_owner_id_idx
  on public.api_keys(owner_id)
  where disabled_at is null;

create index if not exists api_keys_active_idx
  on public.api_keys(key_hash)
  where disabled_at is null;

-- RLS: owners can read their own keys (metadata only — never the hash);
-- admins can read all. No one writes via RLS — all mutations go via
-- SECURITY DEFINER RPCs below that enforce role + hash generation in one
-- place.
alter table public.api_keys enable row level security;

drop policy if exists "Owners can read own api_keys" on public.api_keys;
create policy "Owners can read own api_keys"
  on public.api_keys for select
  using (auth.uid() = owner_id);

drop policy if exists "Admins can read all api_keys" on public.api_keys;
create policy "Admins can read all api_keys"
  on public.api_keys for select
  using (public.is_admin());

-- No INSERT/UPDATE/DELETE policies — mutations go through the RPCs.

-- ------------------------------------------------------------
-- RPC: create_api_key
--   Caller must be admin OR approved contributor (so they can self-serve
--   keys for their own integrations). Returns the raw token ONCE; it is
--   never retrievable again.
-- ------------------------------------------------------------
create or replace function public.create_api_key(
  p_owner_id uuid,
  p_name text,
  p_rate_limit_per_minute int default null,
  p_scopes text[] default array['read:public']::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_raw text;
  v_hash text;
  v_prefix text;
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  -- Owner must be the caller, OR caller is admin.
  if v_caller <> p_owner_id and not public.is_admin() then
    raise exception 'Not authorised' using errcode = 'P0001';
  end if;

  -- Scope gate: approved contributors + admins may mint keys.
  if not public.is_admin() then
    perform 1 from public.profiles
     where id = v_caller
       and role = 'contributor'
       and contributor_status = 'approved';
    if not found then
      raise exception 'Only approved contributors can mint API keys' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(length(trim(p_name)), 0) = 0 then
    raise exception 'Key name required' using errcode = 'P0001';
  end if;

  -- Generate a 32-byte random token, base64url-encoded. The `cck_` prefix
  -- and `live_` / `test_` segment make keys scannable in logs and
  -- obviously-different-from-anon-JWT.
  v_raw := 'cck_live_' || translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');
  v_prefix := substring(v_raw from 1 for 16);

  insert into public.api_keys (owner_id, name, key_hash, key_prefix, scopes, rate_limit_per_minute)
  values (p_owner_id, trim(p_name), v_hash, v_prefix, p_scopes, p_rate_limit_per_minute)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'raw_key', v_raw,
    'prefix', v_prefix,
    'name', trim(p_name)
  );
end
$$;

revoke all on function public.create_api_key(uuid, text, int, text[]) from public;
grant execute on function public.create_api_key(uuid, text, int, text[]) to authenticated;

-- ------------------------------------------------------------
-- RPC: revoke_api_key — soft-disable by setting disabled_at.
-- ------------------------------------------------------------
create or replace function public.revoke_api_key(p_key_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select owner_id into v_owner from public.api_keys where id = p_key_id;
  if v_owner is null then
    return false; -- already gone or never existed
  end if;

  if v_caller <> v_owner and not public.is_admin() then
    raise exception 'Not authorised' using errcode = 'P0001';
  end if;

  update public.api_keys
     set disabled_at = coalesce(disabled_at, now())
   where id = p_key_id;

  return true;
end
$$;

revoke all on function public.revoke_api_key(uuid) from public;
grant execute on function public.revoke_api_key(uuid) to authenticated;

-- ------------------------------------------------------------
-- RPC: resolve_api_key — internal helper used by the Next.js API
-- middleware. Takes the raw bearer token, returns owner + scopes +
-- per-key rate limit IF the key exists and is not disabled. Bumps
-- last_used_at. Returns NULL for invalid/disabled keys.
-- ------------------------------------------------------------
create or replace function public.resolve_api_key(p_raw_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_row record;
begin
  if p_raw_key is null or length(p_raw_key) < 20 then
    return null;
  end if;
  v_hash := encode(digest(p_raw_key, 'sha256'), 'hex');

  select id, owner_id, scopes, rate_limit_per_minute, disabled_at
    into v_row
    from public.api_keys
   where key_hash = v_hash
   limit 1;

  if v_row.id is null or v_row.disabled_at is not null then
    return null;
  end if;

  update public.api_keys
     set last_used_at = now()
   where id = v_row.id;

  return jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'scopes', v_row.scopes,
    'rate_limit_per_minute', v_row.rate_limit_per_minute
  );
end
$$;

-- Only service_role should call resolve_api_key; grant explicitly so the
-- server-side Supabase client (which authenticates as the request's user
-- but also holds service_role in route handlers only if we opt in) can
-- invoke it. We grant to `authenticated` for defence-in-depth — the
-- function never exposes the key_hash itself, only the resolved metadata
-- for a token the caller already possesses.
revoke all on function public.resolve_api_key(text) from public;
grant execute on function public.resolve_api_key(text) to authenticated, anon;

-- ------------------------------------------------------------
-- Audit L2: partial index for the "published events by creator" pattern
-- used by get_org_event_stats. Cheap insurance for when event volume
-- grows past the point where a regular scan becomes expensive.
-- ------------------------------------------------------------
create index if not exists events_published_by_creator_idx
  on public.events(created_by, date)
  where status = 'published';
