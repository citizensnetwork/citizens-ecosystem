-- Phase 15B: Consider system
-- Adds 'considering' status to RSVPs and considers table

-- Add status column to RSVPs to support 'attending' vs 'considering'
alter table public.rsvps
  add column if not exists status text not null default 'attending'
    check (status in ('attending', 'considering'));

-- Index for efficient consider-count queries
create index if not exists rsvps_status_idx on public.rsvps(status);

-- Track friends who joined a consider ("+1 John Doe")
create table if not exists public.consider_joins (
  id uuid default gen_random_uuid() primary key,
  rsvp_id uuid references public.rsvps(id) on delete cascade not null,
  joiner_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  unique(rsvp_id, joiner_id)
);

alter table public.consider_joins enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Consider joins visible to authenticated' and tablename = 'consider_joins') then
    create policy "Consider joins visible to authenticated" on public.consider_joins for select using (auth.uid() is not null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own consider joins' and tablename = 'consider_joins') then
    create policy "Users can insert own consider joins" on public.consider_joins for insert with check (auth.uid() = joiner_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own consider joins' and tablename = 'consider_joins') then
    create policy "Users can delete own consider joins" on public.consider_joins for delete using (auth.uid() = joiner_id);
  end if;
end $$;

-- RPC: Toggle consider status
create or replace function public.toggle_consider(
  p_user_id uuid,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_existing uuid;
begin
  select id into v_existing
  from public.rsvps
  where user_id = p_user_id and event_id = p_event_id;

  if v_existing is not null then
    -- Already has an RSVP — remove if considering, otherwise no-op
    delete from public.rsvps
    where id = v_existing and status = 'considering';
    return jsonb_build_object('success', true, 'action', 'removed');
  else
    -- Insert as considering
    insert into public.rsvps (user_id, event_id, status)
    values (p_user_id, p_event_id, 'considering');
    return jsonb_build_object('success', true, 'action', 'added');
  end if;
end;
$$;
