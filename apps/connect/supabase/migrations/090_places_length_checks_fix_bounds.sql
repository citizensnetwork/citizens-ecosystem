-- ============================================================================
-- 090_places_length_checks_fix_bounds.sql
--
-- Corrects the lower bound on places.description and places.address length
-- checks introduced in migration 088. Those columns are declared
-- `not null default ''` (see Section 6 of schema.sql), so the `between 1`
-- lower bound from 088 would reject empty strings written by inserts that
-- omit the column or pass `''`. Lower bound is relaxed to `0` so the
-- existing column default keeps working; upper bound is unchanged.
--
-- Idempotent: each constraint is dropped if it exists, then re-added with
-- the corrected expression.
-- ============================================================================

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('places_description_length_chk',
        'char_length(description) between 0 and 4000'),
      ('places_address_length_chk',
        'char_length(address) between 0 and 500')
    ) as t(name, expr)
  loop
    if exists (
      select 1 from pg_constraint
      where conname = c.name and conrelid = 'public.places'::regclass
    ) then
      execute format('alter table public.places drop constraint %I', c.name);
    end if;
    execute format(
      'alter table public.places add constraint %I check (%s) not valid',
      c.name, c.expr
    );
    begin
      execute format('alter table public.places validate constraint %I', c.name);
    exception when check_violation then
      raise notice 'constraint % left NOT VALID (existing rows fail check)', c.name;
    end;
  end loop;
end $$;
