-- 196 — C10: verify-first attach for Google Form approvals and Admin Create.
--
-- NOTE ON THE NUMBER: 194 was the live head on 2026-10-21 and the serving-areas work (issue #259)
-- takes 195. This file is a DRAFT numbered 196; the number is taken again at apply time
-- (re-run list_migrations, rename the file if needed, nothing inside refers to its own number).
--
-- The problem (GitHub #159, tracker C10)
-- --------------------------------------
-- The Google Form is public and `owner_email` is unverified. A listing made "for" an email address
-- was claimed by whoever later signed in with that address, silently: the session bootstrap ran
-- `claim_admin_created_contributor()` / `mark_own_listing_claimed()` the moment a matching account
-- appeared. So a stranger who typed a victim's address into the Form (or an admin who mistyped one)
-- could plant a listing on, and copy its content onto, somebody else's account.
--
-- The design (founder, 2026-10-03)
-- --------------------------------
-- Nothing on an existing account changes without the verified owner's explicit yes.
--   * Approving a row whose email already has an account puts the listing live under a PLACEHOLDER
--     auth user with an alias email that is never mailed (the routes make it; this file has no say
--     in the alias). `contributor_claim_email` / the ledger row below hold the real owner email.
--   * The owner signs in (the 6-digit code proves the inbox, or Google), `peek_claimable_listing()`
--     tells the app there is something waiting, and the app asks "Attach 'X' to your account?
--     [Confirm] [Not me]". Only Confirm runs the claim. Admin-created listings are the same.
--   * The claim now REFUSES unless `auth.users.email_confirmed_at is not null` (an address that was
--     typed into a sign-up form but never proved cannot claim anything).
--   * "Not me" (`decline_listing_claim()`) hides the placeholder at once and records the refusal for
--     the admin; nothing on the caller's own account changes.
--   * No answer: the listing stays live, nothing is attached, nothing expires. One reminder goes out
--     after 7 days (sent by a scheduled route, tracked by `reminder_sent_at`).
--
-- Where the state lives
-- ---------------------
-- A new ledger table, `public.listing_claims`, one row per placeholder. `profiles` is not widened
-- (every new profiles column needs a privacy classification, migs 174-176), and the ledger keeps the
-- listing's slug as it was when the Sheet row was written, so the Sheet can still find the row after
-- the claim has moved the slug to the owner's own account.
-- The Apps Script reads it through a signed route (service_role); an admin may read it with their
-- own session (policy below); nobody else can see or write it.
--
-- Contents
--   1. public.listing_claims + grants + RLS
--   2. peek_claimable_listing()                  NEW, read-only, for the confirm screen
--   3. claim_admin_created_contributor()         REPLACED (verified email, ledger, slug moves with the listing)
--   4. mark_own_listing_claimed()                REPLACED (the same, for an owner who signs in AS the placeholder)
--   5. decline_listing_claim()                   NEW ("Not me")
--   6. backfill of any placeholder created before this migration
--   7. ROLLBACK (at the foot, not part of the apply)
--
-- Footguns restated (RESUME section 3): CREATE OR REPLACE FUNCTION drops `SET search_path` unless it is
-- restated, so every function below restates it and schema-qualifies every reference. A new table
-- gets ALL privileges for anon and authenticated by default (TRUNCATE ignores RLS), so they are
-- revoked explicitly. Every SECURITY DEFINER body starts with the `auth.uid() is null` guard.

-- ── 1. The ledger ────────────────────────────────────────────────────
create table public.listing_claims (
  id             uuid primary key default gen_random_uuid(),
  -- The auth user + profile the listing lives under until the owner decides. Deleting that account
  -- (admin Delete of a placeholder) removes the ledger row with it.
  placeholder_id uuid not null unique references public.profiles (id) on delete cascade,
  -- The slug the Sheet row and the welcome email were given. Kept here because the claim moves the
  -- slug onto the owner's own profile and clears it from the placeholder.
  slug           text not null,
  -- The real owner email as typed on the Form / by the admin, lower-cased. Never shown to the public.
  claim_email    text not null check (claim_email = lower(btrim(claim_email)) and char_length(claim_email) between 3 and 254),
  source         text not null check (source in ('google_form', 'admin_create', 'legacy')),
  status         text not null default 'awaiting' check (status in ('awaiting', 'confirmed', 'declined')),
  -- Who confirmed (the placeholder itself when the owner signed in AS it).
  claimant_id    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  reminder_sent_at timestamptz,
  decided_at     timestamptz,
  constraint listing_claims_decided_matches_status check ((status = 'awaiting') = (decided_at is null))
);

comment on table public.listing_claims is
  'C10 ledger: one row per Form/Admin-created listing that is waiting for its owner to confirm it (awaiting), was attached (confirmed) or was refused (declined). Server-owned: service_role, the SECURITY DEFINER claim functions and admins (read) only.';
comment on column public.listing_claims.reminder_sent_at is
  'Set when the single 7-day reminder email was sent (or deliberately suppressed for a legacy row). Never cleared except to retry a failed send.';

-- At most one open request per address, so a confirm screen never has to pick between two listings.
create unique index listing_claims_one_awaiting_per_email
  on public.listing_claims (claim_email) where status = 'awaiting';
-- The Sheet's status poll looks rows up by slug.
create index listing_claims_slug_idx on public.listing_claims (slug);
-- The daily reminder sweep.
create index listing_claims_reminder_due_idx
  on public.listing_claims (created_at) where status = 'awaiting' and reminder_sent_at is null;
-- Foreign key without an index would show up in the performance advisor.
create index listing_claims_claimant_idx on public.listing_claims (claimant_id) where claimant_id is not null;

alter table public.listing_claims enable row level security;

-- A new table is granted ALL to anon and authenticated by default; TRUNCATE ignores RLS.
revoke all on table public.listing_claims from public, anon, authenticated;
grant select on table public.listing_claims to authenticated;           -- only the admin policy below can match
grant select, insert, update, delete on table public.listing_claims to service_role;

create policy "Admins can read listing claims"
  on public.listing_claims for select to authenticated
  using ((select auth.uid()) is not null and public.is_admin());

-- ── 2. peek_claimable_listing() ──────────────────────────────────────
-- Read-only. Answers "is there a listing waiting for the person who is signed in right now?" from
-- the caller's OWN verified email, so there is nothing to enumerate: no argument, and an address
-- that has not been proved gets nothing. `mode` says which screen to show:
--   'attach' the caller has their own account; Confirm copies the listing onto it
--   'self'   the caller signed in AS the placeholder (a fresh address); Confirm just records it
create or replace function public.peek_claimable_listing()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  caller_email text;
  caller_confirmed timestamptz;
  ledger record;
  listing record;
  caller_ok boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('found', false, 'reason', 'not_authenticated');
  end if;

  select email, email_confirmed_at into caller_email, caller_confirmed
    from auth.users where id = auth.uid();
  if caller_email is null or caller_email = '' or caller_confirmed is null then
    return jsonb_build_object('found', false, 'reason', 'email_not_verified');
  end if;

  select lc.* into ledger from public.listing_claims lc
   where lc.status = 'awaiting'
     and lc.claim_email = lower(btrim(caller_email))
   limit 1;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select id, full_name, contributor_kind, contributor_category, logo_url, bio,
         contributor_no_fixed_location, physical_latitude, physical_longitude
    into listing from public.profiles
   where id = ledger.placeholder_id
     and role = 'contributor' and contributor_status = 'approved'
     and coalesce(contributor_hidden, false) = false and deleted_at is null;
  if not found then
    -- Removed or hidden by an admin since: there is nothing left to attach.
    return jsonb_build_object('found', false);
  end if;

  if ledger.placeholder_id = auth.uid() then
    return jsonb_build_object(
      'found', true, 'mode', 'self', 'eligible', true,
      'name', listing.full_name, 'slug', ledger.slug, 'kind', listing.contributor_kind,
      'category', listing.contributor_category, 'logo_url', listing.logo_url,
      'created_at', ledger.created_at
    );
  end if;

  select (role = 'citizen' and contributor_status = 'not_applied') into caller_ok
    from public.profiles where id = auth.uid();

  return jsonb_build_object(
    'found', true, 'mode', 'attach', 'eligible', coalesce(caller_ok, false),
    'name', listing.full_name, 'slug', ledger.slug, 'kind', listing.contributor_kind,
    'category', listing.contributor_category, 'logo_url', listing.logo_url,
    'created_at', ledger.created_at
  );
end;
$function$;

revoke all on function public.peek_claimable_listing() from public, anon;
grant execute on function public.peek_claimable_listing() to authenticated;

comment on function public.peek_claimable_listing() is
  'C10: is a Form/Admin-created listing waiting for the caller? Matches the caller''s OWN verified email only (no argument, nothing to enumerate). Returns {found, mode: attach|self, eligible, name, slug, kind, category, logo_url, created_at}. Read-only.';

-- ── 3. claim_admin_created_contributor() (attach) ────────────────────
-- Body is the live definition (mig 179) with: the verified-email requirement, the ledger as the
-- source of truth (an 'awaiting' row whose address is the caller's), a re-check that the listing is
-- still live, and the slug MOVING to the owner so the link in the welcome email keeps working
-- (the placeholder gives it up first; before this the owner got "name-2" and the emailed link died).
-- The Form's automatic-update choice and sources stay with the placeholder: that consent was given
-- by whoever filled in the Form, so it is not carried onto an account that did not give it.
create or replace function public.claim_admin_created_contributor()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller_email text;
  caller_confirmed timestamptz;
  caller_role text;
  caller_status text;
  ledger record;
  placeholder record;
  new_slug text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select email, email_confirmed_at into caller_email, caller_confirmed
    from auth.users where id = auth.uid();
  if caller_email is null or caller_email = '' then
    return jsonb_build_object('success', false, 'reason', 'no_email');
  end if;
  -- The point of C10: an address that was typed but never proved cannot claim anything.
  if caller_confirmed is null then
    return jsonb_build_object('success', false, 'reason', 'email_not_verified');
  end if;

  select role, contributor_status into caller_role, caller_status
    from public.profiles where id = auth.uid();
  if caller_role is distinct from 'citizen' or caller_status is distinct from 'not_applied' then
    return jsonb_build_object('success', false, 'reason', 'not_eligible');
  end if;

  select lc.* into ledger from public.listing_claims lc
   where lc.status = 'awaiting'
     and lc.claim_email = lower(btrim(caller_email))
     and lc.placeholder_id <> auth.uid()
   for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'nothing_to_claim');
  end if;

  select * into placeholder from public.profiles
   where id = ledger.placeholder_id
     and role = 'contributor' and contributor_status = 'approved'
     and coalesce(contributor_hidden, false) = false and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'nothing_to_claim');
  end if;

  -- Free the slug first (the unique index would refuse two holders), then hand it on.
  update public.profiles set
    contributor_hidden = true,
    contributor_slug = null,
    contributor_claim_email = null,
    contributor_claimed_at = now()
  where id = placeholder.id;

  new_slug := coalesce(
    placeholder.contributor_slug,
    public.generate_contributor_slug(coalesce(nullif(placeholder.full_name, ''), 'contributor'))
  );

  -- Step 1/2: not_applied -> pending (own row), required before the trigger allows step 2.
  update public.profiles set contributor_status = 'pending' where id = auth.uid();

  -- Step 2/2: citizen -> contributor + pending -> approved (own row), plus the field copy.
  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    contributor_hidden = false,
    contributor_kind = placeholder.contributor_kind,
    contributor_category = placeholder.contributor_category,
    full_name = coalesce(nullif(placeholder.full_name, ''), full_name),
    bio = coalesce(placeholder.bio, bio),
    website_url = coalesce(placeholder.website_url, website_url),
    contributor_contact_email = coalesce(placeholder.contributor_contact_email, contributor_contact_email),
    instagram_handle = coalesce(placeholder.instagram_handle, instagram_handle),
    facebook_url = coalesce(placeholder.facebook_url, facebook_url),
    tiktok_handle = coalesce(placeholder.tiktok_handle, tiktok_handle),
    youtube_url = coalesce(placeholder.youtube_url, youtube_url),
    x_handle = coalesce(placeholder.x_handle, x_handle),
    linkedin_url = coalesce(placeholder.linkedin_url, linkedin_url),
    whatsapp_number = coalesce(placeholder.whatsapp_number, whatsapp_number),
    contributor_no_fixed_location = placeholder.contributor_no_fixed_location,
    physical_address = placeholder.physical_address,
    physical_latitude = placeholder.physical_latitude,
    physical_longitude = placeholder.physical_longitude,
    logo_url = coalesce(placeholder.logo_url, logo_url),
    gallery_urls = case
      when jsonb_array_length(coalesce(placeholder.gallery_urls, '[]'::jsonb)) > 0
        then placeholder.gallery_urls
      else gallery_urls
    end,
    cover_photo_urls = case
      when jsonb_array_length(coalesce(placeholder.cover_photo_urls, '[]'::jsonb)) > 0
        then placeholder.cover_photo_urls
      else cover_photo_urls
    end,
    contributor_slug = new_slug,
    needs_re_review = false
  where id = auth.uid();

  update public.listing_claims set
    status = 'confirmed', claimant_id = auth.uid(), decided_at = now()
  where id = ledger.id;

  return jsonb_build_object('success', true, 'slug', new_slug);
end;
$function$;

comment on function public.claim_admin_created_contributor() is
  'C10: the owner CONFIRMED. Copies a Form/Admin-created listing onto the caller''s own account and hides the placeholder. Requires the caller''s email to be verified (email_confirmed_at) and to equal the open ledger row''s address; the slug moves with the listing. Only the confirm screen calls it (via POST /api/contributor/claim).';

-- ── 4. mark_own_listing_claimed() (self) ─────────────────────────────
-- The owner signed in AS the placeholder (its auth email IS their address). Confirming records it.
create or replace function public.mark_own_listing_claimed()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller_email text;
  caller_confirmed timestamptz;
  ledger record;
  own_slug text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select email, email_confirmed_at into caller_email, caller_confirmed
    from auth.users where id = auth.uid();
  if caller_email is null or caller_email = '' or caller_confirmed is null then
    return jsonb_build_object('success', false, 'reason', 'email_not_verified');
  end if;

  select lc.* into ledger from public.listing_claims lc
   where lc.status = 'awaiting'
     and lc.placeholder_id = auth.uid()
     and lc.claim_email = lower(btrim(caller_email))
   for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'nothing_to_mark');
  end if;

  update public.profiles set
    contributor_claimed_at = now(),
    contributor_claim_email = null
  where id = auth.uid()
    and role = 'contributor'
    and coalesce(contributor_hidden, false) = false
    and deleted_at is null
  returning contributor_slug into own_slug;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'nothing_to_mark');
  end if;

  update public.listing_claims set
    status = 'confirmed', claimant_id = auth.uid(), decided_at = now()
  where id = ledger.id;

  return jsonb_build_object('success', true, 'slug', own_slug);
end;
$function$;

comment on function public.mark_own_listing_claimed() is
  'C10: the owner signed in AS their Form/Admin-created listing account and CONFIRMED it is theirs. Verified email required; stamps contributor_claimed_at and the ledger on the caller''s OWN row. No longer runs on sign-in by itself.';

-- ── 5. decline_listing_claim() ("Not me") ────────────────────────────
-- The person who signed in says the listing is not theirs. The placeholder is hidden at once and the
-- ledger records the refusal (the admin sees it in the Sheet and decides whether to Delete). Nothing
-- on the caller's own account changes: this function never writes to the caller's profile unless the
-- caller IS the placeholder, in which case it only sets the hide flag on it.
create or replace function public.decline_listing_claim()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller_email text;
  caller_confirmed timestamptz;
  ledger record;
  listing_name text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select email, email_confirmed_at into caller_email, caller_confirmed
    from auth.users where id = auth.uid();
  if caller_email is null or caller_email = '' or caller_confirmed is null then
    return jsonb_build_object('success', false, 'reason', 'email_not_verified');
  end if;

  select lc.* into ledger from public.listing_claims lc
   where lc.status = 'awaiting'
     and lc.claim_email = lower(btrim(caller_email))
   for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'nothing_to_decline');
  end if;

  update public.profiles set contributor_hidden = true
   where id = ledger.placeholder_id
  returning full_name into listing_name;

  update public.listing_claims set status = 'declined', decided_at = now()
   where id = ledger.id;

  return jsonb_build_object('success', true, 'name', listing_name, 'slug', ledger.slug);
end;
$function$;

revoke all on function public.claim_admin_created_contributor() from public, anon;
grant execute on function public.claim_admin_created_contributor() to authenticated;
revoke all on function public.mark_own_listing_claimed() from public, anon;
grant execute on function public.mark_own_listing_claimed() to authenticated;
revoke all on function public.decline_listing_claim() from public, anon;
grant execute on function public.decline_listing_claim() to authenticated;

comment on function public.decline_listing_claim() is
  'C10: "Not me". Hides the placeholder listing at once and records the refusal on the ledger so the admin can see it. Verified email required. Changes nothing on the caller''s own account.';

-- ── 6. Backfill ──────────────────────────────────────────────────────
-- A placeholder made before this migration has no ledger row, so the owner would never be asked.
-- (Live on 2026-10-21: none.) reminder_sent_at is set so an old row does not get a reminder out of the blue.
insert into public.listing_claims (placeholder_id, slug, claim_email, source, status, created_at, reminder_sent_at)
select p.id, p.contributor_slug, lower(btrim(p.contributor_claim_email)), 'legacy', 'awaiting', p.created_at, now()
  from public.profiles p
 where p.contributor_claim_email is not null
   and btrim(p.contributor_claim_email) <> ''
   and p.contributor_claimed_at is null
   and p.contributor_slug is not null
   and p.role = 'contributor'
on conflict do nothing;

-- ── 7. ROLLBACK (keep with the migration; do not run as part of the apply) ───────────────────
-- Restores the pre-C10 bodies (mig 179 claim, mig 173 mark_own) and removes the ledger. Take the bodies
-- from those two files (git show <tag>:supabase/migrations/179_... and 173_...) rather than retyping them.
--   drop function if exists public.decline_listing_claim();
--   drop function if exists public.peek_claimable_listing();
--   -- re-create claim_admin_created_contributor() from mig 179 and mark_own_listing_claimed() from mig 173
--   --   (CREATE OR REPLACE; restate `set search_path to ''` and the grants)
--   drop table if exists public.listing_claims;
--   -- The pre-apply git tag is the restore point: connect-pre-mig196-listing-claim (name follows the final number).
