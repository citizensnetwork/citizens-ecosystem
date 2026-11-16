-- Control plane 0002: the only way in.
--
-- The functions in "public" are the whole surface of the control plane. Each one:
--   * runs with its owner's rights and an empty search path, and can be called by the signed-in
--     role only (never by a visitor, never by the service role);
--   * starts with control.require_superuser(...), in its declarations, before anything else;
--   * writes its audit row in the same transaction as the change.
-- The helpers in "control" are private: no role that speaks through the data API can reach them.

-- ── The gate ────────────────────────────────────────────────────────
-- The caller must be signed in to THIS project, with a second factor on this very session, and be
-- on the list. The second factor is read from the session itself, so it holds whatever a screen
-- or a server forgets to check. `_least` is the lowest role allowed: 'superuser' (the default) or
-- 'support_operator'.
create function control.require_superuser(_least text default 'superuser')
returns control.superusers
language plpgsql
stable
set search_path = ''
as $gate$
declare
  v_account uuid := auth.uid();
  v_row control.superusers;
begin
  if _least is null or _least not in ('superuser', 'support_operator') then
    raise exception 'unknown_role_level' using errcode = '22023';
  end if;
  if v_account is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'second_factor_required' using errcode = '42501';
  end if;
  select s.* into v_row from control.superusers s where s.user_id = v_account and s.status = 'active';
  if not found then
    raise exception 'not_a_superuser' using errcode = '42501';
  end if;
  if _least = 'superuser' and v_row.role <> 'superuser' then
    raise exception 'superuser_only' using errcode = '42501';
  end if;
  return v_row;
end;
$gate$;

-- A reason, trimmed. Required unless told otherwise; always 5 to 500 characters when given.
create function control.reason(_reason text, _required boolean default true)
returns text
language plpgsql
immutable
set search_path = ''
as $reason$
declare
  v_reason text := nullif(btrim(coalesce(_reason, '')), '');
begin
  if v_reason is null then
    if _required then
      raise exception 'reason_required' using errcode = '22023';
    end if;
    return null;
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'reason_must_be_5_to_500_characters' using errcode = '22023';
  end if;
  return v_reason;
end;
$reason$;

-- The one writer of the audit log. Returns the new row's id, or null when `_source_ref` names an
-- entry that is already there.
create function control.write_audit(
  _actor control.superusers,
  _action text,
  _tenant uuid,
  _reason text,
  _detail jsonb default '{}'::jsonb,
  _source_ref text default null
)
returns bigint
language plpgsql
set search_path = ''
as $audit$
declare
  v_id bigint;
begin
  if _actor.user_id is null then
    raise exception 'audit_needs_an_actor';
  end if;
  insert into control.audit_log (actor_kind, actor, action, tenant_id, reason, detail, source_ref)
  values (_actor.role, _actor.user_id, _action, _tenant, _reason, coalesce(_detail, '{}'::jsonb), _source_ref)
  on conflict (source_ref) where source_ref is not null do nothing
  returning id into v_id;
  return v_id;
end;
$audit$;

-- A tenant that may still be changed, locked for the rest of the transaction.
create function control.tenant_for_change(_tenant uuid)
returns control.tenants
language plpgsql
set search_path = ''
as $tenant$
declare
  v_tenant control.tenants;
begin
  select t.* into v_tenant from control.tenants t where t.id = _tenant for update;
  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  if v_tenant.status = 'retired' then
    raise exception 'tenant_retired' using errcode = '55000';
  end if;
  return v_tenant;
end;
$tenant$;

-- ── The first Superuser ─────────────────────────────────────────────
-- Run once, by the database owner, when the control-plane project is created. It refuses as soon
-- as the list has ever held anyone, so it cannot be used to add a second person or to come back
-- after a revocation. Everyone after the first is added by a Superuser, through superuser_add.
create function control.bootstrap_first_superuser(_account uuid, _display_name text)
returns void
language plpgsql
set search_path = ''
as $bootstrap$
begin
  lock table control.superusers in exclusive mode;
  if exists (select 1 from control.superusers) then
    raise exception 'bootstrap_already_done' using errcode = '55000';
  end if;
  insert into control.superusers (user_id, role, display_name)
  values (_account, 'superuser', btrim(_display_name));
  insert into control.audit_log (actor_kind, actor, action, reason, detail)
  values ('bootstrap', _account, 'superuser.bootstrap', 'The first Superuser, created by the database owner.',
          jsonb_build_object('displayName', btrim(_display_name)));
end;
$bootstrap$;

revoke all on function control.require_superuser(text) from public, anon, authenticated, service_role;
revoke all on function control.reason(text, boolean) from public, anon, authenticated, service_role;
revoke all on function control.write_audit(control.superusers, text, uuid, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function control.tenant_for_change(uuid) from public, anon, authenticated, service_role;
revoke all on function control.bootstrap_first_superuser(uuid, text) from public, anon, authenticated, service_role;

-- ── Superusers ──────────────────────────────────────────────────────
create function public.whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser('support_operator');
begin
  return jsonb_build_object('account', v_actor.user_id, 'role', v_actor.role, 'displayName', v_actor.display_name);
end;
$fn$;

create function public.superusers_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'account', s.user_id, 'role', s.role, 'displayName', s.display_name, 'status', s.status,
             'addedAt', s.added_at, 'addedBy', s.added_by, 'revokedAt', s.revoked_at, 'revokedBy', s.revoked_by)
             order by s.added_at, s.user_id)
      from control.superusers s), '[]'::jsonb);
end;
$fn$;

-- The account must already exist in this project's sign-in (it is invited there first).
create function public.superuser_add(_account uuid, _role text, _display_name text, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
begin
  if _account is null or not exists (select 1 from auth.users u where u.id = _account) then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from control.superusers s where s.user_id = _account and s.status = 'active') then
    raise exception 'already_listed' using errcode = '23505';
  end if;
  insert into control.superusers (user_id, role, display_name, added_by)
  values (_account, _role, btrim(_display_name), v_actor.user_id)
  on conflict (user_id) do update
    set role = excluded.role,
        display_name = excluded.display_name,
        status = 'active',
        added_at = now(),
        added_by = excluded.added_by,
        revoked_at = null,
        revoked_by = null;
  perform control.write_audit(v_actor, 'superuser.add', null, v_reason,
    jsonb_build_object('account', _account, 'role', _role, 'displayName', btrim(_display_name)));
end;
$fn$;

-- Nobody takes themselves off the list, so the list can never become empty.
-- Two Superusers who revoke each other at the same moment must not both succeed, or the list would
-- be left with nobody. So each one first locks its OWN row, still active. Of two such calls, one
-- then waits for the other; when it goes on, it finds its own row revoked and stops (or the
-- database ends one of the two as a deadlock). Either way, one of the two stays on the list.
create function public.superuser_revoke(_account uuid, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
begin
  if _account is null then
    raise exception 'not_listed' using errcode = 'P0002';
  end if;
  if _account = v_actor.user_id then
    raise exception 'cannot_revoke_yourself' using errcode = '22023';
  end if;
  perform 1 from control.superusers s where s.user_id = v_actor.user_id and s.status = 'active' for update;
  if not found then
    raise exception 'not_a_superuser' using errcode = '42501';
  end if;
  update control.superusers s
     set status = 'revoked', revoked_at = now(), revoked_by = v_actor.user_id
   where s.user_id = _account and s.status = 'active';
  if not found then
    raise exception 'not_listed' using errcode = 'P0002';
  end if;
  perform control.write_audit(v_actor, 'superuser.revoke', null, v_reason, jsonb_build_object('account', _account));
end;
$fn$;

-- ── Tenants ─────────────────────────────────────────────────────────
create function public.tenant_create(_slug text, _display_name text, _region text, _reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
  v_id uuid;
begin
  insert into control.tenants (slug, display_name, region, created_by)
  values (btrim(_slug), btrim(_display_name), btrim(_region), v_actor.user_id)
  returning id into v_id;
  perform control.write_audit(v_actor, 'tenant.create', v_id, v_reason,
    jsonb_build_object('slug', btrim(_slug), 'displayName', btrim(_display_name), 'region', btrim(_region)));
  return v_id;
end;
$fn$;

-- building -> live; live <-> suspended; anything but retired -> retired. Suspending switches a
-- world off and deletes nothing. Retiring is final, and is refused until the tenant has been
-- offered an export or a transfer of its project.
create function public.tenant_set_status(_tenant uuid, _status text, _reason text, _export_offered boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
  v_tenant control.tenants := control.tenant_for_change(_tenant);
begin
  if not coalesce(
       (v_tenant.status = 'building' and _status in ('live', 'retired'))
       or (v_tenant.status = 'live' and _status in ('suspended', 'retired'))
       or (v_tenant.status = 'suspended' and _status in ('live', 'retired')), false) then
    raise exception 'status_change_not_allowed: % to %', v_tenant.status, coalesce(_status, 'nothing')
      using errcode = '22023';
  end if;
  if _status = 'retired' and _export_offered is not true then
    raise exception 'export_or_transfer_must_be_offered_first' using errcode = '55000';
  end if;
  -- Nothing may be left half done on a retired tenant: a provisioning run still running could go
  -- on recording steps, and an open support grant could still be used. Finish or close them first.
  -- (A grant whose time has passed is no longer open: it cannot be used.)
  if _status = 'retired' and (
       exists (select 1 from control.provisioning_runs r where r.tenant_id = _tenant and r.status = 'running')
       or exists (select 1 from control.support_access_grants g
                   where g.tenant_id = _tenant and g.ended_at is null and g.expires_at > now())) then
    raise exception 'tenant_has_open_work' using errcode = '55000';
  end if;
  update control.tenants t
     set status = _status,
         live_at = case when _status = 'live' and t.live_at is null then now() else t.live_at end,
         suspended_at = case when _status = 'suspended' then now() when _status = 'live' then null else t.suspended_at end,
         retired_at = case when _status = 'retired' then now() else null end,
         updated_at = now()
   where t.id = _tenant;
  perform control.write_audit(v_actor, 'tenant.set_status', _tenant, v_reason,
    jsonb_build_object('from', v_tenant.status, 'to', _status)
      || case when _status = 'retired' then jsonb_build_object('exportOffered', true) else '{}'::jsonb end);
end;
$fn$;

create function public.tenant_domain_add(_tenant uuid, _domain text, _primary boolean, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
  v_tenant control.tenants := control.tenant_for_change(_tenant);
  v_domain text := lower(btrim(_domain));
begin
  if coalesce(_primary, false) then
    update control.tenant_domains d set is_primary = false where d.tenant_id = _tenant and d.is_primary;
  end if;
  insert into control.tenant_domains (domain, tenant_id, is_primary, added_by)
  values (v_domain, _tenant, coalesce(_primary, false), v_actor.user_id);
  perform control.write_audit(v_actor, 'tenant.domain_add', _tenant, v_reason,
    jsonb_build_object('domain', v_domain, 'primary', coalesce(_primary, false)));
end;
$fn$;

create function public.tenant_domain_remove(_tenant uuid, _domain text, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
  v_tenant control.tenants := control.tenant_for_change(_tenant);
  v_domain text := lower(btrim(_domain));
begin
  delete from control.tenant_domains d where d.tenant_id = _tenant and d.domain = v_domain;
  if not found then
    raise exception 'domain_not_found' using errcode = 'P0002';
  end if;
  perform control.write_audit(v_actor, 'tenant.domain_remove', _tenant, v_reason, jsonb_build_object('domain', v_domain));
end;
$fn$;

-- `_identifiers` may hold databaseProject, hostingProject, emailDomain and mapKeyLabel. A key that
-- is left out keeps its value; a key given as null is cleared. Anything else is refused, and the
-- table itself refuses a value that is not shaped like an identifier.
create function public.tenant_infrastructure_set(_tenant uuid, _identifiers jsonb, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
  v_tenant control.tenants := control.tenant_for_change(_tenant);
  v_unknown text;
begin
  if _identifiers is null or jsonb_typeof(_identifiers) <> 'object' or _identifiers = '{}'::jsonb then
    raise exception 'identifiers_required' using errcode = '22023';
  end if;
  select k into v_unknown from jsonb_object_keys(_identifiers) k
   where k not in ('databaseProject', 'hostingProject', 'emailDomain', 'mapKeyLabel') limit 1;
  if v_unknown is not null then
    raise exception 'unknown_identifier: %', v_unknown using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(_identifiers) e where jsonb_typeof(e.value) not in ('string', 'null')) then
    raise exception 'identifiers_must_be_text' using errcode = '22023';
  end if;
  insert into control.tenant_infrastructure (tenant_id, updated_by) values (_tenant, v_actor.user_id)
  on conflict (tenant_id) do nothing;
  update control.tenant_infrastructure i
     set database_project = case when _identifiers ? 'databaseProject' then _identifiers ->> 'databaseProject' else i.database_project end,
         hosting_project = case when _identifiers ? 'hostingProject' then _identifiers ->> 'hostingProject' else i.hosting_project end,
         email_domain = case when _identifiers ? 'emailDomain' then _identifiers ->> 'emailDomain' else i.email_domain end,
         map_key_label = case when _identifiers ? 'mapKeyLabel' then _identifiers ->> 'mapKeyLabel' else i.map_key_label end,
         updated_at = now(),
         updated_by = v_actor.user_id
   where i.tenant_id = _tenant;
  perform control.write_audit(v_actor, 'tenant.infrastructure_set', _tenant, v_reason,
    jsonb_build_object('identifiers', _identifiers));
end;
$fn$;

-- Sets what a tenant's plan allows. The console's server checks the whole document first; the
-- database then checks again, whoever called: it is for the engine line, every feature is a yes
-- or a no, and every yes is a feature the engine line can carry. Returns the new revision. The
-- copy in the tenant's project is written afterwards (tenant_entitlements_delivered records it).
create function public.tenant_entitlements_set(_tenant uuid, _document jsonb, _reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
  v_tenant control.tenants := control.tenant_for_change(_tenant);
  v_before jsonb;
  v_revision integer;
  v_feature text;
begin
  if _document is null or jsonb_typeof(_document) <> 'object' then
    raise exception 'entitlements_must_be_an_object' using errcode = '22023';
  end if;
  if (_document ->> 'schemaLine') is distinct from 'engine' then
    raise exception 'entitlements_not_for_the_engine_line' using errcode = '22023';
  end if;
  if jsonb_typeof(_document -> 'features') is distinct from 'object' then
    raise exception 'entitlements_features_missing' using errcode = '22023';
  end if;
  select f.key into v_feature from jsonb_each(_document -> 'features') f
   where jsonb_typeof(f.value) <> 'boolean' limit 1;
  if v_feature is not null then
    raise exception 'feature_must_be_yes_or_no: %', v_feature using errcode = '22023';
  end if;
  select f.key into v_feature from jsonb_each(_document -> 'features') f
   where f.value = 'true'::jsonb
     and not exists (select 1 from control.grantable_features g where g.feature = f.key)
   order by f.key limit 1;
  if v_feature is not null then
    raise exception 'feature_not_grantable: %', v_feature using errcode = '22023';
  end if;

  select e.document, e.revision into v_before, v_revision
    from control.tenant_entitlements e where e.tenant_id = _tenant for update;
  v_revision := coalesce(v_revision, 0) + 1;
  insert into control.tenant_entitlements (tenant_id, revision, document, set_by)
  values (_tenant, v_revision, _document, v_actor.user_id)
  on conflict (tenant_id) do update
    set revision = excluded.revision, document = excluded.document, set_at = now(), set_by = excluded.set_by;
  perform control.write_audit(v_actor, 'entitlements.set', _tenant, v_reason,
    jsonb_build_object('revision', v_revision, 'before', v_before, 'after', _document));
  return v_revision;
end;
$fn$;

create function public.tenant_entitlements_delivered(_tenant uuid, _revision integer)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_tenant control.tenants := control.tenant_for_change(_tenant);
begin
  update control.tenant_entitlements e
     set delivered_revision = e.revision, delivered_at = now()
   where e.tenant_id = _tenant and e.revision = _revision;
  if not found then
    raise exception 'not_the_current_revision' using errcode = '55000';
  end if;
  perform control.write_audit(v_actor, 'entitlements.delivered', _tenant, null, jsonb_build_object('revision', _revision));
end;
$fn$;

create function public.tenants_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser('support_operator');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id, 'slug', t.slug, 'displayName', t.display_name, 'status', t.status, 'region', t.region,
             'createdAt', t.created_at, 'liveAt', t.live_at, 'suspendedAt', t.suspended_at, 'retiredAt', t.retired_at)
             order by t.created_at, t.id)
      from control.tenants t), '[]'::jsonb);
end;
$fn$;

-- Everything the control plane holds about one tenant.
create function public.tenant_get(_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_result jsonb;
begin
  select jsonb_build_object(
           'tenant', jsonb_build_object(
             'id', t.id, 'slug', t.slug, 'displayName', t.display_name, 'status', t.status, 'region', t.region,
             'createdAt', t.created_at, 'liveAt', t.live_at, 'suspendedAt', t.suspended_at, 'retiredAt', t.retired_at),
           'domains', coalesce((
             select jsonb_agg(jsonb_build_object('domain', d.domain, 'primary', d.is_primary, 'addedAt', d.added_at)
                              order by d.is_primary desc, d.domain)
               from control.tenant_domains d where d.tenant_id = t.id), '[]'::jsonb),
           'infrastructure', (
             select jsonb_build_object(
                      'databaseProject', i.database_project, 'hostingProject', i.hosting_project,
                      'emailDomain', i.email_domain, 'mapKeyLabel', i.map_key_label, 'updatedAt', i.updated_at)
               from control.tenant_infrastructure i where i.tenant_id = t.id),
           'entitlements', (
             select jsonb_build_object(
                      'revision', e.revision, 'document', e.document, 'setAt', e.set_at,
                      'deliveredRevision', e.delivered_revision, 'deliveredAt', e.delivered_at)
               from control.tenant_entitlements e where e.tenant_id = t.id),
           'schemaState', (
             select jsonb_build_object(
                      'release', s.release, 'head', s.head, 'fingerprint', s.fingerprint, 'drift', s.drift,
                      'appliedAt', s.applied_at, 'checkedAt', s.checked_at)
               from control.tenant_schema_state s where s.tenant_id = t.id),
           'provisioningRuns', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', r.id, 'kind', r.kind, 'status', r.status, 'steps', r.steps,
                      'stoppedAtStep', r.stopped_at_step, 'startedAt', r.started_at, 'finishedAt', r.finished_at)
                      order by r.started_at desc)
               from control.provisioning_runs r where r.tenant_id = t.id), '[]'::jsonb))
    into v_result
    from control.tenants t where t.id = _tenant;
  if v_result is null then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  return v_result;
end;
$fn$;

-- ── Engine versions and where each tenant stands ────────────────────
create function public.engine_release_record(_version text, _schema_head text, _schema_fingerprint text, _contract text, _notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
begin
  insert into control.engine_releases (version, schema_head, schema_fingerprint, contract, notes, recorded_by)
  values (_version, _schema_head, _schema_fingerprint, _contract, coalesce(btrim(_notes), ''), v_actor.user_id);
  perform control.write_audit(v_actor, 'release.record', null, null,
    jsonb_build_object('version', _version, 'schemaHead', _schema_head, 'schemaFingerprint', _schema_fingerprint, 'contract', _contract));
end;
$fn$;

create function public.engine_release_withdraw(_version text, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
begin
  update control.engine_releases r
     set withdrawn_at = now(), withdrawn_by = v_actor.user_id
   where r.version = _version and r.withdrawn_at is null;
  if not found then
    raise exception 'release_not_found' using errcode = 'P0002';
  end if;
  perform control.write_audit(v_actor, 'release.withdraw', null, v_reason, jsonb_build_object('version', _version));
end;
$fn$;

-- Records what a fan-out or a drift check found in one tenant's database, and what was applied.
-- This is also the log of maintenance access: every use says which release, and `_note` says why.
-- Returns 'in_step' when the head and the fingerprint are the ones the release expects.
create function public.tenant_schema_state_record(
  _tenant uuid, _release text, _head text, _fingerprint text, _applied boolean default false, _note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_note text := control.reason(_note, false);
  v_tenant control.tenants := control.tenant_for_change(_tenant);
  v_release control.engine_releases;
  v_drift text := 'unknown';
begin
  if _release is not null then
    select r.* into v_release from control.engine_releases r where r.version = _release;
    if not found then
      raise exception 'release_not_found' using errcode = 'P0002';
    end if;
    v_drift := case when v_release.schema_head = _head and v_release.schema_fingerprint = _fingerprint
                    then 'in_step' else 'drifted' end;
  end if;
  insert into control.tenant_schema_state (tenant_id, release, head, fingerprint, drift, applied_at, recorded_by)
  values (_tenant, _release, _head, _fingerprint, v_drift, case when _applied then now() end, v_actor.user_id)
  on conflict (tenant_id) do update
    set release = excluded.release, head = excluded.head, fingerprint = excluded.fingerprint, drift = excluded.drift,
        applied_at = coalesce(excluded.applied_at, control.tenant_schema_state.applied_at),
        checked_at = now(), recorded_by = excluded.recorded_by;
  perform control.write_audit(v_actor, case when _applied then 'schema.applied' else 'schema.checked' end, _tenant, v_note,
    jsonb_build_object('release', _release, 'head', _head, 'fingerprint', _fingerprint, 'drift', v_drift));
  return v_drift;
end;
$fn$;

-- ── Provisioning ────────────────────────────────────────────────────
create function public.provisioning_run_start(_tenant uuid, _kind text, _reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_reason text := control.reason(_reason);
  v_tenant control.tenants := control.tenant_for_change(_tenant);
  v_id uuid;
begin
  insert into control.provisioning_runs (tenant_id, kind, started_by)
  values (_tenant, _kind, v_actor.user_id)
  returning id into v_id;
  perform control.write_audit(v_actor, 'provisioning.start', _tenant, v_reason, jsonb_build_object('run', v_id, 'kind', _kind));
  return v_id;
end;
$fn$;

-- One step of a run: 'done', 'skipped' or 'failed'. A failed step stops the run there. `_detail`
-- is a short note; it must never hold a key or a password (it is refused when it looks like one).
create function public.provisioning_step_record(_run uuid, _step text, _outcome text, _detail text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_run control.provisioning_runs;
  v_detail text := nullif(btrim(coalesce(_detail, '')), '');
begin
  select r.* into v_run from control.provisioning_runs r where r.id = _run for update;
  if not found then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;
  if v_run.status <> 'running' then
    raise exception 'run_not_running' using errcode = '55000';
  end if;
  if _step is null or _step !~ '^[a-z][a-z0-9-]{0,62}$' then
    raise exception 'step_id_invalid' using errcode = '22023';
  end if;
  if _outcome is null or _outcome not in ('done', 'skipped', 'failed') then
    raise exception 'step_outcome_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_run.steps) s where s ->> 'id' = _step) then
    raise exception 'step_already_recorded' using errcode = '23505';
  end if;
  if v_detail is not null
     and (char_length(v_detail) > 300
          or v_detail ~* '(eyJ[A-Za-z0-9_-]{8}|sb_secret_|\msbp_[a-z0-9]{6}|\msk_(live|test)_|\mre_[a-z0-9]{8}|bearer\s+[a-z0-9]|(secret|password|token|key)\s*[:=])') then
    raise exception 'step_detail_refused' using errcode = '22023';
  end if;
  update control.provisioning_runs r
     set steps = r.steps || jsonb_build_array(jsonb_build_object('id', _step, 'outcome', _outcome, 'at', now(), 'detail', v_detail)),
         status = case when _outcome = 'failed' then 'stopped' else r.status end,
         stopped_at_step = case when _outcome = 'failed' then _step else r.stopped_at_step end,
         finished_at = case when _outcome = 'failed' then now() else r.finished_at end
   where r.id = _run;
  perform control.write_audit(v_actor, 'provisioning.step', v_run.tenant_id, null,
    jsonb_build_object('run', _run, 'step', _step, 'outcome', _outcome));
end;
$fn$;

create function public.provisioning_run_finish(_run uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_tenant uuid;
begin
  update control.provisioning_runs r
     set status = 'completed', finished_at = now()
   where r.id = _run and r.status = 'running'
  returning r.tenant_id into v_tenant;
  if not found then
    raise exception 'run_not_running' using errcode = '55000';
  end if;
  perform control.write_audit(v_actor, 'provisioning.finish', v_tenant, null, jsonb_build_object('run', _run));
end;
$fn$;

-- ── Usage totals ────────────────────────────────────────────────────
-- `_totals` is an object of metric -> whole number, for one tenant and one day.
create function public.usage_totals_record(_tenant uuid, _day date, _totals jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
  v_tenant control.tenants := control.tenant_for_change(_tenant);
begin
  if _day is null or _day > current_date then
    raise exception 'usage_day_invalid' using errcode = '22023';
  end if;
  if _totals is null or jsonb_typeof(_totals) <> 'object' or _totals = '{}'::jsonb
     or exists (select 1 from jsonb_each(_totals) e
                 where jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}') !~ '^[0-9]{1,15}$') then
    raise exception 'usage_totals_must_be_whole_numbers' using errcode = '22023';
  end if;
  insert into control.usage_totals (tenant_id, day, metric, value, recorded_by)
  select _tenant, _day, e.key, (e.value #>> '{}')::bigint, v_actor.user_id
    from jsonb_each(_totals) e
  on conflict (tenant_id, day, metric) do update
    set value = excluded.value, recorded_at = now(), recorded_by = excluded.recorded_by;
  perform control.write_audit(v_actor, 'usage.record', _tenant, null, jsonb_build_object('day', _day, 'totals', _totals));
end;
$fn$;

create function public.usage_totals_read(_tenant uuid, _from date, _to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('tenant', u.tenant_id, 'day', u.day, 'metric', u.metric, 'value', u.value)
                     order by u.day, u.tenant_id, u.metric)
      from control.usage_totals u
     where (_tenant is null or u.tenant_id = _tenant)
       and u.day between coalesce(_from, current_date - 30) and coalesce(_to, current_date)), '[]'::jsonb);
end;
$fn$;

-- ── Break-glass support access ──────────────────────────────────────
-- Step 1 of break-glass. Opens a grant: tenant, reason (required), read-only, at most 30 minutes,
-- one open grant per tenant. What it returns is what is then written into the tenant's project
-- (engine.open_support_session there), which is where the reading happens and is logged.
create function public.support_grant_open(_tenant uuid, _reason text, _minutes integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser('support_operator');
  v_reason text := control.reason(_reason);
  v_tenant control.tenants := control.tenant_for_change(_tenant);
  v_grant control.support_access_grants;
begin
  if _minutes is null or _minutes not between 1 and 30 then
    raise exception 'support_access_is_at_most_30_minutes' using errcode = '22023';
  end if;
  if not exists (select 1 from control.tenant_infrastructure i
                  where i.tenant_id = _tenant and i.database_project is not null) then
    raise exception 'tenant_has_no_database_project' using errcode = '55000';
  end if;
  -- A grant whose time has passed must not block the next one. Closing it here is part of this
  -- transaction, so it is kept only when the new grant is.
  update control.support_access_grants g
     set ended_at = g.expires_at,
         end_cause = case when g.delivery = 'not_delivered' then 'not_delivered' else 'expired' end
   where g.tenant_id = _tenant and g.ended_at is null and g.expires_at <= now();
  begin
    insert into control.support_access_grants (tenant_id, opened_by, reason, expires_at)
    values (_tenant, v_actor.user_id, v_reason, now() + make_interval(mins => _minutes))
    returning * into v_grant;
  exception when unique_violation then
    raise exception 'support_grant_already_open' using errcode = '55000';
  end;
  perform control.write_audit(v_actor, 'support.grant_open', _tenant, v_reason,
    jsonb_build_object('grant', v_grant.id, 'access', v_grant.access, 'expiresAt', v_grant.expires_at));
  return jsonb_build_object(
    'grant', v_grant.id, 'tenant', _tenant, 'access', v_grant.access, 'reason', v_grant.reason,
    'openedAt', v_grant.opened_at, 'expiresAt', v_grant.expires_at, 'operatorLabel', v_actor.display_name);
end;
$fn$;

-- Records what the tenant's project answered: 'active' (reads may happen), 'awaiting_tenant' (the
-- tenant chose "ask me first"), and later 'active' or 'declined' once the tenant has answered.
create function public.support_grant_delivery(_grant uuid, _state text, _tenant_session uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser('support_operator');
  v_grant control.support_access_grants;
begin
  select g.* into v_grant from control.support_access_grants g where g.id = _grant for update;
  if not found then
    raise exception 'support_grant_not_found' using errcode = 'P0002';
  end if;
  if v_grant.ended_at is not null then
    raise exception 'support_grant_has_ended' using errcode = '55000';
  end if;
  if v_grant.expires_at <= now() then
    raise exception 'support_grant_expired' using errcode = '55000';
  end if;
  if not coalesce(
       (v_grant.delivery = 'not_delivered' and _state in ('active', 'awaiting_tenant') and _tenant_session is not null)
       or (v_grant.delivery = 'awaiting_tenant' and _state in ('active', 'declined')), false) then
    raise exception 'support_delivery_not_allowed: % to %', v_grant.delivery, coalesce(_state, 'nothing')
      using errcode = '22023';
  end if;
  update control.support_access_grants g
     set delivery = _state,
         delivered_at = coalesce(g.delivered_at, now()),
         tenant_session = coalesce(g.tenant_session, _tenant_session),
         ended_at = case when _state = 'declined' then now() end,
         end_cause = case when _state = 'declined' then 'declined' end
   where g.id = _grant;
  perform control.write_audit(v_actor, 'support.grant_delivery', v_grant.tenant_id, null,
    jsonb_build_object('grant', _grant, 'from', v_grant.delivery, 'to', _state));
end;
$fn$;

-- Ends a grant. `_cause` is 'closed' (the operator is done) or 'ended_by_tenant' (the tenant ended
-- it on its side). A grant whose time has passed is recorded as expired, at the time it expired.
create function public.support_grant_close(_grant uuid, _cause text default 'closed')
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser('support_operator');
  v_grant control.support_access_grants;
  v_cause text;
begin
  if _cause is null or _cause not in ('closed', 'ended_by_tenant') then
    raise exception 'support_close_cause_invalid' using errcode = '22023';
  end if;
  select g.* into v_grant from control.support_access_grants g where g.id = _grant for update;
  if not found then
    raise exception 'support_grant_not_found' using errcode = 'P0002';
  end if;
  if v_grant.ended_at is not null then
    raise exception 'support_grant_has_ended' using errcode = '55000';
  end if;
  v_cause := case when v_grant.expires_at > now() then _cause
                  when v_grant.delivery = 'not_delivered' then 'not_delivered'
                  else 'expired' end;
  update control.support_access_grants g
     set ended_at = least(now(), g.expires_at), end_cause = v_cause
   where g.id = _grant;
  perform control.write_audit(v_actor, 'support.grant_close', v_grant.tenant_id, null,
    jsonb_build_object('grant', _grant, 'cause', v_cause));
end;
$fn$;

-- Step 4 of break-glass: the entries of the tenant's own support log, copied here. `_reads` is the
-- list the tenant's project reports for this grant (engine.support_session_report there). Each
-- entry becomes one audit row; an entry that was copied before is skipped. Returns how many were new.
-- An entry holds its number, its time, its kind and, for a thread, the reason given, and nothing
-- else: one that carries any other part (a name, an account, what was looked up) is refused, with
-- the whole list, so nothing about a person can reach the control plane even through a bug in
-- the tooling that carries the list.
create function public.support_reads_record(_grant uuid, _reads jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser('support_operator');
  v_grant control.support_access_grants;
  v_read jsonb;
  v_new integer := 0;
begin
  select g.* into v_grant from control.support_access_grants g where g.id = _grant for update;
  if not found then
    raise exception 'support_grant_not_found' using errcode = 'P0002';
  end if;
  if _reads is null or jsonb_typeof(_reads) <> 'array' or jsonb_array_length(_reads) > 2000 then
    raise exception 'support_reads_must_be_a_list' using errcode = '22023';
  end if;
  for v_read in select r from jsonb_array_elements(_reads) r loop
    -- Asked one by one, so that no question is put to something it does not fit.
    if jsonb_typeof(v_read) <> 'object' then
      raise exception 'support_read_entry_invalid' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(v_read) k where k not in ('id', 'at', 'kind', 'threadReason'))
       or jsonb_typeof(v_read -> 'id') is distinct from 'number'
       or coalesce(v_read ->> 'id', '') !~ '^[0-9]{1,18}$'
       or jsonb_typeof(v_read -> 'kind') is distinct from 'string'
       or coalesce(v_read ->> 'kind', '') !~ '^[a-z_]{1,40}$'
       or (v_read ? 'at' and (jsonb_typeof(v_read -> 'at') is distinct from 'string'
           or (v_read ->> 'at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'))
       or (v_read ? 'threadReason' and jsonb_typeof(v_read -> 'threadReason') is distinct from 'string') then
      raise exception 'support_read_entry_invalid' using errcode = '22023';
    end if;
    if control.write_audit(
         v_actor, 'support.read', v_grant.tenant_id,
         control.reason(v_read ->> 'threadReason', false),
         jsonb_build_object('grant', _grant, 'read', jsonb_strip_nulls(jsonb_build_object(
           'id', (v_read ->> 'id')::bigint, 'at', v_read -> 'at', 'kind', v_read ->> 'kind'))),
         _grant::text || ':' || (v_read ->> 'id')) is not null then
      v_new := v_new + 1;
    end if;
  end loop;
  update control.support_access_grants g set reads_copied = g.reads_copied + v_new where g.id = _grant;
  return v_new;
end;
$fn$;

create function public.support_grants_list(_tenant uuid default null, _limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser('support_operator');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'grant', g.id, 'tenant', g.tenant_id, 'openedBy', g.opened_by, 'reason', g.reason, 'access', g.access,
             'openedAt', g.opened_at, 'expiresAt', g.expires_at, 'delivery', g.delivery,
             'endedAt', g.ended_at, 'endCause', g.end_cause, 'readsCopied', g.reads_copied,
             'open', g.ended_at is null and g.expires_at > now())
             order by g.opened_at desc, g.id)
      from (select * from control.support_access_grants x
             where _tenant is null or x.tenant_id = _tenant
             order by x.opened_at desc, x.id
             limit least(greatest(coalesce(_limit, 50), 1), 200)) g), '[]'::jsonb);
end;
$fn$;

-- ── Reading the audit log ───────────────────────────────────────────
-- Newest first. `_before` is the id to continue from (the smallest id of the page before).
create function public.audit_log_read(_tenant uuid default null, _before bigint default null, _limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor control.superusers := control.require_superuser();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'at', a.at, 'actorKind', a.actor_kind, 'actor', a.actor, 'action', a.action,
             'tenant', a.tenant_id, 'reason', a.reason, 'detail', a.detail)
             order by a.id desc)
      from (select * from control.audit_log x
             where (_tenant is null or x.tenant_id = _tenant)
               and (_before is null or x.id < _before)
             order by x.id desc
             limit least(greatest(coalesce(_limit, 100), 1), 500)) a), '[]'::jsonb);
end;
$fn$;

-- ── Who may call: the signed-in role, and nobody else ───────────────
-- The functions are named one by one. A name that is missing, or that exists twice, stops the
-- migration; a function that is not named here gets no grant at all.
do $grants$
declare
  v_names constant text[] := array[
    'whoami', 'superusers_list', 'superuser_add', 'superuser_revoke',
    'tenant_create', 'tenant_set_status', 'tenant_domain_add', 'tenant_domain_remove',
    'tenant_infrastructure_set', 'tenant_entitlements_set', 'tenant_entitlements_delivered',
    'tenants_list', 'tenant_get',
    'engine_release_record', 'engine_release_withdraw', 'tenant_schema_state_record',
    'provisioning_run_start', 'provisioning_step_record', 'provisioning_run_finish',
    'usage_totals_record', 'usage_totals_read',
    'support_grant_open', 'support_grant_delivery', 'support_grant_close', 'support_reads_record',
    'support_grants_list', 'audit_log_read'
  ];
  v_name text;
  v_function regprocedure;
  v_count integer;
begin
  foreach v_name in array v_names loop
    select count(*), min(p.oid)::regprocedure into v_count, v_function
      from pg_catalog.pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_name;
    if v_count <> 1 then
      raise exception 'expected exactly one function public.%, found %', v_name, v_count;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_function);
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$grants$;

insert into control.schema_migrations (version, name) values ('0002', 'functions');
