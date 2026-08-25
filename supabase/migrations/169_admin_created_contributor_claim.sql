-- Lets an admin manually create a Contributor listing (name, category,
-- location, etc.) that is immediately live on the map and in Kingdom
-- Discovery, tied to an email address. When the real person/org later signs
-- in with Google using that same email, they can claim it — the listing's
-- data moves onto their own account and the admin-created placeholder is
-- hidden. The placeholder is a REAL auth.users row (created via the Admin
-- Auth API from the API route, service_role) because profiles.id has a hard
-- FK to auth.users — there is no way to have a live, map-visible profiles
-- row without one. Claiming does NOT rely on Supabase's cross-provider
-- account-linking behaviour (which is not something this migration can
-- control) — it works regardless of whether the person's later Google
-- sign-in reuses that auth.users row or creates a separate one, because the
-- claim RPC copies data onto whichever profiles row the CALLER is actually
-- signed in as.

alter table public.profiles
  add column if not exists contributor_claim_email text;

alter table public.profiles
  add column if not exists contributor_claimed_at timestamptz;

alter table public.profiles
  add column if not exists contributor_created_by_admin uuid references public.profiles(id) on delete set null;

comment on column public.profiles.contributor_claim_email is
  'Set by an admin when manually creating a Contributor listing — the email the real owner must sign in with to claim it via claim_admin_created_contributor(). Null once claimed or for self-serve contributors.';
comment on column public.profiles.contributor_claimed_at is
  'Timestamp the listing was claimed by its real owner. Null = self-serve contributor (n/a) or still awaiting claim.';
comment on column public.profiles.contributor_created_by_admin is
  'The admin (profiles.id) who manually created this Contributor listing, if any.';

-- Claim an admin-created Contributor listing. Caller must be signed in;
-- matches on their OWN verified auth.users.email (case-insensitive) against
-- any unclaimed placeholder's contributor_claim_email. Copies the listing's
-- fields onto the caller's own profile (mirrors
-- self_approve_contributor_application's copy pattern) and hides the
-- placeholder. Two-step role/status update on the caller's own row is
-- required to satisfy protect_role_column()'s transition rules (same
-- not_applied->pending->approved dance /api/contributor/apply uses) — the
-- placeholder is only ever touched on non-role/status columns, so it never
-- needs the admin bypass in that trigger.
create or replace function public.claim_admin_created_contributor()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  caller_email text;
  caller_role text;
  caller_status text;
  placeholder record;
  new_slug text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  select role, contributor_status into caller_role, caller_status
    from public.profiles where id = auth.uid();

  if caller_role is distinct from 'citizen' or caller_status is distinct from 'not_applied' then
    return jsonb_build_object('success', false, 'reason', 'not_eligible');
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null or caller_email = '' then
    return jsonb_build_object('success', false, 'reason', 'no_email');
  end if;

  select * into placeholder from public.profiles
    where lower(contributor_claim_email) = lower(caller_email)
      and contributor_claimed_at is null
      and id <> auth.uid()
    order by created_at desc
    limit 1
    for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'nothing_to_claim');
  end if;

  new_slug := public.generate_contributor_slug(coalesce(nullif(placeholder.full_name, ''), 'contributor'));

  -- Step 1/2: not_applied -> pending (own row) — required before the trigger
  -- will allow pending -> approved in step 2.
  update public.profiles set contributor_status = 'pending' where id = auth.uid();

  -- Step 2/2: citizen -> contributor + pending -> approved (own row), plus
  -- the actual field copy.
  update public.profiles set
    role = 'contributor',
    contributor_status = 'approved',
    contributor_kind = placeholder.contributor_kind,
    contributor_category = placeholder.contributor_category,
    full_name = coalesce(nullif(placeholder.full_name, ''), full_name),
    bio = coalesce(placeholder.bio, bio),
    website_url = coalesce(placeholder.website_url, website_url),
    instagram_handle = coalesce(placeholder.instagram_handle, instagram_handle),
    facebook_url = coalesce(placeholder.facebook_url, facebook_url),
    tiktok_handle = coalesce(placeholder.tiktok_handle, tiktok_handle),
    youtube_url = coalesce(placeholder.youtube_url, youtube_url),
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
    contributor_slug = new_slug,
    needs_re_review = false
  where id = auth.uid();

  -- Neutralize the placeholder — only non-role/status columns, so this never
  -- touches protect_role_column()'s restricted transitions. contributor_
  -- hidden = true removes it from every public listing (/api/v1/contributors,
  -- directory_contributors, Kingdom Discovery, the map) exactly like the
  -- existing admin moderation flag does.
  update public.profiles set
    contributor_hidden = true,
    contributor_slug = null,
    contributor_claim_email = null,
    contributor_claimed_at = now()
  where id = placeholder.id;

  return jsonb_build_object('success', true, 'slug', new_slug);
end;
$function$;

revoke all on function public.claim_admin_created_contributor() from public, anon;
grant execute on function public.claim_admin_created_contributor() to authenticated;
