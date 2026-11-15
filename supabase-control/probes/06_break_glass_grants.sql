-- Promise: break-glass support access, on the control-plane side (ADR-001, decision 3). A grant
-- needs a reason, is read-only, lasts at most 30 minutes and is the only open one for its tenant.
-- What the tenant's project answers is recorded, and every read made under the grant is copied
-- into the audit log exactly once.

select pg_temp.probe_cast();
select pg_temp.probe_tenant('alpha', 'aaaaaaaaaaaaaaaaaaaa');
select pg_temp.probe_tenant('beta', 'bbbbbbbbbbbbbbbbbbbb');
select pg_temp.probe_tenant('gamma', 'cccccccccccccccccccc');

-- A tenant that has no database project yet.
select pg_temp.probe_sign_in('ada');
select set_config('probe.delta', public.tenant_create('delta', 'Example delta', 'eu-central-1', 'A made-up tenant without a project.')::text, true);

-- Two grants of the past that nobody closed: one that was never delivered, one that was in use.
-- (Written directly, as the owner: time cannot be made to pass inside a probe.)
insert into control.support_access_grants (tenant_id, opened_by, reason, opened_at, expires_at)
values (current_setting('probe.beta')::uuid, current_setting('probe.ole')::uuid, 'An old made-up reason.',
        now() - interval '40 minutes', now() - interval '10 minutes');
insert into control.support_access_grants (tenant_id, opened_by, reason, opened_at, expires_at, delivery, delivered_at, tenant_session)
values (current_setting('probe.gamma')::uuid, current_setting('probe.ole')::uuid, 'Another old made-up reason.',
        now() - interval '40 minutes', now() - interval '10 minutes', 'active', now() - interval '39 minutes', gen_random_uuid())
returning set_config('probe.old_grant', id::text, true);

-- ── A support operator opens a grant ────────────────────────────────
select pg_temp.probe_sign_in('ole');
set local role authenticated;
do $probe$
declare
  v_alpha constant uuid := current_setting('probe.alpha')::uuid;
  v_opened jsonb;
begin
  begin
    perform public.support_grant_open(v_alpha, null);
    raise exception 'PROBE FAILED: a grant was opened without a reason';
  exception when invalid_parameter_value then
    if sqlerrm <> 'reason_required' then raise; end if;
  end;
  begin
    perform public.support_grant_open(v_alpha, 'help');
    raise exception 'PROBE FAILED: a grant was opened with a reason of four letters';
  exception when invalid_parameter_value then
    if sqlerrm <> 'reason_must_be_5_to_500_characters' then raise; end if;
  end;
  begin
    perform public.support_grant_open(v_alpha, 'A partner cannot sign in.', 31);
    raise exception 'PROBE FAILED: a grant of 31 minutes was opened';
  exception when invalid_parameter_value then
    if sqlerrm <> 'support_access_is_at_most_30_minutes' then raise; end if;
  end;
  begin
    perform public.support_grant_open(v_alpha, 'A partner cannot sign in.', 0);
    raise exception 'PROBE FAILED: a grant of no time at all was opened';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.support_grant_open(current_setting('probe.delta')::uuid, 'A partner cannot sign in.');
    raise exception 'PROBE FAILED: a grant was opened for a tenant without a database project';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'tenant_has_no_database_project' then raise; end if;
  end;

  v_opened := public.support_grant_open(v_alpha, '  A partner cannot sign in.  ');
  if (v_opened ->> 'access') <> 'read_only'
     or (v_opened ->> 'reason') <> 'A partner cannot sign in.'
     or (v_opened ->> 'operatorLabel') <> 'Ole Example'
     or (v_opened ->> 'expiresAt')::timestamptz > now() + interval '30 minutes'
     or (v_opened ->> 'expiresAt')::timestamptz <= now() then
    raise exception 'PROBE FAILED: an opened grant is not read-only, with its reason, for at most 30 minutes: %', v_opened;
  end if;
  perform set_config('probe.grant', v_opened ->> 'grant', true);

  -- One open grant per tenant.
  begin
    perform public.support_grant_open(v_alpha, 'A second look at the same time.');
    raise exception 'PROBE FAILED: two grants are open for one tenant';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'support_grant_already_open' then raise; end if;
  end;

  -- A grant whose time has passed does not block the next one; it is closed as what it was.
  perform public.support_grant_open(current_setting('probe.beta')::uuid, 'A new question from this tenant.', 5);
  perform public.support_grant_open(current_setting('probe.gamma')::uuid, 'A new question from that tenant.', 5);
end;
$probe$;
reset role;

do $probe$
begin
  if (select count(*) from control.support_access_grants g
       where g.tenant_id = current_setting('probe.beta')::uuid and g.end_cause = 'not_delivered' and g.ended_at = g.expires_at) <> 1
     or (select count(*) from control.support_access_grants g
          where g.tenant_id = current_setting('probe.gamma')::uuid and g.end_cause = 'expired' and g.ended_at = g.expires_at) <> 1 then
    raise exception 'PROBE FAILED: grants whose time had passed were not closed as expired, at the time they expired';
  end if;
  if exists (select 1 from control.support_access_grants g where g.ended_at is null group by g.tenant_id having count(*) > 1) then
    raise exception 'PROBE FAILED: a tenant has two open grants';
  end if;
end;
$probe$;

-- One more grant of the past, still open: nothing can be done under it but closing it.
insert into control.support_access_grants (tenant_id, opened_by, reason, opened_at, expires_at)
values (current_setting('probe.delta')::uuid, current_setting('probe.ole')::uuid, 'A third old made-up reason.',
        now() - interval '40 minutes', now() - interval '10 minutes')
returning set_config('probe.stale_grant', id::text, true);

-- ── What the tenant's project answered, the reads, and the end ──────
select pg_temp.probe_sign_in('ole');
set local role authenticated;
do $probe$
declare
  v_grant constant uuid := current_setting('probe.grant')::uuid;
  v_reads constant jsonb := '[
    {"id": 1, "at": "2026-01-01T10:00:00Z", "kind": "find_account"},
    {"id": 2, "at": "2026-01-01T10:01:00Z", "kind": "account", "subject": "00000000-0000-0000-0000-000000000001"},
    {"id": 3, "at": "2026-01-01T10:02:00Z", "kind": "thread", "threadReason": "The partner asked about this thread."}
  ]'::jsonb;
begin
  begin
    perform public.support_grant_delivery(current_setting('probe.stale_grant')::uuid, 'active', gen_random_uuid());
    raise exception 'PROBE FAILED: a grant whose time has passed was put to use';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'support_grant_expired' then raise; end if;
  end;
  begin
    perform public.support_grant_delivery(v_grant, 'active');
    raise exception 'PROBE FAILED: a delivery without the tenant session was recorded';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.support_grant_delivery(v_grant, 'declined');
    raise exception 'PROBE FAILED: a grant nobody was asked about was recorded as declined';
  exception when invalid_parameter_value then null;
  end;

  -- The tenant chose "ask me first": the grant waits, then the tenant says yes.
  perform public.support_grant_delivery(v_grant, 'awaiting_tenant', gen_random_uuid());
  perform public.support_grant_delivery(v_grant, 'active');
  begin
    perform public.support_grant_delivery(v_grant, 'awaiting_tenant', gen_random_uuid());
    raise exception 'PROBE FAILED: an active grant went back to waiting';
  exception when invalid_parameter_value then null;
  end;

  -- The reads, copied from the tenant's own log. Copying them again adds nothing.
  if public.support_reads_record(v_grant, v_reads) <> 3 then
    raise exception 'PROBE FAILED: three reads were not copied as three';
  end if;
  if public.support_reads_record(v_grant, v_reads || '[{"id": 4, "kind": "location"}]'::jsonb) <> 1 then
    raise exception 'PROBE FAILED: copying the same reads again did not add exactly the new one';
  end if;
  begin
    perform public.support_reads_record(v_grant, '[{"kind": "account"}]'::jsonb);
    raise exception 'PROBE FAILED: a read without its number was copied';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.support_reads_record(v_grant, '{"id": 9, "kind": "account"}'::jsonb);
    raise exception 'PROBE FAILED: something that is not a list of reads was copied';
  exception when invalid_parameter_value then null;
  end;

  perform public.support_grant_close(v_grant);
  begin
    perform public.support_grant_close(v_grant);
    raise exception 'PROBE FAILED: a grant was closed twice';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'support_grant_has_ended' then raise; end if;
  end;
  begin
    perform public.support_grant_delivery(v_grant, 'active', gen_random_uuid());
    raise exception 'PROBE FAILED: a closed grant was put to use again';
  exception when object_not_in_prerequisite_state then null;
  end;
  -- Reads that arrive after the end are still copied (the tenant's log is read once more).
  if public.support_reads_record(v_grant, v_reads) <> 0 then
    raise exception 'PROBE FAILED: reads were copied twice after the grant ended';
  end if;

  -- Closing a grant whose time has passed records it as that, not as the operator's own choice.
  perform public.support_grant_close(current_setting('probe.stale_grant')::uuid);

  -- A tenant that says no ends the grant.
  perform public.support_grant_open(current_setting('probe.alpha')::uuid, 'A second question, later on.', 10);
end;
$probe$;
reset role;

do $probe$
declare
  v_grant control.support_access_grants;
  v_waiting uuid;
begin
  select g.* into v_grant from control.support_access_grants g where g.id = current_setting('probe.grant')::uuid;
  if v_grant.end_cause <> 'closed' or v_grant.reads_copied <> 4 or v_grant.delivery <> 'active' then
    raise exception 'PROBE FAILED: the closed grant is not recorded as closed with its four reads';
  end if;
  if (select count(*) from control.audit_log a where a.action = 'support.read' and a.detail ->> 'grant' = v_grant.id::text) <> 4 then
    raise exception 'PROBE FAILED: the audit log does not hold each read exactly once';
  end if;
  select g.* into v_grant from control.support_access_grants g where g.id = current_setting('probe.stale_grant')::uuid;
  if v_grant.end_cause <> 'not_delivered' or v_grant.ended_at <> v_grant.expires_at then
    raise exception 'PROBE FAILED: a grant closed after its time is not recorded as ended at that time';
  end if;
  select g.id into v_waiting from control.support_access_grants g
   where g.tenant_id = current_setting('probe.alpha')::uuid and g.ended_at is null;
  perform set_config('probe.waiting', v_waiting::text, true);
end;
$probe$;

select pg_temp.probe_sign_in('ole');
set local role authenticated;
do $probe$
declare
  v_listed jsonb;
begin
  perform public.support_grant_delivery(current_setting('probe.waiting')::uuid, 'awaiting_tenant', gen_random_uuid());
  perform public.support_grant_delivery(current_setting('probe.waiting')::uuid, 'declined');
  v_listed := public.support_grants_list(current_setting('probe.alpha')::uuid);
  if jsonb_array_length(v_listed) <> 2
     or (select count(*) from jsonb_array_elements(v_listed) g
          where g ->> 'endCause' = 'declined' and not (g ->> 'open')::boolean) <> 1
     or exists (select 1 from jsonb_array_elements(v_listed) g where (g ->> 'open')::boolean) then
    raise exception 'PROBE FAILED: a declined grant is not listed as ended: %', v_listed;
  end if;
  -- After a no, the next request is a new grant with its own reason.
  perform public.support_grant_open(current_setting('probe.alpha')::uuid, 'Asking once more, with more detail.', 10);
end;
$probe$;
reset role;
