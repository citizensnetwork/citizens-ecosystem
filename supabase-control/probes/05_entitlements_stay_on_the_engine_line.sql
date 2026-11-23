-- Promise: what a tenant is allowed can only ever be something the engine line carries. A document
-- for another database line is refused, and so is a "yes" for a feature that needs another line,
-- whatever the caller's server checked or forgot to check.

select pg_temp.probe_cast();
select pg_temp.probe_tenant('alpha', 'aaaaaaaaaaaaaaaaaaaa');

select set_config('probe.good', pg_temp.probe_entitlements('{"partnerInvitations": true, "communityIdeas": true, "aiSearch": false}'::jsonb)::text, true);
select set_config('probe.other_line', pg_temp.probe_entitlements('{"partnerInvitations": true}'::jsonb, 'citizens')::text, true);
select set_config('probe.not_grantable', pg_temp.probe_entitlements('{"partnerInvitations": true, "aiSearch": true}'::jsonb)::text, true);
select set_config('probe.unknown', pg_temp.probe_entitlements('{"teleportation": true}'::jsonb)::text, true);
select set_config('probe.not_boolean', pg_temp.probe_entitlements('{"partnerInvitations": "yes"}'::jsonb)::text, true);
select set_config('probe.no_limits', (pg_temp.probe_entitlements() - 'limits')::text, true);

select pg_temp.probe_sign_in('ada');
set local role authenticated;
do $probe$
declare
  v_alpha constant uuid := current_setting('probe.alpha')::uuid;
begin
  begin
    perform public.tenant_entitlements_set(v_alpha, current_setting('probe.other_line')::jsonb, 'A document for another line.');
    raise exception 'PROBE FAILED: a document for another database line was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'entitlements_not_for_the_engine_line' then raise; end if;
  end;
  begin
    perform public.tenant_entitlements_set(v_alpha, current_setting('probe.not_grantable')::jsonb, 'A feature of another line.');
    raise exception 'PROBE FAILED: a feature that needs another database line was allowed';
  exception when invalid_parameter_value then
    if sqlerrm <> 'feature_not_grantable: aiSearch' then raise; end if;
  end;
  begin
    perform public.tenant_entitlements_set(v_alpha, current_setting('probe.unknown')::jsonb, 'A feature nobody built.');
    raise exception 'PROBE FAILED: a feature the engine does not have was allowed';
  exception when invalid_parameter_value then
    if sqlerrm <> 'feature_not_grantable: teleportation' then raise; end if;
  end;
  begin
    perform public.tenant_entitlements_set(v_alpha, current_setting('probe.not_boolean')::jsonb, 'Not a yes or a no.');
    raise exception 'PROBE FAILED: a feature that is neither yes nor no was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.tenant_entitlements_set(v_alpha, current_setting('probe.no_limits')::jsonb, 'A part is missing.');
    raise exception 'PROBE FAILED: a document without its limits was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.tenant_entitlements_set(v_alpha, '[]'::jsonb, 'Not a document.');
    raise exception 'PROBE FAILED: a list was accepted as a document';
  exception when invalid_parameter_value then null;
  end;

  -- A feature of another line may be named as long as the answer is no.
  if public.tenant_entitlements_set(v_alpha, current_setting('probe.good')::jsonb, 'The first plan.') <> 1 then
    raise exception 'PROBE FAILED: the first document is not revision 1';
  end if;
  if public.tenant_entitlements_set(v_alpha, current_setting('probe.good')::jsonb - 'nothing', 'The plan again.') <> 2 then
    raise exception 'PROBE FAILED: the second document is not revision 2';
  end if;

  -- Only the current revision can be recorded as delivered to the tenant's project.
  begin
    perform public.tenant_entitlements_delivered(v_alpha, 1);
    raise exception 'PROBE FAILED: an old revision was recorded as delivered';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'not_the_current_revision' then raise; end if;
  end;
  perform public.tenant_entitlements_delivered(v_alpha, 2);
end;
$probe$;
reset role;

do $probe$
declare
  v_row control.tenant_entitlements;
begin
  select e.* into v_row from control.tenant_entitlements e where e.tenant_id = current_setting('probe.alpha')::uuid;
  if v_row.revision <> 2 or v_row.delivered_revision <> 2 or v_row.document <> current_setting('probe.good')::jsonb then
    raise exception 'PROBE FAILED: the stored document is not the one that was set';
  end if;
  -- Refused attempts wrote nothing: two sets and one delivery, after the four rows of the set-up.
  if (select count(*) from control.audit_log) <> 7 then
    raise exception 'PROBE FAILED: a refused document left an audit row';
  end if;
  -- The table itself refuses another line, even for the owner of the database; and a document
  -- that does not say which line it is for is refused like one for another line.
  begin
    update control.tenant_entitlements set document = current_setting('probe.other_line')::jsonb;
    raise exception 'PROBE FAILED: the table accepted a document for another line';
  exception when check_violation then null;
  end;
  begin
    update control.tenant_entitlements set document = document - 'schemaLine';
    raise exception 'PROBE FAILED: the table accepted a document that names no line';
  exception when check_violation then null;
  end;
  begin
    update control.tenant_entitlements set document = document - 'requirements';
    raise exception 'PROBE FAILED: the table accepted a document with a part missing';
  exception when check_violation then null;
  end;
  if exists (select 1 from control.grantable_features g
              where g.feature in ('publicApi', 'aiSearch', 'listingAutomation', 'formIntake', 'personalisationGames')) then
    raise exception 'PROBE FAILED: a feature of another database line is on the list of what can be allowed';
  end if;
end;
$probe$;
