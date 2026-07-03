-- 083_categories_admin_write_policies.sql
-- Add missing admin INSERT / UPDATE / DELETE RLS policies on public.categories.
--
-- Background: migration 003 enabled RLS on public.categories and only created
-- a public SELECT policy. The /admin/categories surface (CategoryManager) writes
-- directly to the table via the browser supabase client, so every mutation is
-- rejected by RLS in the authenticated role.
--
-- This migration fills that gap using the exact same is_admin() gate already in
-- use on event_tags (migration 056) and admin_actions (migration 043). It does
-- NOT change what categories are, how they are used, or how they are fetched --
-- only which Postgres role may write them.
--
-- Masterplan alignment: categories are admin-managed, app-defined taxonomy.
-- See .github/MASTER_DIRECTION.md. No feature scope is altered.
--
-- VERIFICATION NOTE (Tier B): Before or after applying, confirm live state with:
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'categories'
--   order by cmd;
-- Expected after apply: SELECT (public), INSERT (authenticated/is_admin),
-- UPDATE (authenticated/is_admin), DELETE (authenticated/is_admin).
-- Also run: mcp_supabase_get_advisors type:"security" -- no new warnings expected.

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'categories'
      and policyname = 'categories_insert_admin'
  ) then
    create policy "categories_insert_admin"
      on public.categories for insert
      to authenticated
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'categories'
      and policyname = 'categories_update_admin'
  ) then
    create policy "categories_update_admin"
      on public.categories for update
      to authenticated
      using  (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'categories'
      and policyname = 'categories_delete_admin'
  ) then
    create policy "categories_delete_admin"
      on public.categories for delete
      to authenticated
      using (public.is_admin());
  end if;
end $$;
