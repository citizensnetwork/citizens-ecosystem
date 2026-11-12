-- ════════════════════════════════════════════════════════════════════
--  205_central_functions
--
--  DRAFT. NOT APPLIED, AND NEVER EXECUTED ANYWHERE. Same rules as 203.
--  Needs 203 and 204.
--
--  The `central` schema is not exposed through PostgREST, so Connect's
--  server code reaches it through these four functions in `public`.
--
--  WHY SECURITY INVOKER
--   Every function runs as its caller, and the only caller allowed is
--   service_role, which already holds the table grants (203, 204). So no
--   SECURITY DEFINER function is needed and the advisor gains no new
--   definer finding. EXECUTE is revoked from public, anon and
--   authenticated and granted to service_role only. search_path is empty
--   and every name is schema-qualified.
--
--  WHAT IT ADDS
--   * public.central_publish_items(app, items)  the ONE write path. The
--     caller (Connect's API route) has already validated each item in
--     TypeScript and taken `app` from the API key binding; the table
--     checks of 204 are the second line. Limits: 100 items per call, the
--     app's daily quota, the app's publish switch.
--   * public.central_remove_items(app, keys)    soft removal.
--   * public.central_feed_candidates(lat, lng, cutoff, limit)  the read
--     the feed API ranks from (guide section 5.2). It takes a coarse cell
--     and returns public items only. It stores and logs nothing.
--   * public.central_apps()                     the registry as JSON.
--
--  ROLLBACK
--    drop function public.central_apps();
--    drop function public.central_feed_candidates(numeric, numeric, timestamptz, integer);
--    drop function public.central_remove_items(text, jsonb);
--    drop function public.central_publish_items(text, jsonb);
-- ════════════════════════════════════════════════════════════════════

create function public.central_publish_items(p_app text, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_app      central.apps%rowtype;
  v_count    integer;
  v_used     integer;
  v_item     jsonb;
  v_index    integer := 0;
  v_accepted integer := 0;
  v_rejected jsonb := '[]'::jsonb;
  v_today    date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  select * into v_app from central.apps where slug = p_app;
  if not found then
    raise exception 'central: unknown app' using errcode = '22023';
  end if;
  if not v_app.publish_enabled or v_app.status = 'paused' then
    raise exception 'central: publishing is switched off for this app' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'central: items must be an array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count > 100 then
    raise exception 'central: at most 100 items per call' using errcode = '22023';
  end if;

  -- Count first. If the quota is exceeded the exception rolls the count back too.
  insert into central.publish_log as l (app_slug, day, writes)
  values (p_app, v_today, v_count)
  on conflict (app_slug, day) do update set writes = l.writes + excluded.writes
  returning l.writes into v_used;
  if v_used > v_app.daily_item_quota then
    raise exception 'central: daily quota reached for this app' using errcode = '53400';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      insert into central.feed_items as f (
        app_slug, kind, source_id, title, kicker, summary, image_url, image_alt, icon, list,
        shape, place_label, geo_lat, geo_lng, region, starts_at, ends_at, href, visibility, payload
      )
      values (
        p_app,
        v_item ->> 'kind',
        v_item ->> 'sourceId',
        v_item ->> 'title',
        v_item ->> 'kicker',
        v_item ->> 'summary',
        v_item #>> '{image,url}',
        v_item #>> '{image,alt}',
        v_item ->> 'icon',
        nullif(v_item -> 'list', 'null'::jsonb),
        v_item ->> 'shape',
        v_item #>> '{place,label}',
        (v_item #>> '{place,lat}')::numeric,
        (v_item #>> '{place,lng}')::numeric,
        v_item ->> 'region',
        (v_item ->> 'startsAt')::timestamptz,
        (v_item ->> 'endsAt')::timestamptz,
        v_item ->> 'href',
        v_item ->> 'visibility',
        nullif(v_item -> 'payload', 'null'::jsonb)
      )
      on conflict on constraint feed_items_source_key do update set
        title = excluded.title,
        kicker = excluded.kicker,
        summary = excluded.summary,
        image_url = excluded.image_url,
        image_alt = excluded.image_alt,
        icon = excluded.icon,
        list = excluded.list,
        shape = excluded.shape,
        place_label = excluded.place_label,
        geo_lat = excluded.geo_lat,
        geo_lng = excluded.geo_lng,
        region = excluded.region,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        href = excluded.href,
        payload = excluded.payload,
        status = 'live',
        updated_at = now(),
        expires_at = now() + interval '30 days';
        -- published_at is kept: an edit does not re-enter the edition cutoff.
      v_accepted := v_accepted + 1;
    exception
      when check_violation or not_null_violation or foreign_key_violation
        or invalid_text_representation or invalid_datetime_format
        or datetime_field_overflow or numeric_value_out_of_range then
        v_rejected := v_rejected
          || jsonb_build_array(jsonb_build_object('index', v_index, 'reason', sqlstate));
    end;
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object('accepted', v_accepted, 'rejected', v_rejected);
end;
$$;

create function public.central_remove_items(p_app text, p_keys jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_removed integer;
begin
  if p_keys is null or jsonb_typeof(p_keys) <> 'array' or jsonb_array_length(p_keys) > 100 then
    raise exception 'central: keys must be an array of at most 100' using errcode = '22023';
  end if;
  update central.feed_items f
  set status = 'removed', updated_at = now()
  from jsonb_array_elements(p_keys) as k(value)
  where f.app_slug = p_app
    and f.kind = k.value ->> 'kind'
    and f.source_id = k.value ->> 'sourceId'
    and f.status <> 'removed';
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

create function public.central_feed_candidates(
  p_lat    numeric,
  p_lng    numeric,
  p_cutoff timestamptz,
  p_limit  integer default 300
)
returns setof central.feed_items
language sql
stable
security invoker
set search_path = ''
as $$
  select f.*
  from central.feed_items f
  join central.apps a on a.slug = f.app_slug
  where f.status = 'live'
    and a.status = 'live'
    and f.visibility = 'public'
    and f.expires_at > now()
    and (f.ends_at is null or f.ends_at > now())
    and (f.starts_at is null or f.starts_at <= now() + interval '21 days')
    and f.published_at <= p_cutoff
  order by
    -- Central's own pause and encouragement items are never crowded out by the limit.
    case when f.app_slug = 'central' then 0 else 1 end,
    -- Items with a venue first when the viewer has a cell, nearest first. The viewer's
    -- cell is rounded to 1 decimal here as well: the caller is not trusted to have done it.
    case when p_lat is null or p_lng is null or f.geo_lat is null then 1 else 0 end,
    case
      when p_lat is null or p_lng is null or f.geo_lat is null then 0
      else power(f.geo_lat - round(p_lat, 1), 2)
         + power((f.geo_lng - round(p_lng, 1)) * cos(radians(round(p_lat, 1))), 2)
    end,
    f.id
  limit least(greatest(coalesce(p_limit, 300), 1), 300);
$$;

create function public.central_apps()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slug', a.slug,
        'name', a.name,
        'label', a.label,
        'accent', a.accent,
        'icon', a.icon,
        'explanation', a.explanation,
        'visitUrl', a.visit_url,
        'status', a.status,
        'sortOrder', a.sort_order,
        'kinds', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object('kind', k.kind, 'label', k.label, 'defaultShape', k.default_shape)
              order by k.kind
            ),
            '[]'::jsonb
          )
          from central.app_kinds k
          where k.app_slug = a.slug
        )
      )
      order by a.sort_order, a.slug
    ),
    '[]'::jsonb
  )
  from central.apps a
  where a.status in ('live', 'coming_soon');
$$;

revoke execute on function public.central_publish_items(text, jsonb) from public, anon, authenticated;
revoke execute on function public.central_remove_items(text, jsonb) from public, anon, authenticated;
revoke execute on function public.central_feed_candidates(numeric, numeric, timestamptz, integer)
  from public, anon, authenticated;
revoke execute on function public.central_apps() from public, anon, authenticated;

grant execute on function public.central_publish_items(text, jsonb) to service_role;
grant execute on function public.central_remove_items(text, jsonb) to service_role;
grant execute on function public.central_feed_candidates(numeric, numeric, timestamptz, integer)
  to service_role;
grant execute on function public.central_apps() to service_role;
