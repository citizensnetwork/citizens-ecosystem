-- Phase 14B: Social platform connections in profile
-- Adds instagram, facebook, tiktok handles to profiles

alter table public.profiles
  add column if not exists instagram_handle text,
  add column if not exists facebook_url text,
  add column if not exists tiktok_handle text;

-- Update schema comment
comment on column public.profiles.instagram_handle is 'Instagram username (without @)';
comment on column public.profiles.facebook_url is 'Facebook profile or page URL';
comment on column public.profiles.tiktok_handle is 'TikTok username (without @)';
