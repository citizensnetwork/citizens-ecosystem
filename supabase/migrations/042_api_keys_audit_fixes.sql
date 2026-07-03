-- Migration 042: Phase C (API keys) audit fixes
-- ============================================================
-- Addresses Architect findings H1, M1, M2, L3 from the 041 review:
--   H1 — pgcrypto lives in the `extensions` schema on Supabase, so
--        `set search_path = public` causes `digest()` /
--        `gen_random_bytes()` resolution to fail at first invocation.
--        All three crypto-touching RPCs re-declared with
--        `search_path = public, extensions`.
--   M1 — Keys kept working after a contributor's status was downgraded
--        out of `approved`. `resolve_api_key` now joins `profiles` and
--        returns null unless the owner is still an active admin OR an
--        approved contributor.
--   M2 — Hot write on every request. `last_used_at` only bumped when
--        the current value is NULL or older than 60 seconds.
--   L3 — `revoke_api_key` differentiated "not yours" from "not found".
--        Both paths now return false without raising.
-- ============================================================

-- Rewrite create_api_key with the correct search_path.
create or replace function public.create_api_key(
  p_owner_id uuid,
  p_name text,
  p_rate_limit_per_minute int default null,
  p_scopes text[] default array['read:public']::text[]
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  if v_caller <> p_owner_id and not public.is_admin() then
    raise exception 'Not authorised' using errcode = 'P0001';
  end if;
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

  v_raw := 'cck_live_' || translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  v_hash := encode(extensions.digest(v_raw, 'sha256'), 'hex');
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

-- revoke_api_key: no longer leaks row existence via error differentiation
-- (L3). Returns false when the key is missing OR not owned by the caller.
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
    return false;
  end if;
  if v_caller <> v_owner and not public.is_admin() then
    -- Indistinguishable from "not found".
    return false;
  end if;
  update public.api_keys
     set disabled_at = coalesce(disabled_at, now())
   where id = p_key_id;
  return true;
end
$$;

-- resolve_api_key:
--  - qualifies pgcrypto with `extensions.` (H1),
--  - joins profiles so downgraded contributors lose key access (M1),
--  - only writes `last_used_at` at most once per minute per key (M2),
--  - caps raw key length at 200 chars (N5 / DoS hardening).
create or replace function public.resolve_api_key(p_raw_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_row record;
begin
  if p_raw_key is null
     or length(p_raw_key) < 20
     or length(p_raw_key) > 200 then
    return null;
  end if;
  v_hash := encode(extensions.digest(p_raw_key, 'sha256'), 'hex');

  -- Join profiles so a contributor whose status is revoked / set back to
  -- pending loses access without us having to run a trigger over every
  -- status transition.
  select k.id, k.owner_id, k.scopes, k.rate_limit_per_minute, k.disabled_at,
         k.last_used_at, p.role, p.contributor_status
    into v_row
    from public.api_keys k
    join public.profiles p on p.id = k.owner_id
   where k.key_hash = v_hash
   limit 1;

  if v_row.id is null
     or v_row.disabled_at is not null
     or not (
       v_row.role = 'admin'
       or (v_row.role = 'contributor' and v_row.contributor_status = 'approved')
     ) then
    return null;
  end if;

  -- Only bump last_used_at at most once per minute per key to avoid
  -- WAL / bloat pressure under heavy polling (Architect M2).
  if v_row.last_used_at is null
     or v_row.last_used_at < now() - interval '60 seconds' then
    update public.api_keys
       set last_used_at = now()
     where id = v_row.id;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'scopes', v_row.scopes,
    'rate_limit_per_minute', v_row.rate_limit_per_minute
  );
end
$$;

revoke all on function public.create_api_key(uuid, text, int, text[]) from public;
grant execute on function public.create_api_key(uuid, text, int, text[]) to authenticated;
revoke all on function public.revoke_api_key(uuid) from public;
grant execute on function public.revoke_api_key(uuid) to authenticated;
revoke all on function public.resolve_api_key(text) from public;
grant execute on function public.resolve_api_key(text) to authenticated, anon;
