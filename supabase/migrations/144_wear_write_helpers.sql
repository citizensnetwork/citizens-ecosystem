-- ============================================================================
-- 144_wear_write_helpers.sql — wear.* write-path helpers (Step 3, Inc B)
-- ============================================================================
-- Completes the wear.* schema (mig 143) for the SupabaseWearStore port. 143
-- shipped the READ-path SECURITY DEFINER helpers (is_conversation_member,
-- is_blocked_either) but not the WRITE-path helpers the store needs, because
-- three operations are structurally impossible under 143's RLS:
--
--   1. DM / group CREATION inserts the *other* participant's membership row,
--      but `conversation_members_self_write` only allows `auth.uid() = user_id`
--      (you may write your OWN membership, never someone else's). This is the
--      same wall Connect hit; it solved it with a SECURITY DEFINER
--      `find_or_create_conversation`. Mirror that here.
--   2. Bumping `wear.conversations.updated_at` when a message arrives — the
--      table has NO update policy (members read-only), so an ordinary member
--      cannot touch it. A SECURITY DEFINER AFTER-INSERT trigger on messages
--      does it as the table owner (bypasses RLS).
--   3. block() implies unfollow in BOTH directions, but `follows_self_write`
--      only lets you delete edges where `actor_id = auth.uid()` — you cannot
--      delete the blocked user's follow OF you. A SECURITY DEFINER AFTER-INSERT
--      trigger on blocks removes both edges authoritatively.
--
-- All three are additive, RLS-preserving (each RPC re-derives the actor from
-- auth.uid() internally — a caller cannot act as someone else), and mirror the
-- MemoryWearStore semantics exactly (the contract spec). No table/column
-- changes. Hardened empty search_path + schema-qualified throughout, matching
-- mig 143 style.
-- ============================================================================

-- ── 1. Direct (1:1) conversation: get-or-create ─────────────────────────────
-- Returns the canonical 1:1 conversation between the caller and p_other,
-- creating it (plus both membership rows) if absent. The recipient is
-- auto-accepted only if they already follow the caller; otherwise the thread
-- lands in their requests inbox. Self-DMs and mutually-blocked pairs are
-- rejected — byte-for-byte the MemoryWearStore.conversations.getOrCreateDirect
-- contract.
create or replace function wear.create_direct_conversation(p_other uuid)
returns wear.conversations
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_conv  wear.conversations;
  v_recipient_state wear.conversation_request_state;
  v_ts timestamptz := now();
begin
  if v_actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_other is null or p_other = v_actor then
    raise exception 'self_dm' using errcode = '22023';
  end if;
  if wear.is_blocked_either(v_actor, p_other) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Existing direct thread between exactly these two?
  select c.* into v_conv
  from wear.conversations c
  where c.kind = 'direct'
    and exists (select 1 from wear.conversation_members m
                where m.conversation_id = c.id and m.user_id = v_actor)
    and exists (select 1 from wear.conversation_members m
                where m.conversation_id = c.id and m.user_id = p_other)
    and (select count(*) from wear.conversation_members m
         where m.conversation_id = c.id) = 2
  limit 1;
  if found then
    return v_conv;
  end if;

  v_recipient_state := case
    when exists (select 1 from wear.follows f
                 where f.actor_id = p_other and f.target_id = v_actor)
    then 'accepted'::wear.conversation_request_state
    else 'requested'::wear.conversation_request_state
  end;

  insert into wear.conversations (kind, name, created_by, created_at, updated_at)
  values ('direct', null, v_actor, v_ts, v_ts)
  returning * into v_conv;

  insert into wear.conversation_members
    (conversation_id, user_id, joined_at, last_read_at, request_state, role)
  values
    (v_conv.id, v_actor,  v_ts, v_ts,  'accepted', 'owner'),
    (v_conv.id, p_other,  v_ts, null,  v_recipient_state, 'member');

  return v_conv;
end $$;
revoke all on function wear.create_direct_conversation(uuid) from public;
grant execute on function wear.create_direct_conversation(uuid) to authenticated, service_role;

-- ── 2. Group conversation: create ───────────────────────────────────────────
-- Creator = caller (auth.uid()). Members = distinct(creator + p_member_ids)
-- minus anyone in a mutual block with the creator. Requires ≥2 members. All
-- members are auto-accepted (group invites are not gated). Mirrors
-- MemoryWearStore.conversations.createGroup.
create or replace function wear.create_group_conversation(p_name text, p_member_ids uuid[])
returns wear.conversations
language plpgsql security definer set search_path = '' as $$
declare
  v_creator uuid := auth.uid();
  v_conv    wear.conversations;
  v_name    text := left(btrim(coalesce(p_name, '')), 80);
  v_ids     uuid[];
  v_id      uuid;
  v_ts      timestamptz := now();
begin
  if v_creator is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'empty_group_name' using errcode = '22023';
  end if;

  -- distinct(creator + members), drop mutual blocks with the creator.
  select array_agg(distinct id) into v_ids
  from (
    select unnest(array[v_creator] || coalesce(p_member_ids, '{}'::uuid[])) as id
  ) s
  where not wear.is_blocked_either(v_creator, s.id);

  if v_ids is null or array_length(v_ids, 1) < 2 then
    raise exception 'group_too_small' using errcode = '22023';
  end if;

  insert into wear.conversations (kind, name, created_by, created_at, updated_at)
  values ('group', v_name, v_creator, v_ts, v_ts)
  returning * into v_conv;

  foreach v_id in array v_ids loop
    insert into wear.conversation_members
      (conversation_id, user_id, joined_at, last_read_at, request_state, role)
    values (
      v_conv.id, v_id, v_ts,
      case when v_id = v_creator then v_ts else null end,
      'accepted',
      case when v_id = v_creator then 'owner' else 'member' end
    );
  end loop;

  return v_conv;
end $$;
revoke all on function wear.create_group_conversation(text, uuid[]) from public;
grant execute on function wear.create_group_conversation(text, uuid[]) to authenticated, service_role;

-- ── 3. Bump conversation.updated_at on a new message ────────────────────────
create or replace function wear.bump_conversation_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update wear.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end $$;
revoke all on function wear.bump_conversation_updated_at() from public;
create trigger trg_bump_conversation_updated_at
  after insert on wear.messages
  for each row execute function wear.bump_conversation_updated_at();

-- ── 4. Symmetric unfollow when a block is created ───────────────────────────
create or replace function wear.unfollow_on_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from wear.follows
  where (actor_id = new.actor_id and target_id = new.target_id)
     or (actor_id = new.target_id and target_id = new.actor_id);
  return new;
end $$;
revoke all on function wear.unfollow_on_block() from public;
create trigger trg_unfollow_on_block
  after insert on wear.blocks
  for each row execute function wear.unfollow_on_block();

-- ============================================================================
-- Post-apply: get_advisors(security) must stay 0 ERROR. The two new SECURITY
-- DEFINER RPCs will each add one authenticated_security_definer_function_
-- executable WARN (by design — internal auth.uid() guards; identical pattern
-- to mig 143's is_conversation_member / is_blocked_either). Trigger functions
-- are not directly executable (no role grant) so add no such WARN.
-- Smoke: two users can start a DM; recipient who doesn't follow lands in
-- 'requested'; sending a message bumps the thread; blocking drops both follows.
-- ============================================================================
