-- Control plane 0001: the private schema, its tables, and the append-only audit log.
--
-- This file and every file after it belong to the control-plane line. They are applied to the
-- engine owner's own control-plane project, in order, and never to a tenant's project or to any
-- other project.
--
-- The shape of everything below:
--   * Every table lives in the private schema "control". The data API does not serve it, and the
--     roles that speak through the data API (anon, authenticated, service_role) cannot use it.
--   * Every table has row security on and NO policy, and every privilege is revoked table by table.
--   * The only way in is the functions of file 0002. Each one checks who is calling and writes the
--     audit row in the same transaction as the change.

-- ── Safe defaults for objects created from now on ───────────────────
-- A new function is callable by everyone unless that is taken away; in this database it is taken
-- away for good. A hosted project also grants the data API roles every privilege on new objects in
-- "public"; that is taken away too. Each function states its own grants.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;

-- ── The private schema ──────────────────────────────────────────────
create schema if not exists control;
revoke all on schema control from public;
revoke all on schema control from anon, authenticated, service_role;

-- Which control-plane migrations this database has. Every migration file ends by writing its row.
create table control.schema_migrations (
  version text not null,
  name text not null,
  applied_at timestamp with time zone not null default now(),
  constraint schema_migrations_pkey primary key (version),
  constraint schema_migrations_version_format check (version ~ '^[0-9]{4}$')
);

-- ── Who may act ─────────────────────────────────────────────────────
-- A row names an account of THIS project's own sign-in. It is never an account in any tenant.
--   superuser          may do everything the functions offer
--   support_operator   may see the tenant list and use break-glass support access, nothing else
-- A person is taken off the list by revoking the row; the row stays, so the audit log keeps
-- pointing at somebody.
create table control.superusers (
  user_id uuid not null,
  role text not null,
  display_name text not null,
  status text not null default 'active',
  added_at timestamp with time zone not null default now(),
  added_by uuid,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  constraint superusers_pkey primary key (user_id),
  constraint superusers_account foreign key (user_id) references auth.users (id) on delete restrict,
  constraint superusers_added_by foreign key (added_by) references control.superusers (user_id),
  constraint superusers_revoked_by foreign key (revoked_by) references control.superusers (user_id),
  constraint superusers_role check (role in ('superuser', 'support_operator')),
  constraint superusers_status check (status in ('active', 'revoked')),
  constraint superusers_display_name check (char_length(btrim(display_name)) between 2 and 80),
  constraint superusers_revocation check (
    (status = 'revoked') = (revoked_at is not null) and (revoked_at is null) = (revoked_by is null)
  )
);

-- ── Tenants ─────────────────────────────────────────────────────────
-- One row per tenant. Never a user, a partner or a message of that tenant.
create table control.tenants (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  display_name text not null,
  status text not null default 'building',
  region text not null,
  created_at timestamp with time zone not null default now(),
  created_by uuid not null,
  live_at timestamp with time zone,
  suspended_at timestamp with time zone,
  retired_at timestamp with time zone,
  updated_at timestamp with time zone not null default now(),
  constraint tenants_pkey primary key (id),
  constraint tenants_slug_key unique (slug),
  constraint tenants_created_by foreign key (created_by) references control.superusers (user_id),
  constraint tenants_slug_format check (slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
  constraint tenants_display_name check (char_length(btrim(display_name)) between 2 and 80),
  constraint tenants_status check (status in ('building', 'live', 'suspended', 'retired')),
  constraint tenants_region_format check (region ~ '^[a-z]{2}-[a-z]+-[0-9]$'),
  constraint tenants_retired check ((status = 'retired') = (retired_at is not null))
);

-- The domains each tenant's world answers on.
create table control.tenant_domains (
  domain text not null,
  tenant_id uuid not null,
  is_primary boolean not null default false,
  added_at timestamp with time zone not null default now(),
  added_by uuid not null,
  constraint tenant_domains_pkey primary key (domain),
  constraint tenant_domains_tenant foreign key (tenant_id) references control.tenants (id),
  constraint tenant_domains_added_by foreign key (added_by) references control.superusers (user_id),
  constraint tenant_domains_format check (
    domain = lower(domain)
    and char_length(domain) <= 253
    and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'
  )
);
create index tenant_domains_tenant_idx on control.tenant_domains (tenant_id);
create unique index tenant_domains_one_primary on control.tenant_domains (tenant_id) where is_primary;

-- Identifiers only: WHICH database project, hosting project, email domain and map key belong to a
-- tenant. Never a key, a password or a token: each column accepts only the shape of an identifier,
-- and that shape leaves no room for a secret.
--   database_project  the 20-character reference of the tenant's database project
--   hosting_project   the hosting project's id
--   email_domain      the domain the tenant's email is sent from
--   map_key_label     the NAME the tenant's map key has in the map account (lower case, with a
--                     hyphen), never the key itself
create table control.tenant_infrastructure (
  tenant_id uuid not null,
  database_project text,
  hosting_project text,
  email_domain text,
  map_key_label text,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid not null,
  constraint tenant_infrastructure_pkey primary key (tenant_id),
  constraint tenant_infrastructure_tenant foreign key (tenant_id) references control.tenants (id),
  constraint tenant_infrastructure_updated_by foreign key (updated_by) references control.superusers (user_id),
  constraint tenant_infrastructure_database_key unique (database_project),
  constraint tenant_infrastructure_hosting_key unique (hosting_project),
  constraint tenant_infrastructure_database_format check (database_project is null or database_project ~ '^[a-z0-9]{20}$'),
  constraint tenant_infrastructure_hosting_format check (hosting_project is null or hosting_project ~ '^prj_[A-Za-z0-9]{1,60}$'),
  constraint tenant_infrastructure_email_format check (
    email_domain is null
    or (email_domain = lower(email_domain)
        and char_length(email_domain) <= 253
        and email_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$')
  ),
  constraint tenant_infrastructure_map_format check (
    map_key_label is null
    or (map_key_label ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)+$' and char_length(map_key_label) <= 40)
  )
);

-- ── What a tenant's plan allows ─────────────────────────────────────
-- The features a tenant on the engine line can be allowed at all. Seeded by file 0003 from the
-- engine's feature list; a feature that needs another database line is never in it.
create table control.grantable_features (
  feature text not null,
  constraint grantable_features_pkey primary key (feature),
  constraint grantable_features_format check (feature ~ '^[a-z][A-Za-z0-9]{1,60}$')
);

-- The entitlements document of each tenant: the source of the read-only copy in the tenant's own
-- project. The constraints are the ones the tenant side has, so a document accepted here is
-- accepted there. Each one is written so that a MISSING part fails it (a comparison with nothing
-- is neither true nor false, and a check lets "neither" through).
create table control.tenant_entitlements (
  tenant_id uuid not null,
  revision integer not null,
  document jsonb not null,
  set_at timestamp with time zone not null default now(),
  set_by uuid not null,
  delivered_revision integer,
  delivered_at timestamp with time zone,
  constraint tenant_entitlements_pkey primary key (tenant_id),
  constraint tenant_entitlements_tenant foreign key (tenant_id) references control.tenants (id),
  constraint tenant_entitlements_set_by foreign key (set_by) references control.superusers (user_id),
  constraint tenant_entitlements_revision check (revision >= 1),
  constraint tenant_entitlements_is_object check (jsonb_typeof(document) = 'object'),
  constraint tenant_entitlements_engine_line check (coalesce((document ->> 'schemaLine') = 'engine', false)),
  constraint tenant_entitlements_parts check (
    coalesce(
      (document ->> 'contract') ~ '^[0-9]{1,4}\.[0-9]{1,4}$'
      and jsonb_typeof(document -> 'features') = 'object'
      and jsonb_typeof(document -> 'limits') = 'object'
      and jsonb_typeof(document -> 'requirements') = 'object',
      false)
  ),
  constraint tenant_entitlements_delivery check (
    (delivered_revision is null) = (delivered_at is null)
    and (delivered_revision is null or delivered_revision between 1 and revision)
  )
);

-- ── Engine versions and where each tenant stands ────────────────────
create table control.engine_releases (
  version text not null,
  schema_head text not null,
  schema_fingerprint text not null,
  contract text not null,
  notes text not null default '',
  recorded_at timestamp with time zone not null default now(),
  recorded_by uuid not null,
  withdrawn_at timestamp with time zone,
  withdrawn_by uuid,
  constraint engine_releases_pkey primary key (version),
  constraint engine_releases_recorded_by foreign key (recorded_by) references control.superusers (user_id),
  constraint engine_releases_withdrawn_by foreign key (withdrawn_by) references control.superusers (user_id),
  constraint engine_releases_version_format check (version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  constraint engine_releases_head_format check (schema_head ~ '^[0-9]{4}$'),
  constraint engine_releases_fingerprint_format check (schema_fingerprint ~ '^[0-9a-f]{32}$'),
  constraint engine_releases_contract_format check (contract ~ '^[0-9]{1,4}\.[0-9]{1,4}$'),
  constraint engine_releases_notes_length check (char_length(notes) <= 1000),
  constraint engine_releases_withdrawal check ((withdrawn_at is null) = (withdrawn_by is null))
);

create table control.tenant_schema_state (
  tenant_id uuid not null,
  release text,
  head text not null,
  fingerprint text not null,
  drift text not null,
  applied_at timestamp with time zone,
  checked_at timestamp with time zone not null default now(),
  recorded_by uuid not null,
  constraint tenant_schema_state_pkey primary key (tenant_id),
  constraint tenant_schema_state_tenant foreign key (tenant_id) references control.tenants (id),
  constraint tenant_schema_state_release foreign key (release) references control.engine_releases (version),
  constraint tenant_schema_state_recorded_by foreign key (recorded_by) references control.superusers (user_id),
  constraint tenant_schema_state_head_format check (head ~ '^[0-9]{4}$'),
  constraint tenant_schema_state_fingerprint_format check (fingerprint ~ '^[0-9a-f]{32}$'),
  constraint tenant_schema_state_drift check (drift in ('in_step', 'drifted', 'unknown'))
);

-- The steps of creating or retiring a tenant, and where a run stopped. "steps" is a list of
-- {id, outcome, at, detail}; the functions only ever add to it.
create table control.provisioning_runs (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  kind text not null,
  status text not null default 'running',
  steps jsonb not null default '[]'::jsonb,
  stopped_at_step text,
  started_at timestamp with time zone not null default now(),
  started_by uuid not null,
  finished_at timestamp with time zone,
  constraint provisioning_runs_pkey primary key (id),
  constraint provisioning_runs_tenant foreign key (tenant_id) references control.tenants (id),
  constraint provisioning_runs_started_by foreign key (started_by) references control.superusers (user_id),
  constraint provisioning_runs_kind check (kind in ('provision', 'retire')),
  constraint provisioning_runs_status check (status in ('running', 'stopped', 'completed')),
  constraint provisioning_runs_steps_is_list check (jsonb_typeof(steps) = 'array'),
  constraint provisioning_runs_finish check ((status = 'running') = (finished_at is null)),
  constraint provisioning_runs_stop check ((status = 'stopped') = (stopped_at_step is not null))
);
create index provisioning_runs_tenant_idx on control.provisioning_runs (tenant_id, started_at desc);
create unique index provisioning_runs_one_running on control.provisioning_runs (tenant_id) where status = 'running';

-- Daily numbers per tenant. Numbers only: nothing in this table can describe a person.
create table control.usage_totals (
  tenant_id uuid not null,
  day date not null,
  metric text not null,
  value bigint not null,
  recorded_at timestamp with time zone not null default now(),
  recorded_by uuid not null,
  constraint usage_totals_pkey primary key (tenant_id, day, metric),
  constraint usage_totals_tenant foreign key (tenant_id) references control.tenants (id),
  constraint usage_totals_recorded_by foreign key (recorded_by) references control.superusers (user_id),
  constraint usage_totals_metric check (metric in ('active_users', 'listings', 'map_requests', 'emails_sent')),
  constraint usage_totals_value check (value >= 0)
);

-- ── Break-glass support access ──────────────────────────────────────
-- One row per grant. A grant is read-only (there is no other value), has a reason, ends at most 30
-- minutes after it opens, and at most one is open per tenant. The tenant's own database enforces
-- the same limits again on its side.
--   delivery   not_delivered     written here, not yet in the tenant's project
--              active            the tenant's project accepted it and reads may happen
--              awaiting_tenant   the tenant chose "ask me first" and has not answered
--              declined          the tenant said no
create table control.support_access_grants (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  opened_by uuid not null,
  reason text not null,
  access text not null default 'read_only',
  opened_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  delivery text not null default 'not_delivered',
  delivered_at timestamp with time zone,
  tenant_session uuid,
  ended_at timestamp with time zone,
  end_cause text,
  reads_copied integer not null default 0,
  constraint support_access_grants_pkey primary key (id),
  constraint support_access_grants_tenant foreign key (tenant_id) references control.tenants (id),
  constraint support_access_grants_opened_by foreign key (opened_by) references control.superusers (user_id),
  constraint support_access_grants_reason check (char_length(btrim(reason)) between 5 and 500),
  constraint support_access_grants_read_only check (access = 'read_only'),
  constraint support_access_grants_time_box check (
    expires_at > opened_at and expires_at <= opened_at + interval '30 minutes'
  ),
  constraint support_access_grants_delivery check (delivery in ('not_delivered', 'active', 'awaiting_tenant', 'declined')),
  constraint support_access_grants_delivered check (
    (delivery = 'not_delivered') = (delivered_at is null) and (delivered_at is null) = (tenant_session is null)
  ),
  constraint support_access_grants_end_cause check (
    end_cause is null or end_cause in ('closed', 'expired', 'declined', 'ended_by_tenant', 'not_delivered')
  ),
  constraint support_access_grants_end check ((ended_at is null) = (end_cause is null)),
  constraint support_access_grants_reads check (reads_copied >= 0)
);
create index support_access_grants_tenant_idx on control.support_access_grants (tenant_id, opened_at desc);
create unique index support_access_grants_one_open on control.support_access_grants (tenant_id) where ended_at is null;

-- What a grant said when it was opened never changes, and an ended grant only counts the reads
-- copied back from the tenant. Nobody deletes a grant, the database owner included.
create function control.support_grant_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'support_grants_are_kept: % refused', tg_op;
  end if;
  if new.id is distinct from old.id
     or new.tenant_id is distinct from old.tenant_id
     or new.opened_by is distinct from old.opened_by
     or new.reason is distinct from old.reason
     or new.access is distinct from old.access
     or new.opened_at is distinct from old.opened_at
     or new.expires_at is distinct from old.expires_at then
    raise exception 'support_grant_facts_are_fixed';
  end if;
  if old.ended_at is not null
     and (new.ended_at is distinct from old.ended_at
          or new.end_cause is distinct from old.end_cause
          or new.delivery is distinct from old.delivery
          or new.delivered_at is distinct from old.delivered_at
          or new.tenant_session is distinct from old.tenant_session) then
    raise exception 'support_grant_has_ended';
  end if;
  return new;
end;
$guard$;
create trigger support_access_grants_guard
  before update or delete on control.support_access_grants
  for each row execute function control.support_grant_guard();
create trigger support_access_grants_no_truncate
  before truncate on control.support_access_grants
  for each statement execute function control.support_grant_guard();

-- ── The audit log ───────────────────────────────────────────────────
-- Every action taken through the functions: who, what, which tenant, why, when. A row is written
-- in the same transaction as the change it describes, so neither exists without the other.
--   source_ref   set only on rows copied from a tenant's own support log, so that copying the
--                same entry twice keeps one row
create table control.audit_log (
  id bigint generated always as identity,
  at timestamp with time zone not null default now(),
  actor_kind text not null,
  actor uuid not null,
  action text not null,
  tenant_id uuid,
  reason text,
  detail jsonb not null default '{}'::jsonb,
  source_ref text,
  constraint audit_log_pkey primary key (id),
  constraint audit_log_actor foreign key (actor) references control.superusers (user_id),
  constraint audit_log_tenant foreign key (tenant_id) references control.tenants (id),
  constraint audit_log_actor_kind check (actor_kind in ('superuser', 'support_operator', 'bootstrap')),
  constraint audit_log_action_format check (action ~ '^[a-z_]+\.[a-z_]+$'),
  constraint audit_log_reason_length check (reason is null or char_length(reason) between 1 and 500),
  constraint audit_log_detail_is_object check (jsonb_typeof(detail) = 'object'),
  constraint audit_log_source_ref_length check (source_ref is null or char_length(source_ref) between 1 and 120)
);
create index audit_log_tenant_idx on control.audit_log (tenant_id, id desc);
create index audit_log_actor_idx on control.audit_log (actor, id desc);
create unique index audit_log_source_ref_key on control.audit_log (source_ref) where source_ref is not null;

-- Append-only, by trigger: no update, no delete, no truncate, for anyone, the database owner
-- included. (Append-only by grants: the revokes below. Nobody but the owner can even insert.)
create function control.audit_log_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
begin
  raise exception 'audit_log_is_append_only: % refused', tg_op;
end;
$guard$;
create trigger audit_log_no_change
  before update or delete on control.audit_log
  for each row execute function control.audit_log_guard();
create trigger audit_log_no_truncate
  before truncate on control.audit_log
  for each statement execute function control.audit_log_guard();

-- ── Row security on, no policy, every privilege revoked ─────────────
alter table control.schema_migrations enable row level security;
alter table control.superusers enable row level security;
alter table control.tenants enable row level security;
alter table control.tenant_domains enable row level security;
alter table control.tenant_infrastructure enable row level security;
alter table control.grantable_features enable row level security;
alter table control.tenant_entitlements enable row level security;
alter table control.engine_releases enable row level security;
alter table control.tenant_schema_state enable row level security;
alter table control.provisioning_runs enable row level security;
alter table control.usage_totals enable row level security;
alter table control.support_access_grants enable row level security;
alter table control.audit_log enable row level security;

revoke all on table control.schema_migrations from public, anon, authenticated, service_role;
revoke all on table control.superusers from public, anon, authenticated, service_role;
revoke all on table control.tenants from public, anon, authenticated, service_role;
revoke all on table control.tenant_domains from public, anon, authenticated, service_role;
revoke all on table control.tenant_infrastructure from public, anon, authenticated, service_role;
revoke all on table control.grantable_features from public, anon, authenticated, service_role;
revoke all on table control.tenant_entitlements from public, anon, authenticated, service_role;
revoke all on table control.engine_releases from public, anon, authenticated, service_role;
revoke all on table control.tenant_schema_state from public, anon, authenticated, service_role;
revoke all on table control.provisioning_runs from public, anon, authenticated, service_role;
revoke all on table control.usage_totals from public, anon, authenticated, service_role;
revoke all on table control.support_access_grants from public, anon, authenticated, service_role;
revoke all on table control.audit_log from public, anon, authenticated, service_role;
revoke all on sequence control.audit_log_id_seq from public, anon, authenticated, service_role;

revoke all on function control.support_grant_guard() from public, anon, authenticated, service_role;
revoke all on function control.audit_log_guard() from public, anon, authenticated, service_role;

insert into control.schema_migrations (version, name) values ('0001', 'schema_and_audit_log');
