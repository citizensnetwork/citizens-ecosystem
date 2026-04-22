-- Migration 044: Public read access to platform-wide analytics rows.
--
-- Phase D follow-up for the ecosystem v1 surface.
--
-- `analytics_daily` already allows admins + the owning contributor to
-- read their rows. Ecosystem consumers (Citizens Central, the public
-- `/api/v1/analytics/community` endpoint) need to read the aggregated
-- PLATFORM-WIDE rows — those where `org_id is null`. These rows
-- contain only aggregate counts (events_published, rsvps_created,
-- active_users, etc.) with no PII.
--
-- The existing org-scoped rows remain private — this policy explicitly
-- scopes to `org_id is null`.

begin;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'analytics_daily'
      and policyname = 'Platform analytics are public'
  ) then
    create policy "Platform analytics are public"
      on public.analytics_daily for select
      using (org_id is null);
  end if;
end $$;

commit;
