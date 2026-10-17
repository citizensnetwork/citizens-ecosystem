-- ════════════════════════════════════════════════════════════════════
--  184_event_cohosts: P2-09 Co-hosted events. APPLIED 2026-10-17 through MCP apply_migration as `184_event_cohosts`, on
--  Stephen's yes in chat (pre-apply tag `connect-pre-mig184-event-cohosts`; rollback-only probe
--  docs/audit/probes/184_event_cohosts.probe.sql, 39 of 39 PASS against the live objects). The live
--  notifications_type_check was re-read first (25 kinds) and this file re-states it with the two new kinds (27).
--  Security advisor: 0 ERROR; 3 new WARN, the three functions below, callable by signed-in users on purpose (each checks
--  auth.uid() inside, like the 109 existing functions of that class).
--
--  Today an event has ONE organiser (events.created_by). The organiser invites up to 3 other approved Contributors, and the
--  event then shows on each of their pages once they accept. No direct INSERT / UPDATE / DELETE on the table: every change
--  goes through a SECURITY DEFINER function that checks who is asking; search_path is pinned; EXECUTE is limited to
--  signed-in users. Authored as proposals/p2-09-event-cohosts.sql (2026-10-15); this file is that proposal with one change:
--  authenticated has its default privileges revoked first (TRUNCATE is not subject to RLS), not only anon.
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

-- (Supabase grants every privilege on a new table to anon and authenticated by default, and TRUNCATE is not subject to
-- RLS: take everything away from both, then give back read access only.)
revoke all on public.event_cohosts from anon, authenticated, public;
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
