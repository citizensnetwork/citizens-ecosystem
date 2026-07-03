-- 085_fix_contributor_notification_types_and_delete.sql
--
-- Two related fixes for the Contributor approval pipeline:
--
-- 1. Bugfix: `notifications.type` CHECK constraint omits the
--    `contributor_approved` / `contributor_rejected` values that
--    `approve_contributor_application()` and
--    `reject_contributor_application()` (added in migration 084)
--    actually insert.  Every admin click currently fails with
--      ERROR: new row for relation "notifications" violates check
--      constraint "notifications_type_check"
--    which surfaces as PostgREST 400 -> Edge Function 500 -> UI
--    "review failed".  Verified against pg_constraint + edge fn
--    postgres logs on 2026-05-22.
--
--    Fix: rebuild the CHECK to include the contributor decision
--    types (and keep every existing value).
--
-- 2. New: admin-only `delete_contributor_application(_application_id)`
--    SECURITY DEFINER RPC.  Admin UI gains a Discard / Delete control
--    so non-actionable applications can be removed without polluting
--    the queue.  When deleted, the applicant's profile is reset to
--    `contributor_status = 'not_applied'` so they can re-apply.
--
--    No matching RLS DELETE policy is added on
--    `contributor_applications` — admins act through this RPC so the
--    profile reset stays atomic with the row delete.

-- ---------------------------------------------------------------
-- 1. Widen notifications_type_check.
-- ---------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type = any (array[
      'event_reminder',
      'new_event_match',
      'event_cancelled',
      'new_follower',
      'event_update',
      'new_message',
      'review_prompt',
      'admin_elevation_request',
      'friend_convince',
      'friend_attending',
      'contributor_approved',
      'contributor_rejected'
    ])
  );

-- ---------------------------------------------------------------
-- 2. delete_contributor_application(_application_id uuid)
-- ---------------------------------------------------------------
create or replace function public.delete_contributor_application(_application_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  app record;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'reason', 'not_admin');
  end if;

  -- Lock + load the row so the profile reset and the delete commit
  -- as one unit, and so concurrent reviewers see a consistent state.
  select id, user_id, status into app
  from public.contributor_applications
  where id = _application_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  -- Reset applicant's profile status only if they are still flagged
  -- as the applicant for this exact row (status pending). Approved
  -- applicants should keep their contributor state even if the
  -- historical application is deleted.
  if app.status = 'pending' then
    update public.profiles
      set contributor_status = 'not_applied'
      where id = app.user_id
        and contributor_status = 'pending';
  end if;

  delete from public.contributor_applications where id = _application_id;

  return jsonb_build_object(
    'success', true,
    'action', 'deleted',
    'user_id', app.user_id
  );
end;
$$;

revoke all on function public.delete_contributor_application(uuid) from public;
grant execute on function public.delete_contributor_application(uuid) to authenticated;

comment on function public.delete_contributor_application(uuid) is
  'Admin-only. Hard-deletes a contributor_applications row and resets the applicant''s profile.contributor_status to ''not_applied'' if it was still ''pending''. Wrapped in a SECURITY DEFINER function so we do not need a broad DELETE RLS policy on the table.';
