-- Engine baseline 0004: where a world keeps what it is allowed, what it chose, and its words.
--
-- Three tables and the functions around them:
--   engine_entitlements    what the engine owner allows this world (a read-only copy)
--   engine_configuration   what the world chose: one row per published revision, one of them current
--   engine_wording         the text that database functions and edge functions read by key
-- The one rule between the first two is enforced here, in the database, whoever calls:
-- a configuration can only switch on what the entitlements allow.

-- ── 1. The read-only copy of the entitlements ───────────────────────
-- Written by the engine owner's tooling as the database owner, and by nothing else: not the people
-- of this world, and not the world's own server. Everyone may read it; the app needs it to start.
create table public.engine_entitlements (
  singleton boolean not null default true,
  document jsonb not null,
  written_at timestamp with time zone not null default now(),
  constraint engine_entitlements_pkey primary key (singleton),
  constraint engine_entitlements_one_row check (singleton),
  constraint engine_entitlements_is_object check (jsonb_typeof(document) = 'object'),
  constraint engine_entitlements_engine_line check ((document ->> 'schemaLine') = 'engine'),
  constraint engine_entitlements_parts check (
    (document ->> 'contract') ~ '^[0-9]{1,4}\.[0-9]{1,4}$'
    and jsonb_typeof(document -> 'features') = 'object'
    and jsonb_typeof(document -> 'limits') = 'object'
    and jsonb_typeof(document -> 'requirements') = 'object'
  )
);
alter table public.engine_entitlements enable row level security;
create policy engine_entitlements_read on public.engine_entitlements
  as permissive for select to anon, authenticated
  using (true);
revoke all on table public.engine_entitlements from public, anon, authenticated, service_role;
grant select on table public.engine_entitlements to anon, authenticated, service_role;

-- The only way in. It lives in the private schema and nobody is granted it, so it runs only for
-- the database owner (provisioning, and the engine owner's tooling on every change).
create function engine.write_entitlements(_document jsonb)
returns void
language plpgsql
set search_path = ''
as $write$
begin
  insert into public.engine_entitlements (singleton, document)
  values (true, _document)
  on conflict (singleton) do update
    set document = excluded.document,
        written_at = pg_catalog.now();
end;
$write$;
revoke all on function engine.write_entitlements(jsonb) from public, anon, authenticated, service_role;

-- ── 2. The configuration ────────────────────────────────────────────
create table public.engine_configuration (
  revision integer not null,
  contract text not null,
  document jsonb not null,
  is_current boolean not null default false,
  published_at timestamp with time zone not null default now(),
  published_by uuid,
  constraint engine_configuration_pkey primary key (revision),
  constraint engine_configuration_revision_positive check (revision >= 1),
  constraint engine_configuration_is_object check (jsonb_typeof(document) = 'object'),
  constraint engine_configuration_revision_matches check ((document ->> 'revision') = revision::text),
  constraint engine_configuration_contract_matches check ((document ->> 'contract') = contract),
  constraint engine_configuration_contract_format check (contract ~ '^[0-9]{1,4}\.[0-9]{1,4}$'),
  constraint engine_configuration_published_by_fkey foreign key (published_by)
    references public.profiles (id) on delete set null
);
-- At most one row is the current one.
create unique index engine_configuration_one_current on public.engine_configuration (is_current) where is_current;
create index engine_configuration_published_by_idx on public.engine_configuration (published_by);

alter table public.engine_configuration enable row level security;
-- Everyone reads the current revision. Staff also read the earlier ones.
create policy engine_configuration_read on public.engine_configuration
  as permissive for select to anon, authenticated
  using (is_current or public.is_admin());
revoke all on table public.engine_configuration from public, anon, authenticated, service_role;
grant select on table public.engine_configuration to anon, authenticated, service_role;

-- A published revision is a record: it is never edited and never deleted. Only "is this the
-- current one" may change, and the publisher's link may be cleared when that account is removed.
create function public.engine_configuration_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'engine_configuration_history_is_kept' using errcode = '42501';
  end if;
  if new.revision is distinct from old.revision
     or new.contract is distinct from old.contract
     or new.document is distinct from old.document
     or new.published_at is distinct from old.published_at
     or (new.published_by is distinct from old.published_by and new.published_by is not null) then
    raise exception 'engine_configuration_revision_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$guard$;
revoke all on function public.engine_configuration_guard() from public, anon, authenticated, service_role;
create trigger engine_configuration_guard
  before update or delete on public.engine_configuration
  for each row execute function public.engine_configuration_guard();

-- ── 3. The wording table ────────────────────────────────────────────
-- 'engine' rows are the engine's neutral defaults (seeded by a migration, from the same message
-- catalogue the app uses). 'tenant' rows are this world's own words, replaced on every publish.
create table public.engine_wording (
  key text not null,
  source text not null,
  renderer text not null,
  text text not null,
  revision integer,
  constraint engine_wording_pkey primary key (key, source),
  constraint engine_wording_source_check check (source in ('engine', 'tenant')),
  constraint engine_wording_renderer_check check (renderer in ('database', 'edge')),
  constraint engine_wording_key_format check (key ~ '^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$'),
  constraint engine_wording_text_length check (char_length(text) <= 500),
  constraint engine_wording_text_plain check (text !~ '[<>]'),
  constraint engine_wording_tenant_has_revision check ((source = 'tenant') = (revision is not null))
);
alter table public.engine_wording enable row level security;
-- No policy: the data API roles cannot read it. Edge functions read it with the service role.
revoke all on table public.engine_wording from public, anon, authenticated, service_role;
grant select on table public.engine_wording to service_role;

-- One sentence, in this world's words, with its values filled in.
--   engine_text('notification.ideaLead.body', jsonb_build_object('title', 'A new bench'))
-- This world's own row wins; without one, the engine's default; without that, the key itself, so a
-- missing sentence shows up as an odd text and never stops the action that wanted to send it.
-- Values are put in during a single pass over the text, so a value is never read as a placeholder.
create function public.engine_text(_key text, _values jsonb default '{}'::jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $engine_text$
declare
  v_text text;
  v_parts text[];
  v_names text[];
  v_out text;
  i integer;
begin
  select w.text into v_text
    from public.engine_wording w
   where w.key = _key
   order by (w.source = 'tenant') desc
   limit 1;
  if v_text is null then
    return _key;
  end if;

  v_parts := pg_catalog.regexp_split_to_array(v_text, '\{\$[a-z][A-Za-z0-9]{0,39}\}');
  select pg_catalog.array_agg(m.hit[1] order by m.ord)
    into v_names
    from pg_catalog.regexp_matches(v_text, '\{\$([a-z][A-Za-z0-9]{0,39})\}', 'g')
         with ordinality as m(hit, ord);

  v_out := v_parts[1];
  for i in 1 .. coalesce(pg_catalog.array_length(v_names, 1), 0) loop
    v_out := v_out || coalesce(_values ->> v_names[i], '') || coalesce(v_parts[i + 1], '');
  end loop;
  return v_out;
end;
$engine_text$;
revoke all on function public.engine_text(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.engine_text(text, jsonb) to authenticated, service_role;

-- Is a feature on in this world? Only when the world switched it on AND the engine owner allows it.
create function public.engine_feature_on(_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $feature$
  select coalesce((select (c.document -> 'features' -> _feature) = 'true'::jsonb
                     from public.engine_configuration c
                    where c.is_current), false)
     and coalesce((select (e.document -> 'features' -> _feature) = 'true'::jsonb
                     from public.engine_entitlements e), false);
$feature$;
revoke all on function public.engine_feature_on(text) from public, anon, authenticated, service_role;
grant execute on function public.engine_feature_on(text) to anon, authenticated, service_role;

-- The event and place categories of a configuration, as rows for the categories table: one row per
-- id. An id in both lists applies to both; its name and colour come from the event list.
create function engine.listed_categories(_document jsonb)
returns table (slug text, name text, color text, applies_to text, sort_order integer)
language sql
immutable
set search_path = ''
as $listed$
  with listed as (
    select e.item ->> 'id' as slug, e.item ->> 'label' as name, e.item ->> 'color' as color,
           'events'::text as kind, e.ord::integer as sort_order
      from pg_catalog.jsonb_array_elements(coalesce(_document -> 'categories' -> 'events', '[]'::jsonb))
           with ordinality as e(item, ord)
    union all
    select p.item ->> 'id', p.item ->> 'label', p.item ->> 'color', 'places'::text, 1000 + p.ord::integer
      from pg_catalog.jsonb_array_elements(coalesce(_document -> 'categories' -> 'places', '[]'::jsonb))
           with ordinality as p(item, ord)
  )
  select l.slug,
         (pg_catalog.array_agg(l.name order by l.sort_order))[1],
         (pg_catalog.array_agg(l.color order by l.sort_order))[1],
         case when pg_catalog.count(distinct l.kind) > 1 then 'both' else pg_catalog.min(l.kind) end,
         pg_catalog.min(l.sort_order)
    from listed l
   group by l.slug;
$listed$;
revoke all on function engine.listed_categories(jsonb) from public, anon, authenticated, service_role;

-- ── 4. Publishing ───────────────────────────────────────────────────
-- The world's server checks a configuration in full first (the contract's own validation), then
-- calls this with the service role. Whatever the caller checked, this function holds the rule that
-- matters for the engine owner: nothing is switched on, and no limit is passed, beyond the
-- entitlements. In one transaction it stores the revision, makes it the current one, replaces this
-- world's wording rows and brings the categories table in line.
--
--   _wording: {"database": {"<key>": "<text>", ...}, "edge": {"<key>": "<text>", ...}}
create function public.publish_engine_configuration(
  _document jsonb,
  _wording jsonb default '{}'::jsonb,
  _published_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $publish$
declare
  v_entitlements jsonb;
  v_contract text;
  v_next integer;
  v_feature record;
  v_limit numeric;
  v_list text;
  v_renderer text;
  v_row record;
  v_wording_rows integer := 0;
  v_category_rows integer := 0;
  v_slugs text[];
  v_slug_re constant text := '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$';
begin
  -- One publisher at a time.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('engine_configuration', 0));

  select e.document into v_entitlements from public.engine_entitlements e;
  if v_entitlements is null then
    raise exception 'engine_no_entitlements' using errcode = '55000';
  end if;

  if _document is null or pg_catalog.jsonb_typeof(_document) <> 'object' then
    raise exception 'engine_configuration_not_an_object' using errcode = '22023';
  end if;

  v_contract := _document ->> 'contract';
  if v_contract is null or v_contract !~ '^[0-9]{1,4}\.[0-9]{1,4}$' then
    raise exception 'engine_configuration_contract_missing' using errcode = '22023';
  end if;
  if pg_catalog.split_part(v_contract, '.', 1) <> pg_catalog.split_part(v_entitlements ->> 'contract', '.', 1) then
    raise exception 'engine_configuration_contract_mismatch: % against %', v_contract, v_entitlements ->> 'contract'
      using errcode = '22023';
  end if;

  select coalesce(pg_catalog.max(c.revision), 0) + 1 into v_next from public.engine_configuration c;
  if (_document ->> 'revision') is distinct from v_next::text then
    raise exception 'engine_configuration_wrong_revision: the next revision is %', v_next using errcode = '22023';
  end if;

  -- The rule: every feature that is switched on must be allowed.
  if pg_catalog.jsonb_typeof(coalesce(_document -> 'features', '{}'::jsonb)) <> 'object' then
    raise exception 'engine_configuration_features_not_an_object' using errcode = '22023';
  end if;
  for v_feature in
    select f.key, f.value from pg_catalog.jsonb_each(coalesce(_document -> 'features', '{}'::jsonb)) f
  loop
    if pg_catalog.jsonb_typeof(v_feature.value) <> 'boolean' then
      raise exception 'engine_configuration_feature_not_a_switch: %', v_feature.key using errcode = '22023';
    end if;
    if v_feature.value = 'true'::jsonb
       and coalesce(v_entitlements -> 'features' -> v_feature.key, 'false'::jsonb) <> 'true'::jsonb then
      raise exception 'engine_feature_not_entitled: %', v_feature.key using errcode = '42501';
    end if;
  end loop;

  -- The limits.
  if pg_catalog.jsonb_typeof(v_entitlements -> 'limits' -> 'mapTiltMaxDegrees') = 'number' then
    v_limit := (v_entitlements -> 'limits' ->> 'mapTiltMaxDegrees')::numeric;
    if pg_catalog.jsonb_typeof(_document -> 'map' -> 'tiltDegrees') <> 'number'
       or (_document -> 'map' ->> 'tiltDegrees')::numeric > v_limit then
      raise exception 'engine_limit_exceeded: map.tiltDegrees is allowed up to %', v_limit using errcode = '42501';
    end if;
  end if;
  if pg_catalog.jsonb_typeof(v_entitlements -> 'limits' -> 'maxCategoriesPerList') = 'number' then
    v_limit := (v_entitlements -> 'limits' ->> 'maxCategoriesPerList')::numeric;
    foreach v_list in array array['events', 'places', 'partnerTypes'] loop
      if pg_catalog.jsonb_typeof(coalesce(_document -> 'categories' -> v_list, '[]'::jsonb)) <> 'array' then
        raise exception 'engine_configuration_list_not_an_array: categories.%', v_list using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(coalesce(_document -> 'categories' -> v_list, '[]'::jsonb)) > v_limit then
        raise exception 'engine_limit_exceeded: categories.% may hold up to % entries', v_list, v_limit
          using errcode = '42501';
      end if;
    end loop;
  end if;
  if coalesce(v_entitlements -> 'requirements' -> 'legalOperator', 'false'::jsonb) = 'true'::jsonb
     and coalesce(pg_catalog.btrim(_document -> 'legal' ->> 'serviceProvider'), '') = '' then
    raise exception 'engine_legal_operator_required' using errcode = '42501';
  end if;

  -- Store the revision and make it the current one.
  update public.engine_configuration set is_current = false where is_current;
  insert into public.engine_configuration (revision, contract, document, is_current, published_by)
  values (v_next, v_contract, _document, true, _published_by);

  -- This world's words. Only keys the engine knows, for the renderer the engine gave them.
  if _wording is not null and pg_catalog.jsonb_typeof(_wording) <> 'object' then
    raise exception 'engine_wording_not_an_object' using errcode = '22023';
  end if;
  delete from public.engine_wording where source = 'tenant';
  for v_renderer in select k from pg_catalog.jsonb_object_keys(coalesce(_wording, '{}'::jsonb)) k loop
    if v_renderer not in ('database', 'edge') then
      raise exception 'engine_wording_unknown_renderer: %', v_renderer using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(_wording -> v_renderer) <> 'object' then
      raise exception 'engine_wording_not_an_object: %', v_renderer using errcode = '22023';
    end if;
    for v_row in select w.key, w.value from pg_catalog.jsonb_each(_wording -> v_renderer) w loop
      if pg_catalog.jsonb_typeof(v_row.value) <> 'string' then
        raise exception 'engine_wording_not_text: %', v_row.key using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.engine_wording d
         where d.key = v_row.key and d.source = 'engine' and d.renderer = v_renderer
      ) then
        raise exception 'engine_wording_unknown_key: % (%)', v_row.key, v_renderer using errcode = '22023';
      end if;
      -- Plain text only: no control character except a line break (markup is refused by the table).
      if pg_catalog.replace(v_row.value #>> '{}', pg_catalog.chr(10), '') ~ '[[:cntrl:]]' then
        raise exception 'engine_wording_control_character: %', v_row.key using errcode = '22023';
      end if;
      insert into public.engine_wording (key, source, renderer, text, revision)
      values (v_row.key, 'tenant', v_renderer, v_row.value #>> '{}', v_next);
      v_wording_rows := v_wording_rows + 1;
    end loop;
  end loop;

  -- The categories table follows the configuration: one row per event or place category, found
  -- by its id. A category that left the configuration is removed only when nothing uses it.
  if exists (
    select 1 from engine.listed_categories(_document) l
     where l.slug is null or l.slug !~ v_slug_re or pg_catalog.char_length(l.slug) > 50
        or coalesce(pg_catalog.btrim(l.name), '') = ''
        or l.color is null or l.color !~ '^#[0-9a-fA-F]{6}$'
  ) then
    raise exception 'engine_configuration_bad_category' using errcode = '22023';
  end if;

  insert into public.categories (name, slug, color, applies_to, sort_order)
  select l.name, l.slug, l.color, l.applies_to, l.sort_order from engine.listed_categories(_document) l
  on conflict (slug) do update
    set name = excluded.name,
        color = excluded.color,
        applies_to = excluded.applies_to,
        sort_order = excluded.sort_order;
  get diagnostics v_category_rows = row_count;

  select pg_catalog.array_agg(l.slug) into v_slugs from engine.listed_categories(_document) l;
  delete from public.categories c
   where not (c.slug = any (coalesce(v_slugs, array[]::text[])))
     and not exists (select 1 from public.events e where e.category_id = c.id or e.category = c.slug)
     and not exists (select 1 from public.places p where p.category_id = c.id);

  return pg_catalog.jsonb_build_object(
    'revision', v_next,
    'wording_rows', v_wording_rows,
    'category_rows', v_category_rows
  );
end;
$publish$;
revoke all on function public.publish_engine_configuration(jsonb, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.publish_engine_configuration(jsonb, jsonb, uuid) to service_role;

-- ── 5. An event's category must be one this world has ───────────────
-- In the source database the list of categories was written into a constraint. Here it is data:
-- the categories table, which publishing keeps in line with the configuration.
create function public.engine_event_category_known()
returns trigger
language plpgsql
security definer
set search_path = ''
as $known$
begin
  if new.category is not null
     and (tg_op = 'INSERT' or new.category is distinct from old.category)
     and not exists (
       select 1 from public.categories c
        where c.slug = new.category and c.applies_to in ('events', 'both')
     ) then
    raise exception 'unknown_event_category: %', new.category using errcode = '23514';
  end if;
  return new;
end;
$known$;
revoke all on function public.engine_event_category_known() from public, anon, authenticated, service_role;
create trigger engine_event_category_known
  before insert or update of category on public.events
  for each row execute function public.engine_event_category_known();

insert into engine.schema_migrations (version, name) values ('0004', 'engine_configuration');
