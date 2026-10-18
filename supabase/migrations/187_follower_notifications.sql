-- ════════════════════════════════════════════════════════════════════
--  187_follower_notifications: P2-04 Follow, follower notifications. Authored as docs/proposals/p2-04-follower-notifications.sql
--  on 2026-10-17; applied the same day through MCP apply_migration as `187_follower_notifications` on Stephen's yes in chat
--  (one yes per file; pre-apply tag `connect-pre-mig187-follower-notifications`). The live notifications_type_check was
--  re-read first (27 kinds, as this file's list minus its two new ones).
--
--  Stephen's answer (2026-10-17): a Contributor you follow notifies you of a new event or news post BY DEFAULT. The one
--  switch in Settings already exists (`contributor_updates`), so this file adds no setting and no column.
--  Two kinds, followed_new_event and followed_new_news, written by three triggers (events insert, events draft -> published,
--  news_posts insert) through one audience function, so an event and a news post can never disagree about who is told.
--  The attention test (tracker Q4): no draft/private/cancelled/past event; at most 500 per post; at most 2 per Contributor per
--  follower in 24 hours; nothing to a follower who switched contributor_updates off, muted the Contributor or that event, or
--  is in a block either way; never twice for the same post; no counts, no streaks.
--  Evidence: rollback-only probe docs/audit/probes/187_follower_notifications.probe.sql, 13 of 13 PASS against the live
--  triggers, nothing left behind; security advisor identical to the one before (0 ERROR, 130 WARN: the functions are not
--  callable by anon or signed-in users; service_role keeps the default execute right, like the friend_attending trigger).
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
