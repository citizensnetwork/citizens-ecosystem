-- 054_seed_orgs_and_events.sql
-- ───────────────────────────────────────────────────────────────────────────
-- Seeds 40 organisation places and ~160 events across Gauteng, Western Cape,
-- KwaZulu-Natal, and Eastern Cape so the platform can be visually verified
-- end-to-end (map markers, calendar, lifecycle states, category visuals).
--
-- Ownership: every place + event is `created_by` the seed admin
-- (citizensnetworkpbo@gmail.com → 4a1b3802-4e9d-40ef-bd8d-7ec8b4d242ca).
-- This avoids creating ghost auth.users while still showing 40 distinct
-- organisations on the map.
--
-- Lifecycle distribution across events:
--   • ~60% upcoming (1–60 days from now)
--   • ~20% past     (1–60 days ago)
--   • ~15% live     (started 0–2h ago, end_time still in the future)
--   • ~5%  cancelled (status='cancelled', date in next 30 days)
--
-- Idempotent guard: aborts if events table is non-empty (run 053 first).
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare
  ev_count int;
  pl_count int;
begin
  select count(*) into ev_count from public.events;
  select count(*) into pl_count from public.places;
  if ev_count > 0 or pl_count > 0 then
    raise exception
      'Refusing to seed: events=% places=%. Run 053 wipe first.',
      ev_count, pl_count;
  end if;
end $$;

-- Ensure events.category check constraint includes the full EventCategory union
-- (the original constraint was created before `care` was added in the type).
alter table public.events drop constraint if exists events_category_check;
alter table public.events add constraint events_category_check
  check (
    category is null or category = any (array[
      'entertainment','sport-fun','social-fun','community-upliftment',
      'education','church','missional','marriage-and-couples',
      'mens','womens','kids','recovery','equip','weekend',
      'members-only','care'
    ])
  );

-- Resolve seed admin uuid + category uuids into a temp table for readability.
create temporary table _seed_ctx on commit drop as
select
  (select id from public.profiles where email='citizensnetworkpbo@gmail.com') as admin_id,
  (select id from public.categories where slug='church')                as cat_church,
  (select id from public.categories where slug='community-upliftment')  as cat_uplift,
  (select id from public.categories where slug='missional')             as cat_missional,
  (select id from public.categories where slug='social-fun')            as cat_social,
  (select id from public.categories where slug='entertainment')         as cat_entertainment,
  (select id from public.categories where slug='sport-fun')             as cat_sport,
  (select id from public.categories where slug='education')             as cat_education,
  (select id from public.categories where slug='equip')                 as cat_equip,
  (select id from public.categories where slug='care')                  as cat_care,
  (select id from public.categories where slug='recovery')              as cat_recovery,
  (select id from public.categories where slug='marriage-and-couples')  as cat_couples,
  (select id from public.categories where slug='mens')                  as cat_mens,
  (select id from public.categories where slug='womens')                as cat_womens,
  (select id from public.categories where slug='kids')                  as cat_kids,
  (select id from public.categories where slug='weekend')               as cat_weekend,
  (select id from public.categories where slug='members-only')          as cat_members;

-- ═══════════════════════════════════════════════════════════════════════════
-- PLACES — 40 organisations
-- ═══════════════════════════════════════════════════════════════════════════
-- Each block: name, description, address, lat, lng, place_category, website.
-- We map church-organisation places to category_id=church.

insert into public.places (id, name, description, address, latitude, longitude, category_id, website, custom_category, verified, created_by, created_at)
select
  uuid_generate_v4(), p.name, p.description, p.address, p.lat, p.lng,
  case p.kind
    when 'church'   then ctx.cat_church
    when 'ministry' then ctx.cat_church
    when 'ngo'      then ctx.cat_uplift
    when 'business' then ctx.cat_social
    when 'school'   then ctx.cat_education
  end,
  p.website,
  case p.kind
    when 'ngo'      then 'NGO / Non-profit'
    when 'business' then 'Christian Business'
    when 'school'   then 'Christian School'
    else null
  end,
  true,
  ctx.admin_id,
  now()
from _seed_ctx ctx
cross join (values
  -- ── Pretoria (15) ───────────────────────────────────────────────────────
  ('Hatfield Community Church',     'Vibrant gathering for students and young professionals in the heart of Hatfield. Sunday services at 09:00 and 18:00.', '1186 Burnett Street, Hatfield, Pretoria',                  -25.7479, 28.2370, 'church',   'https://example.org/hatfield-cc'),
  ('Menlyn Hope Centre',            'Multi-cultural church family with strong outreach into Menlyn and Lynnwood. Weekly homecells across the east.',         '36 Garsfontein Road, Menlyn, Pretoria',                    -25.7868, 28.2776, 'church',   'https://example.org/menlyn-hope'),
  ('Sunnyside Light Fellowship',    'Heart for the inner-city — Mozambican, Zimbabwean and Congolese members welcome. Trilingual services.',               '88 Mears Street, Sunnyside, Pretoria',                     -25.7575, 28.2128, 'church',   'https://example.org/sunnyside-light'),
  ('Brooklyn Anchor Church',        'Family-focused church plant in the Brooklyn area, deeply involved in marriage discipleship and parenting groups.',     '212 Justice Mahomed Street, Brooklyn, Pretoria',           -25.7720, 28.2403, 'church',   'https://example.org/brooklyn-anchor'),
  ('Centurion Springs Church',      'Charismatic church serving Centurion and surrounds — Sunday family service plus mid-week kingdom seminars.',          '15 Lenchen Avenue North, Centurion',                       -25.8404, 28.1879, 'church',   'https://example.org/centurion-springs'),
  ('Pretoria North Bible Centre',   'Bible-teaching ministry with strong equip-school and weekly mens & womens breakfasts.',                                '423 Voortrekker Road, Gezina, Pretoria',                   -25.7173, 28.1979, 'church',   'https://example.org/pta-bible'),
  ('Mamelodi Reach Out',            'Community ministry running youth clubs, soup kitchens and after-school programmes in Mamelodi.',                       '1 Tsamaya Avenue, Mamelodi East, Pretoria',                -25.7237, 28.3922, 'ngo',      'https://example.org/mamelodi-reach'),
  ('Atteridgeville Restore Trust',  'Restoring lives through addiction recovery, skills training and family healing.',                                       '7146 Block A, Atteridgeville, Pretoria',                   -25.7717, 28.0596, 'ngo',      'https://example.org/atteridgeville-restore'),
  ('Pretoria Worship Collective',   'Worship-arts house bringing together creatives across denominations for monthly nights of worship.',                  '78 Park Street, Arcadia, Pretoria',                        -25.7445, 28.2124, 'ministry', 'https://example.org/pwc'),
  ('Faith Coffee Co.',              'Christian-owned coffee shop and meeting space hosting weekly bible-study breakfasts.',                                  '290 Beyers Naudé Drive, Rietfontein, Pretoria',            -25.7286, 28.2287, 'business', 'https://example.org/faith-coffee'),
  ('Cornerstone Christian School',  'Christ-centred K–12 school serving the Faerie Glen and Garsfontein corridor.',                                          '500 Atterbury Road, Faerie Glen, Pretoria',                -25.7886, 28.3076, 'school',   'https://example.org/cornerstone-cs'),
  ('Garsfontein Family Church',     'Family-friendly Sunday celebrations with strong kids and youth programmes.',                                            '587 Rooihuiskraal Road, Garsfontein, Pretoria',            -25.8075, 28.2758, 'church',   'https://example.org/garsfontein-fc'),
  ('Mamelodi Mens Build',           'Mens discipleship ministry running Saturday workshops and accountability groups.',                                       '15 Maphalla Street, Mamelodi West, Pretoria',              -25.7128, 28.3641, 'ministry', 'https://example.org/mamelodi-mens'),
  ('Hammanskraal Hope Mission',     'Rural mission base serving Hammanskraal and surrounding farming communities.',                                          '12 Carousel Way, Hammanskraal, Pretoria',                  -25.4030, 28.2861, 'ngo',      'https://example.org/hammanskraal-hope'),
  ('Equip Pretoria School',         'Practical equipping school for emerging leaders — six-week intensives quarterly.',                                       '142 Lynnwood Road, Hatfield, Pretoria',                    -25.7531, 28.2425, 'ministry', 'https://example.org/equip-pta'),

  -- ── Johannesburg (8) ────────────────────────────────────────────────────
  ('Sandton King''s Centre',        'Modern urban church plant in Sandton with executive mentorship circles and Friday-night worship.',                       '12 Maude Street, Sandton',                                 -26.1076, 28.0567, 'church',   'https://example.org/sandton-kings'),
  ('Soweto Restoration Church',     'Soweto-based church planting movement — Sunday celebrations + weekday cell groups.',                                     '1234 Vilakazi Street, Orlando West, Soweto',               -26.2389, 27.9041, 'church',   'https://example.org/soweto-restoration'),
  ('Rosebank Hope Community',       'Coffee-shop church gathering in Rosebank with deep focus on mid-life spiritual formation.',                              '50 Bath Avenue, Rosebank, Johannesburg',                   -26.1438, 28.0410, 'church',   'https://example.org/rosebank-hope'),
  ('Alexandra Kids Connect',        'After-school programme + weekend kids ministry serving Alexandra township.',                                              '2nd Avenue, Alexandra, Johannesburg',                      -26.1031, 28.1100, 'ngo',      'https://example.org/alex-kids'),
  ('Johannesburg Couples Network',  'Marriage-strengthening ministry running monthly couples date-nights and weekend retreats.',                              '256 Oxford Road, Illovo, Johannesburg',                    -26.1342, 28.0432, 'ministry', 'https://example.org/jhb-couples'),
  ('Randburg Sport & Faith',        'Christian sports league — football, netball, basketball — Saturday mornings.',                                            '15 Hill Street, Ferndale, Randburg',                       -26.0954, 27.9760, 'ngo',      'https://example.org/randburg-sport'),
  ('Soweto Recovery House',         'Substance-abuse recovery home with rolling Friday-night group sessions open to community.',                              '7890 Klipspruit Valley Road, Soweto',                      -26.2768, 27.8762, 'ngo',      'https://example.org/soweto-recovery'),
  ('Joburg Marketplace Ministry',   'Equipping Christians in business and marketplace leadership — monthly breakfasts in Sandton.',                           '32 Fredman Drive, Sandton',                                -26.1067, 28.0521, 'business', 'https://example.org/jhb-marketplace'),

  -- ── Cape Town (8) ───────────────────────────────────────────────────────
  ('Cape Town City Church',         'CBD-based church family with emphasis on prayer, intercession and city transformation.',                                 '5 Bree Street, Cape Town City Centre',                     -33.9189, 18.4196, 'church',   'https://example.org/ct-city-church'),
  ('Stellenbosch Vine Church',      'University church serving Stellenbosch students — weekly bible studies in Afrikaans and English.',                       '47 Andringa Street, Stellenbosch',                         -33.9354, 18.8602, 'church',   'https://example.org/stellies-vine'),
  ('Khayelitsha Restore Mission',   'Long-standing community ministry in Khayelitsha — feeding scheme, kids club, marriage seminars.',                         'Site C, Khayelitsha, Cape Town',                           -34.0428, 18.6817, 'ngo',      'https://example.org/khaya-restore'),
  ('Sea Point Beach Church',        'Outdoor Sunday gatherings on the Sea Point promenade — every weather, all welcome.',                                      'Sea Point Promenade, Cape Town',                           -33.9180, 18.3855, 'church',   'https://example.org/sea-point-bc'),
  ('Mitchells Plain Hope Centre',   'Recovery, womens ministry and trauma counselling for Mitchells Plain families.',                                          'AZ Berman Drive, Lentegeur, Mitchells Plain',              -34.0431, 18.6062, 'ngo',      'https://example.org/mp-hope'),
  ('Bellville Worship Church',      'Multi-language church in Bellville — Xhosa, Afrikaans, English, Shona services.',                                          'Voortrekker Road, Bellville, Cape Town',                   -33.8945, 18.6310, 'church',   'https://example.org/bellville-worship'),
  ('Cape Winelands Womens Circle',  'Womens ministry connecting wives, mothers and singles across the Winelands. Quarterly retreats.',                        '12 Ryneveld Street, Stellenbosch',                         -33.9342, 18.8576, 'ministry', 'https://example.org/cw-womens'),
  ('Bo-Kaap Equip School',          'Practical-skills equipping school based in Bo-Kaap. Open Tuesday and Thursday evenings.',                                 '71 Wale Street, Bo-Kaap, Cape Town',                       -33.9226, 18.4143, 'ministry', 'https://example.org/bo-kaap-equip'),

  -- ── Durban (5) ──────────────────────────────────────────────────────────
  ('Durban North Family Church',    'Family church on the North Coast with thriving kids, youth and couples ministries.',                                     '38 Adelaide Tambo Drive, Durban North',                    -29.7972, 31.0286, 'church',   'https://example.org/dn-family'),
  ('Umlazi Community Church',       'Township church serving Umlazi with weekend revival meetings and weekday cells.',                                         'D Section, Umlazi, Durban',                                -29.9712, 30.8825, 'church',   'https://example.org/umlazi-cc'),
  ('Berea Marriage Ministry',       'Marriage-focused church plant on the Berea — Friday-night couples sessions weekly.',                                      '22 Mathews Meyiwa Road, Berea, Durban',                    -29.8409, 31.0030, 'church',   'https://example.org/berea-marriage'),
  ('Pinetown Recovery House',       'Mens recovery home with public Tuesday-night testimony service.',                                                          '15 Old Main Road, Pinetown',                               -29.8202, 30.8552, 'ngo',      'https://example.org/pinetown-recovery'),
  ('uShaka Youth Collective',       'Surf-and-faith youth ministry meeting weekly on the Durban beachfront.',                                                  '1 Bell Street, Point Waterfront, Durban',                  -29.8688, 31.0436, 'ministry', 'https://example.org/ushaka-youth'),

  -- ── Gqeberha / Port Elizabeth (4) ───────────────────────────────────────
  ('Gqeberha Hope Church',          'Coastal church family in Summerstrand — strong student and young-couples groups.',                                        '9 Marine Drive, Summerstrand, Gqeberha',                   -33.9941, 25.6708, 'church',   'https://example.org/gqe-hope'),
  ('Walmer Township Mission',       'Community mission running daily kids feeding and weekend bible school in Walmer Township.',                               '15th Avenue, Walmer Township, Gqeberha',                   -33.9837, 25.5710, 'ngo',      'https://example.org/walmer-mission'),
  ('Newton Park Worship Centre',    'Worship-led church in Newton Park — Sunday celebrations + monthly equipping conferences.',                                'Cape Road, Newton Park, Gqeberha',                         -33.9596, 25.5754, 'church',   'https://example.org/np-worship'),
  ('Bay Christian Coffee',          'Christian-owned coffee roastery — Saturday-morning prayer breakfast open to all.',                                        '5 Bird Street, Central, Gqeberha',                         -33.9609, 25.6177, 'business', 'https://example.org/bay-coffee')
) as p(name, description, address, lat, lng, kind, website);

-- ═══════════════════════════════════════════════════════════════════════════
-- EVENTS — ~160 spread across the 40 places, with realistic lifecycle mix.
-- ═══════════════════════════════════════════════════════════════════════════
-- Strategy: cross join places with an event-template table; use deterministic
-- modulo arithmetic to assign category, lifecycle bucket, and time offset.
-- Each place gets ~4 events (40 × 4 = 160).

with event_slots as (
  select
    p.id           as place_id,
    p.name         as place_name,
    p.address      as place_addr,
    p.latitude     as place_lat,
    p.longitude    as place_lng,
    s.slot         as slot,
    -- Lifecycle assignment per slot:
    --   slot 0 → upcoming   (60%)
    --   slot 1 → upcoming   (60%)
    --   slot 2 → past       (20%)
    --   slot 3 → live (15%) for 75% of places, cancelled (5%) for 25%
    case
      when s.slot in (0,1) then 'upcoming'
      when s.slot = 2      then 'past'
      when s.slot = 3 and (abs(hashtext(p.name::text)) % 4) <> 0 then 'live'
      when s.slot = 3                                            then 'cancelled'
    end as lifecycle,
    -- Category: rotate through the 16 EventCategory slugs
    (array['church','community-upliftment','missional','social-fun',
           'entertainment','sport-fun','education','equip',
           'care','recovery','marriage-and-couples','mens',
           'womens','kids','weekend','members-only'])
      [1 + ((abs(hashtext(p.name::text)) + s.slot * 7) % 16)] as cat_slug
  from public.places p
  cross join generate_series(0,3) as s(slot)
)
insert into public.events (
  id, title, description, date, end_time, location,
  latitude, longitude, category, category_id, image_url,
  status, attendees_visible, created_by, created_at, max_attendees
)
select
  uuid_generate_v4(),
  -- Title
  case es.cat_slug
    when 'church'                then es.place_name || ' — Sunday Celebration'
    when 'community-upliftment'  then es.place_name || ' — Community Outreach'
    when 'missional'             then es.place_name || ' — Outreach Saturday'
    when 'social-fun'            then es.place_name || ' — Coffee & Connect'
    when 'entertainment'         then es.place_name || ' — Worship Night'
    when 'sport-fun'             then es.place_name || ' — Saturday Sport Day'
    when 'education'             then es.place_name || ' — Bible Teaching'
    when 'equip'                 then es.place_name || ' — Leaders Equip Session'
    when 'care'                  then es.place_name || ' — Counselling Drop-in'
    when 'recovery'              then es.place_name || ' — Recovery Group'
    when 'marriage-and-couples'  then es.place_name || ' — Couples Date-Night'
    when 'mens'                  then es.place_name || ' — Mens Breakfast'
    when 'womens'                then es.place_name || ' — Womens Tea'
    when 'kids'                  then es.place_name || ' — Kids Club'
    when 'weekend'               then es.place_name || ' — Weekend Retreat'
    when 'members-only'          then es.place_name || ' — Members Gathering'
  end,
  -- Description
  'A regular gathering hosted by ' || es.place_name ||
  '. All are welcome unless noted otherwise. Contact the organiser for details.',
  -- Date (timestamp with tz). Anchored on now ± offsets per lifecycle.
  case es.lifecycle
    when 'upcoming'  then now() + ((1 + (abs(hashtext(es.place_name::text || es.slot::text)) % 60)) || ' days')::interval
    when 'past'      then now() - ((1 + (abs(hashtext(es.place_name::text || es.slot::text)) % 60)) || ' days')::interval
    when 'live'      then now() - ((30 + (abs(hashtext(es.place_name::text || es.slot::text)) % 60)) || ' minutes')::interval
    when 'cancelled' then now() + ((1 + (abs(hashtext(es.place_name::text || es.slot::text)) % 30)) || ' days')::interval
  end,
  -- end_time = date + 2 hours (live events still have a future end_time)
  case es.lifecycle
    when 'upcoming'  then now() + ((1 + (abs(hashtext(es.place_name::text || es.slot::text)) % 60)) || ' days')::interval + interval '2 hours'
    when 'past'      then now() - ((1 + (abs(hashtext(es.place_name::text || es.slot::text)) % 60)) || ' days')::interval + interval '2 hours'
    when 'live'      then now() - ((30 + (abs(hashtext(es.place_name::text || es.slot::text)) % 60)) || ' minutes')::interval + interval '2 hours'
    when 'cancelled' then now() + ((1 + (abs(hashtext(es.place_name::text || es.slot::text)) % 30)) || ' days')::interval + interval '2 hours'
  end,
  es.place_addr,
  -- Add small ±0.003 degree jitter (~330 m) so co-located events don't fully overlap on the map.
  es.place_lat + (((abs(hashtext(es.place_name::text || es.slot::text || 'lat')) % 60) - 30) / 10000.0),
  es.place_lng + (((abs(hashtext(es.place_name::text || es.slot::text || 'lng')) % 60) - 30) / 10000.0),
  es.cat_slug,
  (select id from public.categories where slug = es.cat_slug),
  null,
  case es.lifecycle when 'cancelled' then 'cancelled' else 'published' end,
  'public',
  ctx.admin_id,
  now(),
  case when (abs(hashtext(es.place_name::text || es.slot::text)) % 3) = 0
       then 50 + (abs(hashtext(es.place_name::text || es.slot::text)) % 150)
       else null
  end
from event_slots es
cross join _seed_ctx ctx
where es.lifecycle is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- Sanity report
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  pl int; ev int; up int; pa int; lv int; cn int;
begin
  select count(*) into pl from public.places;
  select count(*) into ev from public.events;
  select count(*) into up from public.events where status='published' and date > now();
  select count(*) into pa from public.events where status='published' and end_time < now();
  select count(*) into lv from public.events where status='published' and date <= now() and end_time > now();
  select count(*) into cn from public.events where status='cancelled';
  raise notice 'SEED REPORT — places=% events=% upcoming=% past=% live=% cancelled=%',
    pl, ev, up, pa, lv, cn;
end $$;
