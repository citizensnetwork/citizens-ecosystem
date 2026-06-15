// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — static reference data (window.DATA)
//  Entity arrays (events, places, contributors etc.) are populated
//  from live Supabase data in store.jsx. This file only carries
//  the category/tier constants that are safe to ship as code.
// ════════════════════════════════════════════════════════════════════
(function () {
  // ── Event categories (17) ──
  const EVENT_CATEGORIES = [
    { id: 'worship-prayer',      name: 'Worship & Prayer',      short: 'Worship',     hex: '#B8860B', icon: 'HeartHandshake' },
    { id: 'church-services',     name: 'Church Services',       short: 'Church',      hex: '#D4AF37', icon: 'Building2' },
    { id: 'outreach-missions',   name: 'Outreach & Missions',   short: 'Outreach',    hex: '#1ABC9C', icon: 'Globe' },
    { id: 'markets-expos',       name: 'Markets & Expos',       short: 'Markets',     hex: '#F39C12', icon: 'Store' },
    { id: 'sport-recreation',    name: 'Sport & Recreation',    short: 'Sport',       hex: '#2ECC71', icon: 'CircleDot' },
    { id: 'arts-culture',        name: 'Arts & Culture',        short: 'Arts',        hex: '#FF6B35', icon: 'Palette' },
    { id: 'social-gatherings',   name: 'Social Gatherings',     short: 'Social',      hex: '#E91E63', icon: 'Wine' },
    { id: 'community-upliftment',name: 'Community Upliftment',  short: 'Upliftment',  hex: '#9B59B6', icon: 'HeartHandshake' },
    { id: 'education-equipping', name: 'Education & Equipping', short: 'Education',   hex: '#3498DB', icon: 'GraduationCap' },
    { id: 'marriage-family',     name: 'Marriage & Family',     short: 'Family',      hex: '#E74C3C', icon: 'Users' },
    { id: 'mens-community',      name: "Men's Community",       short: "Men's",       hex: '#34495E', icon: 'User' },
    { id: 'womens-community',    name: "Women's Community",     short: "Women's",     hex: '#C71585', icon: 'UserRound' },
    { id: 'youth-students',      name: 'Youth & Students',      short: 'Youth',       hex: '#FF8C42', icon: 'Flame' },
    { id: 'kids',                name: 'Kids',                  short: 'Kids',        hex: '#00BCD4', icon: 'Candy' },
    { id: 'care-recovery',       name: 'Care & Recovery',       short: 'Care',        hex: '#8E44AD', icon: 'HandHeart' },
    { id: 'members-only',        name: 'Members Only',          short: 'Members',     hex: '#212121', icon: 'KeyRound' },
    { id: 'conferences-summits', name: 'Conferences & Summits', short: 'Conferences', hex: '#5D6D7E', icon: 'Mic' },
  ];

  // ── Place categories (10) ──
  const PLACE_CATEGORIES = [
    { id: 'churches-ministries', name: 'Churches & Ministries', short: 'Churches',   hex: '#D4AF37', icon: 'Building2' },
    { id: 'hospitality-cafes',   name: 'Hospitality & Cafés',   short: 'Cafés',      hex: '#8B4513', icon: 'Coffee' },
    { id: 'recreation-sport',    name: 'Recreation & Sport',    short: 'Recreation', hex: '#2ECC71', icon: 'Dumbbell' },
    { id: 'media-broadcasting',  name: 'Media & Broadcasting',  short: 'Media',      hex: '#9B59B6', icon: 'Radio' },
    { id: 'retail-shopping',     name: 'Retail & Shopping',     short: 'Retail',     hex: '#E91E63', icon: 'ShoppingBag' },
    { id: 'health-wellness',     name: 'Health & Wellness',     short: 'Health',     hex: '#E74C3C', icon: 'Stethoscope' },
    { id: 'education-training',  name: 'Education & Training',  short: 'Training',   hex: '#3498DB', icon: 'BookOpen' },
    { id: 'arts-creative',       name: 'Arts & Creative',       short: 'Creative',   hex: '#FF6B35', icon: 'Palette' },
    { id: 'christian-businesses',name: 'Christian Businesses',  short: 'Business',   hex: '#A67C00', icon: 'Store' },
    { id: 'safe-spaces',         name: 'Safe Spaces',           short: 'Safe',       hex: '#B59CD9', icon: 'Heart' },
  ];

  const getEventCategory = (id) => EVENT_CATEGORIES.find((c) => c.id === id);
  const getPlaceCategory = (id) => PLACE_CATEGORIES.find((c) => c.id === id);
  const getCategory = (id) => getEventCategory(id) || getPlaceCategory(id);

  // ── Contributor involvement tiers ──
  const TIERS = [
    { id: 'seed',     name: 'Seed',     min: 0,  desc: 'Newly approved contributor' },
    { id: 'shepherd', name: 'Shepherd', min: 5,  desc: 'Growing presence in the community' },
    { id: 'pillar',   name: 'Pillar',   min: 15, desc: 'A cornerstone of the community' },
    { id: 'beacon',   name: 'Beacon',   min: 40, desc: 'Shining light across the Kingdom' },
  ];

  window.DATA = {
    EVENT_CATEGORIES,
    PLACE_CATEGORIES,
    TIERS,
    getEventCategory,
    getPlaceCategory,
    getCategory,
    // Live entity arrays — populated from Supabase in store.jsx
    contributors: [],
    events: [],
    places: [],
    citizens: [],
    conversations: [],
    impactIdeas: [],
    notifications: [],
    applications: [],
    volunteerApplications: [],
    reports: [],
  };
})();
