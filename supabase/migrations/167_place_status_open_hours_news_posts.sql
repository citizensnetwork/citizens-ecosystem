-- ═══════════════════════════════════════════════════════════════════
-- Migration 167 — place cancellation status + open_hours, news_posts
-- ═══════════════════════════════════════════════════════════════════
-- APPLIED to xyiajtrvhlxaeplsiajj on 2026-08-24. Security advisor checked
-- immediately after per SHARED_DB_CONTRACT.md R7.3: 0 ERROR, no new findings
-- (every WARN/INFO returned was pre-existing baseline, unrelated to this
-- migration). Kept here as the historical record for your migrations
-- folder — the first attempt referenced `public.set_updated_at()` for an
-- auto-touch trigger on `updated_at`, which turned out to only exist in the
-- `wear` schema; rather than borrow across that app boundary for a column
-- nothing in the UI reads, the trigger was dropped and the column kept with
-- just its insert-time default. The version below is exactly what's live.
--
-- Purely additive: two new columns on `places` (one mirrors an existing,
-- working pattern already on `events`; the other fixes a pre-existing bug),
-- and one brand-new table with its own RLS. Nothing existing was altered or
-- dropped.

-- 1) places.status — mirrors events.status exactly, so "remove" means
--    cancel (reversible), matching what you asked for. Cancelled places stay
--    in the DB and remain directly viewable; the app filters/badges them —
--    this migration doesn't need to touch places' SELECT RLS (it's already
--    unconditionally `true`, same as it is today).
alter table public.places
  add column if not exists status text not null default 'published'
    check (status in ('published', 'cancelled'));

comment on column public.places.status is
  'Mirrors events.status. Cancelled places stay in the DB (reversible) —
   the dashboard flips this instead of deleting.';

-- 2) places.open_hours — a pre-existing gap found while wiring the edit
--    form: Create Place has always captured "Opening hours" in the UI, but
--    createPlace() never included it in the insert row, so it was silently
--    discarded on every place ever created. This column makes the field
--    actually persist. (create.jsx / store.jsx already read and write it —
--    no frontend change needed once this column exists.)
alter table public.places
  add column if not exists open_hours text;

-- 3) news_posts — a contributor-authored update/story feed shown on their
--    own public listing (ContributorProfilePage). Distinct from
--    broadcast_messages, which is a 24h map-bubble tied to one event/place.
--    post_date is contributor-editable (backdate a story, or just order a
--    timeline) and is what the feed sorts by — separate from created_at.
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 5000),
  image_url text,
  post_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.news_posts is
  'Contributor-authored update/story/blog post shown on their public
   listing. post_date is contributor-editable and is what the public feed
   sorts by — distinct from created_at (when the row was actually inserted).';

create index if not exists news_posts_contributor_date_idx
  on public.news_posts (contributor_id, post_date desc);

alter table public.news_posts enable row level security;

-- Commons-style visibility (SHARED_DB_CONTRACT.md R3.1): public read,
-- owner-or-admin write — identical shape to places/events/broadcast_messages.
create policy "News posts are viewable by everyone"
  on public.news_posts for select
  using (true);

create policy "Contributors can create own news posts"
  on public.news_posts for insert
  with check (auth.uid() = contributor_id);

create policy "Contributors can update own news posts"
  on public.news_posts for update
  using (auth.uid() = contributor_id or is_admin())
  with check (auth.uid() = contributor_id or is_admin());

create policy "Contributors can delete own news posts"
  on public.news_posts for delete
  using (auth.uid() = contributor_id or is_admin());

-- No auto-touch trigger on updated_at: the only generic "touch updated_at"
-- functions in this project live in the wear/vision schemas (app-scoped, not
-- public/commons), and borrowing across that boundary for a column nothing
-- in the UI currently reads isn't worth the cross-app dependency. The column
-- stays (insert-time default), update.jsx callers can set it explicitly if
-- it's ever surfaced later.

-- ── After applying ──
-- Run the security advisor per SHARED_DB_CONTRACT.md R7.3. Target: 0 ERROR.
-- A new RLS-enabled table with straightforward owner policies shouldn't
-- introduce any; the two `places` columns are nullable-safe/defaulted so no
-- existing row or reader is affected.
