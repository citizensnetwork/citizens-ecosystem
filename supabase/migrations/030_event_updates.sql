-- Event Updates (Phase E)
-- Organisers post short updates for an event; all RSVPed + considering users
-- receive an in-app / push notification via the Supabase webhook + Edge Function.
-- Schema is idempotent and uses the same RLS patterns as events.

create table if not exists public.event_updates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists event_updates_event_created_idx
  on public.event_updates (event_id, created_at desc);

alter table public.event_updates enable row level security;

-- SELECT: anyone can read updates for events they can see. We keep this
-- permissive because event visibility (public/private) is enforced upstream
-- in the page/query layer the same way it is for comments.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_updates'
      and policyname = 'event_updates_select_all'
  ) then
    create policy event_updates_select_all on public.event_updates
      for select using (true);
  end if;
end $$;

-- INSERT: only the event creator OR an admin may post updates.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_updates'
      and policyname = 'event_updates_insert_creator'
  ) then
    create policy event_updates_insert_creator on public.event_updates
      for insert with check (
        auth.uid() = author_id
        and (
          exists (
            select 1 from public.events e
            where e.id = event_id and e.created_by = auth.uid()
          )
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
          )
        )
      );
  end if;
end $$;

-- DELETE: only the author or an admin.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_updates'
      and policyname = 'event_updates_delete_author_or_admin'
  ) then
    create policy event_updates_delete_author_or_admin on public.event_updates
      for delete using (
        auth.uid() = author_id
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;

comment on table public.event_updates is
  'Short organiser-authored updates for an event. New rows trigger notifications to RSVPed/considering users via Edge Function.';
