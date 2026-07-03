-- 128_broadcast_reactions.sql
--
-- Anonymous broadcast reactions.
--
-- Product decision (docs/feature-clarity/notifications.md, "Broadcast reactions"):
--   "Broadcast cards in event view should support anonymous reactions. Use
--    five fixed emoji options with visible counts beneath the lower edge of
--    the broadcast card; store reaction counts without exposing reacting user
--    identities in the UI."
--   "Anonymous broadcast reactions should be aggregated counts only in the UI;
--    avoid turning reactions into identity-bearing social pressure."
--
-- We therefore store ONLY an aggregate count per (broadcast, emoji). No user
-- id is recorded, so there is nothing to expose and no per-user dedup — by
-- design, reactions are a lightweight, identity-free "vibe" signal. Abuse is
-- bounded by the authenticated + rate-limited POST route, not by row identity.

create table if not exists public.broadcast_reactions (
  broadcast_id uuid    not null
                       references public.broadcast_messages(id) on delete cascade,
  emoji        text    not null
                       check (emoji in ('🙏', '❤️', '🎉', '🙌', '🔥')),
  count        integer not null default 0 check (count >= 0),
  primary key (broadcast_id, emoji)
);

comment on table public.broadcast_reactions is
  'Aggregate-only, identity-free reaction counts per broadcast message. No user id is stored. Five fixed emoji enforced by check constraint and increment_broadcast_reaction RPC.';

alter table public.broadcast_reactions enable row level security;

-- Counts are public: anyone who can see a broadcast can see its reaction
-- totals. There is no PII here (no user id), so a permissive SELECT is safe.
drop policy if exists "broadcast_reactions_select" on public.broadcast_reactions;
create policy "broadcast_reactions_select" on public.broadcast_reactions
  for select using (true);

-- No INSERT/UPDATE/DELETE policies: clients cannot write directly. All
-- mutations flow through the SECURITY DEFINER RPC below, which validates the
-- emoji and that the target broadcast exists and is not soft-deleted.

create or replace function public.increment_broadcast_reaction(
  p_broadcast_id uuid,
  p_emoji        text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_broadcast_id is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_emoji not in ('🙏', '❤️', '🎉', '🙌', '🔥') then
    raise exception 'invalid_emoji' using errcode = '22023';
  end if;

  -- Target broadcast must exist and be live (not soft-deleted).
  if not exists (
    select 1 from public.broadcast_messages
    where id = p_broadcast_id and deleted_at is null
  ) then
    raise exception 'broadcast_not_found' using errcode = 'P0002';
  end if;

  insert into public.broadcast_reactions (broadcast_id, emoji, count)
  values (p_broadcast_id, p_emoji, 1)
  on conflict (broadcast_id, emoji)
  do update set count = public.broadcast_reactions.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

revoke all on function public.increment_broadcast_reaction(uuid, text) from public, anon;
grant execute on function public.increment_broadcast_reaction(uuid, text) to authenticated;

comment on function public.increment_broadcast_reaction(uuid, text) is
  'Atomically increments the aggregate reaction count for (broadcast, emoji) and returns the new total. Identity-free: no user id is recorded. Validates emoji against the five fixed options and that the broadcast is live.';
