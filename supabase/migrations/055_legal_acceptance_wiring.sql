-- Batch J — Legal acceptance wiring
--
-- Note: migration 024 (indemnity_forms) was never applied to the remote
-- Supabase database — the `indemnity_templates` and `indemnity_signatures`
-- tables don't exist on this environment, even though supporting code in
-- `EventFormWithIndemnity` and `/api/indemnity` was shipped. This migration
-- therefore also creates those tables so that Batch J is complete in one
-- shot without touching older migration file numbering.
--
-- Goals of this batch:
--   1. Create indemnity_templates + indemnity_signatures (if missing)
--   2. Allow 'platform' in applies_to
--   3. Replace blunt UNIQUE(..., event_id|place_id) with partial indexes
--      so that NULLS-DISTINCT does not silently allow duplicate signatures
--   4. Add profiles.terms_accepted_at scalar gate
--   5. Seed platform-terms-v1, organiser-event-liability,
--      attendee-participation-waiver, venue-listing-waiver templates

begin;

-- ── 1. Tables (idempotent) ───────────────────────────────
create table if not exists public.indemnity_templates (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  body        text not null,
  version     int not null default 1,
  applies_to  text not null default 'events',
  required    boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.indemnity_signatures (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references public.indemnity_templates(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  event_id         uuid references public.events(id) on delete set null,
  place_id         uuid references public.places(id) on delete set null,
  full_name        text not null,
  agreed_at        timestamptz not null default now(),
  ip_address       text,
  template_version int not null default 1,
  created_at       timestamptz not null default now()
);

-- ── 2. Applies-to check (drop + add) ─────────────────────
alter table public.indemnity_templates
  drop constraint if exists indemnity_templates_applies_to_check;

alter table public.indemnity_templates
  add constraint indemnity_templates_applies_to_check
  check (applies_to in ('events', 'places', 'platform', 'both'));

-- ── 3. Uniqueness via partial indexes ────────────────────
alter table public.indemnity_signatures
  drop constraint if exists indemnity_signatures_template_id_user_id_event_id_key;
alter table public.indemnity_signatures
  drop constraint if exists indemnity_signatures_template_id_user_id_place_id_key;

create unique index if not exists indemnity_signatures_platform_unique
  on public.indemnity_signatures (template_id, user_id)
  where event_id is null and place_id is null;

create unique index if not exists indemnity_signatures_event_unique
  on public.indemnity_signatures (template_id, user_id, event_id)
  where event_id is not null;

create unique index if not exists indemnity_signatures_place_unique
  on public.indemnity_signatures (template_id, user_id, place_id)
  where place_id is not null;

create index if not exists idx_indemnity_signatures_user
  on public.indemnity_signatures (user_id);

-- ── 4. RLS ───────────────────────────────────────────────
alter table public.indemnity_templates enable row level security;
alter table public.indemnity_signatures enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='indemnity_templates'
      and policyname='Anyone can read indemnity templates'
  ) then
    create policy "Anyone can read indemnity templates"
      on public.indemnity_templates for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='indemnity_templates'
      and policyname='Admins can manage indemnity templates'
  ) then
    create policy "Admins can manage indemnity templates"
      on public.indemnity_templates for all using (is_admin());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='indemnity_signatures'
      and policyname='Users can read own signatures'
  ) then
    create policy "Users can read own signatures"
      on public.indemnity_signatures for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='indemnity_signatures'
      and policyname='Users can sign indemnities'
  ) then
    create policy "Users can sign indemnities"
      on public.indemnity_signatures for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='indemnity_signatures'
      and policyname='Admins can read all signatures'
  ) then
    create policy "Admins can read all signatures"
      on public.indemnity_signatures for select using (is_admin());
  end if;
end $$;

-- ── 5. profiles.terms_accepted_at ────────────────────────
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_accepted_at is
  'Timestamp at which the user accepted the current platform Terms. NULL means never accepted. Paired with an indemnity_signatures row for audit.';

-- ── 6. Seed templates ────────────────────────────────────
insert into public.indemnity_templates (slug, title, body, applies_to, required, version)
values (
  'platform-terms-v1',
  'Citizens Connect — Terms & Community Agreement',
  E'By creating an account on Citizens Connect, you confirm that you have read and agree to the following. These terms protect you, other members, and the broader community of organisers, contributors, and attendees.\n\nPURPOSE OF THE PLATFORM\nCitizens Connect is a community discovery platform that helps people find and share faith-centred gatherings, social events, community upliftment activities, and the spaces where they happen. It is open to everyone, regardless of background or belief.\n\nPARTICIPATION\nAll activities you discover on this platform happen in the real world, off-platform. By attending, organising, or engaging with any listed event or place, you acknowledge that your participation is voluntary and at your own risk, that you will behave respectfully toward other members, organisers, and attendees, and that you will not use the platform to promote hate speech, harassment, illegal activity, or misleading content.\n\nACCURACY OF INFORMATION\nYou agree that the information you provide about yourself, your organisation, and any events or places you list is accurate and kept up to date. Misrepresentation may result in account suspension.\n\nCONTENT YOU SHARE\nYou retain ownership of any content you upload (photos, event descriptions, reviews, messages). By posting, you grant Citizens Connect a non-exclusive licence to display, distribute, and promote that content within the platform and its affiliated channels.\n\nMODERATION AND REPORTS\nCitizens Connect operates a reports and moderation system. Abusive, harmful, or misleading content may be removed, and offending accounts may be suspended. We strive to be fair and transparent, and we review reports against published community guidelines.\n\nLIABILITY LIMITATION\nCitizens Connect, its operators, and affiliates are a facilitating platform — not the organiser of listed events or the owner of listed places. We are not liable for any injuries, damages, losses, disputes, or claims arising from interactions initiated on the platform or from attending or hosting any event or place listed here.\n\nDATA AND PRIVACY\nWe handle your personal information in accordance with applicable privacy law (including the Protection of Personal Information Act, where it applies). You can request to view, export, or delete your data at any time from your profile page.\n\nCHANGES TO THE AGREEMENT\nWe may revise these terms as the platform evolves. Material changes will be surfaced in-app and require re-acceptance. Continued use of the platform after a revised version is published constitutes acceptance of the new terms.',
  'platform',
  true,
  1
)
on conflict (slug) do nothing;

insert into public.indemnity_templates (slug, title, body, applies_to, required, version)
values (
  'organiser-event-liability',
  'Event Organiser Liability Waiver',
  E'By creating this event on Citizens Connect, I acknowledge and agree to the following:\n\nRESPONSIBILITY\nI am solely responsible for the planning, execution, and safety of this event.\n\nACCURACY\nAll information provided about this event is accurate and not misleading.\n\nCOMPLIANCE\nThis event complies with all applicable local laws, bylaws, and regulations.\n\nLIABILITY\nCitizens Connect, its operators, and affiliates shall not be held liable for any injuries, damages, losses, or claims arising from this event.\n\nINSURANCE\nI understand that Citizens Connect does not provide insurance coverage for events listed on the platform.\n\nINDEMNIFICATION\nI agree to indemnify and hold harmless Citizens Connect from any claims, damages, or expenses arising from my event.\n\nCONTENT\nI have the right to use all content (images, descriptions, etc.) associated with this event listing.\n\nThis agreement is binding from the moment of event publication.',
  'events',
  true,
  1
)
on conflict (slug) do nothing;

-- Attendee waiver: required=false so it does NOT pull into the organiser
-- EventFormWithIndemnity flow (which filters applies_to=events + required=true).
-- Enforced at RSVP via the first-time modal in RSVPButton.
insert into public.indemnity_templates (slug, title, body, applies_to, required, version)
values (
  'attendee-participation-waiver',
  'Event Participation Waiver',
  E'By RSVPing to this event, I acknowledge and agree to the following:\n\nVOLUNTARY PARTICIPATION\nMy attendance is voluntary and at my own risk.\n\nASSUMPTION OF RISK\nI understand that events may involve inherent risks.\n\nRELEASE\nI release the event organiser and Citizens Connect from liability for any injuries or losses during the event.\n\nEMERGENCY CONTACT\nI confirm I have provided accurate contact information in my profile.\n\nMEDIA CONSENT\nI consent to being photographed or recorded at the event unless I opt out with the organiser.',
  'events',
  false,
  1
)
on conflict (slug) do nothing;

insert into public.indemnity_templates (slug, title, body, applies_to, required, version)
values (
  'venue-listing-waiver',
  'Venue & Place Listing Agreement',
  E'By adding this place to Citizens Connect, I confirm the following:\n\nAUTHORITY\nI am authorised to list this place on behalf of the venue, ministry, organisation, or business it represents.\n\nACCURACY\nThe information provided — including name, address, contact details, imagery, and description — is accurate to the best of my knowledge.\n\nCOMPLIANCE\nThe venue operates lawfully and in compliance with all applicable safety, zoning, and licensing regulations.\n\nSAFETY\nI am responsible for the health, safety, and conduct of people who visit this place as a result of it being listed on the platform.\n\nLIABILITY\nCitizens Connect, its operators, and affiliates are a facilitating platform and are not liable for any injuries, damages, or losses that occur at this venue.\n\nREMOVAL\nI understand Citizens Connect reserves the right to unlist any place that violates these terms or community guidelines.',
  'places',
  true,
  1
)
on conflict (slug) do nothing;

commit;
