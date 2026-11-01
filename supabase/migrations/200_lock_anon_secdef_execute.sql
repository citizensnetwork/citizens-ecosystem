-- ════════════════════════════════════════════════════════════════════
--  200_lock_anon_secdef_execute
--
--  NOT APPLIED. The owner applies this file after an explicit yes
--  (pre-apply tag, rollback-only probe
--  docs/audit/probes/200_lock_anon_secdef_execute.probe.sql,
--  advisor diff: 0 ERROR, and the anon SECURITY DEFINER count drops
--  by the four functions locked below). Commit only. Do not apply
--  from a pull request.
--
--  199 is not this file. An open pull request reserved 199.
--
--  Issue #153: security-definer functions the anon role can execute.
--  A security-definer function runs as its owner and bypasses RLS, so
--  an anon EXECUTE grant is a public RPC on /rest/v1/rpc.
--
--  Every caller was checked (supabase.rpc, route handlers, policies,
--  triggers) before a grant was removed. Nine functions stay callable
--  by anon because a logged-out flow really calls them. Four do not.
--
--  KEPT for anon (logged-out flow):
--    caller_may_read_private_event(uuid)
--      events SELECT policy, evaluated on every logged-out read of
--      public.events (map and discovery). Already false when
--      auth.uid() is null. search_path is ''.
--    follower_count_public(uuid)
--      GET /api/v1/contributors/[slug] through the anon server client.
--    get_active_map_bubbles()
--      map bubbles in the logged-out frontend (store.jsx).
--    get_community_ideas()
--      ideas board in the logged-out frontend (store.jsx).
--    get_contributor_public_stats(uuid)
--      GET /api/v1/contributors/[slug]/stats through the anon server client.
--    get_public_contributor_analytics(uuid, integer)
--      GET /api/contributor/[handle]/analytics/public. getRouteAuth
--      uses the anon key when nobody is signed in.
--    get_search_autocomplete(text, integer)
--      GET /api/search/autocomplete, same anon key path.
--    wear.get_concept_proposal_tags(uuid)
--      Wear concept cards for a visitor who is not signed in.
--    is_admin()
--      Policies on public tables (events, news, moments, and others)
--      are for every role and call is_admin() while a logged-out
--      visitor reads them. A null uid is not an admin: the function
--      returns false, it does not raise (raising would break those
--      reads). The blanket PUBLIC grant is removed; anon, authenticated
--      and service_role are granted explicitly.
--
--  LOCKED (anon has no caller):
--    resolve_api_key(text)
--      Was granted to anon and authenticated. The only caller is
--      resolveApiKey(), now the service-role client. A direct anon
--      RPC could test guessed keys and read owner_id on a hit, and
--      it wrote last_used_at. Guard: return null unless the JWT role
--      is service_role (that role has a null auth.uid()).
--    is_conversation_participant(uuid, uuid)
--      Took any uid, so a caller could test membership for any person.
--      No route or frontend calls it. Signed-in messaging policies do:
--      the participants SELECT policy cannot query its own table
--      inline (that recurses), so it calls this function. Those four
--      policies were for every role; they are now for authenticated
--      only, so a logged-out read returns no rows and does not need
--      EXECUTE. The inbox loads through /api/conversations, which
--      returns 401 when nobody is signed in. Guard: false unless the
--      uid is auth.uid(), or the JWT role is service_role.
--    trending_events(integer)
--      No app, policy, or trigger caller. Returns exact RSVP counts.
--      PUBLIC grant removed. Owner only.
--    get_public_team(uuid)
--      No app caller. Team screens read team_memberships as the
--      signed-in member. Owner only.
--
--  search_path is '' on every function this file replaces. Names
--  inside those functions are schema-qualified. Expected advisor
--  delta: -4 anon_security_definer_function_executable
--  (resolve_api_key, is_conversation_participant, trending_events,
--  get_public_team) and -3 authenticated_security_definer_function_executable
--  (the same set except is_conversation_participant, which signed-in
--  policies still call). is_admin() stays an anon warning on purpose.
--  0 ERROR.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── is_admin: explicit null arm, empty search_path, no PUBLIC grant.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from public.profiles
       where id = (select auth.uid())
         and role = 'admin'
     );
$fn$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

comment on function public.is_admin() is
  'True only when auth.uid() is an admin profile. A null uid returns false so logged-out RLS can call it. anon EXECUTE stays: public policies on events, news, moments and other tables call this during logged-out reads (mig 200).';

-- ── resolve_api_key: service_role only.

create or replace function public.resolve_api_key(p_raw_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_hash text;
  v_row record;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') <> 'service_role' then
    return null;
  end if;

  if p_raw_key is null
     or length(p_raw_key) < 20
     or length(p_raw_key) > 200 then
    return null;
  end if;

  v_hash := encode(extensions.digest(p_raw_key, 'sha256'), 'hex');

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

  if v_row.last_used_at is null
     or v_row.last_used_at < pg_catalog.now() - interval '60 seconds' then
    update public.api_keys
       set last_used_at = pg_catalog.now()
     where id = v_row.id;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'scopes', v_row.scopes,
    'rate_limit_per_minute', v_row.rate_limit_per_minute
  );
end;
$fn$;

revoke all on function public.resolve_api_key(text) from public, anon, authenticated;
grant execute on function public.resolve_api_key(text) to service_role;

comment on function public.resolve_api_key(text) is
  'Hash a raw key and return its id, owner, scopes and limit, or null. service_role only (mig 200). Called from the server API-key gate. anon and authenticated cannot probe keys.';

-- ── is_conversation_participant: caller uid only, not a membership oracle.

create or replace function public.is_conversation_participant(conv_id uuid, uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $fn$
begin
  if auth.uid() is null or uid is distinct from auth.uid() then
    if coalesce(auth.role(), '') <> 'service_role' then
      return false;
    end if;
  end if;

  return exists (
    select 1
    from public.conversation_participants
    where conversation_id = conv_id
      and user_id = uid
  );
end;
$fn$;

revoke all on function public.is_conversation_participant(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated, service_role;

comment on function public.is_conversation_participant(uuid, uuid) is
  'True when uid is a member of conv_id. A signed-in caller may only ask about auth.uid(). service_role may pass a uid. anon cannot execute (mig 200).';

-- Policies that call the function were for every role. Logged-out reads
-- do not use these tables (the inbox route returns 401; realtime starts
-- after sign-in). Restricting the policies to authenticated means a
-- logged-out select returns no rows and does not need EXECUTE.
-- Expressions are unchanged. The participants SELECT policy must keep
-- calling this function: an inline self-query recurses.
alter policy "Participants can view conversations"
  on public.conversations
  to authenticated;

alter policy "Users see participants of their conversations"
  on public.conversation_participants
  to authenticated;

alter policy "Participants can view messages"
  on public.messages
  to authenticated;

alter policy "Participants can send messages"
  on public.messages
  to authenticated;

-- ── No caller. Owner only.

revoke all on function public.trending_events(integer) from public, anon, authenticated, service_role;
revoke all on function public.get_public_team(uuid) from public, anon, authenticated, service_role;

comment on function public.trending_events(integer) is
  'Exact RSVP counts for published upcoming events. No app caller. Owner only (mig 200).';

comment on function public.get_public_team(uuid) is
  'Name and avatar of a contributor team. No app caller. Owner only (mig 200).';

commit;

-- ── ROLLBACK (do not run as part of the apply) ──
-- Re-grant the roles this file removed. Restoring the old bodies is
-- required as well: the guards above stay in force after a re-grant,
-- so anon would still get null from resolve_api_key and false from
-- is_conversation_participant for any uid that is not auth.uid().
-- Previous bodies are migration 042 (resolve_api_key), the pre-200
-- is_admin (search_path public, exists on profiles.id = auth.uid()),
-- and the pre-200 is_conversation_participant (exists on
-- conversation_participants for the passed uid, search_path public).
--
-- grant execute on function public.resolve_api_key(text) to anon, authenticated;
-- grant execute on function public.is_conversation_participant(uuid, uuid) to public, anon;
-- grant execute on function public.trending_events(integer) to public, anon, authenticated, service_role;
-- grant execute on function public.get_public_team(uuid) to anon, authenticated, service_role;
-- grant execute on function public.is_admin() to public;
-- alter policy "Participants can view conversations" on public.conversations to public;
-- alter policy "Users see participants of their conversations" on public.conversation_participants to public;
-- alter policy "Participants can view messages" on public.messages to public;
-- alter policy "Participants can send messages" on public.messages to public;
