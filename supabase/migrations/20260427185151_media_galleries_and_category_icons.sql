-- Media galleries for places + event media RLS hardening.
--
-- Event gallery UI already exists, but its row-level security allowed any
-- authenticated user to attach media rows to any event as long as they set
-- uploaded_by to themselves. This migration scopes event media writes to the
-- event owner/admin and adds the equivalent place gallery table + policies.

-- Refresh place-images bucket + storage policies. The bucket already exists in
-- older environments, but these definitions make create/update/delete owner
-- scoped and idempotent for gallery uploads. Public object URLs use the bucket's
-- public flag, so no broad SELECT policy is recreated for storage.objects.
insert into storage.buckets (id, name, public)
values ('place-images', 'place-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Place images public read" on storage.objects;

drop policy if exists "Place images upload" on storage.objects;
create policy "Place images upload" on storage.objects
	for insert to authenticated
	with check (
		bucket_id = 'place-images'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "Place images update own" on storage.objects;
create policy "Place images update own" on storage.objects
	for update to authenticated
	using (
		bucket_id = 'place-images'
		and (
			(storage.foldername(name))[1] = auth.uid()::text
			or public.is_admin()
		)
	)
	with check (
		bucket_id = 'place-images'
		and (
			(storage.foldername(name))[1] = auth.uid()::text
			or public.is_admin()
		)
	);

drop policy if exists "Place images delete own" on storage.objects;
create policy "Place images delete own" on storage.objects
	for delete to authenticated
	using (
		bucket_id = 'place-images'
		and (
			(storage.foldername(name))[1] = auth.uid()::text
			or public.is_admin()
		)
	);

create table if not exists public.place_media (
	id uuid default gen_random_uuid() primary key,
	place_id uuid not null references public.places(id) on delete cascade,
	url text not null,
	kind text not null default 'image' check (kind in ('image', 'video')),
	thumbnail_url text,
	title text,
	sort_order int not null default 0,
	uploaded_by uuid not null references public.profiles(id) on delete cascade,
	created_at timestamptz not null default now()
);

create index if not exists place_media_place_sort_idx
	on public.place_media (place_id, sort_order);

alter table public.place_media enable row level security;

drop policy if exists "Place media are viewable by everyone" on public.place_media;
create policy "Place media are viewable by everyone" on public.place_media
	for select to public
	using (true);

drop policy if exists "Place owners or admins can upload place media" on public.place_media;
create policy "Place owners or admins can upload place media" on public.place_media
	for insert to authenticated
	with check (
		auth.uid() = uploaded_by
		and exists (
			select 1
			from public.places p
			where p.id = place_id
				and (p.created_by = auth.uid() or public.is_admin())
		)
	);

drop policy if exists "Place owners or admins can update place media" on public.place_media;
create policy "Place owners or admins can update place media" on public.place_media
	for update to authenticated
	using (
		exists (
			select 1
			from public.places p
			where p.id = place_id
				and (p.created_by = auth.uid() or public.is_admin())
		)
	)
	with check (
		exists (
			select 1
			from public.places p
			where p.id = place_id
				and (p.created_by = auth.uid() or public.is_admin())
		)
	);

drop policy if exists "Place owners or admins can delete place media" on public.place_media;
create policy "Place owners or admins can delete place media" on public.place_media
	for delete to authenticated
	using (
		exists (
			select 1
			from public.places p
			where p.id = place_id
				and (p.created_by = auth.uid() or public.is_admin())
		)
	);

drop policy if exists "Authenticated users can upload event photos" on public.event_photos;
drop policy if exists "Photo uploader or admin can delete photos" on public.event_photos;
drop policy if exists "Event owners or admins can upload event photos" on public.event_photos;
drop policy if exists "Event owners or admins can update event photos" on public.event_photos;
drop policy if exists "Event owners or admins can delete event photos" on public.event_photos;
drop policy if exists "Event owners, admins, or uploaders can delete event photos" on public.event_photos;

create policy "Event owners or admins can upload event photos" on public.event_photos
	for insert to authenticated
	with check (
		auth.uid() = uploaded_by
		and exists (
			select 1
			from public.events e
			where e.id = event_id
				and (e.created_by = auth.uid() or public.is_admin())
		)
	);

create policy "Event owners or admins can update event photos" on public.event_photos
	for update to authenticated
	using (
		exists (
			select 1
			from public.events e
			where e.id = event_id
				and (e.created_by = auth.uid() or public.is_admin())
		)
	)
	with check (
		exists (
			select 1
			from public.events e
			where e.id = event_id
				and (e.created_by = auth.uid() or public.is_admin())
		)
	);

create policy "Event owners, admins, or uploaders can delete event photos" on public.event_photos
	for delete to authenticated
	using (
		auth.uid() = uploaded_by
		or exists (
			select 1
			from public.events e
			where e.id = event_id
				and (e.created_by = auth.uid() or public.is_admin())
		)
	);

comment on table public.place_media is
	'Place media gallery - images and videos shown on the place detail page.';
comment on column public.place_media.kind is 'image or video';
comment on column public.place_media.thumbnail_url is 'optional preview frame for videos';
comment on column public.place_media.sort_order is 'smaller values render first';
