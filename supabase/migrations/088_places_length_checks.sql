-- ============================================================================
-- 088_places_length_checks.sql
--
-- Bounds free-text columns on public.places to prevent storage DoS via direct
-- supabase-js inserts. Forms enforce these on the client (only custom_category
-- carries maxLength={100}); RLS only gates write authorship + role, not size.
-- This closes the gap at the DB layer so a hostile contributor cannot write
-- multi-megabyte text fields that then propagate into map popups, search
-- RPCs, and places.search_profile derivations.
--
-- Idempotent: lookups against pg_constraint guard re-application. Each
-- constraint is added NOT VALID (so it takes effect for new writes
-- immediately) then VALIDATEd; if existing rows violate the bound the
-- constraint stays NOT VALID and a follow-up batch must remediate.
-- ============================================================================

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('places_name_length_chk',
        'char_length(name) between 1 and 120'),
      ('places_description_length_chk',
        'char_length(description) between 0 and 4000'),
      ('places_address_length_chk',
        'char_length(address) between 0 and 500'),
      ('places_phone_length_chk',
        'phone is null or char_length(phone) <= 32'),
      ('places_website_length_chk',
        'website is null or char_length(website) <= 500'),
      ('places_custom_category_length_chk',
        'custom_category is null or char_length(custom_category) <= 120')
    ) as t(name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c.name and conrelid = 'public.places'::regclass
    ) then
      execute format(
        'alter table public.places add constraint %I check (%s) not valid',
        c.name, c.expr
      );
      begin
        execute format('alter table public.places validate constraint %I', c.name);
      exception when check_violation then
        -- Leave the constraint NOT VALID; a follow-up batch must remediate
        -- offending rows and re-run `validate constraint`.
        raise notice 'constraint % left NOT VALID (existing rows fail check)', c.name;
      end;
    end if;
  end loop;
end $$;
