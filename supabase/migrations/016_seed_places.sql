-- 016: Seed 50 mock places across South Africa
-- 25 Gauteng (50%), 13 Eastern Cape (25%), 12 Western Cape (25%)

-- Use first available user as the creator
DO $$
DECLARE
  seed_user uuid;
  cat_church uuid;
  cat_youth uuid;
  cat_outreach uuid;
  cat_worship uuid;
  cat_bible uuid;
  cat_prayer uuid;
  cat_social uuid;
  cat_other uuid;
BEGIN
  SELECT id INTO seed_user FROM profiles LIMIT 1;
  IF seed_user IS NULL THEN
    RAISE EXCEPTION 'No profiles exist — cannot seed places without a created_by user';
  END IF;

  SELECT id INTO cat_church FROM categories WHERE slug = 'church-service';
  SELECT id INTO cat_youth FROM categories WHERE slug = 'youth';
  SELECT id INTO cat_outreach FROM categories WHERE slug = 'community-outreach';
  SELECT id INTO cat_worship FROM categories WHERE slug = 'worship';
  SELECT id INTO cat_bible FROM categories WHERE slug = 'bible-study';
  SELECT id INTO cat_prayer FROM categories WHERE slug = 'prayer';
  SELECT id INTO cat_social FROM categories WHERE slug = 'social';
  SELECT id INTO cat_other FROM categories WHERE slug = 'other';

  -- ═══════════════════════════════════════════════════════
  -- GAUTENG (25 places) — Pretoria, Johannesburg, Soweto
  -- ═══════════════════════════════════════════════════════

  INSERT INTO places (name, description, address, category_id, latitude, longitude, created_by, verified) VALUES
  ('City Life Church Pretoria', 'Contemporary worship community in the heart of Pretoria CBD.', '235 Pretorius St, Pretoria Central', cat_church, -25.7461, 28.1881, seed_user, true),
  ('Grace Family Church', 'Family-focused church with children and youth ministries.', '12 Park Rd, Lynnwood, Pretoria', cat_church, -25.7670, 28.2750, seed_user, true),
  ('Hatfield Christian Church', 'Large multi-campus church near the University of Pretoria.', '1100 Burnett St, Hatfield', cat_church, -25.7530, 28.2380, seed_user, true),
  ('Cornerstone Church Centurion', 'Growing community church in Centurion.', '45 Lenchen Ave, Centurion', cat_church, -25.8600, 28.1900, seed_user, true),

  ('Pretoria Youth Hub', 'Youth centre hosting weekly gatherings, mentoring, and skills workshops.', '88 Church St, Pretoria Central', cat_youth, -25.7480, 28.1870, seed_user, true),
  ('Soweto Youth Collective', 'Empowerment space for young people in Soweto.', '4071 Vilakazi St, Orlando West', cat_youth, -26.3380, 27.9000, seed_user, true),
  ('Generation Impact Midrand', 'Youth development centre between Joburg and Pretoria.', '15 Old Pretoria Rd, Midrand', cat_youth, -25.9960, 28.1270, seed_user, true),

  ('Hands of Hope Outreach', 'Community feeding scheme and clothing distribution in Mamelodi.', '231 Tsamaya Rd, Mamelodi West', cat_outreach, -25.7120, 28.3580, seed_user, true),
  ('Joburg Inner City Mission', 'Homeless outreach and rehabilitation support.', '42 Jeppe St, Johannesburg CBD', cat_outreach, -26.2044, 28.0456, seed_user, true),
  ('Tshwane Mercy Centre', 'Food parcels, counselling and job placement.', '90 Boom St, Pretoria West', cat_outreach, -25.7500, 28.1600, seed_user, true),

  ('Worship Tabernacle Bryanston', 'Intimate worship venue for monthly worship nights.', '22 Ballyclare Dr, Bryanston', cat_worship, -26.0580, 28.0150, seed_user, true),
  ('Sound of Heaven Studio', 'Worship recording studio and practice space.', '5 Republic Rd, Randburg', cat_worship, -26.0960, 28.0000, seed_user, true),
  ('Living Praise Centre', 'Weekly worship sessions open to all.', '78 Nelson Mandela Dr, Sandton', cat_worship, -26.1070, 28.0570, seed_user, true),

  ('Berean Study Hall', 'Dedicated Bible study space with a theological library.', '14 Festival St, Hatfield', cat_bible, -25.7550, 28.2400, seed_user, true),
  ('Scripture Café', 'Casual venue combining study groups and good coffee.', '3 Burnett St, Hatfield', cat_bible, -25.7520, 28.2360, seed_user, true),

  ('Upper Room Prayer House', '24/7 prayer room in the eastern suburbs of Pretoria.', '55 Atterbury Rd, Menlo Park', cat_prayer, -25.7700, 28.2700, seed_user, true),
  ('Joburg Prayer Tower', 'Corporate prayer gatherings every Saturday morning.', '10 Rissik St, Johannesburg', cat_prayer, -26.2030, 28.0450, seed_user, true),

  ('The Gathering Place Rosebank', 'Social hub for community dinners and events.', '19 Cradock Ave, Rosebank', cat_social, -26.1460, 28.0430, seed_user, true),
  ('Kingdom Coffee House', 'Christian café space for hangouts and small groups.', '7 Dey St, Centurion', cat_social, -25.8630, 28.1870, seed_user, true),
  ('Community Hall Soweto', 'Multi-purpose hall for social gatherings and celebrations.', '1812 Khumalo St, Orlando East', cat_social, -26.3350, 27.9100, seed_user, true),
  ('Unity Park Pavilion', 'Outdoor event space for community markets and braais.', 'Union Ave, Groenkloof', cat_social, -25.7780, 28.2050, seed_user, true),

  ('Christian Bookshop Menlyn', 'Books, Bibles, and ministry resources.', 'Menlyn Park Shopping Centre, Pretoria', cat_other, -25.7830, 28.2770, seed_user, true),
  ('Faith Radio Studio', 'Community radio station broadcasting faith content.', '60 Esselen St, Sunnyside', cat_other, -25.7590, 28.2050, seed_user, true),
  ('Rehoboth Retreat', 'Weekend retreat and conference venue.', 'R511, Hartbeespoort', cat_other, -25.7400, 27.8800, seed_user, true),
  ('Shepherd''s Kitchen', 'Christian-run restaurant and gathering place.', '34 Duncan St, Pretoria CBD', cat_other, -25.7470, 28.1920, seed_user, true);

  -- ═══════════════════════════════════════════════════════
  -- EASTERN CAPE (13 places) — PE, East London, Mthatha
  -- ═══════════════════════════════════════════════════════

  INSERT INTO places (name, description, address, category_id, latitude, longitude, created_by, verified) VALUES
  ('Harvest Church PE', 'Vibrant church community in Port Elizabeth.', '100 Main Rd, Walmer', cat_church, -33.9740, 25.6250, seed_user, true),
  ('Lighthouse Church East London', 'Multi-generational church on the Buffalo City coast.', '55 Oxford St, East London', cat_church, -33.0150, 27.9100, seed_user, true),
  ('Living Hope Mthatha', 'Growing faith community in the heart of Mthatha.', '12 Sutherland St, Mthatha', cat_church, -31.5890, 28.7840, seed_user, true),

  ('Bay Youth Centre', 'Youth programmes and after-school activities in PE.', '20 Heugh Rd, Summerstrand', cat_youth, -33.9800, 25.6600, seed_user, true),
  ('East London Youth Network', 'Mentoring and leadership development.', '8 Fleet St, East London', cat_youth, -33.0130, 27.9050, seed_user, true),

  ('Mandela Bay Community Kitchen', 'Daily meal service and community support.', '45 Njoli Rd, New Brighton', cat_outreach, -33.8900, 25.6400, seed_user, true),
  ('Buffalo City Outreach', 'Clothing and food distribution in informal settlements.', '33 King William''s Town Rd, Mdantsane', cat_outreach, -32.9500, 27.7800, seed_user, true),

  ('Worship House PE', 'Worship nights every Friday in central PE.', '12 Govan Mbeki Ave, Port Elizabeth', cat_worship, -33.9620, 25.6150, seed_user, true),
  ('Bible Institute of the Eastern Cape', 'Theological training and study groups.', '88 High St, Makhanda', cat_bible, -33.3100, 26.5300, seed_user, true),

  ('Prayer Garden Jeffreys Bay', 'Peaceful outdoor prayer space near the coast.', 'Da Gama Rd, Jeffreys Bay', cat_prayer, -33.9330, 25.0150, seed_user, true),

  ('Boardwalk Fellowship Café', 'Social gathering spot near the PE Boardwalk.', 'Marine Dr, Summerstrand', cat_social, -33.9850, 25.6700, seed_user, true),
  ('Mthatha Community Centre', 'Events, markets, and weekly socials.', '22 York Rd, Mthatha', cat_social, -31.5910, 28.7900, seed_user, true),
  ('Sunshine Coast Retreat', 'Weekend retreat and team-building venue.', 'N2, between PE and Jeffreys Bay', cat_other, -33.9500, 25.3000, seed_user, true);

  -- ═══════════════════════════════════════════════════════
  -- WESTERN CAPE (12 places) — Cape Town, Stellenbosch, Paarl
  -- ═══════════════════════════════════════════════════════

  INSERT INTO places (name, description, address, category_id, latitude, longitude, created_by, verified) VALUES
  ('Common Ground Church Cape Town', 'Multi-site church with a strong community focus.', '20 Roeland St, Gardens', cat_church, -33.9300, 18.4150, seed_user, true),
  ('Table Mountain Church', 'Church with stunning mountain backdrop.', '15 Rhodes Dr, Newlands', cat_church, -33.9600, 18.4600, seed_user, true),
  ('Vineyard Church Stellenbosch', 'Welcoming church in the student town of Stellenbosch.', '44 Dorp St, Stellenbosch', cat_church, -33.9360, 18.8600, seed_user, true),

  ('Cape Town Youth Hub', 'Central youth space hosting events and skills training.', '5 Buitensingel St, Cape Town CBD', cat_youth, -33.9250, 18.4200, seed_user, true),
  ('Paarl Youth Initiative', 'After-school programmes and mentoring.', '22 Main Rd, Paarl', cat_youth, -33.7310, 18.9700, seed_user, true),

  ('City Bowl Outreach', 'Serving the homeless community in central Cape Town.', '78 Long St, Cape Town', cat_outreach, -33.9240, 18.4180, seed_user, true),
  ('Khayelitsha Community Mission', 'Education and feeding programme in Khayelitsha.', 'Ntlazane Rd, Khayelitsha', cat_outreach, -34.0430, 18.6700, seed_user, true),

  ('Worship at the Winelands', 'Monthly worship evenings in a winery setting.', 'R44, Stellenbosch', cat_worship, -33.9400, 18.8700, seed_user, true),

  ('Word & Wonder Paarl', 'Bible study groups and theological discussion.', '15 Lady Grey St, Paarl', cat_bible, -33.7300, 18.9650, seed_user, true),

  ('Mountain Prayer Retreat', 'Silent retreat centre on the slopes of Table Mountain.', 'Tafelberg Rd, Cape Town', cat_prayer, -33.9550, 18.4050, seed_user, true),

  ('The Long Table', 'Community dinners and social events in the CBD.', '33 Wale St, Cape Town', cat_social, -33.9260, 18.4170, seed_user, true),
  ('Stellenbosch Community Market', 'Weekly farmers market and fellowship.', 'Coetzenburg Rd, Stellenbosch', cat_social, -33.9320, 18.8750, seed_user, true);

END $$;
