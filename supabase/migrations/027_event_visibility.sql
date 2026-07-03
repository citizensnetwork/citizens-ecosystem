-- Add visibility column to events (public/private)
-- Private events are only visible to the creator and invited/RSVPed users.

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'visibility'
  ) then
    alter table public.events
      add column visibility text not null default 'public'
      check (visibility in ('public', 'private'));
  end if;
end $$;

-- Index for efficient filtering of public events
create index if not exists events_visibility_idx on public.events(visibility);
