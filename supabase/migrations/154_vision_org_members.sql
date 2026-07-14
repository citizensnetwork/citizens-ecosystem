-- 154_vision_org_members.sql
-- Vision Phase A, Team screen (VISION_BACKEND_WIRING_SPEC §3.11): the org member
-- roster reader. This is the last editable screen of wiring-spec item (a). It was
-- deferred in increment 4 (RESUME §3T) BY DESIGN: GET /api/orgs/[orgId]/members
-- returns vision.user_org_roles + departments(name) but NO member display names
-- (names live in public.profiles, a DIFFERENT schema, never joined), and a nameless
-- live team list would render WORSE than the demo's named list (VISION.md litmus #3
-- — the small are honoured; the roster is where people are seen). The fix is a
-- SECURITY DEFINER reader that joins public.profiles for DISPLAY-SAFE identity only.
--
-- Contract (identical class to the mig-148 / mig-151 / mig-153 readers):
--   * SECURITY DEFINER, search_path = vision, public, pg_catalog.
--   * Take the VISION org id; gate is_org_member OR is_platform_admin (42501 when
--     neither) — any member may see who is on their team, admins mutate via the
--     RLS-gated PATCH/DELETE on user_org_roles (unchanged; this fn is read-only).
--   * EXECUTE granted to authenticated + service_role (the members GET calls it with
--     the caller's JWT so the membership gate resolves via auth.uid()). anon/public
--     revoked. Same intentional authenticated-SECDEF class as the mig-148/151/153
--     readers: this adds ONE by-design advisor WARN (org_members) → baseline 83→84.
--     Document, do not re-flag.
--
-- DISPLAY-SAFE COLUMNS ONLY (SHARED_DB_CONTRACT R2). Because the function runs as
-- its owner it bypasses RLS on public.profiles, so it MUST hand-pick columns and
-- NEVER select public.profiles.email or any other PII. full_name + avatar_url are
-- already public display identity (profiles RLS is using(true) — Connect migrations
-- 063/065 — and Connect's own /api/v1/profiles/[id] exposes exactly these two), so
-- this adds NO new exposure surface. `id` is the user_org_roles ROW id (not the
-- person) — the frontend keys role-change PATCH / remove DELETE on it, so it must be
-- returned. department_id/title/is_founder are org-internal metadata, not PII.
--
-- Returns ONE ROW PER MEMBERSHIP (a user_org_roles row for this org), created-order
-- (matches the existing members GET ordering). full_name / avatar_url stay NULL when
-- a profile row is missing (LEFT JOIN) — the frontend degrades a null name to a
-- neutral placeholder + initial, never a fabricated identity.

create or replace function vision.org_members(p_org_id uuid)
returns table (
  id              uuid,
  user_id         uuid,
  full_name       text,
  avatar_url      text,
  role            text,
  department_id   uuid,
  department_name text,
  title           text,
  is_founder      boolean
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
begin
  if not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  return query
  select
    uor.id,
    uor.user_id,
    p.full_name,
    p.avatar_url,
    uor.role,
    uor.department_id,
    d.name,
    uor.title,
    uor.is_founder
  from vision.user_org_roles uor
  left join public.profiles p    on p.id = uor.user_id
  left join vision.departments d on d.id = uor.department_id
  where uor.org_id = p_org_id
  order by uor.created_at;
end;
$$;

revoke all on function vision.org_members(uuid) from public, anon;
grant execute on function vision.org_members(uuid) to authenticated, service_role;
