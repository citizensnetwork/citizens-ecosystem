-- ════════════════════════════════════════════════════════════════════
--  194_admin_delete_citizen_account
--
--  NOT APPLIED. The owner applies this file after an explicit yes
--  (pre-apply tag, rollback-only probe
--  docs/audit/probes/194_admin_delete_citizen_account.probe.sql,
--  advisor 0 ERROR). Commit only. Do not apply from a pull request.
--
--  Admin → Citizens. Two functions, both SECURITY DEFINER with
--  search_path '' (every name schema-qualified) and an auth.uid()
--  admin guard at the top. A missing JWT or a non-admin raises
--  'not_admin' (errcode 42501) and changes nothing. EXECUTE is
--  revoked from public and anon and granted to authenticated only.
--  service_role has no auth.uid(), so it cannot call these either.
--
--  admin_list_citizens
--    Paged Citizen accounts for the Citizens tab. Search may match
--    a display name or an email, but the jsonb never contains an
--    email. Filters combine with AND: signed in (any/once/never),
--    joined (any/7d/30d/older), application (any/pending/rejected/none).
--
--  admin_delete_citizen_account
--    _apply false: read-only preflight (display name, counts, blockers).
--    _apply true: hard-delete the auth user after the typed display
--    name matches. Refuses the caller, any admin, any Contributor
--    listing (those stay on admin_remove_contributor_listing, mig 178),
--    Wear brand owners and Vision data. One admin_actions row in the
--    same transaction (actor, citizen_account_deleted, target id,
--    counts). The metadata stores no email and no name. A foreign key
--    that is not ON DELETE CASCADE aborts the whole change.
-- ════════════════════════════════════════════════════════════════════

begin;

create or replace function public.admin_list_citizens(
  _q text default null,
  _signed_in text default 'any',
  _joined text default 'any',
  _application text default 'any',
  _page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_page integer;
  v_size constant integer := 20;
  v_q text;
  v_total integer;
  v_rows jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  -- An explicit null is the same as omitting the argument (the default is 'any').
  _signed_in := coalesce(_signed_in, 'any');
  _joined := coalesce(_joined, 'any');
  _application := coalesce(_application, 'any');

  if _signed_in not in ('any', 'once', 'never')
     or _joined not in ('any', '7d', '30d', 'older')
     or _application not in ('any', 'pending', 'rejected', 'none') then
    return jsonb_build_object('success', false, 'reason', 'bad_filter');
  end if;

  v_page := least(greatest(coalesce(_page, 1), 1), 500);
  v_q := left(btrim(coalesce(_q, '')), 80);
  if v_q = '' then
    v_q := null;
  else
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  select count(*) into v_total
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.role = 'citizen'
     and p.deleted_at is null
     and (
       v_q is null
       or p.full_name ilike ('%' || v_q || '%') escape '\'
       or p.email ilike ('%' || v_q || '%') escape '\'
       or u.email ilike ('%' || v_q || '%') escape '\'
     )
     and (
       _signed_in = 'any'
       or (_signed_in = 'once' and u.last_sign_in_at is not null)
       or (_signed_in = 'never' and u.last_sign_in_at is null)
     )
     and (
       _joined = 'any'
       or (_joined = '7d' and p.created_at >= pg_catalog.now() - interval '7 days')
       or (_joined = '30d' and p.created_at >= pg_catalog.now() - interval '30 days')
       or (_joined = 'older' and p.created_at < pg_catalog.now() - interval '30 days')
     )
     and (
       _application = 'any'
       or (_application = 'pending' and p.contributor_status = 'pending')
       or (_application = 'rejected' and p.contributor_status = 'rejected')
       or (_application = 'none' and coalesce(p.contributor_status, 'not_applied') = 'not_applied')
     );

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'full_name', s.full_name,
           'avatar_url', s.avatar_url,
           'contributor_status', s.contributor_status,
           'created_at', s.created_at,
           'last_sign_in_at', s.last_sign_in_at
         ) order by s.created_at desc, s.id desc), '[]'::jsonb)
    into v_rows
    from (
      select p.id, p.full_name, p.avatar_url, p.contributor_status, p.created_at, u.last_sign_in_at
        from public.profiles p
        join auth.users u on u.id = p.id
       where p.role = 'citizen'
         and p.deleted_at is null
         and (
           v_q is null
           or p.full_name ilike ('%' || v_q || '%') escape '\'
           or p.email ilike ('%' || v_q || '%') escape '\'
           or u.email ilike ('%' || v_q || '%') escape '\'
         )
         and (
           _signed_in = 'any'
           or (_signed_in = 'once' and u.last_sign_in_at is not null)
           or (_signed_in = 'never' and u.last_sign_in_at is null)
         )
         and (
           _joined = 'any'
           or (_joined = '7d' and p.created_at >= pg_catalog.now() - interval '7 days')
           or (_joined = '30d' and p.created_at >= pg_catalog.now() - interval '30 days')
           or (_joined = 'older' and p.created_at < pg_catalog.now() - interval '30 days')
         )
         and (
           _application = 'any'
           or (_application = 'pending' and p.contributor_status = 'pending')
           or (_application = 'rejected' and p.contributor_status = 'rejected')
           or (_application = 'none' and coalesce(p.contributor_status, 'not_applied') = 'not_applied')
         )
       order by p.created_at desc, p.id desc
       offset (v_page - 1) * v_size
       limit v_size
    ) s;

  return jsonb_build_object(
    'success', true,
    'data', v_rows,
    'page', v_page,
    'page_size', v_size,
    'total', v_total
  );
end;
$function$;

revoke all on function public.admin_list_citizens(text, text, text, text, integer) from public, anon;
grant execute on function public.admin_list_citizens(text, text, text, text, integer) to authenticated;

comment on function public.admin_list_citizens(text, text, text, text, integer) is
  'Admin → Citizens list (mig 194). Citizens only, paged, filters combined with AND. Search may match email; the result never contains one. Raises not_admin unless auth.uid() is an admin.';

create or replace function public.admin_delete_citizen_account(
  _user_id uuid,
  _apply boolean default false,
  _confirm text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_row record;
  v_blockers text[] := '{}';
  v_follows integer;
  v_place_follows integer;
  v_saves integer;
  v_rsvps integer;
  v_comments integer;
  v_moments integer;
  v_messages integer;
  v_notifications integer;
  v_deleted integer;
  v_expected text;
  v_meta jsonb;
begin
  if v_caller is null or not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select id, role, full_name
    into v_row
    from public.profiles
   where id = _user_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if v_row.id = v_caller then
    return jsonb_build_object('success', false, 'reason', 'cannot_delete_self');
  end if;
  if v_row.role = 'admin' then
    return jsonb_build_object('success', false, 'reason', 'target_is_admin');
  end if;
  if v_row.role is distinct from 'citizen' then
    return jsonb_build_object('success', false, 'reason', 'not_a_citizen');
  end if;

  select count(*) into v_follows from public.follows where follower_id = _user_id or followee_id = _user_id;
  select count(*) into v_place_follows from public.place_follows where user_id = _user_id;
  select count(*) into v_saves from public.saved_items where user_id = _user_id;
  select count(*) into v_rsvps from public.rsvps where user_id = _user_id;
  select count(*) into v_comments from public.comments where user_id = _user_id;
  select count(*) into v_moments from public.moments where contributor_id = _user_id;
  select count(*) into v_messages from public.messages where sender_id = _user_id;
  select count(*) into v_notifications from public.notifications where user_id = _user_id;

  if exists (select 1 from wear.brands where owner_user_id = _user_id) then
    v_blockers := array_append(v_blockers, 'owns_wear_brand'::text);
  end if;
  if exists (select 1 from vision.organisations where created_by = _user_id) then
    v_blockers := array_append(v_blockers, 'created_vision_organisation'::text);
  end if;
  if exists (select 1 from vision.activities where created_by = _user_id)
     or exists (select 1 from vision.goals where created_by = _user_id)
     or exists (select 1 from vision.projects where created_by = _user_id)
     or exists (select 1 from vision.cc_event_claims where claimed_by = _user_id)
     or exists (select 1 from vision.cc_place_claims where claimed_by = _user_id)
     or exists (select 1 from vision.org_partnerships where initiated_by = _user_id or responded_by = _user_id)
  then
    v_blockers := array_append(v_blockers, 'has_vision_activity'::text);
  end if;

  if not coalesce(_apply, false) then
    return jsonb_build_object(
      'success', true,
      'name', v_row.full_name,
      'follows', v_follows,
      'place_follows', v_place_follows,
      'saves', v_saves,
      'rsvps', v_rsvps,
      'comments', v_comments,
      'moments', v_moments,
      'messages', v_messages,
      'notifications', v_notifications,
      'blockers', to_jsonb(v_blockers)
    );
  end if;

  if cardinality(v_blockers) > 0 then
    return jsonb_build_object('success', false, 'reason', 'blocked', 'blockers', to_jsonb(v_blockers));
  end if;

  v_expected := lower(btrim(regexp_replace(coalesce(nullif(btrim(v_row.full_name), ''), 'delete'), '\s+', ' ', 'g')));
  if lower(btrim(regexp_replace(coalesce(_confirm, ''), '\s+', ' ', 'g'))) is distinct from v_expected then
    return jsonb_build_object('success', false, 'reason', 'name_mismatch');
  end if;

  perform 1 from public.profiles where id = _user_id for update;

  -- Re-read under the lock. A role change between the check and the delete must not slip through.
  select id, role into v_row from public.profiles where id = _user_id;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;
  if v_row.id = v_caller then
    return jsonb_build_object('success', false, 'reason', 'cannot_delete_self');
  end if;
  if v_row.role = 'admin' then
    return jsonb_build_object('success', false, 'reason', 'target_is_admin');
  end if;
  if v_row.role is distinct from 'citizen' then
    return jsonb_build_object('success', false, 'reason', 'not_a_citizen');
  end if;

  v_meta := jsonb_build_object(
    'follows', v_follows,
    'place_follows', v_place_follows,
    'saves', v_saves,
    'rsvps', v_rsvps,
    'comments', v_comments,
    'moments', v_moments,
    'messages', v_messages,
    'notifications', v_notifications
  );

  begin
    -- Their words must not remain with a null sender (messages.sender_id is ON DELETE SET NULL).
    delete from public.messages where sender_id = _user_id;
    delete from auth.users where id = _user_id;
    get diagnostics v_deleted = row_count;
  exception when foreign_key_violation then
    return jsonb_build_object('success', false, 'reason', 'blocked_by_related_data');
  end;

  if v_deleted = 0 then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  insert into public.admin_actions (actor_id, action, target_type, target_id, metadata)
  values (v_caller, 'citizen_account_deleted', 'profile', _user_id::text, v_meta);

  return jsonb_build_object('success', true, 'outcome', 'deleted') || v_meta;
end;
$function$;

revoke all on function public.admin_delete_citizen_account(uuid, boolean, text) from public, anon;
grant execute on function public.admin_delete_citizen_account(uuid, boolean, text) to authenticated;

comment on function public.admin_delete_citizen_account(uuid, boolean, text) is
  'Admin → Citizens "Delete account" (mig 194). _apply=false: preflight {name, counts, blockers}, no email. _apply=true (+ _confirm = display name): hard-delete the auth user. Refuses self, admins, Contributor listings, Wear brand owners and Vision data. One admin_actions row in the same transaction, with counts only. Raises not_admin unless auth.uid() is an admin.';

commit;

-- ── ROLLBACK (NOT APPLIED until the owner says yes)
-- begin;
-- drop function if exists public.admin_delete_citizen_account(uuid, boolean, text);
-- drop function if exists public.admin_list_citizens(text, text, text, text, integer);
-- commit;
