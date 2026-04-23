-- 056_tags_and_review_prompt.sql
--
-- Batch K:
--   * K1 — Event tag taxonomy + assignments (user-created + official).
--   * K3 — Extends notifications.type CHECK to include 'review_prompt'
--          so the post-event review nudge Edge Function has a valid
--          notification type.
--   * K4 — Admin hide flag on tags (moderation). Assignment rows
--          remain intact so we don't silently delete a user's
--          curation work; the UI simply filters hidden tags.
--
-- Idempotent: safe to re-run.

begin;

-- ── Event tags ──────────────────────────────────────────────────

create table if not exists public.event_tags (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                  check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  label         text not null
                  check (char_length(label) between 1 and 40),
  is_official   boolean not null default false,
  is_hidden     boolean not null default false,
  usage_count   integer not null default 0
                  check (usage_count >= 0),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists event_tags_label_lower_idx
  on public.event_tags (lower(label));

create index if not exists event_tags_visible_usage_idx
  on public.event_tags (usage_count desc)
  where is_hidden = false;

alter table public.event_tags enable row level security;

-- Readable when not hidden, or to admins, or to the creator.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_tags'
      and policyname = 'event_tags_select_visible'
  ) then
    create policy "event_tags_select_visible"
      on public.event_tags for select
      using (is_hidden = false or public.is_admin() or created_by = auth.uid());
  end if;
end $$;

-- Authenticated users can create new tags (slug uniqueness enforces
-- dedup; we also normalise slug client-side before insert).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_tags'
      and policyname = 'event_tags_insert_authenticated'
  ) then
    create policy "event_tags_insert_authenticated"
      on public.event_tags for insert
      with check (
        auth.uid() is not null
        and created_by = auth.uid()
        and is_official = false  -- only admins can seed official tags
        and is_hidden = false    -- can't self-hide on insert
      );
  end if;
end $$;

-- Only admins can update (moderation: hide/unhide, mark official).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_tags'
      and policyname = 'event_tags_update_admin'
  ) then
    create policy "event_tags_update_admin"
      on public.event_tags for update
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

-- Only admins can delete.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_tags'
      and policyname = 'event_tags_delete_admin'
  ) then
    create policy "event_tags_delete_admin"
      on public.event_tags for delete
      using (public.is_admin());
  end if;
end $$;

-- ── Event ↔ tag assignments ─────────────────────────────────────

create table if not exists public.event_tag_assignments (
  event_id      uuid not null references public.events(id) on delete cascade,
  tag_id        uuid not null references public.event_tags(id) on delete cascade,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (event_id, tag_id)
);

create index if not exists event_tag_assignments_tag_idx
  on public.event_tag_assignments (tag_id);

alter table public.event_tag_assignments enable row level security;

-- Public read when the underlying event is published or visible.  We
-- keep this simple: assignments are readable by anyone (they reference
-- event_id only). Tag visibility is controlled on the event_tags row.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_tag_assignments'
      and policyname = 'event_tag_assignments_select_all'
  ) then
    create policy "event_tag_assignments_select_all"
      on public.event_tag_assignments for select
      using (true);
  end if;
end $$;

-- Organisers can assign/unassign tags on events they own (or admin).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_tag_assignments'
      and policyname = 'event_tag_assignments_insert_owner'
  ) then
    create policy "event_tag_assignments_insert_owner"
      on public.event_tag_assignments for insert
      with check (
        exists (
          select 1 from public.events e
          where e.id = event_id
            and (e.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'event_tag_assignments'
      and policyname = 'event_tag_assignments_delete_owner'
  ) then
    create policy "event_tag_assignments_delete_owner"
      on public.event_tag_assignments for delete
      using (
        exists (
          select 1 from public.events e
          where e.id = event_id
            and (e.created_by = auth.uid() or public.is_admin())
        )
      );
  end if;
end $$;

-- ── Usage-count maintenance ─────────────────────────────────────

create or replace function public.bump_tag_usage_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.event_tags
       set usage_count = usage_count + 1
     where id = new.tag_id;
    return new;
  elsif TG_OP = 'DELETE' then
    update public.event_tags
       set usage_count = greatest(0, usage_count - 1)
     where id = old.tag_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists event_tag_assignments_bump_count on public.event_tag_assignments;
create trigger event_tag_assignments_bump_count
  after insert or delete on public.event_tag_assignments
  for each row execute function public.bump_tag_usage_count();

-- ── Cap at 5 tags per event ─────────────────────────────────────

create or replace function public.enforce_tag_cap_per_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _count int;
begin
  select count(*) into _count
    from public.event_tag_assignments
   where event_id = new.event_id;
  if _count >= 5 then
    raise exception 'event_tag_cap_reached: an event can have at most 5 tags'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists event_tag_assignments_enforce_cap on public.event_tag_assignments;
create trigger event_tag_assignments_enforce_cap
  before insert on public.event_tag_assignments
  for each row execute function public.enforce_tag_cap_per_event();

-- ── Notifications type extension (K3) ───────────────────────────

do $$
declare
  _con text;
begin
  -- Locate the existing CHECK so we can rebuild it with the new value.
  select conname into _con
    from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%type = any%'
  limit 1;

  if _con is not null then
    execute format(
      'alter table public.notifications drop constraint %I',
      _con
    );
  end if;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'event_reminder',
      'new_event_match',
      'event_cancelled',
      'new_follower',
      'event_update',
      'review_prompt'
    ));
end $$;

-- ── Helpful comments ────────────────────────────────────────────

comment on table public.event_tags is
  'User-created + official tags for events. Hidden tags are filtered from public lists but assignment rows remain.';
comment on table public.event_tag_assignments is
  'Join table. Capped at 5 tags per event by trigger.';
comment on constraint notifications_type_check on public.notifications is
  'Whitelisted notification types. Extend here when adding new Edge Function notifications.';

commit;
