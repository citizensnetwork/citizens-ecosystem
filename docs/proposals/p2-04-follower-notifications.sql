-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL, NOT APPLIED. Tracker P2-04 (Follow): follower notifications. Gates G1 and G6. Written 2026-10-17.
--  Take the next free migration number at apply time. Needs Stephen's yes in chat for THIS file first.
--
--  Stephen's answer (2026-10-17): a Contributor you follow notifies you of a new event or news post BY DEFAULT.
--  The "one switch in Settings" already exists: `contributor_updates` ("Broadcasts & updates: updates from places, events and
--  orgs you follow", profiles.notification_prefs, default on), so this file adds NO setting and no column.
--
--  What it does
--    1. Two notification kinds: followed_new_event, followed_new_news. The check re-states the whole list: the live list had
--       27 kinds on 2026-10-17 (migration 184 added cohost_invite and cohost_invite_response). RE-READ it at apply time and
--       rebase if another migration has added a kind since.
--    2. AFTER INSERT on events, and AFTER UPDATE OF status when an event goes draft -> published (events are often created
--       as drafts), and AFTER INSERT on news_posts: one notification per follower, from an APPROVED, not-hidden Contributor.
--
--  What it deliberately does NOT do (the attention test, tracker Q4: respect people's time)
--    - no notification for a draft, a private or cancelled event, or an event that already happened;
--    - at most 500 notifications per post (the newest followers first; a bigger audience is for the weekly digest);
--    - at most 2 from the same Contributor to the same follower in 24 hours (a burst of five events is two pings, not five);
--    - nothing to a follower who switched `contributor_updates` off, who muted that Contributor ({"type":"org"}) or that event
--      ({"type":"event"}) in muted_source_ids, or who is in a block with the Contributor in either direction;
--    - never twice for the same event (the publish update after an insert, or a repeat update, finds the first one).
--    - no counts, no "X people are going", no streaks.
--
--  Same pattern as the live friend_attending trigger (069): SECURITY DEFINER, pinned search_path, EXECUTE revoked from every
--  role (a trigger function needs none), and the preference read from notification_prefs.
--
--  DRY-RUN DONE (2026-10-17, nothing was applied): these statements were run inside a transaction that always rolls back,
--  with synthetic users, and 13 of 13 checks passed: a published event tells exactly the eligible followers (a follower who
--  turned contributor_updates off, one who muted the org, one who muted that event, and a blocked one are not told); the
--  third post inside 24 hours is capped at 2 (events and news counted together); a draft tells nobody and publishing it tells
--  once, never again after a rename or a cancel and re-publish; a private, past, cancelled or citizen's event tells nobody;
--  501 followers gave 500 notifications; the trigger functions are not callable by anon or authenticated.
--
--  If approved: pre-apply git tag, MCP apply_migration (<next free number>_follower_notifications), get_advisors
--  (0 ERROR; list any new WARN), rollback-only probe (below), move this file to supabase/migrations/ in the same PR.
-- ════════════════════════════════════════════════════════════════════

begin;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'event_reminder', 'new_event_match', 'event_cancelled', 'new_follower', 'event_update', 'new_message',
  'review_prompt', 'admin_elevation_request', 'friend_convince', 'friend_attending', 'contributor_approved',
  'contributor_rejected', 'contributor_type_change_request', 'admin_on_behalf_action', 'broadcast_sent', 'spam_flag',
  'broadcast_flood', 'dm_received', 'dm_response', 'team_invite', 'team_invite_response', 'team_owner_transfer',
  'volunteer_application', 'volunteer_application_response', 'suggestion_response',
  'cohost_invite', 'cohost_invite_response',
  'followed_new_event', 'followed_new_news'
]::text[]));

-- One place for the audience rule, used by both triggers, so an event and a news post can never disagree about who is told.
-- Returns the follower ids to notify (already filtered), newest follower first, at most 500.
create function public.followed_post_audience(p_contributor uuid, p_kind text, p_post_id uuid)
returns table (follower_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select f.follower_id
  from public.follows f
  join public.profiles fp on fp.id = f.follower_id
  where f.followee_id = p_contributor
    and f.follower_id <> p_contributor
    and coalesce((fp.notification_prefs->>'contributor_updates')::boolean, true) = true
    -- muted: the whole Contributor ("org") or, for an event, that one event
    and not (coalesce(fp.muted_source_ids, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('type', 'org', 'id', p_contributor::text)))
    and not (p_kind = 'followed_new_event' and coalesce(fp.muted_source_ids, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('type', 'event', 'id', p_post_id::text)))
    -- a block in either direction
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = f.follower_id and b.blocked_id = p_contributor)
         or (b.blocker_id = p_contributor and b.blocked_id = f.follower_id)
    )
    -- never twice for the same post
    and not exists (
      select 1 from public.notifications n
      where n.user_id = f.follower_id and n.type = p_kind
        and (n.data->>'post_id') = p_post_id::text
    )
    -- at most 2 from this Contributor to this follower in 24 hours
    and (
      select count(*) from public.notifications n
      where n.user_id = f.follower_id and n.type in ('followed_new_event', 'followed_new_news')
        and (n.data->>'contributor_id') = p_contributor::text
        and n.created_at > now() - interval '24 hours'
    ) < 2
  order by f.created_at desc
  limit 500;
$$;
revoke execute on function public.followed_post_audience(uuid, text, uuid) from public, anon, authenticated;

create function public.notify_followers_of_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if new.status <> 'published' or new.visibility <> 'public' or new.date < now() then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;   -- only the draft -> published step

  select p.full_name into v_name
  from public.profiles p
  where p.id = new.created_by and p.role = 'contributor' and p.contributor_status = 'approved'
    and coalesce(p.contributor_hidden, false) = false;
  if not found then return new; end if;   -- a citizen's event, or a hidden / unapproved Contributor: nobody is pinged

  insert into public.notifications (user_id, type, title, body, data)
  select a.follower_id, 'followed_new_event',
         'New event from ' || coalesce(nullif(v_name, ''), 'a Contributor you follow'),
         new.title,
         jsonb_build_object('event_id', new.id, 'post_id', new.id, 'contributor_id', new.created_by)
  from public.followed_post_audience(new.created_by, 'followed_new_event', new.id) a;
  return new;
end;
$$;
revoke execute on function public.notify_followers_of_event() from public, anon, authenticated;

create function public.notify_followers_of_news()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select p.full_name into v_name
  from public.profiles p
  where p.id = new.contributor_id and p.role = 'contributor' and p.contributor_status = 'approved'
    and coalesce(p.contributor_hidden, false) = false;
  if not found then return new; end if;

  insert into public.notifications (user_id, type, title, body, data)
  select a.follower_id, 'followed_new_news',
         'New update from ' || coalesce(nullif(v_name, ''), 'a Contributor you follow'),
         new.title,
         jsonb_build_object('post_id', new.id, 'contributor_id', new.contributor_id)
  from public.followed_post_audience(new.contributor_id, 'followed_new_news', new.id) a;
  return new;
end;
$$;
revoke execute on function public.notify_followers_of_news() from public, anon, authenticated;

create trigger trg_notify_followers_of_event_insert
  after insert on public.events
  for each row execute function public.notify_followers_of_event();
create trigger trg_notify_followers_of_event_publish
  after update of status on public.events
  for each row when (old.status is distinct from new.status)
  execute function public.notify_followers_of_event();
create trigger trg_notify_followers_of_news
  after insert on public.news_posts
  for each row execute function public.notify_followers_of_news();

commit;

-- Rollback: drop the three triggers and the three functions; delete any followed_new_* notification rows; put the check back
-- to the 27 kinds without the two new ones.
--
-- Rollback-only probe to run at apply time (docs/audit/probes/ pattern: synthetic users, a DO block that ends in RAISE):
--   publish an event / insert a news post as an approved Contributor with 4 followers, one of whom switched contributor_updates
--   off, one who muted the org, one blocked, one normal: exactly ONE notification, to the normal one; a second event in the
--   same hour: that follower now has 2; a third: still 2 (the 24 hour cap); a draft insert: none, then update to published: one
--   per eligible follower, and a repeat update: no duplicates; a citizen's event, a private event, a past event, a cancelled
--   event: none; 501 followers: 500 notifications; anon and authenticated cannot EXECUTE the trigger functions.
--
-- Front end once approved (not built): NOTIF_ICON entries and the open handler for the two kinds in pages.jsx
-- (followed_new_event opens the event; followed_new_news opens the Contributor), and the Settings line under
-- "Broadcasts & updates" saying it also covers new events and news from Contributors you follow.
