-- Promise: a tenant moves only along the allowed path (building, live, suspended, retired);
-- retiring is final and waits for an export or transfer to be offered; and the control plane holds
-- identifiers only: a value shaped like a key, a token or a password is refused by the table.

select pg_temp.probe_cast();
select pg_temp.probe_tenant('alpha', 'aaaaaaaaaaaaaaaaaaaa');
select pg_temp.probe_tenant('beta', 'bbbbbbbbbbbbbbbbbbbb');

select pg_temp.probe_sign_in('ada');
set local role authenticated;

-- ── The path of a tenant ────────────────────────────────────────────
do $probe$
declare
  v_alpha constant uuid := current_setting('probe.alpha')::uuid;
  v_run uuid;
  v_grant uuid;
begin
  begin
    perform public.tenant_set_status(v_alpha, 'suspended', 'Skipping a step.');
    raise exception 'PROBE FAILED: a tenant that was never live was suspended';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.tenant_set_status(v_alpha, 'paused', 'A status that does not exist.');
    raise exception 'PROBE FAILED: a made-up status was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.tenant_set_status(v_alpha, 'live', 'The launch gate was passed.');
  perform public.tenant_set_status(v_alpha, 'suspended', 'The invoice is overdue.');
  perform public.tenant_set_status(v_alpha, 'live', 'The invoice was paid.');
  begin
    perform public.tenant_set_status(v_alpha, 'retired', 'The tenant is leaving.');
    raise exception 'PROBE FAILED: a tenant was retired before an export or transfer was offered';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'export_or_transfer_must_be_offered_first' then raise; end if;
  end;
  -- Nothing is left half done when a tenant is retired: not a provisioning run, not a support grant.
  v_run := public.provisioning_run_start(v_alpha, 'retire', 'Taking the tenant down.');
  begin
    perform public.tenant_set_status(v_alpha, 'retired', 'The tenant is leaving.', true);
    raise exception 'PROBE FAILED: a tenant was retired while a provisioning run was still running';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'tenant_has_open_work' then raise; end if;
  end;
  perform public.provisioning_run_finish(v_run);
  v_grant := (public.support_grant_open(v_alpha, 'One last question before the end.', 5) ->> 'grant')::uuid;
  begin
    perform public.tenant_set_status(v_alpha, 'retired', 'The tenant is leaving.', true);
    raise exception 'PROBE FAILED: a tenant was retired while a support grant was still open';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'tenant_has_open_work' then raise; end if;
  end;
  perform public.support_grant_close(v_grant);
  perform public.tenant_set_status(v_alpha, 'retired', 'The tenant is leaving.', true);

  -- Retired is final: nothing about the tenant changes any more, and no support access opens.
  begin
    perform public.tenant_set_status(v_alpha, 'live', 'Coming back.');
    raise exception 'PROBE FAILED: a retired tenant came back';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'tenant_retired' then raise; end if;
  end;
  begin
    perform public.tenant_domain_add(v_alpha, 'alpha.example', true, 'After the end.');
    raise exception 'PROBE FAILED: a retired tenant got a domain';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.support_grant_open(v_alpha, 'After the end.');
    raise exception 'PROBE FAILED: support access was opened on a retired tenant';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$probe$;

-- ── Identifiers only ────────────────────────────────────────────────
do $probe$
declare
  v_beta constant uuid := current_setting('probe.beta')::uuid;
  v_value text;
begin
  -- Each of these is shaped like a secret or an address, not like an identifier.
  foreach v_value in array array[
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl',
    'sb_secret_0123456789abcdefghij',
    'sbp_' || repeat('0a', 20),
    'https://bbbbbbbbbbbbbbbbbbbb.example',
    'BBBBBBBBBBBBBBBBBBBB',
    'bbbbbbbbbbbbbbbbbbbb; drop'
  ] loop
    begin
      perform public.tenant_infrastructure_set(v_beta, jsonb_build_object('databaseProject', v_value), 'A value that is not an identifier.');
      raise exception 'PROBE FAILED: "%" was stored as a database project', v_value;
    exception when check_violation then null;
    end;
  end loop;
  foreach v_value in array array['AbCdEfGhIjKlMnOpQrSt', 'abcdefghijklmnopqrst', 'key', 'alpha web', 'pk.eyJ1IjoiZXhhbXBsZSJ9'] loop
    begin
      perform public.tenant_infrastructure_set(v_beta, jsonb_build_object('mapKeyLabel', v_value), 'A value that is not a label.');
      raise exception 'PROBE FAILED: "%" was stored as the label of a map key', v_value;
    exception when check_violation then null;
    end;
  end loop;
  begin
    perform public.tenant_infrastructure_set(v_beta, '{"hostingProject": "re_0123456789abcdef"}'::jsonb, 'A sending key.');
    raise exception 'PROBE FAILED: a sending key was stored as a hosting project';
  exception when check_violation then null;
  end;
  begin
    perform public.tenant_infrastructure_set(v_beta, '{"emailDomain": "no-reply@beta.example"}'::jsonb, 'An address, not a domain.');
    raise exception 'PROBE FAILED: an email address was stored as a domain';
  exception when check_violation then null;
  end;
  begin
    perform public.tenant_infrastructure_set(v_beta, '{"serviceKey": "anything"}'::jsonb, 'A column that does not exist.');
    raise exception 'PROBE FAILED: an unknown identifier was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'unknown_identifier: serviceKey' then raise; end if;
  end;
  begin
    perform public.tenant_infrastructure_set(v_beta, '{"databaseProject": {"ref": "x"}}'::jsonb, 'Not a text.');
    raise exception 'PROBE FAILED: an identifier that is not a text was accepted';
  exception when invalid_parameter_value then null;
  end;
  -- One database project belongs to one tenant.
  begin
    perform public.tenant_infrastructure_set(v_beta, '{"databaseProject": "aaaaaaaaaaaaaaaaaaaa"}'::jsonb, 'The project of another tenant.');
    raise exception 'PROBE FAILED: two tenants share a database project';
  exception when unique_violation then null;
  end;
  -- What identifiers look like. A key that is left out keeps its value; null clears one.
  perform public.tenant_infrastructure_set(
    v_beta, '{"hostingProject": "prj_Example02", "emailDomain": "mail.beta.example", "mapKeyLabel": "beta-web"}'::jsonb,
    'The made-up projects of this tenant.');
  perform public.tenant_infrastructure_set(v_beta, '{"mapKeyLabel": null}'::jsonb, 'The key was removed.');
end;
$probe$;

-- ── Domains ─────────────────────────────────────────────────────────
do $probe$
declare
  v_beta constant uuid := current_setting('probe.beta')::uuid;
  v_value text;
begin
  foreach v_value in array array['beta', 'https://beta.example', 'beta.example/path', '-beta.example', 'beta..example', 'be ta.example'] loop
    begin
      perform public.tenant_domain_add(v_beta, v_value, false, 'Not a domain.');
      raise exception 'PROBE FAILED: "%" was stored as a domain', v_value;
    exception when check_violation then null;
    end;
  end loop;
  perform public.tenant_domain_add(v_beta, 'beta.example', true, 'Its first domain.');
  perform public.tenant_domain_add(v_beta, 'WWW.Beta.Example', true, 'Its main domain from now on.');
  begin
    perform public.tenant_domain_add(v_beta, 'www.beta.example', false, 'The same domain twice.');
    raise exception 'PROBE FAILED: a domain was added twice';
  exception when unique_violation then null;
  end;
  begin
    perform public.tenant_domain_remove(v_beta, 'other.example', 'A domain it never had.');
    raise exception 'PROBE FAILED: a domain that was never there was removed';
  exception when no_data_found then null;
  end;
end;
$probe$;
reset role;

do $probe$
declare
  v_beta constant uuid := current_setting('probe.beta')::uuid;
  v_row control.tenant_infrastructure;
begin
  select i.* into v_row from control.tenant_infrastructure i where i.tenant_id = v_beta;
  if v_row.database_project <> 'bbbbbbbbbbbbbbbbbbbb' or v_row.hosting_project <> 'prj_Example02'
     or v_row.email_domain <> 'mail.beta.example' or v_row.map_key_label is not null then
    raise exception 'PROBE FAILED: the identifiers are not what was set';
  end if;
  if (select count(*) from control.tenant_domains d where d.tenant_id = v_beta) <> 2
     or (select d.domain from control.tenant_domains d where d.tenant_id = v_beta and d.is_primary) <> 'www.beta.example' then
    raise exception 'PROBE FAILED: a tenant does not have exactly one main domain, in lower case';
  end if;
  if (select t.status from control.tenants t where t.id = current_setting('probe.alpha')::uuid) <> 'retired'
     or (select t.retired_at from control.tenants t where t.id = current_setting('probe.alpha')::uuid) is null then
    raise exception 'PROBE FAILED: the retired tenant is not recorded as retired';
  end if;
  -- Retiring deleted nothing.
  if not exists (select 1 from control.tenant_infrastructure i where i.tenant_id = current_setting('probe.alpha')::uuid) then
    raise exception 'PROBE FAILED: retiring a tenant deleted its records';
  end if;
end;
$probe$;
