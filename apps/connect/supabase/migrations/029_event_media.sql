-- Event Media Gallery
-- Extends the existing event_photos table to also carry videos.
-- Keeps existing RLS + FK semantics; adds kind/thumbnail/title columns.

alter table public.event_photos
  add column if not exists kind text not null default 'image'
    check (kind in ('image', 'video')),
  add column if not exists thumbnail_url text,
  add column if not exists title text;

-- Keep the uploader referenced for RLS, but relax cascade behaviour:
-- media should survive if the uploader's profile is deleted (rare for org accounts).
-- Skipped — the existing constraint is acceptable and rewriting it would be
-- destructive. Admins can clean up if needed.

create index if not exists event_photos_event_sort_idx
  on public.event_photos (event_id, sort_order);

-- Broaden the insert policy: allow an event creator to also add media
-- regardless of which row.uploaded_by we happen to store for them, as long
-- as auth.uid() matches uploaded_by (existing policy already enforces this).
-- No change needed.

comment on table public.event_photos is
  'Event media gallery — images and videos shown in a horizontal strip on the event detail page.';
comment on column public.event_photos.kind is 'image or video';
comment on column public.event_photos.thumbnail_url is 'optional preview frame for videos';
comment on column public.event_photos.sort_order is 'smaller values render first';
