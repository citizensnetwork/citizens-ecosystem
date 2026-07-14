-- 152_vision_category_space_reader.sql
-- Vision space-mapping tranche, companion to mig 151 (VISION_BACKEND_WIRING_SPEC
-- §3.5a / §3.10): a SECURITY DEFINER reader for the current category→space
-- assignments, so the Configure Spaces mapping UI can PRE-FILL what is already
-- mapped for ANY org admin — not only the Connect link owner.
--
-- Why this is needed: vision.category_space_map's own RLS (mig 133) is
-- `auth.uid() = org_id`, where org_id is the Connect contributor id. Only the
-- link-owner account can therefore SELECT the mappings through the user client;
-- a non-owner org_admin would see every category as unmapped. mig 151's
-- set_category_space already lets any admin WRITE mappings (SECDEF, is_org_admin
-- gated); this is its read counterpart so the round-trip is symmetric.
--
-- Contract matches the mig-148/150/151 readers: SECDEF, is_org_member gate
-- (42501), resolves connect_contributor_id internally, EXECUTE authenticated +
-- service_role. Adds ONE by-design authenticated-SECDEF advisor WARN. Returns
-- (category_id, space_id) pairs — the frontend joins these onto the Connect
-- category list (fetched via /api/v1/categories). A single-select UI reads at
-- most one space per category, but the raw pairs are returned so a future
-- multi-space UI needs no DB change.

create or replace function vision.get_category_spaces(
  p_org_id uuid
) returns table (
  category_id uuid,
  space_id    uuid
)
language plpgsql stable security definer
set search_path = vision, public, pg_catalog
as $$
declare
  v_cc uuid;
begin
  if not (vision.is_org_member(p_org_id) or vision.is_platform_admin()) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select o.connect_contributor_id into v_cc
  from vision.organisations o
  where o.id = p_org_id;

  if v_cc is null then
    return; -- unlinked org has no Connect-category mappings
  end if;

  return query
  -- Only mappings whose target space still belongs to THIS vision org (a
  -- forged cross-org map row, keyed on the shared contributor id, is inert).
  select m.category_id, m.space_id
  from vision.category_space_map m
  join vision.spaces s on s.id = m.space_id and s.org_id = p_org_id
  where m.org_id = v_cc;
end;
$$;

revoke all on function vision.get_category_spaces(uuid) from public, anon;
grant execute on function vision.get_category_spaces(uuid) to authenticated, service_role;
