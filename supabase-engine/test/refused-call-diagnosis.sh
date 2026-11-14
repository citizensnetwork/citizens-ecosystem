#!/usr/bin/env bash
# TEST ONLY. Runs last in the "Engine baseline" job and never fails it.
#
# On 2026-11-13 the hosted Postgres image ended its server process when a role called a function
# it had no right to call. This script finds out when that happens: which caller, which kind of
# function, and which preloaded library is involved. It prints one "RESULT |" line per attempt.
# It uses its own throwaway schema and never touches the engine line's objects, except for one
# read-only call of the publish function.
#
# usage: refused-call-diagnosis.sh <container name>

set -u
C="${1:-engine-db}"
IMAGE="$(docker inspect --format '{{.Config.Image}}' "$C")"

run_sql() { # <user> ; SQL on stdin
  docker exec -i -e PGPASSWORD "$C" psql -X -q -h localhost -U "$1" -d postgres 2>&1
}
wait_ready() {
  for _ in $(seq 1 45); do
    if docker exec "$C" pg_isready -q -h localhost -U supabase_admin -d postgres 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
classify() {
  case "$1" in
    *"permission denied for function"*) echo "refused cleanly" ;;
    *"server closed the connection"* | *"terminated abnormally"* | *"connection to server"*) echo "SERVER PROCESS ENDED" ;;
    *) echo "other: $(printf '%s' "$1" | tr '\n' ' ' | cut -c1-160)" ;;
  esac
}
attempt() { # <label> <login role> <sql>
  if ! wait_ready; then echo "RESULT | $1 | server not ready"; return; fi
  out="$(printf '%s\n' "$3" | run_sql "$2")"
  echo "RESULT | $1 | $(classify "$out")"
}

wait_ready || { echo "RESULT | setup | server not ready"; exit 0; }

run_sql supabase_admin <<'SQL'
create schema if not exists diag;
grant usage on schema diag to anon, authenticated;
create or replace function diag.plain_sql() returns int language sql as 'select 1';
create or replace function diag.plain_plpgsql() returns int language plpgsql as $f$ begin return 1; end $f$;
create or replace function diag.definer_fixed_path() returns int language plpgsql security definer
  set search_path = '' as $f$ begin return 1; end $f$;
create or replace function diag.with_default(_a jsonb, _b jsonb default '{}'::jsonb) returns int
  language sql as 'select 1';
revoke all on all functions in schema diag from public, anon, authenticated;
select 'login roles: ' || string_agg(rolname || (case when rolsuper then ' (superuser)' else '' end), ', ' order by rolname)
  from pg_roles where rolcanlogin;
select 'shared_preload_libraries: ' || current_setting('shared_preload_libraries');
select 'session_preload_libraries: ' || current_setting('session_preload_libraries');
select 'server_version: ' || current_setting('server_version');
SQL

echo "== 1. Who calls, and what kind of function (a plain top-level statement, as the data API sends it)"
for login in supabase_admin postgres authenticator; do
  for fn in "diag.plain_sql()" "diag.plain_plpgsql()" "diag.definer_fixed_path()" "diag.with_default('{}'::jsonb)" "public.publish_engine_configuration('{}'::jsonb)"; do
    attempt "login $login, set role anon, select $fn" "$login" "set role anon; select $fn;"
  done
done

echo "== 2. Other forms, as the data API's own login role"
attempt "authenticator, anon, inside a transaction with set local role" authenticator \
  "begin; set local role anon; select diag.plain_sql(); commit;"
attempt "authenticator, anon, function in FROM" authenticator \
  "set role anon; select * from diag.plain_sql();"
attempt "authenticator, anon, inside a block with an exception handler" authenticator \
  "set role anon; do \$d\$ begin begin perform diag.plain_sql(); exception when insufficient_privilege then null; end; end \$d\$;"
attempt "authenticator, authenticated, select" authenticator \
  "set role authenticated; select diag.plain_sql();"
attempt "authenticator, anon, a refused TABLE read (for contrast)" authenticator \
  "set role anon; select * from engine.schema_migrations;"

echo "== 3. Which preloaded library is involved (each one left out in turn, then the first call again)"
wait_ready || { echo "RESULT | bisect | server not ready"; exit 0; }
shared="$(printf '%s\n' "select current_setting('shared_preload_libraries');" | docker exec -i -e PGPASSWORD "$C" psql -X -q -t -A -h localhost -U supabase_admin -d postgres 2>/dev/null)"
session="$(printf '%s\n' "select current_setting('session_preload_libraries');" | docker exec -i -e PGPASSWORD "$C" psql -X -q -t -A -h localhost -U supabase_admin -d postgres 2>/dev/null)"
datadir="$(printf '%s\n' "select current_setting('data_directory');" | docker exec -i -e PGPASSWORD "$C" psql -X -q -t -A -h localhost -U supabase_admin -d postgres 2>/dev/null)"
if [ -z "$datadir" ]; then echo "RESULT | bisect | could not read the settings"; exit 0; fi

without() { # <list> <item> : the comma list without one item
  printf '%s' "$1" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v -x -F "$2" | paste -sd, -
}
restart_with() { # <shared list> <session list>
  docker stop -t 20 "$C" >/dev/null 2>&1
  docker run --rm --volumes-from "$C" --entrypoint sh "$IMAGE" -c \
    "printf '%s\n' \"shared_preload_libraries = '$1'\" \"session_preload_libraries = '$2'\" > '$datadir/postgresql.auto.conf'" >/dev/null 2>&1
  docker start "$C" >/dev/null 2>&1
}
probe_call="set role anon; select diag.plain_sql();"

restart_with "$shared" "$session"
attempt "all libraries as shipped (after a restart)" supabase_admin "$probe_call"

for lib in $(printf '%s' "$session" | tr ',' ' '); do
  restart_with "$shared" "$(without "$session" "$lib")"
  attempt "without session library $lib" supabase_admin "$probe_call"
done
for lib in $(printf '%s' "$shared" | tr ',' ' '); do
  restart_with "$(without "$shared" "$lib")" "$session"
  attempt "without shared library $lib" supabase_admin "$probe_call"
done
restart_with "" ""
attempt "without any preloaded library" supabase_admin "$probe_call"
exit 0
