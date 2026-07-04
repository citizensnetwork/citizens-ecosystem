-- 017: Place follows table + website URLs for seeded places

-- Place follows: users can follow places
CREATE TABLE IF NOT EXISTS place_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, place_id)
);

ALTER TABLE place_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_follows_select" ON place_follows
  FOR SELECT USING (true);
CREATE POLICY "place_follows_insert" ON place_follows
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "place_follows_delete" ON place_follows
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_place_follows_user ON place_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_place_follows_place ON place_follows(place_id);

-- Add website URLs to all 50 seeded places
UPDATE places SET website = 'https://citylifechurch.co.za' WHERE name = 'City Life Church Pretoria' AND website IS NULL;
UPDATE places SET website = 'https://gracefamily.co.za' WHERE name = 'Grace Family Church' AND website IS NULL;
UPDATE places SET website = 'https://hatfieldchristian.co.za' WHERE name = 'Hatfield Christian Church' AND website IS NULL;
UPDATE places SET website = 'https://cornerstonechurch.co.za' WHERE name = 'Cornerstone Church Centurion' AND website IS NULL;
UPDATE places SET website = 'https://pretoriayouthhub.org.za' WHERE name = 'Pretoria Youth Hub' AND website IS NULL;
UPDATE places SET website = 'https://sowetoyouthcollective.org' WHERE name = 'Soweto Youth Collective' AND website IS NULL;
UPDATE places SET website = 'https://generationimpact.co.za' WHERE name = 'Generation Impact Midrand' AND website IS NULL;
UPDATE places SET website = 'https://handsofhope.org.za' WHERE name = 'Hands of Hope Outreach' AND website IS NULL;
UPDATE places SET website = 'https://joburgmission.org.za' WHERE name = 'Joburg Inner City Mission' AND website IS NULL;
UPDATE places SET website = 'https://tshwanemercy.org.za' WHERE name = 'Tshwane Mercy Centre' AND website IS NULL;
UPDATE places SET website = 'https://worshiptabernacle.co.za' WHERE name = 'Worship Tabernacle Bryanston' AND website IS NULL;
UPDATE places SET website = 'https://soundofheaven.co.za' WHERE name = 'Sound of Heaven Studio' AND website IS NULL;
UPDATE places SET website = 'https://livingword.co.za' WHERE name = 'Living Word Fellowship Sandton' AND website IS NULL;
UPDATE places SET website = 'https://wordoflightministries.co.za' WHERE name = 'Word of Light Bible College' AND website IS NULL;
UPDATE places SET website = 'https://pretoriaprayerhouse.org' WHERE name = 'Pretoria Prayer House' AND website IS NULL;
UPDATE places SET website = 'https://watchmenjhb.co.za' WHERE name = 'Watchmen Intercessors JHB' AND website IS NULL;
UPDATE places SET website = 'https://youthefc.co.za' WHERE name = 'Youth Encounter Fourways' AND website IS NULL;
UPDATE places SET website = 'https://midrandhub.co.za' WHERE name = 'The Hub Midrand' AND website IS NULL;
UPDATE places SET website = 'https://sowetocafe.co.za' WHERE name = 'Ubuntu Café Soweto' AND website IS NULL;
UPDATE places SET website = 'https://roodepoortcc.co.za' WHERE name = 'Roodepoort Community Centre' AND website IS NULL;
UPDATE places SET website = 'https://commoncoffeeco.co.za' WHERE name = 'Common Ground Coffee Centurion' AND website IS NULL;
UPDATE places SET website = 'https://goldcitymarket.co.za' WHERE name = 'Gold City Market' AND website IS NULL;
UPDATE places SET website = 'https://gospelrecordspta.co.za' WHERE name = 'Gospel Records Pretoria' AND website IS NULL;
UPDATE places SET website = 'https://mamelodiskillshub.org.za' WHERE name = 'Mamelodi Skills Hub' AND website IS NULL;
UPDATE places SET website = 'https://gaautengfaithcamp.co.za' WHERE name = 'Gauteng Faith Camp' AND website IS NULL;
UPDATE places SET website = 'https://baycommunitychurch.co.za' WHERE name = 'Bay Community Church' AND website IS NULL;
UPDATE places SET website = 'https://gqeberhaoutreach.org.za' WHERE name = 'Gqeberha Outreach Centre' AND website IS NULL;
UPDATE places SET website = 'https://windycityworship.co.za' WHERE name = 'Windy City Worship' AND website IS NULL;
UPDATE places SET website = 'https://borderyouthcamp.co.za' WHERE name = 'Border Youth Camp' AND website IS NULL;
UPDATE places SET website = 'https://eastlondonbiblestudy.co.za' WHERE name = 'East London Bible House' AND website IS NULL;
UPDATE places SET website = 'https://ecapeneedlearts.co.za' WHERE name = 'ECape Prayer Warriors' AND website IS NULL;
UPDATE places SET website = 'https://rhodescommunitycafe.co.za' WHERE name = 'Rhodes Community Café' AND website IS NULL;
UPDATE places SET website = 'https://sundayriversurfers.co.za' WHERE name = 'Sunday River Surf Church' AND website IS NULL;
UPDATE places SET website = 'https://umthatamission.org.za' WHERE name = 'Mthatha Mission Station' AND website IS NULL;
UPDATE places SET website = 'https://wildcoastretreats.co.za' WHERE name = 'Wild Coast Retreat Centre' AND website IS NULL;
UPDATE places SET website = 'https://makhandabooksandmore.co.za' WHERE name = 'Makhanda Books & More' AND website IS NULL;
UPDATE places SET website = 'https://jbaysurfers4christ.co.za' WHERE name = 'JBay Surfers for Christ' AND website IS NULL;
UPDATE places SET website = 'https://gqeberhayouthzone.co.za' WHERE name = 'Gqeberha Youth Zone' AND website IS NULL;
UPDATE places SET website = 'https://commonground.co.za' WHERE name = 'Common Ground Church' AND website IS NULL;
UPDATE places SET website = 'https://capeflatshope.org.za' WHERE name = 'Cape Flats Hope Centre' AND website IS NULL;
UPDATE places SET website = 'https://tablemountainworship.co.za' WHERE name = 'Table Mountain Worship Night' AND website IS NULL;
UPDATE places SET website = 'https://stellenboschbiblestudy.co.za' WHERE name = 'Stellenbosch Bible Study Circle' AND website IS NULL;
UPDATE places SET website = 'https://paarlprayergarden.co.za' WHERE name = 'Paarl Prayer Garden' AND website IS NULL;
UPDATE places SET website = 'https://woodstockcafe.co.za' WHERE name = 'Woodstock Social Café' AND website IS NULL;
UPDATE places SET website = 'https://khayelitshacommunitychurch.co.za' WHERE name = 'Khayelitsha Community Church' AND website IS NULL;
UPDATE places SET website = 'https://bellvilleyouth.co.za' WHERE name = 'Bellville Youth Arena' AND website IS NULL;
UPDATE places SET website = 'https://capevineyardworship.co.za' WHERE name = 'Cape Vineyard Worship' AND website IS NULL;
UPDATE places SET website = 'https://somersetwestoutreach.co.za' WHERE name = 'Somerset West Outreach' AND website IS NULL;
UPDATE places SET website = 'https://capetownfaithmarkets.co.za' WHERE name = 'Cape Town Faith Market' AND website IS NULL;
UPDATE places SET website = 'https://constantiawinelands.co.za' WHERE name = 'Constantia Winelands Church' AND website IS NULL;
