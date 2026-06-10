-- 131_community_ideas_read.sql
-- Kingdom Projects / Impact Ideas: public read path + idea metadata columns.
-- Phase 3 of the HTML-frontend wiring (docs/HTML_FRONTEND_WIRING_SPEC.md §4, build order §5/Phase 3 #6).
--
-- The suggestions table has no public SELECT policy (platform suggestions are
-- admin-read). The community ideas board IS public by design, so instead of
-- opening the whole table we expose a controlled-field SECURITY DEFINER RPC
-- (same accepted pattern as get_active_map_bubbles, migration 129): only the
-- fields the public board renders, only rows that are community ideas.
--
-- Also adds the idea metadata the spec needs:
--   • category    — idea category slug (replaces the legacy [cat:slug] body
--                   prefix convention from the old Next.js community page).
--   • latitude/longitude — optional idea map location (spec §4.7 idea pins;
--                   required input for Phase-4 event synthesis). Capture UI
--                   lands with the Phase-4 ideas-on-map increment.

begin;

alter table public.suggestions add column if not exists category text
  check (category is null or category ~ '^[a-z0-9-]{1,50}$');
alter table public.suggestions add column if not exists latitude double precision
  check (latitude is null or (latitude >= -90 and latitude <= 90));
alter table public.suggestions add column if not exists longitude double precision
  check (longitude is null or (longitude >= -180 and longitude <= 180));

-- Public ideas feed: community ideas only, controlled fields, with vote count
-- and the caller's own vote state (false for anon callers).
create or replace function public.get_community_ideas()
returns table (
  id uuid,
  title text,
  body text,
  category text,
  tier text,
  tier_label text,
  vote_threshold integer,
  idea_status text,
  project_lead_id uuid,
  associated_event_id uuid,
  latitude double precision,
  longitude double precision,
  created_at timestamptz,
  author_name text,
  author_avatar text,
  vote_count bigint,
  voted_by_me boolean
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select s.id, s.title, s.body, s.category,
         s.tier, s.tier_label, s.vote_threshold, s.idea_status,
         s.project_lead_id, s.associated_event_id,
         s.latitude, s.longitude, s.created_at,
         p.full_name  as author_name,
         p.avatar_url as author_avatar,
         (select count(*) from public.idea_votes v where v.idea_id = s.id) as vote_count,
         (auth.uid() is not null and exists (
            select 1 from public.idea_votes v
             where v.idea_id = s.id and v.user_id = auth.uid())) as voted_by_me
    from public.suggestions s
    left join public.profiles p on p.id = s.user_id
   where s.page_url ilike '%/community'
     and s.status in ('open','in_review','actioned')
   order by s.created_at desc
   limit 200;
$$;

revoke all on function public.get_community_ideas() from public;
grant execute on function public.get_community_ideas() to anon, authenticated;

commit;
