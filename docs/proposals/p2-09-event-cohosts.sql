-- ════════════════════════════════════════════════════════════════════
--  PROPOSAL, NOT APPLIED. Tracker P2-09 (Co-hosted events: two Contributors on one event), gate G1.
--  Written 2026-10-15 against live head 181; the live head is now 182 (another session's Vision migration), so the
--  number is NOT fixed: take the next free one after list_migrations at apply time. Needs Stephen's yes in chat first.
--
--  Today an event has ONE organiser (events.created_by). Two ministries who run a night together cannot both be on it,
--  so one of them is unseen. Collaboration across sectors is the point of Citizens (VISION), so this lets the organiser
--  invite up to 3 other approved Contributors, and the event then shows on each of their pages once they accept.
--
--  Design: no direct INSERT or UPDATE on the table. Every change goes through a SECURITY DEFINER function that checks
--  who is asking (the organiser invites; only the invited Contributor answers), so RLS can stay "read only" and there is
--  nothing to widen by mistake. search_path is pinned and EXECUTE is limited to signed-in users.
--
--  If approved: pre-apply git tag, MCP apply_migration (<next free number>_event_cohosts), get_advisors (0 ERROR,
--  0 new findings), move this file to supabase/migrations/<number>_event_cohosts.sql in the same PR.
--  Re-read the live notifications_type_check before applying: this file re-states the whole list (25 types on
--  2026-10-16) and must be rebased if another migration has added a type since.
-- ════════════════════════════════════════════════════════════════════

begin;

create table public.event_cohosts (
  event_id       uuid not null references public.events(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  status         text not null default 'invited' check (status in ('invited', 'accepted', 'declined')),
  invited_by     uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  primary key (event_id, contributor_id)
);
create index event_cohosts_contributor_status_idx on public.event_cohosts (contributor_id, status);
create index event_cohosts_invited_by_idx         on public.event_cohosts (invited_by);

alter table public.event_cohosts enable row level security;

-- Who may read a row: anyone who can already see the event may see ACCEPTED co-hosts (so the event can show both hosts);
-- the invited Contributor and the organiser also see pending and declined ones; an admin sees all. The subselect on
-- events runs under the reader's own RLS, so a private event never leaks its co-hosts.
create policy event_cohosts_select on public.event_cohosts
  for select using (
    (
      status = 'accepted'
      and exists (select 1 from public.events e where e.id = event_cohosts.event_id)
    )
    or contributor_id = (select auth.uid())
    or invited_by = (select auth.uid())
    or (select public.is_admin())
  );
-- deliberately NO insert / update / delete policy: default deny. The three functions below are the only way in.

revoke all on public.event_cohosts from anon, public;
revoke insert, update, delete on public.event_cohosts from authenticated;
grant select on public.event_cohosts to authenticated, anon;

-- Two new notification kinds. The check lists every existing type (read from the live constraint on 2026-10-15) plus two.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'event_reminder', 'new_event_match', 'event_cancelled', 'new_follower', 'event_update', 'new_message',
  'review_prompt', 'admin_elevation_request', 'friend_convince', 'friend_attending', 'contributor_approved',
  'contributor_rejected', 'contributor_type_change_request', 'admin_on_behalf_action', 'broadcast_sent', 'spam_flag',
  'broadcast_flood', 'dm_received', 'dm_response', 'team_invite', 'team_invite_response', 'team_owner_transfer',
  'volunteer_application', 'volunteer_application_response', 'suggestion_response',
  'cohost_invite', 'cohost_invite_response'
]::text[]));

-- The organiser invites another approved Contributor (at most 3 live co-hosts per event).
create function public.invite_event_cohost(p_event_id uuid, p_contributor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_title text;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'reason', 'not_authenticated'); end if;
  if p_contributor_id = v_uid then return jsonb_build_object('success', false, 'reason', 'cannot_cohost_self'); end if;

  select e.title into v_title from public.events e where e.id = p_event_id and e.created_by = v_uid;
  if not found then return jsonb_build_object('success', false, 'reason', 'not_event_owner'); end if;

  -- two invitations arriving together must not both slip under the limit of 3
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  if not exists (
    select 1 from public.profiles p
    where p.id = p_contributor_id and p.role = 'contributor' and p.contributor_status = 'approved'
      and coalesce(p.contributor_hidden, false) = false
  ) then return jsonb_build_object('success', false, 'reason', 'not_a_contributor'); end if;

  if public.is_blocked(v_uid, p_contributor_id) then return jsonb_build_object('success', false, 'reason', 'not_allowed'); end if;

  if (select count(*) from public.event_cohosts where event_id = p_event_id and status in ('invited', 'accepted')) >= 3 then
    return jsonb_build_object('success', false, 'reason', 'too_many_cohosts');
  end if;

  insert into public.event_cohosts (event_id, contributor_id, invited_by) values (p_event_id, p_contributor_id, v_uid)
  on conflict (event_id, contributor_id) do nothing;
  if not found then return jsonb_build_object('success', false, 'reason', 'already_invited'); end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (p_contributor_id, 'cohost_invite', 'Co-host invitation',
          'You are invited to co-host: ' || coalesce(v_title, 'an event'),
          jsonb_build_object('event_id', p_event_id, 'invited_by', v_uid));

  return jsonb_build_object('success', true);
end;
$$;

-- The invited Contributor answers. Only the invited person can, and only while the row is still "invited".
create function public.respond_event_cohost(p_event_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inviter uuid;
begin
  if v_uid is null then return jsonb_build_object('success', false, 'reason', 'not_authenticated'); end if;

  update public.event_cohosts
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where event_id = p_event_id and contributor_id = v_uid and status = 'invited'
   returning invited_by into v_inviter;
  if not found then return jsonb_build_object('success', false, 'reason', 'no_open_invitation'); end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (v_inviter, 'cohost_invite_response',
          case when p_accept then 'Co-host invitation accepted' else 'Co-host invitation declined' end,
          'Your co-host invitation was ' || case when p_accept then 'accepted.' else 'declined.' end,
          jsonb_build_object('event_id', p_event_id, 'contributor_id', v_uid, 'accepted', p_accept));

  return jsonb_build_object('success', true, 'status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;

-- Either side can end it: the organiser removes a co-host, or a co-host steps off. (An admin can use the same call.)
create function public.remove_event_cohost(p_event_id uuid, p_contributor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return jsonb_build_object('success', false, 'reason', 'not_authenticated'); end if;

  delete from public.event_cohosts c
   where c.event_id = p_event_id and c.contributor_id = p_contributor_id
     and (c.contributor_id = v_uid or c.invited_by = v_uid or (select public.is_admin()));
  if not found then return jsonb_build_object('success', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.invite_event_cohost(uuid, uuid) from public, anon;
revoke execute on function public.respond_event_cohost(uuid, boolean) from public, anon;
revoke execute on function public.remove_event_cohost(uuid, uuid) from public, anon;
grant execute on function public.invite_event_cohost(uuid, uuid) to authenticated;
grant execute on function public.respond_event_cohost(uuid, boolean) to authenticated;
grant execute on function public.remove_event_cohost(uuid, uuid) to authenticated;

commit;

-- Rollback: drop the three functions, drop table public.event_cohosts, and put the notifications check back to the
-- 25-type list without the two new kinds (delete any cohost_* notification rows first, or the re-add will fail).
--
-- What follows in the front end, once approved (none of it is built): an "Invite a co-host" step in the organiser's event
-- form, an invitation card in the invited Contributor's notifications, and the Events tab and map pin listing an event for
-- every ACCEPTED co-host (the per-slug fetch needs "created_by = X OR accepted co-host" for the same event row, shown once).
-- Tests to write with the migration: policy tests (a stranger cannot insert, update or delete; a private event leaks no
-- co-host), the function refusals (not the owner, self, hidden or non-Contributor target, blocked, a 4th co-host,
-- a repeat invite, answering someone else's invitation), and both notifications.
