-- Engine baseline 0009: the scheduled jobs of a world.
--
-- Seven jobs only run SQL inside this database. One (the weekly digest) calls an edge function.
-- The address it calls is never written into the job: it is read from engine.project_settings,
-- which is filled when the project is provisioned. Until then the job does nothing.

-- The scheduler and the outbound-call extension are installed where the platform offers them (every
-- hosted project does). If the scheduler is missing altogether, the first job below fails loudly.
do $extensions$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end;
$extensions$;

-- Calls one of this project's own edge functions. Settings it reads:
--   functions_url  the project's own functions address, ending in /functions/v1
--   functions_key  the project's publishable key (never a secret key)
create function engine.call_edge_function(_name text, _body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
set search_path = ''
as $call$
declare
  v_url text;
  v_key text;
  v_request bigint;
begin
  if _name is null or _name !~ '^[a-z][a-z0-9-]{0,62}$' then
    raise exception 'engine_bad_function_name' using errcode = '22023';
  end if;
  select s.value into v_url from engine.project_settings s where s.key = 'functions_url';
  select s.value into v_key from engine.project_settings s where s.key = 'functions_key';
  if v_url is null or v_key is null then
    return null;
  end if;
  if v_url !~ '^https://[A-Za-z0-9.-]+/functions/v1$' then
    raise exception 'engine_functions_url_invalid' using errcode = '22023';
  end if;
  select net.http_post(
           url := v_url || '/' || _name,
           headers := pg_catalog.jsonb_build_object(
             'Content-Type', 'application/json',
             'Authorization', 'Bearer ' || v_key
           ),
           body := coalesce(_body, '{}'::jsonb)
         )
    into v_request;
  return v_request;
end;
$call$;
revoke all on function engine.call_edge_function(text, jsonb) from public, anon, authenticated, service_role;

select cron.schedule('contributor-analytics-daily', '15 2 * * *',
  $job$select public.aggregate_contributor_analytics_daily();$job$);

select cron.schedule('contributor-analytics-purge', '0 3 * * 0',
  $job$select public.purge_old_analytics();$job$);

select cron.schedule('live-location-cleanup', '*/15 * * * *',
  $job$select public.cleanup_stale_locations();$job$);

select cron.schedule('map-prominence-recompute', '45 2 * * *',
  $job$select public.recompute_map_prominence();$job$);

-- Messages are kept 60 days; 30 days when the sender's account was deleted.
select cron.schedule('messaging-purge-60d', '0 3 * * *', $job$
  delete from public.messages
   where created_at < now() - interval '60 days'
     and sender_id in (select id from public.profiles where deleted_at is null);

  delete from public.messages m
   where m.created_at < now() - interval '30 days'
     and exists (select 1 from public.profiles p where p.id = m.sender_id and p.deleted_at is not null);
$job$);

select cron.schedule('moments-cleanup', '17 2 * * *',
  $job$delete from public.moments where expires_at < now() - interval '7 days';$job$);

select cron.schedule('search-term-stats-purge', '30 3 * * 0',
  $job$select public.purge_old_search_terms();$job$);

select cron.schedule('contributor-digest', '0 6 * * 1',
  $job$select engine.call_edge_function('send-contributor-digest', jsonb_build_object('period', 'weekly'));$job$);

insert into engine.schema_migrations (version, name) values ('0009', 'scheduled_jobs');
