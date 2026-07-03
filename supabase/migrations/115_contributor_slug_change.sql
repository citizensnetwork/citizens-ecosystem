-- Migration 115: Contributor slug change — admin override RPC
-- =====================================================================
-- Stage K of contributor-dashboard plan:
--   • Owner can change their `contributor_slug` once per 30 days (enforced
--     in the API layer at /api/contributor/[handle]/slug PATCH).
--   • Admins may override the cooldown via a SECURITY DEFINER RPC; the
--     override writes an `admin_actions` audit row AND an `activity_log`
--     entry attributed to the admin acting on behalf of the contributor.
--
-- DB-level invariants already in place from earlier migrations:
--   • `profiles_contributor_slug_key` partial unique index (migration 036)
--     blocks slug collisions even if two requests race.
--   • `profiles.handle_changed_at` column (migration 100) is the cooldown
--     timestamp.
--
-- Format validation (regex `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$`) lives
-- in the API layer to match existing patterns (e.g. tag slug, category
-- slug). Both paths normalise to lowercase before write.

CREATE OR REPLACE FUNCTION public.admin_change_contributor_slug(
  p_contributor_id uuid,
  p_new_slug       text,
  p_reason         text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_admin_role text;
  v_old_slug   text;
  v_new_slug   text := lower(trim(p_new_slug));
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Caller must be an admin. We check the role server-side so the RPC
  -- cannot be tricked into bypassing cooldown via SECURITY DEFINER alone.
  SELECT role INTO v_admin_role
  FROM public.profiles
  WHERE id = v_admin_id;

  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;

  -- Slug format guard. The API layer also validates, but enforcing here
  -- means a compromised admin session cannot inject arbitrary strings.
  IF v_new_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'invalid_slug_format' USING ERRCODE = '22023';
  END IF;

  -- Capture the prior slug for the audit row.
  SELECT contributor_slug INTO v_old_slug
  FROM public.profiles
  WHERE id = p_contributor_id;

  IF v_old_slug IS NULL THEN
    -- Either the row does not exist OR this profile was never a contributor;
    -- both are caller errors.
    RAISE EXCEPTION 'contributor_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_slug = v_new_slug THEN
    RAISE EXCEPTION 'slug_unchanged' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET contributor_slug   = v_new_slug,
         handle_changed_at  = now()
   WHERE id = p_contributor_id;

  -- Admin audit (admin_actions is the canonical admin trail).
  -- Schema (migration 043): actor_id uuid, action text(1..64),
  -- target_type text, target_id text, metadata jsonb.
  INSERT INTO public.admin_actions (
    actor_id, action, target_type, target_id, metadata
  ) VALUES (
    v_admin_id,
    'contributor_slug_override',
    'profiles',
    p_contributor_id::text,
    jsonb_build_object(
      'old_slug', v_old_slug,
      'new_slug', v_new_slug,
      'reason',   coalesce(p_reason, '')
    )
  );

  -- activity_log mirror so the contributor sees the change in their own
  -- dashboard history (admin-on-behalf attribution).
  -- entity_id is text in activity_log; cast the uuid.
  INSERT INTO public.activity_log (
    contributor_id, actor_id, actor_role, action, entity_type, entity_id, metadata
  ) VALUES (
    p_contributor_id,
    v_admin_id,
    'admin',
    'contributor_slug_override',
    'profiles',
    p_contributor_id::text,
    jsonb_build_object(
      'old_slug',     v_old_slug,
      'new_slug',     v_new_slug,
      'reason',       coalesce(p_reason, ''),
      'on_behalf_of', p_contributor_id
    )
  );

  RETURN v_new_slug;
EXCEPTION
  WHEN unique_violation THEN
    -- profiles_contributor_slug_key collision — surface a clean error
    -- so the API layer can translate to 409.
    RAISE EXCEPTION 'slug_taken' USING ERRCODE = '23505';
END;
$$;

COMMENT ON FUNCTION public.admin_change_contributor_slug(uuid, text, text) IS
  'Stage K: admin-only override for the contributor slug cooldown. Writes admin_actions + activity_log. Caller must be role=admin.';

REVOKE EXECUTE ON FUNCTION public.admin_change_contributor_slug(uuid, text, text)
  FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.admin_change_contributor_slug(uuid, text, text)
  TO authenticated;
