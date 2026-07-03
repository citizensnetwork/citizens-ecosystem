-- Migration 077: harden content_labels lifecycle + tighten RLS.
-- Architect findings on Batch 6:
--   1. Must-fix: trigger only INSERTs; moving an event from 'markets-expos'
--      → 'youth' leaves the stale 'market' label. Fix by deleting all
--      rule-managed labels for the row before reinserting per current rules.
--   2. Must-fix: deleting an event / place / profile leaves orphan rows in
--      content_labels (no FK exists, the entity_id is just a uuid).  Add
--      AFTER DELETE triggers so removed entities tidy up after themselves.
--   3. Should-fix: select policy `using (true)` leaks profile labels.  No
--      profile labels are written today, but the schema allows them — close
--      the door before any caller starts writing them.
-- Idempotent.

-- (1) Rewrite the apply trigger so it deletes rule-managed labels first.
create or replace function public.apply_event_content_labels()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Clear any rule-managed labels for this event so a category change
  -- (e.g. 'markets-expos' → 'youth') doesn't leave stale labels behind.
  delete from public.content_labels
    where entity_type = 'event'
      and entity_id = new.id
      and label in ('market', 'education');

  if new.category = 'markets-expos' then
    insert into public.content_labels (entity_type, entity_id, label)
      values ('event', new.id, 'market')
      on conflict (entity_type, entity_id, label) do nothing;
  end if;
  if new.category in ('education-equipping', 'education', 'equip') then
    insert into public.content_labels (entity_type, entity_id, label)
      values ('event', new.id, 'education')
      on conflict (entity_type, entity_id, label) do nothing;
  end if;
  return new;
end;
$$;

-- (2) Cascade-cleanup triggers for entity deletes.  Single helper function
-- keyed on TG_ARGV[0] so we don't need three near-identical functions.
create or replace function public.cleanup_content_labels_on_entity_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entity_type text := tg_argv[0];
begin
  delete from public.content_labels
    where entity_type = v_entity_type
      and entity_id = old.id;
  return old;
end;
$$;

revoke all on function public.cleanup_content_labels_on_entity_delete() from public;
revoke execute on function public.cleanup_content_labels_on_entity_delete() from anon, authenticated;
grant execute on function public.cleanup_content_labels_on_entity_delete() to service_role;

drop trigger if exists trg_cleanup_content_labels_event on public.events;
create trigger trg_cleanup_content_labels_event
  after delete on public.events
  for each row execute function public.cleanup_content_labels_on_entity_delete('event');

drop trigger if exists trg_cleanup_content_labels_place on public.places;
create trigger trg_cleanup_content_labels_place
  after delete on public.places
  for each row execute function public.cleanup_content_labels_on_entity_delete('place');

drop trigger if exists trg_cleanup_content_labels_profile on public.profiles;
create trigger trg_cleanup_content_labels_profile
  after delete on public.profiles
  for each row execute function public.cleanup_content_labels_on_entity_delete('profile');

-- (3) Tighten the public-read policy to event + place only.  Profile labels
-- (if/when written) must be read through a view that gates on the profile's
-- own visibility, not through this blanket policy.
drop policy if exists content_labels_select_all on public.content_labels;
create policy content_labels_select_public_entities on public.content_labels
  for select using (entity_type in ('event', 'place'));
