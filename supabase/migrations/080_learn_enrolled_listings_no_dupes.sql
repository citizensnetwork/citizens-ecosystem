-- Migration 080 — No-duplicates CHECK on profiles.learn_enrolled_listings
--
-- Batch 7b. Closes the deferred "CHECK no-dupes on learn_enrolled_listings"
-- Architect nice-to-have from Batch 6.
--
-- Postgres forbids subqueries directly inside CHECK expressions, so we wrap the
-- dedupe predicate in an IMMUTABLE helper function. The CHECK then calls the
-- function and Postgres is happy.

create or replace function public.uuid_array_has_no_duplicates(arr uuid[])
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select arr is null
      or cardinality(arr) = cardinality(array(select distinct unnest(arr)));
$$;

comment on function public.uuid_array_has_no_duplicates(uuid[]) is
  'IMMUTABLE helper for CHECK constraints — true iff arr is null/empty or all elements are distinct.';

do $$
begin
  if not exists (
    select 1
    from   pg_constraint
    where  conname = 'profiles_learn_enrolled_listings_no_dupes'
    and    conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_learn_enrolled_listings_no_dupes
      check (public.uuid_array_has_no_duplicates(learn_enrolled_listings));
  end if;
end
$$;
