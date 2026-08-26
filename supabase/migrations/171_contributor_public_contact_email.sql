-- Adds a genuinely PUBLIC contact email a Contributor can choose to display
-- on their listing — distinct from profiles.notification_email (private,
-- platform-only, used by /api/contributor/setup for where WE email them).
-- Prior to this, the onboarding wizard's "Contact email" field was written
-- into notification_email and never surfaced publicly — ContributorProfilePage
-- already had display code for `contactEmail` that could never fire because
-- nothing populated it. This column is what that display code was waiting on.

alter table public.profiles
  add column if not exists contributor_contact_email text;

alter table public.profiles
  add constraint profiles_contributor_contact_email_length
  check (contributor_contact_email is null or char_length(contributor_contact_email) <= 254);

comment on column public.profiles.contributor_contact_email is
  'Public-facing contact email a Contributor chooses to display on their listing (ContributorProfilePage, /api/v1/contributors). Nullable, self-service via /api/contributor/profile. Distinct from notification_email (private) and the auth account email.';
