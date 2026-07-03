-- 061 - Seed 6 real-world contributor organisations + 5 events each.
--
-- For QA / design review. Categories map to the events_category_check
-- allowlist (migration 052). Idempotent - keyed by fixed UUIDs.
--
-- The profile-enrichment UPDATE block disables user triggers on
-- public.profiles so seed data can set role='contributor' and
-- contributor_status='approved' directly (the protect_role_column
-- trigger otherwise blocks not_applied -> approved transitions). The
-- trigger is re-enabled immediately after. handle_new_user runs as
-- INSERT trigger on auth.users - unaffected.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- 1. Seed auth.users - handle_new_user trigger creates matching profiles.
do $$
declare
  orgs record;
begin
  for orgs in
    select * from (values
      ('11111111-1111-4111-8111-000000000001'::uuid, 'seed-crc@citizens.local',           'Christian Revival Church (CRC) - Cape Town', 'ministry'),
      ('11111111-1111-4111-8111-000000000002'::uuid, 'seed-everynation@citizens.local',   'Every Nation Mooikloof',                      'ministry'),
      ('11111111-1111-4111-8111-000000000003'::uuid, 'seed-lynnwoodmarket@citizens.local','Lynnwood Farmers Market',                     'business'),
      ('11111111-1111-4111-8111-000000000004'::uuid, 'seed-ellel@citizens.local',         'Ellel Ministries South Africa',               'ministry'),
      ('11111111-1111-4111-8111-000000000005'::uuid, 'seed-popup@citizens.local',         'POPUP Skills Development Centre',             'organization'),
      ('11111111-1111-4111-8111-000000000006'::uuid, 'seed-uturn@citizens.local',         'U-Turn Homeless Ministries',                  'organization')
    ) as t(id, email, full_name, kind)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, invited_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_super_admin, last_sign_in_at
    )
    values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      orgs.id,
      'authenticated',
      'authenticated',
      orgs.email,
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      null,
      '', '', '', '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'full_name', orgs.full_name,
        'role', 'contributor',
        'contributor_kind', orgs.kind
      ),
      now(), now(), false, null
    )
    on conflict (id) do nothing;
  end loop;
end $$;

-- 2. Enrich profiles. Must disable user triggers so protect_role_column
--    does not block role/contributor_status changes on seed rows.
alter table public.profiles disable trigger user;

update public.profiles set
  role = 'contributor',
  contributor_kind = 'ministry',
  contributor_status = 'approved',
  full_name = 'Christian Revival Church (CRC) - Cape Town',
  contributor_slug = 'crc-cape-town',
  bio = 'Christian Revival Church is a Spirit-filled, multi-generational family of believers in the Mother City. We gather weekly to worship Jesus, disciple the next generation, and release the Kingdom across Cape Town through teaching, prayer, and outreach.',
  website_url = 'https://www.crc.org.za',
  instagram_handle = 'crccapetown',
  facebook_url = 'https://www.facebook.com/crccapetown',
  youtube_url = 'https://www.youtube.com/@crccapetown',
  physical_address = 'CRC Bloubergstrand, Cape Town, Western Cape',
  physical_latitude = -33.8116,
  physical_longitude = 18.4716,
  bio_setup_required = false
where id = '11111111-1111-4111-8111-000000000001';

update public.profiles set
  role = 'contributor',
  contributor_kind = 'ministry',
  contributor_status = 'approved',
  full_name = 'Every Nation Mooikloof',
  contributor_slug = 'every-nation-mooikloof',
  bio = 'Every Nation Mooikloof is a church of honour, faith and fire in east Pretoria. Our heart is to honour God, honour people, and equip every follower of Jesus to disciple their family, workplace and city.',
  website_url = 'https://enmooikloof.co.za',
  instagram_handle = 'enmooikloof',
  facebook_url = 'https://www.facebook.com/ENMooikloof',
  youtube_url = 'https://www.youtube.com/@everynationmooikloof',
  physical_address = 'Olympus Drive, Mooikloof, Pretoria, Gauteng',
  physical_latitude = -25.8231,
  physical_longitude = 28.3564,
  bio_setup_required = false
where id = '11111111-1111-4111-8111-000000000002';

update public.profiles set
  role = 'contributor',
  contributor_kind = 'business',
  contributor_status = 'approved',
  full_name = 'Lynnwood Farmers Market',
  contributor_slug = 'lynnwood-farmers-market',
  bio = 'A vibrant Saturday morning market in the heart of Lynnwood, Pretoria. Artisan food, local produce, live acoustic music, and a family-friendly atmosphere every weekend - rain or shine.',
  website_url = 'https://lynnwoodfarmersmarket.co.za',
  instagram_handle = 'lynnwoodfarmersmarket',
  facebook_url = 'https://www.facebook.com/LynnwoodFarmersMarket',
  physical_address = 'Lynnwood Road, Lynnwood, Pretoria, Gauteng',
  physical_latitude = -25.7670,
  physical_longitude = 28.2940,
  bio_setup_required = false
where id = '11111111-1111-4111-8111-000000000003';

update public.profiles set
  role = 'contributor',
  contributor_kind = 'ministry',
  contributor_status = 'approved',
  full_name = 'Ellel Ministries South Africa',
  contributor_slug = 'ellel-ministries',
  bio = 'A Christian retreat centre on the slopes of the Magaliesberg offering teaching, prayer ministry, healing retreats and personal restoration. Rooted in scripture, led by the Holy Spirit, and dedicated to seeing lives made whole in Jesus.',
  website_url = 'https://www.ellelministries.org/south-africa',
  instagram_handle = 'ellelafrica',
  facebook_url = 'https://www.facebook.com/EllelAfrica',
  youtube_url = 'https://www.youtube.com/@EllelMinistriesInternational',
  physical_address = 'Pecanwood Estate Road, Hartbeespoort, North West',
  physical_latitude = -25.7311,
  physical_longitude = 27.8650,
  bio_setup_required = false
where id = '11111111-1111-4111-8111-000000000004';

update public.profiles set
  role = 'contributor',
  contributor_kind = 'organization',
  contributor_status = 'approved',
  full_name = 'POPUP Skills Development Centre',
  contributor_slug = 'popup-skills',
  bio = 'POPUP (People Upliftment Programme) is a Pretoria-based NPO equipping unemployed South Africans with practical skills, life-orientation, and work-readiness - helping them step out of poverty and into sustainable livelihoods.',
  website_url = 'https://popup.co.za',
  instagram_handle = 'popupsa',
  facebook_url = 'https://www.facebook.com/popupsouthafrica',
  youtube_url = 'https://www.youtube.com/@popupsouthafrica',
  physical_address = '237 Visagie Street, Pretoria Central, Gauteng',
  physical_latitude = -25.7534,
  physical_longitude = 28.1873,
  bio_setup_required = false
where id = '11111111-1111-4111-8111-000000000005';

update public.profiles set
  role = 'contributor',
  contributor_kind = 'organization',
  contributor_status = 'approved',
  full_name = 'U-Turn Homeless Ministries',
  contributor_slug = 'u-turn',
  bio = 'U-Turn breaks the cycle of homelessness in Cape Town through a proven rehabilitation programme, skills training, and dignified work opportunities. Every purchase at a U-Turn charity shop helps fund a life-change journey.',
  website_url = 'https://homeless.org.za',
  instagram_handle = 'uturnministries',
  facebook_url = 'https://www.facebook.com/UTurnMinistries',
  youtube_url = 'https://www.youtube.com/@uturnministries',
  physical_address = '1 Roeland Street, Cape Town CBD, Western Cape',
  physical_latitude = -33.9290,
  physical_longitude = 18.4197,
  bio_setup_required = false
where id = '11111111-1111-4111-8111-000000000006';

alter table public.profiles enable trigger user;

-- 3. Additional venues: U-Turn second location + CRC second campus.
delete from public.contributor_locations
 where profile_id = any(array[
   '11111111-1111-4111-8111-000000000001',
   '11111111-1111-4111-8111-000000000006'
 ]::uuid[]);

insert into public.contributor_locations (profile_id, label, address, latitude, longitude, sort_order)
values
  ('11111111-1111-4111-8111-000000000006', 'Roeland Street Cafe',    '1 Roeland Street, Cape Town CBD, Western Cape', -33.9290, 18.4197, 0),
  ('11111111-1111-4111-8111-000000000006', 'Claremont Charity Shop', 'Main Road, Claremont, Cape Town, Western Cape', -33.9823, 18.4650, 1),
  ('11111111-1111-4111-8111-000000000001', 'Bloubergstrand Campus',  'CRC Bloubergstrand, Cape Town, Western Cape',   -33.8116, 18.4716, 0),
  ('11111111-1111-4111-8111-000000000001', 'Durbanville Campus',     'Wellington Road, Durbanville, Cape Town',       -33.8290, 18.6500, 1);

-- 4. Seed 30 events. Categories from events_category_check allowlist.
delete from public.events
 where created_by = any(array[
   '11111111-1111-4111-8111-000000000001',
   '11111111-1111-4111-8111-000000000002',
   '11111111-1111-4111-8111-000000000003',
   '11111111-1111-4111-8111-000000000004',
   '11111111-1111-4111-8111-000000000005',
   '11111111-1111-4111-8111-000000000006'
 ]::uuid[]);

insert into public.events (title, description, category, latitude, longitude, location, date, end_time, created_by, status) values
  ('Sunday Celebration Service', 'Join us every Sunday for vibrant worship, powerful preaching and deep encounter with Jesus. All ages welcome.', 'church',    -33.8116, 18.4716, 'CRC Bloubergstrand, Cape Town', now() + interval '2 days',  now() + interval '2 days 2 hours',  '11111111-1111-4111-8111-000000000001', 'published'),
  ('Youth Night: Ignite',        'High-energy worship and teaching for teens and young adults. Pizza after!',                                                'kids',      -33.8116, 18.4716, 'CRC Bloubergstrand, Cape Town', now() + interval '5 days',  now() + interval '5 days 3 hours',  '11111111-1111-4111-8111-000000000001', 'published'),
  ('City Prayer Gathering',      'An evening of united prayer for Cape Town. All churches welcome.',                                                          'church',    -33.8116, 18.4716, 'CRC Bloubergstrand, Cape Town', now() + interval '14 days', now() + interval '14 days 2 hours', '11111111-1111-4111-8111-000000000001', 'published'),
  ('Marriage Enrichment Workshop','A Saturday morning investing in your marriage - practical, biblical, fun.',                                                'marriage-and-couples', -33.8116, 18.4716, 'CRC Bloubergstrand, Cape Town', now() + interval '21 days', now() + interval '21 days 4 hours', '11111111-1111-4111-8111-000000000001', 'published'),
  ('Water Baptism Celebration',  'Public declaration of faith at the beach. Come celebrate with us!',                                                          'church',    -33.8116, 18.4716, 'Bloubergstrand Beach, Cape Town', now() - interval '7 days', now() - interval '7 days' + interval '2 hours', '11111111-1111-4111-8111-000000000001', 'published'),
  ('EN Mooikloof Sunday',          'Gather with family for worship, Word and community. Kids and youth programmes run in parallel.', 'church',     -25.8231, 28.3564, 'Olympus Drive, Mooikloof, Pretoria', now() + interval '3 days',  now() + interval '3 days 2 hours',  '11111111-1111-4111-8111-000000000002', 'published'),
  ('Victory Groups Kick-off',      'Sign up for a small group - discipleship, friendship, growth.',                                   'equip',      -25.8231, 28.3564, 'Olympus Drive, Mooikloof, Pretoria', now() + interval '10 days', now() + interval '10 days 2 hours', '11111111-1111-4111-8111-000000000002', 'published'),
  ('Men of Honour Breakfast',      'Practical discipleship over breakfast for men of all ages.',                                       'mens',       -25.8231, 28.3564, 'Olympus Drive, Mooikloof, Pretoria', now() + interval '17 days', now() + interval '17 days 3 hours', '11111111-1111-4111-8111-000000000002', 'published'),
  ('Worship Night: Sanctuary',     'A night of pure worship. Come expectant.',                                                         'church',     -25.8231, 28.3564, 'Olympus Drive, Mooikloof, Pretoria', now() + interval '28 days', now() + interval '28 days 2 hours', '11111111-1111-4111-8111-000000000002', 'published'),
  ('Community Outreach: Mamelodi', 'Serving practically with food parcels, medical outreach and prayer.',                              'missional',  -25.7200, 28.3700, 'Mamelodi, Pretoria', now() - interval '14 days', now() - interval '14 days' + interval '5 hours', '11111111-1111-4111-8111-000000000002', 'published'),
  ('Saturday Market: This Weekend', 'Artisan food, fresh produce, live acoustic music. Family friendly.',             'social-fun',    -25.7670, 28.2940, 'Lynnwood Road, Pretoria', now() + interval '4 days',  now() + interval '4 days 5 hours',  '11111111-1111-4111-8111-000000000003', 'published'),
  ('Coffee & Craft Showcase',       'Local roasters and artisans take over the central aisle.',                        'social-fun',    -25.7670, 28.2940, 'Lynnwood Road, Pretoria', now() + interval '11 days', now() + interval '11 days 5 hours', '11111111-1111-4111-8111-000000000003', 'published'),
  ('Spring Harvest Festival',       'Celebrate spring with our biggest market of the season.',                         'entertainment', -25.7670, 28.2940, 'Lynnwood Road, Pretoria', now() + interval '25 days', now() + interval '25 days 6 hours', '11111111-1111-4111-8111-000000000003', 'published'),
  ('Live Music: Acoustic Lounge',   'Relax to live acoustic sets every Saturday morning.',                             'entertainment', -25.7670, 28.2940, 'Lynnwood Road, Pretoria', now() + interval '18 days', now() + interval '18 days 4 hours', '11111111-1111-4111-8111-000000000003', 'published'),
  ('Kids Morning: Easter Edition',  'Face painting, petting zoo and treasure hunt for the little ones.',               'kids',          -25.7670, 28.2940, 'Lynnwood Road, Pretoria', now() - interval '30 days', now() - interval '30 days' + interval '5 hours', '11111111-1111-4111-8111-000000000003', 'published'),
  ('Healing Retreat: 3 Days',        'A structured retreat weekend for deep prayer ministry and restoration.',     'care',    -25.7311, 27.8650, 'Pecanwood, Hartbeespoort', now() + interval '20 days', now() + interval '22 days', '11111111-1111-4111-8111-000000000004', 'published'),
  ('Modular School: Week 1',         'First week of the modular school of healing & discipleship.',                'equip',   -25.7311, 27.8650, 'Pecanwood, Hartbeespoort', now() + interval '40 days', now() + interval '44 days', '11111111-1111-4111-8111-000000000004', 'published'),
  ('Day of Teaching: Forgiveness',   'A Saturday of teaching and ministry on biblical forgiveness.',               'equip',   -25.7311, 27.8650, 'Pecanwood, Hartbeespoort', now() + interval '12 days', now() + interval '12 days 8 hours', '11111111-1111-4111-8111-000000000004', 'published'),
  ('Quiet Day of Prayer',            'A reflective day set aside for personal prayer and journaling on campus.',   'church',  -25.7311, 27.8650, 'Pecanwood, Hartbeespoort', now() + interval '6 days',  now() + interval '6 days 7 hours',  '11111111-1111-4111-8111-000000000004', 'published'),
  ('Completed Retreat Feedback Day', 'Optional follow-up day for past retreat attendees.',                         'care',    -25.7311, 27.8650, 'Pecanwood, Hartbeespoort', now() - interval '21 days', now() - interval '21 days' + interval '8 hours', '11111111-1111-4111-8111-000000000004', 'published'),
  ('Open Day: New Student Intake', 'Meet the POPUP team, tour the centre and sign up for our life-skills programme.', 'education',            -25.7534, 28.1873, '237 Visagie Street, Pretoria Central', now() + interval '8 days',  now() + interval '8 days 5 hours',  '11111111-1111-4111-8111-000000000005', 'published'),
  ('Job Readiness Workshop',       'CV writing, interview skills, workplace etiquette - free of charge.',            'education',            -25.7534, 28.1873, '237 Visagie Street, Pretoria Central', now() + interval '15 days', now() + interval '15 days 6 hours', '11111111-1111-4111-8111-000000000005', 'published'),
  ('Sewing Skills Showcase',       'Students display their work at the end of the sewing module.',                   'community-upliftment', -25.7534, 28.1873, '237 Visagie Street, Pretoria Central', now() + interval '22 days', now() + interval '22 days 4 hours', '11111111-1111-4111-8111-000000000005', 'published'),
  ('Volunteer Info Evening',       'Learn how you can partner with POPUP as a volunteer or mentor.',                 'community-upliftment', -25.7534, 28.1873, '237 Visagie Street, Pretoria Central', now() + interval '30 days', now() + interval '30 days 2 hours', '11111111-1111-4111-8111-000000000005', 'published'),
  ('Graduation Celebration 2024',  'Celebrating our 2024 graduates and their next steps.',                           'social-fun',           -25.7534, 28.1873, '237 Visagie Street, Pretoria Central', now() - interval '45 days', now() - interval '45 days' + interval '4 hours', '11111111-1111-4111-8111-000000000005', 'published'),
  ('Work Readiness Programme Intake', 'Intake morning for the next cohort of the U-Turn work-readiness programme.',    'recovery',             -33.9290, 18.4197, '1 Roeland Street, Cape Town CBD', now() + interval '7 days',  now() + interval '7 days 3 hours',  '11111111-1111-4111-8111-000000000006', 'published'),
  ('Charity Shop: Pop-up Sale',       'Everything 50% off - proceeds fund our work-readiness programme.',              'social-fun',           -33.9823, 18.4650, 'Claremont, Cape Town',             now() + interval '13 days', now() + interval '13 days 8 hours', '11111111-1111-4111-8111-000000000006', 'published'),
  ('Volunteer Induction',             'New volunteer onboarding session at our Roeland Street cafe.',                   'community-upliftment', -33.9290, 18.4197, '1 Roeland Street, Cape Town CBD', now() + interval '19 days', now() + interval '19 days 2 hours', '11111111-1111-4111-8111-000000000006', 'published'),
  ('Kingsley Holgate Breakfast',      'Fundraiser breakfast with special guest speaker.',                               'community-upliftment', -33.9290, 18.4197, '1 Roeland Street, Cape Town CBD', now() + interval '26 days', now() + interval '26 days 3 hours', '11111111-1111-4111-8111-000000000006', 'published'),
  ('Street Outreach: CBD',            'Walking the CBD with care packs, prayer and invitation into our programme.',    'missional',            -33.9290, 18.4197, 'Cape Town CBD',                    now() - interval '10 days', now() - interval '10 days' + interval '4 hours', '11111111-1111-4111-8111-000000000006', 'published');

-- 5. Link category_id by slug.
update public.events e
   set category_id = c.id
  from public.categories c
 where c.slug = e.category
   and e.created_by = any(array[
     '11111111-1111-4111-8111-000000000001',
     '11111111-1111-4111-8111-000000000002',
     '11111111-1111-4111-8111-000000000003',
     '11111111-1111-4111-8111-000000000004',
     '11111111-1111-4111-8111-000000000005',
     '11111111-1111-4111-8111-000000000006'
   ]::uuid[]);

-- 6. Sanity check: warn if any seed event is missing category_id. The
--    UI uses events.category (text) for labels so missing category_id
--    does not break rendering, but any surface that joins/filters on
--    category_id will silently drop these rows.
do $$
declare
  missing int;
begin
  select count(*) into missing
    from public.events e
   where e.category_id is null
     and e.created_by = any(array[
       '11111111-1111-4111-8111-000000000001',
       '11111111-1111-4111-8111-000000000002',
       '11111111-1111-4111-8111-000000000003',
       '11111111-1111-4111-8111-000000000004',
       '11111111-1111-4111-8111-000000000005',
       '11111111-1111-4111-8111-000000000006'
     ]::uuid[]);
  if missing > 0 then
    raise notice 'Seed migration 061: % seed event(s) have null category_id - category slug not found in public.categories', missing;
  end if;
end $$;
