-- ============================================================================
-- 089_place_six_month_delete_window.sql
--
-- Enforces the "places cannot be removed within 6 months of creation"
-- business rule at the database layer. Admins (public.is_admin()) bypass.
--
-- EditPlaceForm.handleDelete enforces this rule client-side only; a place
-- owner can bypass via any other Supabase client (browser console, curl with
-- their JWT, mobile build). This trigger closes the bypass.
-- ============================================================================

create or replace function public.enforce_place_six_month_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.is_admin() then
    return old;
  end if;

  if old.created_at > (now() - interval '6 months') then
    raise exception 'places cannot be removed within 6 months of creation'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

revoke all on function public.enforce_place_six_month_delete() from public;
-- Trigger functions don't need explicit grants; postgres owns the trigger.

drop trigger if exists trg_enforce_place_six_month_delete on public.places;
create trigger trg_enforce_place_six_month_delete
  before delete on public.places
  for each row execute function public.enforce_place_six_month_delete();
