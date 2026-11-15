-- Engine 0011: break-glass support access, the side that lives in a world's own database.
--
-- The service provider has no standing access to the people, messages or locations of a world.
-- When support is needed, a grant is opened in the service provider's own records and written
-- here as a SUPPORT SESSION: read-only, with a reason, for at most 30 minutes, one at a time.
-- Reading happens only through the reader functions below. Each one checks that the session is
-- active and inside its time, and writes a row into this world's own log before it returns
-- anything. The world's staff see every session and every read, are told when one opens and
-- when it ends, and can end one at any moment.
--
--   app_settings key 'support_access_mode'   "notify" (the default) or "ask". With "ask", a
--                                            session waits until a staff member approves it.
--
-- Nothing here can change a row of the world: there is no write-as-user of any kind.

-- ── 0. Two checks of file 0004, made to fail on a missing part ──────
-- A comparison with something that is not there is neither true nor false, and a check lets
-- "neither" through. So a document that named no database line at all, or lacked a part, was
-- accepted. Both checks now treat "not there" as a failure.
alter table public.engine_entitlements drop constraint engine_entitlements_engine_line;
alter table public.engine_entitlements add constraint engine_entitlements_engine_line
  check (coalesce((document ->> 'schemaLine') = 'engine', false));
alter table public.engine_entitlements drop constraint engine_entitlements_parts;
alter table public.engine_entitlements add constraint engine_entitlements_parts check (
  coalesce(
    (document ->> 'contract') ~ '^[0-9]{1,4}\.[0-9]{1,4}$'
    and jsonb_typeof(document -> 'features') = 'object'
    and jsonb_typeof(document -> 'limits') = 'object'
    and jsonb_typeof(document -> 'requirements') = 'object',
    false)
);

-- ── 1. A notice type for support access ─────────────────────────────
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check CHECK (type = ANY (ARRAY['event_reminder'::text, 'new_event_match'::text, 'event_cancelled'::text, 'new_follower'::text, 'event_update'::text, 'new_message'::text, 'review_prompt'::text, 'admin_elevation_request'::text, 'friend_convince'::text, 'friend_attending'::text, 'contributor_approved'::text, 'contributor_rejected'::text, 'contributor_type_change_request'::text, 'admin_on_behalf_action'::text, 'broadcast_sent'::text, 'spam_flag'::text, 'broadcast_flood'::text, 'dm_received'::text, 'dm_response'::text, 'team_invite'::text, 'team_invite_response'::text, 'team_owner_transfer'::text, 'volunteer_application'::text, 'volunteer_application_response'::text, 'suggestion_response'::text, 'cohost_invite'::text, 'cohost_invite_response'::text, 'followed_new_event'::text, 'followed_new_news'::text, 'support_access'::text]));

-- ── 2. The session and the log of reads ─────────────────────────────
--   state   awaiting_approval   written here, waiting for a staff member ("ask" mode)
--           active              reads may happen until expires_at
--           declined            a staff member said no
--           ended               closed by the operator, by the staff, or by time
create table public.support_sessions (
  id uuid not null default gen_random_uuid(),
  grant_id uuid not null,
  operator_label text not null,
  reason text not null,
  state text not null,
  opened_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  decided_at timestamp with time zone,
  decided_by uuid,
  ended_at timestamp with time zone,
  end_cause text,
  ended_by uuid,
  notice_sent_at timestamp with time zone,
  constraint support_sessions_pkey primary key (id),
  constraint support_sessions_grant_key unique (grant_id),
  constraint support_sessions_operator_label check (char_length(btrim(operator_label)) between 2 and 80),
  constraint support_sessions_reason check (char_length(btrim(reason)) between 5 and 500),
  constraint support_sessions_state check (state in ('awaiting_approval', 'active', 'declined', 'ended')),
  constraint support_sessions_time_box check (
    expires_at > opened_at and expires_at <= opened_at + interval '30 minutes'
  ),
  constraint support_sessions_end_cause check (
    end_cause is null or end_cause in ('closed', 'expired', 'declined', 'ended_by_tenant')
  ),
  constraint support_sessions_end check (
    (ended_at is null) = (end_cause is null)
    and (ended_at is null) = (state in ('awaiting_approval', 'active'))
    and (state = 'declined') = (coalesce(end_cause, '') = 'declined')
  )
);
-- At most one session is open in a world at any time.
create unique index support_sessions_one_open on public.support_sessions ((true)) where ended_at is null;

create table public.support_session_reads (
  id bigint generated always as identity,
  session_id uuid not null,
  at timestamp with time zone not null default clock_timestamp(),
  kind text not null,
  subject_user uuid,
  detail jsonb not null default '{}'::jsonb,
  thread_reason text,
  constraint support_session_reads_pkey primary key (id),
  constraint support_session_reads_session foreign key (session_id) references public.support_sessions (id),
  constraint support_session_reads_kind check (
    kind in ('find_account', 'account', 'conversations', 'thread', 'location', 'notifications')
  ),
  constraint support_session_reads_detail check (jsonb_typeof(detail) = 'object' and char_length(detail::text) <= 2000),
  constraint support_session_reads_thread_reason check (
    (kind = 'thread') = (thread_reason is not null)
    and (thread_reason is null or char_length(btrim(thread_reason)) between 5 and 500)
  )
);
create index support_session_reads_session_idx on public.support_session_reads (session_id, id);

-- What a session said when it was opened never changes, an ended session stays ended, and no
-- session and no read is ever deleted or rewritten, by anyone, the owner of the database included.
create function engine.support_session_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'support_sessions_are_kept: % refused', tg_op;
  end if;
  if new.id is distinct from old.id
     or new.grant_id is distinct from old.grant_id
     or new.operator_label is distinct from old.operator_label
     or new.reason is distinct from old.reason
     or new.opened_at is distinct from old.opened_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'support_session_facts_are_fixed';
  end if;
  if old.ended_at is not null
     and (new.state is distinct from old.state
          or new.ended_at is distinct from old.ended_at
          or new.end_cause is distinct from old.end_cause
          or new.ended_by is distinct from old.ended_by
          or new.decided_at is distinct from old.decided_at
          or new.decided_by is distinct from old.decided_by
          or old.notice_sent_at is not null) then
    raise exception 'support_session_has_ended';
  end if;
  if old.state = 'active' and new.state = 'awaiting_approval' then
    raise exception 'support_session_facts_are_fixed';
  end if;
  return new;
end;
$guard$;

create function engine.support_read_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
begin
  raise exception 'support_reads_are_kept: % refused', tg_op;
end;
$guard$;

create trigger support_sessions_guard
  before update or delete on public.support_sessions
  for each row execute function engine.support_session_guard();
create trigger support_sessions_no_truncate
  before truncate on public.support_sessions
  for each statement execute function engine.support_session_guard();
create trigger support_session_reads_guard
  before update or delete on public.support_session_reads
  for each row execute function engine.support_read_guard();
create trigger support_session_reads_no_truncate
  before truncate on public.support_session_reads
  for each statement execute function engine.support_read_guard();

-- The world's staff read both tables. Nobody inside the world writes them: not a visitor, not a
-- signed-in person, and not the world's own server.
alter table public.support_sessions enable row level security;
alter table public.support_session_reads enable row level security;
create policy support_sessions_staff_read on public.support_sessions
  as permissive for select to authenticated
  using ((select public.is_admin()));
create policy support_session_reads_staff_read on public.support_session_reads
  as permissive for select to authenticated
  using ((select public.is_admin()));
revoke all on table public.support_sessions from public, anon, authenticated, service_role;
revoke all on table public.support_session_reads from public, anon, authenticated, service_role;
revoke all on sequence public.support_session_reads_id_seq from public, anon, authenticated, service_role;
grant select on table public.support_sessions to authenticated, service_role;
grant select on table public.support_session_reads to authenticated, service_role;

-- ── 3. Private helpers (the database owner only) ────────────────────
create function engine.support_access_mode()
returns text
language sql
stable
set search_path = ''
as $mode$
  select case when exists (
           select 1 from public.app_settings s
            where s.key = 'support_access_mode' and s.value = '"ask"'::jsonb)
         then 'ask' else 'notify' end;
$mode$;

-- A notice to every staff member of this world, in this world's own words.
-- `_event` is 'opened', 'requested' or 'ended'.
create function engine.support_notify(_session public.support_sessions, _event text)
returns void
language plpgsql
set search_path = ''
as $notify$
declare
  v_values jsonb;
begin
  v_values := jsonb_build_object(
    'reason', _session.reason,
    'until', to_char(_session.expires_at at time zone 'UTC', 'HH24:MI'),
    'reads', (select count(*) from public.support_session_reads r where r.session_id = _session.id)::text);
  insert into public.notifications (user_id, type, title, body, data)
  select p.id,
         'support_access',
         public.engine_text('notification.supportAccess.' || _event || '.title', v_values),
         public.engine_text('notification.supportAccess.' || _event || '.body', v_values),
         jsonb_build_object('supportSession', _session.id, 'event', _event)
    from public.profiles p
   where p.role = 'admin' and p.deleted_at is null;
end;
$notify$;

-- Ends a session and tells the staff, in one step. A session whose time has passed is recorded
-- as expired, at the time it expired, whatever the caller meant. Returns false when it had
-- already ended.
create function engine.finish_support_session(_session uuid, _cause text, _by uuid default null)
returns boolean
language plpgsql
set search_path = ''
as $finish$
declare
  v_session public.support_sessions;
  v_cause text;
begin
  select s.* into v_session from public.support_sessions s where s.id = _session for update;
  if not found then
    raise exception 'support_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.ended_at is not null then
    return false;
  end if;
  v_cause := case when v_session.expires_at <= now() then 'expired' else _cause end;
  update public.support_sessions s
     set state = case when v_cause = 'declined' then 'declined' else 'ended' end,
         ended_at = least(now(), s.expires_at),
         end_cause = v_cause,
         ended_by = case when v_cause in ('declined', 'ended_by_tenant') then _by end,
         decided_at = case when v_cause = 'declined' then now() else s.decided_at end,
         decided_by = case when v_cause = 'declined' then _by else s.decided_by end,
         notice_sent_at = now()
   where s.id = _session
  returning s.* into v_session;
  perform engine.support_notify(v_session, 'ended');
  return true;
end;
$finish$;

-- The job below runs this every 5 minutes. It closes sessions whose time has passed, and makes
-- sure every ended session has had its notice. The readers do NOT depend on it: they refuse on
-- their own once the time has passed.
create function engine.sweep_support_sessions()
returns integer
language plpgsql
set search_path = ''
as $sweep$
declare
  v_id uuid;
  v_session public.support_sessions;
  v_closed integer := 0;
begin
  for v_id in
    select s.id from public.support_sessions s where s.ended_at is null and s.expires_at <= now()
  loop
    if engine.finish_support_session(v_id, 'expired') then
      v_closed := v_closed + 1;
    end if;
  end loop;
  for v_session in
    select s.* from public.support_sessions s
     where s.ended_at is not null and s.notice_sent_at is null
       for update
  loop
    update public.support_sessions s set notice_sent_at = now() where s.id = v_session.id;
    perform engine.support_notify(v_session, 'ended');
  end loop;
  return v_closed;
end;
$sweep$;

-- ── 4. Opening and closing, by the service provider's tooling ───────
-- Writes a grant into this world as a session. The world's own setting decides whether it starts
-- active or waits for a staff member, and this database sets the time limit again by its own
-- clock: never later than the grant says, never more than 30 minutes from now.
create function engine.open_support_session(_grant uuid, _operator_label text, _reason text, _expires_at timestamp with time zone)
returns jsonb
language plpgsql
set search_path = ''
as $open$
declare
  v_state text;
  v_session public.support_sessions;
begin
  if _grant is null then
    raise exception 'support_grant_required' using errcode = '22023';
  end if;
  if _expires_at is null or _expires_at <= now() then
    raise exception 'support_grant_expired' using errcode = '55000';
  end if;
  -- A session whose time has passed must not block this one.
  perform engine.sweep_support_sessions();
  v_state := case when engine.support_access_mode() = 'ask' then 'awaiting_approval' else 'active' end;
  begin
    insert into public.support_sessions (grant_id, operator_label, reason, state, expires_at)
    values (_grant, btrim(_operator_label), btrim(_reason), v_state, least(_expires_at, now() + interval '30 minutes'))
    returning * into v_session;
  exception when unique_violation then
    raise exception 'support_session_already_open_or_grant_already_used' using errcode = '55000';
  end;
  perform engine.support_notify(v_session, case when v_state = 'active' then 'opened' else 'requested' end);
  return jsonb_build_object('session', v_session.id, 'state', v_session.state, 'expiresAt', v_session.expires_at);
end;
$open$;

create function engine.close_support_session(_session uuid)
returns boolean
language plpgsql
set search_path = ''
as $close$
begin
  return engine.finish_support_session(_session, 'closed');
end;
$close$;

-- ── 5. The gate and the log every reader goes through ───────────────
-- Refuses unless the session is active and inside its time. It reads the clock itself, so it
-- refuses the moment the time has passed, whether or not the job has run. It never changes
-- anything: closing is the job's and the closing functions' work.
create function engine.support_gate(_session uuid)
returns public.support_sessions
language plpgsql
stable
set search_path = ''
as $gate$
declare
  v_session public.support_sessions;
begin
  select s.* into v_session from public.support_sessions s where s.id = _session;
  if not found then
    raise exception 'support_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.ended_at is not null or v_session.state <> 'active' then
    raise exception 'support_session_not_active' using errcode = '55000';
  end if;
  if v_session.expires_at <= clock_timestamp() then
    raise exception 'support_session_expired' using errcode = '55000';
  end if;
  return v_session;
end;
$gate$;

create function engine.support_log(_session uuid, _kind text, _subject uuid, _detail jsonb default '{}'::jsonb, _thread_reason text default null)
returns void
language sql
set search_path = ''
as $log$
  insert into public.support_session_reads (session_id, kind, subject_user, detail, thread_reason)
  values (_session, _kind, _subject, coalesce(_detail, '{}'::jsonb), _thread_reason);
$log$;

-- ── 6. The readers: the only sanctioned way to read under a session ─
-- Each one: the gate, then the log row, then the data. All three happen in one statement, so a
-- read that is not logged does not exist.

-- Finds an account by its exact email address or handle. Never a search by part of a name.
create function engine.support_find_account(_session uuid, _lookup text)
returns jsonb
language plpgsql
set search_path = ''
as $reader$
declare
  v_session public.support_sessions := engine.support_gate(_session);
  v_lookup text := lower(btrim(coalesce(_lookup, '')));
begin
  if char_length(v_lookup) not between 3 and 254 then
    raise exception 'support_lookup_invalid' using errcode = '22023';
  end if;
  perform engine.support_log(_session, 'find_account', null, jsonb_build_object('lookup', v_lookup));
  return coalesce((
    select jsonb_agg(jsonb_build_object('account', p.id, 'handle', p.handle, 'name', p.full_name, 'role', p.role)
                     order by p.id)
      from public.profiles p
      left join auth.users u on u.id = p.id
     where lower(u.email) = v_lookup or lower(p.email) = v_lookup or p.handle = v_lookup), '[]'::jsonb);
end;
$reader$;

-- One account as the world holds it: the profile row and the sign-in facts.
create function engine.support_read_account(_session uuid, _account uuid)
returns jsonb
language plpgsql
set search_path = ''
as $reader$
declare
  v_session public.support_sessions := engine.support_gate(_session);
begin
  perform engine.support_log(_session, 'account', _account);
  return (
    select jsonb_build_object(
             'profile', to_jsonb(p),
             'signIn', (select jsonb_build_object('email', u.email, 'createdAt', u.created_at, 'lastSignInAt', u.last_sign_in_at)
                          from auth.users u where u.id = p.id))
      from public.profiles p where p.id = _account);
end;
$reader$;

-- The list of a person's conversations: who, when, how many messages. Never what was said.
create function engine.support_list_conversations(_session uuid, _account uuid)
returns jsonb
language plpgsql
set search_path = ''
as $reader$
declare
  v_session public.support_sessions := engine.support_gate(_session);
begin
  perform engine.support_log(_session, 'conversations', _account);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'conversation', c.id, 'status', c.status, 'updatedAt', c.updated_at, 'lastReadAt', me.last_read_at,
             'messages', (select count(*) from public.messages m where m.conversation_id = c.id),
             'members', (select jsonb_agg(cp.user_id order by cp.user_id)
                           from public.conversation_participants cp where cp.conversation_id = c.id))
             order by c.updated_at desc, c.id)
      from public.conversation_participants me
      join public.conversations c on c.id = me.conversation_id
     where me.user_id = _account), '[]'::jsonb);
end;
$reader$;

-- What was said in one conversation. Opening a private thread needs its own reason, every time.
create function engine.support_read_thread(_session uuid, _conversation uuid, _reason text)
returns jsonb
language plpgsql
set search_path = ''
as $reader$
declare
  v_session public.support_sessions := engine.support_gate(_session);
  v_reason text := btrim(coalesce(_reason, ''));
begin
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'thread_reason_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.conversations c where c.id = _conversation) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  perform engine.support_log(_session, 'thread', null, jsonb_build_object('conversation', _conversation), v_reason);
  return jsonb_build_object(
    'conversation', _conversation,
    'members', (select jsonb_agg(cp.user_id order by cp.user_id)
                  from public.conversation_participants cp where cp.conversation_id = _conversation),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'sender', m.sender_id, 'createdAt', m.created_at,
               'deleted', m.deleted_at is not null,
               'body', case when m.deleted_at is null then m.body end)
               order by m.created_at, m.id)
        from (select * from public.messages x where x.conversation_id = _conversation
               order by x.created_at desc, x.id limit 500) m), '[]'::jsonb));
end;
$reader$;

-- Where a person is sharing their live location right now.
create function engine.support_read_location(_session uuid, _account uuid)
returns jsonb
language plpgsql
set search_path = ''
as $reader$
declare
  v_session public.support_sessions := engine.support_gate(_session);
begin
  perform engine.support_log(_session, 'location', _account);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'event', l.event_id, 'latitude', l.latitude, 'longitude', l.longitude,
             'accuracy', l.accuracy, 'updatedAt', l.updated_at)
             order by l.updated_at desc, l.id)
      from public.user_locations l where l.user_id = _account), '[]'::jsonb);
end;
$reader$;

-- A person's notices, newest first.
create function engine.support_read_notifications(_session uuid, _account uuid, _limit integer default 50)
returns jsonb
language plpgsql
set search_path = ''
as $reader$
declare
  v_session public.support_sessions := engine.support_gate(_session);
  v_limit integer := least(greatest(coalesce(_limit, 50), 1), 200);
begin
  perform engine.support_log(_session, 'notifications', _account, jsonb_build_object('limit', v_limit));
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', n.id, 'type', n.type, 'title', n.title, 'body', n.body, 'read', n.read, 'createdAt', n.created_at)
             order by n.created_at desc, n.id)
      from (select * from public.notifications x where x.user_id = _account
             order by x.created_at desc, x.id limit v_limit) n), '[]'::jsonb);
end;
$reader$;

-- What is copied back into the service provider's own audit log for one grant: when the session
-- ran and how it ended, and for each read its number, time, kind and (for a thread) its reason.
-- Nothing about a person leaves this database: no name, no address, no account.
create function engine.support_session_report(_grant uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $report$
declare
  v_session public.support_sessions;
begin
  select s.* into v_session from public.support_sessions s where s.grant_id = _grant;
  if not found then
    raise exception 'support_session_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'grant', v_session.grant_id,
    'session', v_session.id,
    'state', v_session.state,
    'openedAt', v_session.opened_at,
    'expiresAt', v_session.expires_at,
    'endedAt', v_session.ended_at,
    'endCause', v_session.end_cause,
    'reads', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', r.id, 'at', r.at, 'kind', r.kind, 'threadReason', r.thread_reason)) order by r.id)
        from public.support_session_reads r where r.session_id = v_session.id), '[]'::jsonb));
end;
$report$;

-- ── 7. What the world's own staff can do ────────────────────────────
-- "Ask me first": a staff member says yes or no to a waiting session. Returns the new state.
create function public.decide_support_session(_session uuid, _approve boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $decide$
declare
  v_session public.support_sessions;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _approve is null then
    raise exception 'answer_required' using errcode = '22023';
  end if;
  select s.* into v_session from public.support_sessions s where s.id = _session for update;
  if not found then
    raise exception 'support_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.ended_at is not null or v_session.state <> 'awaiting_approval' then
    raise exception 'support_session_not_waiting' using errcode = '55000';
  end if;
  if not _approve then
    perform engine.finish_support_session(_session, 'declined', auth.uid());
    return (select s.state from public.support_sessions s where s.id = _session);
  end if;
  if v_session.expires_at <= clock_timestamp() then
    raise exception 'support_session_expired' using errcode = '55000';
  end if;
  update public.support_sessions s
     set state = 'active', decided_at = now(), decided_by = auth.uid()
   where s.id = _session
  returning s.* into v_session;
  perform engine.support_notify(v_session, 'opened');
  return v_session.state;
end;
$decide$;

-- A staff member ends a session at once, waiting or active. Nothing more can be read under it.
create function public.end_support_session(_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $end$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not engine.finish_support_session(_session, 'ended_by_tenant', auth.uid()) then
    raise exception 'support_session_not_active' using errcode = '55000';
  end if;
end;
$end$;

-- ── 8. Who may call what ────────────────────────────────────────────
revoke all on function engine.support_session_guard() from public, anon, authenticated, service_role;
revoke all on function engine.support_read_guard() from public, anon, authenticated, service_role;
revoke all on function engine.support_access_mode() from public, anon, authenticated, service_role;
revoke all on function engine.support_notify(public.support_sessions, text) from public, anon, authenticated, service_role;
revoke all on function engine.finish_support_session(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function engine.sweep_support_sessions() from public, anon, authenticated, service_role;
revoke all on function engine.open_support_session(uuid, text, text, timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function engine.close_support_session(uuid) from public, anon, authenticated, service_role;
revoke all on function engine.support_gate(uuid) from public, anon, authenticated, service_role;
revoke all on function engine.support_log(uuid, text, uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function engine.support_find_account(uuid, text) from public, anon, authenticated, service_role;
revoke all on function engine.support_read_account(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function engine.support_list_conversations(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function engine.support_read_thread(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function engine.support_read_location(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function engine.support_read_notifications(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function engine.support_session_report(uuid) from public, anon, authenticated, service_role;
revoke all on function public.decide_support_session(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.end_support_session(uuid) from public, anon, authenticated, service_role;
grant execute on function public.decide_support_session(uuid, boolean) to authenticated;
grant execute on function public.end_support_session(uuid) to authenticated;

-- ── 9. The job that closes abandoned sessions ───────────────────────
select cron.schedule('support-session-expiry', '*/5 * * * *',
  $job$select engine.sweep_support_sessions();$job$);

-- ── 10. The words of the three notices ──────────────────────────────
-- Generated from the message catalogue in packages/engine-config (a test compares them). A value
-- in curly brackets with a dollar sign is filled in when the text is used.
insert into public.engine_wording (key, source, renderer, text) values
  ('notification.supportAccess.ended.body', 'engine', 'database', 'Read-only support access has ended. Reads made: {$reads}. Each one is listed in your support log.'),
  ('notification.supportAccess.ended.title', 'engine', 'database', 'Support access ended'),
  ('notification.supportAccess.opened.body', 'engine', 'database', 'Your service provider opened read-only support access until {$until} UTC. Reason given: {$reason}'),
  ('notification.supportAccess.opened.title', 'engine', 'database', 'Support access opened'),
  ('notification.supportAccess.requested.body', 'engine', 'database', 'Your service provider asks for read-only support access until {$until} UTC. Nothing can be read until a staff member approves it. Reason given: {$reason}'),
  ('notification.supportAccess.requested.title', 'engine', 'database', 'Support access needs your answer')
on conflict (key, source) do update set renderer = excluded.renderer, text = excluded.text;

insert into engine.schema_migrations (version, name) values ('0011', 'support_access');
