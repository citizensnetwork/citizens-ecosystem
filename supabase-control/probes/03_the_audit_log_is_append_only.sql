-- Promise: the audit log only grows. No update, no delete, no truncate: not for the data API
-- roles (they hold no privilege at all, probe 01), and not for the owner of the database either.
-- The same goes for what a support grant said when it was opened.

select pg_temp.probe_cast();
select pg_temp.probe_tenant('alpha', 'aaaaaaaaaaaaaaaaaaaa');

select pg_temp.probe_sign_in('ole');
set local role authenticated;
select set_config('probe.grant', public.support_grant_open(current_setting('probe.alpha')::uuid, 'A partner cannot sign in.') ->> 'grant', true);
reset role;

-- All of this runs as the owner of the tables: the strongest role there is in a hosted project.
do $probe$
begin
  begin
    update control.audit_log set reason = 'rewritten';
    raise exception 'PROBE FAILED: an audit row was rewritten';
  exception when raise_exception then
    if sqlerrm not like 'audit_log_is_append_only:%' then raise; end if;
  end;
  begin
    update control.audit_log set actor = current_setting('probe.eve')::uuid where action = 'tenant.create';
    raise exception 'PROBE FAILED: an audit row was given another actor';
  exception when raise_exception then
    if sqlerrm not like 'audit_log_is_append_only:%' then raise; end if;
  end;
  begin
    delete from control.audit_log where action = 'support.grant_open';
    raise exception 'PROBE FAILED: an audit row was deleted';
  exception when raise_exception then
    if sqlerrm not like 'audit_log_is_append_only:%' then raise; end if;
  end;
  begin
    truncate control.audit_log;
    raise exception 'PROBE FAILED: the audit log was emptied';
  exception when raise_exception then
    if sqlerrm not like 'audit_log_is_append_only:%' then raise; end if;
  end;
  if (select count(*) from control.audit_log) <> 5 then
    raise exception 'PROBE FAILED: the audit log does not hold its five rows';
  end if;
end;
$probe$;

-- A support grant: its facts are fixed, it is never deleted, and once ended it stays ended.
do $probe$
declare
  v_grant constant uuid := current_setting('probe.grant')::uuid;
begin
  begin
    update control.support_access_grants set reason = 'Another reason entirely.' where id = v_grant;
    raise exception 'PROBE FAILED: the reason of a grant was changed';
  exception when raise_exception then
    if sqlerrm <> 'support_grant_facts_are_fixed' then raise; end if;
  end;
  begin
    update control.support_access_grants set expires_at = expires_at + interval '5 minutes' where id = v_grant;
    raise exception 'PROBE FAILED: a grant was made to last longer';
  exception when raise_exception then
    if sqlerrm <> 'support_grant_facts_are_fixed' then raise; end if;
  end;
  begin
    update control.support_access_grants set access = 'read_write' where id = v_grant;
    raise exception 'PROBE FAILED: a grant was made writable';
  exception when raise_exception or check_violation then
    if sqlerrm <> 'support_grant_facts_are_fixed' and sqlerrm not like '%support_access_grants_read_only%' then raise; end if;
  end;
  begin
    delete from control.support_access_grants where id = v_grant;
    raise exception 'PROBE FAILED: a grant was deleted';
  exception when raise_exception then
    if sqlerrm not like 'support_grants_are_kept:%' then raise; end if;
  end;
  begin
    truncate control.support_access_grants;
    raise exception 'PROBE FAILED: the grants were emptied';
  exception when raise_exception then
    if sqlerrm not like 'support_grants_are_kept:%' then raise; end if;
  end;
end;
$probe$;

select pg_temp.probe_sign_in('ole');
set local role authenticated;
select public.support_grant_close(current_setting('probe.grant')::uuid);
reset role;

do $probe$
begin
  begin
    update control.support_access_grants set ended_at = null, end_cause = null where id = current_setting('probe.grant')::uuid;
    raise exception 'PROBE FAILED: an ended grant was opened again';
  exception when raise_exception then
    if sqlerrm <> 'support_grant_has_ended' then raise; end if;
  end;
end;
$probe$;

-- A grant can never be anything but read-only, whoever inserts it.
do $probe$
begin
  begin
    insert into control.support_access_grants (tenant_id, opened_by, reason, access, expires_at)
    values (current_setting('probe.alpha')::uuid, current_setting('probe.ada')::uuid, 'A made-up reason.', 'read_write', now() + interval '10 minutes');
    raise exception 'PROBE FAILED: a writable grant exists';
  exception when check_violation then null;
  end;
  begin
    insert into control.support_access_grants (tenant_id, opened_by, reason, expires_at)
    values (current_setting('probe.alpha')::uuid, current_setting('probe.ada')::uuid, 'A made-up reason.', now() + interval '31 minutes');
    raise exception 'PROBE FAILED: a grant lasts longer than 30 minutes';
  exception when check_violation then null;
  end;
end;
$probe$;
