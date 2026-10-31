-- ════════════════════════════════════════════════════════════════════
--  198_edit_listing_suggestion: let the owner (or an active editor) change the text of a
--  listing suggestion that is still waiting, without publishing it.
--
--  NOT APPLIED. This file is a PROPOSAL in a draft pull request. It is applied only on the
--  founder's yes in chat naming this file, with a pre-apply git tag pushed first and the
--  security advisor checked afterwards (0 ERROR, no unexpected new finding). Number 198 is
--  the next free one after live head 197 (checked 2026-10-25); take the next free number
--  from a fresh `list_migrations` at apply time.
--
--  WHY. Since migration 181 the owner can only READ a suggestion (listing_suggestions has a
--  SELECT grant and nothing else), and every decision goes through decide_listing_suggestion().
--  "Edit" on a card therefore only changes what is published, never the stored suggestion, so
--  an owner who wants to fix a title today and publish tomorrow has to start again. This adds
--  the one missing write, in the same shape as the decision function.
--
--  WHAT IT ADDS: one function, public.edit_listing_suggestion(_id uuid, _payload jsonb).
--   * SECURITY DEFINER, search_path '', the `auth.uid() is null` guard first, EXECUTE revoked
--     from public and anon and granted to authenticated only (the same class as the existing
--     owner functions; the advisor lists it as one more by-design authenticated EXECUTE WARN).
--   * The caller is the suggestion's owner, or an active EDITOR of that listing (the rule
--     migration 193 gave decide_listing_suggestion). A stranger, an unknown id and a viewer
--     all get `not_found`, so the answer never confirms that an id exists.
--   * Only a PENDING suggestion can be edited (`not_pending` otherwise).
--   * It changes ONE column, `payload`. The row's fingerprint, kind, status, source and
--     timestamps are not touched. The fingerprint stays the identity of the SOURCE item, so the
--     Reader's next daily run still counts that item as "already known" (unique on
--     contributor_id + fingerprint) instead of filing the original again beside the edit.
--   * An editor's edit is written to activity_log (action `edit_suggestion`), like the editor
--     branch of decide_listing_suggestion.
--
--  WHAT IT DELIBERATELY DOES NOT DO. It does not check the CONTENT of the payload. Those rules
--  (allowed fields, https links, phone numbers and emails removed, date ranges, lengths) live in
--  one place, src/lib/automation/suggestions.ts `validateSuggestion`, and the PATCH route
--  /api/automation/suggestions/[id] runs the owner's edit through it before calling this
--  function. Copying those rules into SQL would be a second copy to keep in step. What the
--  database does enforce is what the table already enforced: a JSON object of at most 16 KB.
--  An owner who calls the function directly can therefore store text the route would have
--  cleaned, but only into their OWN waiting suggestion; publishing it still goes through the
--  events and news_posts policies and checks, so nothing reaches another person's data.
--
--  No new table, column, policy or grant on listing_suggestions. Still SELECT-only for
--  authenticated; still no client INSERT/UPDATE/DELETE.
-- ════════════════════════════════════════════════════════════════════

begin;

create or replace function public.edit_listing_suggestion(_id uuid, _payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_s      record;
  v_editor boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'reason', 'not_signed_in');
  end if;
  if _payload is null or jsonb_typeof(_payload) <> 'object' or pg_column_size(_payload) > 16384 then
    return jsonb_build_object('success', false, 'reason', 'invalid_payload');
  end if;

  select id, kind, status, contributor_id
    into v_s
    from public.listing_suggestions
   where id = _id
     for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_s.contributor_id = v_uid then
    v_editor := false;
  elsif public.is_active_team_member(v_s.contributor_id, array['editor']) then
    v_editor := true;
  else
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if v_s.status <> 'pending' then
    return jsonb_build_object('success', false, 'reason', 'not_pending');
  end if;

  update public.listing_suggestions
     set payload = _payload
   where id = _id;

  if v_editor then
    insert into public.activity_log (
      contributor_id, actor_id, actor_role, action, entity_type, entity_id, metadata
    ) values (
      v_s.contributor_id, v_uid, 'team_editor', 'edit_suggestion', 'listing_suggestion', _id::text,
      jsonb_build_object('kind', v_s.kind)
    );
  end if;

  return jsonb_build_object('success', true, 'status', 'pending');
end;
$$;

revoke all on function public.edit_listing_suggestion(uuid, jsonb) from public, anon;
grant execute on function public.edit_listing_suggestion(uuid, jsonb) to authenticated;

comment on function public.edit_listing_suggestion(uuid, jsonb) is
  'Mig 198: the owner, or an active editor of that listing, replaces the payload of a PENDING listing suggestion. Changes only payload (the fingerprint stays the source item''s identity, so the Reader still sees it as already known). Content rules live in lib/automation/suggestions.ts and are applied by PATCH /api/automation/suggestions/[id] before this is called. A stranger gets not_found. Authenticated EXECUTE is by design.';

commit;
