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

  // ── Social platforms an Event / Place / Contributor can publish ──────
  //  ONE table. The apply + onboarding + portal + create-listing inputs, the
  //  public profile chips, the map preview and the Kingdom Discovery card all
  //  key off it, so a platform's icon, its ordering and its link logic only
  //  ever live in one place. Adding a platform here (plus its column in
  //  migration 172's naming scheme) is the whole change.
  //
  //  Every platform accepts EITHER a bare handle OR a full URL — the founder
  //  hit this the hard way: a handle typed into a URL-shaped box used to fail
  //  server validation and take the entire profile save down with it.
  const stripHandle = (v) => (v || '').trim().replace(/^@+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const isAbsolute = (v) => /^https?:\/\//i.test((v || '').trim());
  // Strip any leading "host/" (with or without www.) the user pasted in, so
  // "instagram.com/damcool" and "damcool" both resolve to the same link.
  const stripHost = (v, host) => stripHandle(v).replace(
    new RegExp('^(www\\.)?' + host.replace(/\./g, '\\.') + '\\/?', 'i'), '');
  const onHost = (host, prefix) => (v) => {
    const t = (v || '').trim();
    if (!t) return '';
    if (isAbsolute(t)) return t;
    const handle = stripHost(t, host);
    return handle ? 'https://' + host + '/' + (prefix || '') + handle : '';
  };
  const SOCIAL_PLATFORMS = [
    { key: 'instagram', label: 'Instagram', icon: 'BrandInstagram', prefix: '@', placeholder: '@yourhandle', urlFor: onHost('instagram.com') },
    { key: 'facebook', label: 'Facebook', icon: 'BrandFacebook', prefix: '/', placeholder: 'facebook.com/yourpage', urlFor: onHost('facebook.com') },
    { key: 'youtube', label: 'YouTube', icon: 'BrandYouTube', prefix: '@', placeholder: '@yourchannel', urlFor: (v) => {
      const t = (v || '').trim();
      if (!t) return '';
      if (isAbsolute(t)) return t;
      // YouTube's modern vanity URLs are /@handle; legacy ones are /c/… or
      // /channel/… . Keep an explicit path, prefix a bare handle with @.
      const h = stripHost(t, 'youtube.com');
      if (!h) return '';
      return 'https://youtube.com/' + (/^(c|channel|user)\//i.test(h) ? h : '@' + h);
    } },
    { key: 'tiktok', label: 'TikTok', icon: 'BrandTikTok', prefix: '@', placeholder: '@yourhandle', urlFor: onHost('tiktok.com', '@') },
    { key: 'x', label: 'X', icon: 'BrandX', prefix: '@', placeholder: '@yourhandle', urlFor: onHost('x.com') },
    { key: 'linkedin', label: 'LinkedIn', icon: 'BrandLinkedIn', prefix: '/', placeholder: 'linkedin.com/company/you', urlFor: (v) => {
      const t = (v || '').trim();
      if (!t) return '';
      if (isAbsolute(t)) return t;
      const h = stripHost(t, 'linkedin.com');
      if (!h) return '';
      // A bare word is almost always an organisation on LinkedIn; anything
      // already carrying a path segment (company/…, in/…, school/…) is kept.
      return 'https://www.linkedin.com/' + (h.indexOf('/') > -1 ? h : 'company/' + h);
    } },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'BrandWhatsApp', prefix: '+', placeholder: '+27 82 000 0000', urlFor: (v) => {
      const t = (v || '').trim();
      if (!t) return '';
      if (isAbsolute(t)) return t;
      // A phone number (the usual case) → wa.me. Anything else is treated as
      // a wa.me / chat.whatsapp.com path the contributor pasted without the
      // scheme, so it still becomes a real link instead of dead text.
      const digits = t.replace(/[^\d]/g, '');
      if (/^[+\d][\d\s().-]*$/.test(t) && digits.length >= 7) return 'https://wa.me/' + digits;
      const h = stripHandle(t);
      return h ? 'https://' + h.replace(/^(https?:\/\/)?/i, '') : '';
    } },
  ];
  // Any future/unrecognised social key still gets a safe, clickable link —
  // just with a generic icon instead of a mis-guessed brand one.
  const genericUrl = (v) => { const t = (v || '').trim(); return t && !isAbsolute(t) ? 'https://' + t : t; };
  const getSocialPlatform = (key) => SOCIAL_PLATFORMS.find((s) => s.key === key) || { key, label: key, icon: 'Link', urlFor: genericUrl };
  // What the chip SHOWS. A pasted URL is unreadable at chip size, so it is
  // reduced to the identifying part of the link — never to something that
  // isn't in the stored value.
  const socialDisplay = (key, v) => {
    const t = (v || '').trim();
    if (!t) return '';
    if (key === 'whatsapp') return t.replace(/^https?:\/\/(www\.)?wa\.me\//i, '+').replace(/^https?:\/\//i, '');
    const bare = t.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
    const path = bare.indexOf('/') > -1 ? bare.slice(bare.indexOf('/') + 1) : bare;
    if (!path) return bare;
    return /^@/.test(t) || /^@/.test(path) ? '@' + path.replace(/^@/, '') : path;
  };
  // Row → { platformKey: value } in SOCIAL_PLATFORMS order, skipping blanks.
  // `columns` maps a platform key to that table's column name (they differ:
  // events/places use <platform>_url, profiles uses handle/url per platform —
  // see migration 172's naming note).
  const socialsFromRow = (row, columns) => {
    const out = {};
    if (!row) return out;
    SOCIAL_PLATFORMS.forEach((p) => {
      const col = columns[p.key];
      const v = col && row[col];
      if (typeof v === 'string' && v.trim()) out[p.key] = v.trim();
    });
    return out;
  };
  // The column name each table uses for each platform.
  const SOCIAL_COLUMNS = {
    event: { instagram: 'instagram_url', facebook: 'facebook_url', youtube: 'youtube_url', tiktok: 'tiktok_url', x: 'x_url', linkedin: 'linkedin_url', whatsapp: 'whatsapp_url' },
    place: { instagram: 'instagram_url', facebook: 'facebook_url', youtube: 'youtube_url', tiktok: 'tiktok_url', x: 'x_url', linkedin: 'linkedin_url', whatsapp: 'whatsapp_url' },
    contributor: { instagram: 'instagram_handle', facebook: 'facebook_url', youtube: 'youtube_url', tiktok: 'tiktok_handle', x: 'x_handle', linkedin: 'linkedin_url', whatsapp: 'whatsapp_number' },
  };
  // socials object → the columns to write for one entity type. Empty string
  // (not undefined) for a cleared field so a removed handle really clears.
  const socialsToRow = (socials, kind) => {
    const cols = SOCIAL_COLUMNS[kind] || {};
    const out = {};
    SOCIAL_PLATFORMS.forEach((p) => {
      const col = cols[p.key];
      if (!col) return;
      const v = socials && socials[p.key];
      out[col] = (typeof v === 'string' && v.trim()) ? v.trim() : null;
    });
    return out;
  };

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
    SOCIAL_PLATFORMS,
    SOCIAL_COLUMNS,
    getSocialPlatform,
    socialDisplay,
    socialsFromRow,
    socialsToRow,
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
