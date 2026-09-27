-- 177 — public.profiles: finish the column-level SELECT lockdown.
--
-- CONTRACT step of 174 → 175 → 176 → 177. Revokes the five private columns
-- 176 left granted TRANSITIONALLY for the pre-174 app code. Apply ONLY once
-- the app code that reads them through get_my_profile_private() /
-- mark_my_terms_accepted() (mig 174) is deployed to production — otherwise
-- middleware fails closed and signs every cookie-session user out.
--
-- After this, anon + authenticated can SELECT exactly the 33 PUBLIC columns
-- listed in 176; all 28 private columns are reachable only through the
-- caller-row RPCs, service_role, or SECURITY DEFINER functions.

revoke select (
  force_reauth_at,
  bio_setup_required,
  terms_accepted_at,
  location_sharing,
  notification_prefs
) on table public.profiles from anon, authenticated;

notify pgrst, 'reload schema';
