-- Phase 15C: Custom map markers for events
-- Stores custom marker styling per event

alter table public.events
  add column if not exists marker_type text not null default 'category'
    check (marker_type in ('category', 'profile', 'icon', 'logo')),
  add column if not exists marker_icon text,
  add column if not exists marker_color text,
  add column if not exists marker_image_url text;

comment on column public.events.marker_type is 'category=default category icon, profile=creator profile photo, icon=custom SVG icon, logo=uploaded logo image';
comment on column public.events.marker_icon is 'SVG icon name when marker_type is icon';
comment on column public.events.marker_color is 'Fill colour hex when marker_type is icon';
comment on column public.events.marker_image_url is 'Custom image URL when marker_type is logo';
