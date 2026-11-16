-- Promise: every change made through the functions writes exactly one audit row, in the same
-- transaction: who, what, which tenant, why, when. A change that is refused leaves no row and
-- no change; reading writes nothing.

select pg_temp.probe_account('ada');
select pg_temp.probe_account('ole');
select control.bootstrap_first_superuser(current_setting('probe.ada')::uuid, 'Ada Example');
select pg_temp.probe_audit(1, 'superuser.bootstrap');

-- ada works on a real session of the signed-in role from here on.
select pg_temp.probe_sign_in('ada');
set local role authenticated;
select public.superuser_add(current_setting('probe.ole')::uuid, 'support_operator', 'Ole Example', 'Joins the support desk.');
select set_config('probe.tenant', public.tenant_create('alpha', 'Example Alpha', 'eu-central-1', 'A made-up tenant.')::text, true);
reset role;
select pg_temp.probe_audit(3, 'tenant.create');

set local role authenticated;
select public.tenant_domain_add(current_setting('probe.tenant')::uuid, 'Alpha.Example', true, 'Its own domain.');
reset role;
select pg_temp.probe_audit(4, 'tenant.domain_add');

set local role authenticated;
select public.tenant_infrastructure_set(
  current_setting('probe.tenant')::uuid,
  '{"databaseProject": "aaaaaaaaaaaaaaaaaaaa", "hostingProject": "prj_Example01", "emailDomain": "alpha.example", "mapKeyLabel": "alpha-web"}'::jsonb,
  'The made-up projects of this tenant.');
reset role;
select pg_temp.probe_audit(5, 'tenant.infrastructure_set');
select set_config('probe.document', pg_temp.probe_entitlements()::text, true);

set local role authenticated;
do $probe$
begin
  if public.tenant_entitlements_set(current_setting('probe.tenant')::uuid, current_setting('probe.document')::jsonb, 'The first plan.') <> 1 then
    raise exception 'PROBE FAILED: the first entitlements are not revision 1';
  end if;
end;
$probe$;
reset role;
select pg_temp.probe_audit(6, 'entitlements.set');

set local role authenticated;
select public.tenant_entitlements_delivered(current_setting('probe.tenant')::uuid, 1);
reset role;
select pg_temp.probe_audit(7, 'entitlements.delivered');

set local role authenticated;
select public.engine_release_record('1.0.0', '0011', 'abcdef0123456789abcdef0123456789', '1.0', 'A made-up release.');
reset role;
select pg_temp.probe_audit(8, 'release.record');

set local role authenticated;
do $probe$
begin
  if public.tenant_schema_state_record(current_setting('probe.tenant')::uuid, '1.0.0', '0011', 'abcdef0123456789abcdef0123456789', true, 'Applied release 1.0.0.') <> 'in_step' then
    raise exception 'PROBE FAILED: a database with the expected head and fingerprint is not reported in step';
  end if;
  if public.tenant_schema_state_record(current_setting('probe.tenant')::uuid, '1.0.0', '0011', '00000000000000000000000000000000') <> 'drifted' then
    raise exception 'PROBE FAILED: a different fingerprint is not reported as drift';
  end if;
end;
$probe$;
reset role;
select pg_temp.probe_audit(10, 'schema.checked');

set local role authenticated;
select set_config('probe.run', public.provisioning_run_start(current_setting('probe.tenant')::uuid, 'provision', 'Creating the made-up tenant.')::text, true);
select public.provisioning_step_record(current_setting('probe.run')::uuid, 'project', 'done');
select public.provisioning_step_record(current_setting('probe.run')::uuid, 'schema', 'done', 'Eleven migrations. Function secrets come later.');
do $probe$
declare
  v_note text;
begin
  -- A note that carries a key, a token or a password is refused, and so is a step told twice.
  foreach v_note in array array[
    'service key: sb_secret_0123456789abcdef',
    'Authorization: Bearer abc123',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'password=hunter2',
    'sent with re_0123456789abcdef'
  ] loop
    begin
      perform public.provisioning_step_record(current_setting('probe.run')::uuid, 'secrets', 'done', v_note);
      raise exception 'PROBE FAILED: a note that looks like a secret was stored: %', v_note;
    exception when invalid_parameter_value then
      if sqlerrm <> 'step_detail_refused' then raise; end if;
    end;
  end loop;
  begin
    perform public.provisioning_step_record(current_setting('probe.run')::uuid, 'schema', 'done');
    raise exception 'PROBE FAILED: a step was recorded twice';
  exception when unique_violation then null;
  end;
end;
$probe$;
select public.provisioning_run_finish(current_setting('probe.run')::uuid);
reset role;
select pg_temp.probe_audit(14, 'provisioning.finish');

set local role authenticated;
select public.usage_totals_record(current_setting('probe.tenant')::uuid, current_date - 1, '{"active_users": 12, "map_requests": 340}'::jsonb);
reset role;
select pg_temp.probe_audit(15, 'usage.record');

set local role authenticated;
select public.tenant_set_status(current_setting('probe.tenant')::uuid, 'live', 'The launch gate was passed.');
reset role;
select pg_temp.probe_audit(16, 'tenant.set_status');

set local role authenticated;
select set_config('probe.grant', public.support_grant_open(current_setting('probe.tenant')::uuid, 'A partner cannot sign in.', 20) ->> 'grant', true);
select public.support_grant_delivery(current_setting('probe.grant')::uuid, 'active', gen_random_uuid());
reset role;
select pg_temp.probe_audit(18, 'support.grant_delivery');

set local role authenticated;
do $probe$
begin
  if public.support_reads_record(current_setting('probe.grant')::uuid,
       '[{"id": 1, "kind": "account"},
         {"id": 2, "kind": "thread", "threadReason": "The partner asked about this thread."}]'::jsonb) <> 2 then
    raise exception 'PROBE FAILED: two reads were not copied as two';
  end if;
end;
$probe$;
select public.support_grant_close(current_setting('probe.grant')::uuid);
reset role;
select pg_temp.probe_audit(21, 'support.grant_close');

set local role authenticated;
select public.tenant_domain_remove(current_setting('probe.tenant')::uuid, 'alpha.example', 'Moved to another domain.');
select public.engine_release_withdraw('1.0.0', 'A made-up fault.');
select public.superuser_revoke(current_setting('probe.ole')::uuid, 'Left the support desk.');
reset role;
select pg_temp.probe_audit(24, 'superuser.revoke');

-- ── What the rows say ───────────────────────────────────────────────
do $probe$
declare
  v_ada constant uuid := current_setting('probe.ada')::uuid;
  v_tenant constant uuid := current_setting('probe.tenant')::uuid;
  v_row control.audit_log;
begin
  if exists (select 1 from control.audit_log a where a.actor <> v_ada) then
    raise exception 'PROBE FAILED: an audit row names somebody other than the person who acted';
  end if;
  if (select count(distinct a.at) from control.audit_log a) <> 1 then
    raise exception 'PROBE FAILED: rows of one transaction do not carry one time';
  end if;
  if exists (select 1 from control.audit_log a
              where a.action in ('superuser.add', 'superuser.revoke', 'tenant.create', 'tenant.set_status',
                                 'tenant.domain_add', 'tenant.domain_remove', 'tenant.infrastructure_set',
                                 'entitlements.set', 'release.withdraw', 'provisioning.start', 'support.grant_open')
                and a.reason is null) then
    raise exception 'PROBE FAILED: a change that needs a reason was logged without one';
  end if;
  if exists (select 1 from control.audit_log a
              where (a.action like 'tenant.%' or a.action like 'entitlements.%' or a.action like 'support.%'
                     or a.action like 'schema.%' or a.action like 'provisioning.%' or a.action like 'usage.%')
                and a.tenant_id is distinct from v_tenant) then
    raise exception 'PROBE FAILED: a row about a tenant does not name the tenant';
  end if;
  select a.* into v_row from control.audit_log a where a.action = 'entitlements.set';
  if v_row.detail -> 'after' <> current_setting('probe.document')::jsonb or (v_row.detail ->> 'revision') <> '1' then
    raise exception 'PROBE FAILED: the entitlements row does not hold what was set';
  end if;
  select a.* into v_row from control.audit_log a where a.action = 'tenant.domain_add';
  if (v_row.detail ->> 'domain') <> 'alpha.example' then
    raise exception 'PROBE FAILED: the domain was not stored in lower case';
  end if;
  if (select count(*) from control.audit_log a where a.action = 'support.read') <> 2
     or not exists (select 1 from control.audit_log a
                     where a.action = 'support.read' and a.reason = 'The partner asked about this thread.') then
    raise exception 'PROBE FAILED: the copied support reads are not in the audit log with their reason';
  end if;
end;
$probe$;

-- ── A refused change leaves nothing; reading writes nothing ─────────
set local role authenticated;
do $probe$
begin
  begin
    perform public.tenant_create('beta', 'Example Beta', 'eu-central-1', '   ');
    raise exception 'PROBE FAILED: a tenant was created without a reason';
  exception when invalid_parameter_value then
    if sqlerrm <> 'reason_required' then raise; end if;
  end;
  begin
    perform public.tenant_create('alpha', 'Example Alpha again', 'eu-central-1', 'The same name twice.');
    raise exception 'PROBE FAILED: two tenants share a name';
  exception when unique_violation then null;
  end;
  begin
    perform public.tenant_set_status(current_setting('probe.tenant')::uuid, 'building', 'Going back.');
    raise exception 'PROBE FAILED: a live tenant went back to building';
  exception when invalid_parameter_value then null;
  end;
  perform public.tenants_list();
  perform public.tenant_get(current_setting('probe.tenant')::uuid);
  perform public.audit_log_read();
  perform public.superusers_list();
  perform public.usage_totals_read(null, null, null);
end;
$probe$;
reset role;
select pg_temp.probe_audit(24, 'superuser.revoke');

do $probe$
begin
  if (select count(*) from control.tenants) <> 1 then
    raise exception 'PROBE FAILED: a refused change left a tenant behind';
  end if;
end;
$probe$;

-- ── What a Superuser reads back ─────────────────────────────────────
select pg_temp.probe_sign_in('ada');
set local role authenticated;
do $probe$
declare
  v_tenant jsonb := public.tenant_get(current_setting('probe.tenant')::uuid);
  v_log jsonb := public.audit_log_read(current_setting('probe.tenant')::uuid, null, 5);
begin
  if (v_tenant -> 'tenant' ->> 'status') <> 'live'
     or (v_tenant -> 'infrastructure' ->> 'databaseProject') <> 'aaaaaaaaaaaaaaaaaaaa'
     or (v_tenant -> 'entitlements' ->> 'deliveredRevision') <> '1'
     or (v_tenant -> 'schemaState' ->> 'drift') <> 'drifted'
     or jsonb_array_length(v_tenant -> 'provisioningRuns') <> 1
     or jsonb_array_length(v_tenant -> 'provisioningRuns' -> 0 -> 'steps') <> 2 then
    raise exception 'PROBE FAILED: what is read back about a tenant is not what was written: %', v_tenant;
  end if;
  if jsonb_array_length(v_log) <> 5 or (v_log -> 0 ->> 'action') <> 'tenant.domain_remove' then
    raise exception 'PROBE FAILED: the audit log is not read newest first, a page at a time';
  end if;
  if jsonb_array_length(public.usage_totals_read(current_setting('probe.tenant')::uuid, null, null)) <> 2 then
    raise exception 'PROBE FAILED: the usage totals are not read back';
  end if;
end;
$probe$;
reset role;
