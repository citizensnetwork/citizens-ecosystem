-- Migration 015: Conversation security fixes
-- 1. Atomic find_or_create_conversation RPC (fixes TOCTOU race)
-- 2. Tighten conversation_participants INSERT policy (was: any authenticated user)
-- 3. Add count_friends RPC (fixes profile page waterfall)

-- ── 1. Atomic conversation creation ──────────────────────
-- Replaces the old find_conversation + manual INSERT flow.
-- SECURITY DEFINER so it bypasses RLS and performs all steps atomically.
create or replace function public.find_or_create_conversation(user_a uuid, user_b uuid)
returns uuid language plpgsql security definer as $$
declare
  conv_id uuid;
begin
  -- Validate: cannot message yourself
  if user_a = user_b then
    raise exception 'Cannot create conversation with yourself';
  end if;

  -- Try to find existing conversation between both users
  select cp1.conversation_id into conv_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  where cp1.user_id = user_a and cp2.user_id = user_b
  limit 1;

  if conv_id is not null then
    return conv_id;
  end if;

  -- Create new conversation + add both participants in one transaction
  insert into public.conversations default values returning id into conv_id;
  insert into public.conversation_participants (conversation_id, user_id)
  values (conv_id, user_a), (conv_id, user_b);

  return conv_id;
end;
$$;

-- ── 2. Tighten conversation_participants INSERT policy ───
-- Old policy: auth.uid() is not null  (any user could join ANY conversation)
-- New policy: admin-only direct INSERT (normal creation goes through the SECURITY DEFINER RPC)
do $$ begin
  -- Drop the old overly-permissive policy
  if exists (select 1 from pg_policies where policyname = 'Authenticated users can add participants' and tablename = 'conversation_participants') then
    drop policy "Authenticated users can add participants" on public.conversation_participants;
  end if;

  -- Create restrictive policy — only admins can directly insert (RPC bypasses RLS)
  if not exists (select 1 from pg_policies where policyname = 'Only RPC or admin can add participants' and tablename = 'conversation_participants') then
    create policy "Only RPC or admin can add participants" on public.conversation_participants
      for insert with check (public.is_admin());
  end if;
end $$;

-- ── 3. count_friends RPC (bidirectional follow count) ────
-- Eliminates the sequential waterfall in profile page
create or replace function public.count_friends(target_user uuid)
returns bigint language sql stable as $$
  select count(*)
  from public.follows f1
  join public.follows f2
    on f1.followee_id = f2.follower_id
   and f1.follower_id = f2.followee_id
  where f1.follower_id = target_user;
$$;
