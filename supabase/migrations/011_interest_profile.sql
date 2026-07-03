-- ============================================
-- 011 — Interest Profile & Location-Aware Onboarding
-- Phase 9: interest groups, interests, user_interests, event_interest_tags
--          + profile onboarding/location columns
-- ============================================

-- ══════════════════════════════════════════════
-- 1. Interest Groups (5 groups)
-- ══════════════════════════════════════════════
create table if not exists public.interest_groups (
  id uuid default gen_random_uuid() primary key,
  slug text not null unique,
  label text not null,
  sort_order int not null default 0
);

alter table public.interest_groups enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Interest groups are viewable by everyone' and tablename = 'interest_groups') then
    create policy "Interest groups are viewable by everyone" on public.interest_groups for select using (true);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 2. Interests (~70 items across 5 groups)
-- ══════════════════════════════════════════════
create table if not exists public.interests (
  id uuid default gen_random_uuid() primary key,
  group_id uuid not null references public.interest_groups(id) on delete cascade,
  slug text not null unique,
  label text not null,
  emoji text not null default '📌',
  sort_order int not null default 0
);

alter table public.interests enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Interests are viewable by everyone' and tablename = 'interests') then
    create policy "Interests are viewable by everyone" on public.interests for select using (true);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 3. User Interests (composite PK)
-- ══════════════════════════════════════════════
create table if not exists public.user_interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, interest_id)
);

alter table public.user_interests enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'User interests are viewable by everyone' and tablename = 'user_interests') then
    create policy "User interests are viewable by everyone" on public.user_interests for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage own interests' and tablename = 'user_interests') then
    create policy "Users can manage own interests" on public.user_interests for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own interests' and tablename = 'user_interests') then
    create policy "Users can delete own interests" on public.user_interests for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 4. Event Interest Tags (composite PK)
-- ══════════════════════════════════════════════
create table if not exists public.event_interest_tags (
  event_id uuid not null references public.events(id) on delete cascade,
  interest_id uuid not null references public.interests(id) on delete cascade,
  primary key (event_id, interest_id)
);

alter table public.event_interest_tags enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event interest tags are viewable by everyone' and tablename = 'event_interest_tags') then
    create policy "Event interest tags are viewable by everyone" on public.event_interest_tags for select using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event creators can manage interest tags' and tablename = 'event_interest_tags') then
    create policy "Event creators can manage interest tags" on public.event_interest_tags for insert
      with check (
        exists (select 1 from public.events where id = event_id and (created_by = auth.uid() or public.is_admin()))
      );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Event creators can delete interest tags' and tablename = 'event_interest_tags') then
    create policy "Event creators can delete interest tags" on public.event_interest_tags for delete
      using (
        exists (select 1 from public.events where id = event_id and (created_by = auth.uid() or public.is_admin()))
      );
  end if;
end $$;

-- ══════════════════════════════════════════════
-- 5. Profile columns for onboarding + location
-- ══════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_completed') then
    alter table public.profiles add column onboarding_completed boolean not null default false;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'notification_email') then
    alter table public.profiles add column notification_email text;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'home_latitude') then
    alter table public.profiles add column home_latitude double precision;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'home_longitude') then
    alter table public.profiles add column home_longitude double precision;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'notification_radius_km') then
    alter table public.profiles add column notification_radius_km int not null default 50;
  end if;
end $$;

-- Indexes for efficient interest matching
create index if not exists user_interests_user_idx on public.user_interests(user_id);
create index if not exists user_interests_interest_idx on public.user_interests(interest_id);
create index if not exists event_interest_tags_event_idx on public.event_interest_tags(event_id);
create index if not exists event_interest_tags_interest_idx on public.event_interest_tags(interest_id);
create index if not exists interests_group_idx on public.interests(group_id);

-- ══════════════════════════════════════════════
-- 6. Seed Interest Groups
-- ══════════════════════════════════════════════
insert into public.interest_groups (slug, label, sort_order) values
  ('events-i-enjoy',    'Events I Enjoy',        1),
  ('spiritual-goals',   'Spiritual Goals',        2),
  ('industry',          'Industry / Profession',  3),
  ('hobbies',           'Hobbies & Passions',     4),
  ('life-stage',        'Stage of Life',          5)
on conflict (slug) do nothing;

-- ══════════════════════════════════════════════
-- 7. Seed Interests (~70 items)
-- ══════════════════════════════════════════════

-- Helper: insert interest referencing group by slug
-- Group 1: Events I Enjoy
insert into public.interests (group_id, slug, label, emoji, sort_order) values
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'music-concerts',        'Music Concerts',           '🎵', 1),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'worship-gatherings',    'Worship Gatherings',       '🙌', 2),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'community-service',     'Community Service',        '🤝', 3),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'youth-rallies',         'Youth Rallies',            '🔥', 4),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'sports-events',         'Sports Events',            '⚽', 5),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'art-exhibitions',       'Art Exhibitions',          '🎨', 6),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'prayer-meetings',       'Prayer Meetings',          '🙏', 7),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'leadership-conferences','Leadership Conferences',   '🎤', 8),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'obstacle-races',        'Obstacle Races',           '🏃', 9),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'cultural-events',       'Themed / Cultural Events', '🌍', 10),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'social-mixers',         'Social Mixers',            '🥂', 11),
  ((select id from public.interest_groups where slug = 'events-i-enjoy'), 'bible-studies',         'Bible Studies',            '📖', 12)
on conflict (slug) do nothing;

-- Group 2: Spiritual Goals
insert into public.interests (group_id, slug, label, emoji, sort_order) values
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'deeper-education',      'Deeper Education',              '📚', 1),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'building-connections',   'Building Connections',          '🔗', 2),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'strategic-networking',   'Strategic Networking for Impact','🌐', 3),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'inner-healing',          'Inner Healing',                 '💚', 4),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'personal-development',   'Personal Development',          '🌱', 5),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'mentoring-others',       'Mentoring Others',              '🧑‍🏫', 6),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'being-mentored',         'Being Mentored',                '🎓', 7),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'evangelism-outreach',    'Evangelism / Outreach',         '📢', 8),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'intercessory-prayer',    'Intercessory Prayer',           '✝️', 9),
  ((select id from public.interest_groups where slug = 'spiritual-goals'), 'worship-ministry',       'Worship Ministry',              '🎶', 10)
on conflict (slug) do nothing;

-- Group 3: Industry / Profession
insert into public.interests (group_id, slug, label, emoji, sort_order) values
  ((select id from public.interest_groups where slug = 'industry'), 'technology',     'Technology',     '💻', 1),
  ((select id from public.interest_groups where slug = 'industry'), 'healthcare',     'Healthcare',     '🏥', 2),
  ((select id from public.interest_groups where slug = 'industry'), 'education',      'Education',      '🎒', 3),
  ((select id from public.interest_groups where slug = 'industry'), 'finance',        'Finance',        '💰', 4),
  ((select id from public.interest_groups where slug = 'industry'), 'engineering',    'Engineering',    '⚙️', 5),
  ((select id from public.interest_groups where slug = 'industry'), 'arts-design',    'Arts & Design',  '🖌️', 6),
  ((select id from public.interest_groups where slug = 'industry'), 'fashion-beauty', 'Fashion & Beauty','👗', 7),
  ((select id from public.interest_groups where slug = 'industry'), 'agriculture',    'Agriculture',    '🌾', 8),
  ((select id from public.interest_groups where slug = 'industry'), 'legal',          'Legal',          '⚖️', 9),
  ((select id from public.interest_groups where slug = 'industry'), 'business',       'Business',       '📊', 10),
  ((select id from public.interest_groups where slug = 'industry'), 'media',          'Media',          '📺', 11),
  ((select id from public.interest_groups where slug = 'industry'), 'architecture',   'Architecture',   '🏛️', 12),
  ((select id from public.interest_groups where slug = 'industry'), 'government',     'Government',     '🏛️', 13),
  ((select id from public.interest_groups where slug = 'industry'), 'non-profit',     'Non-Profit',     '💛', 14)
on conflict (slug) do nothing;

-- Group 4: Hobbies & Passions
insert into public.interests (group_id, slug, label, emoji, sort_order) values
  ((select id from public.interest_groups where slug = 'hobbies'), 'reading',       'Reading',       '📚', 1),
  ((select id from public.interest_groups where slug = 'hobbies'), 'fitness',       'Fitness',       '💪', 2),
  ((select id from public.interest_groups where slug = 'hobbies'), 'cooking',       'Cooking',       '🍳', 3),
  ((select id from public.interest_groups where slug = 'hobbies'), 'travel',        'Travel',        '✈️', 4),
  ((select id from public.interest_groups where slug = 'hobbies'), 'photography',   'Photography',   '📸', 5),
  ((select id from public.interest_groups where slug = 'hobbies'), 'music-playing', 'Music (Playing)','🎸', 6),
  ((select id from public.interest_groups where slug = 'hobbies'), 'art-crafts',    'Art / Crafts',  '🎨', 7),
  ((select id from public.interest_groups where slug = 'hobbies'), 'gardening',     'Gardening',     '🌻', 8),
  ((select id from public.interest_groups where slug = 'hobbies'), 'gaming',        'Gaming',        '🎮', 9),
  ((select id from public.interest_groups where slug = 'hobbies'), 'volunteering',  'Volunteering',  '🙋', 10),
  ((select id from public.interest_groups where slug = 'hobbies'), 'writing',       'Writing',       '✏️', 11),
  ((select id from public.interest_groups where slug = 'hobbies'), 'dance',         'Dance',         '💃', 12)
on conflict (slug) do nothing;

-- Group 5: Stage of Life
insert into public.interests (group_id, slug, label, emoji, sort_order) values
  ((select id from public.interest_groups where slug = 'life-stage'), 'student',            'Student',            '🎓', 1),
  ((select id from public.interest_groups where slug = 'life-stage'), 'young-professional', 'Young Professional', '👔', 2),
  ((select id from public.interest_groups where slug = 'life-stage'), 'new-parent',         'New Parent',         '👶', 3),
  ((select id from public.interest_groups where slug = 'life-stage'), 'married',            'Married',            '💍', 4),
  ((select id from public.interest_groups where slug = 'life-stage'), 'single',             'Single',             '🌟', 5),
  ((select id from public.interest_groups where slug = 'life-stage'), 'new-in-town',        'New in Town',        '📍', 6),
  ((select id from public.interest_groups where slug = 'life-stage'), 'retired',            'Retired',            '🌴', 7)
on conflict (slug) do nothing;
