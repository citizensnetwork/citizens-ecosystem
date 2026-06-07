// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — data layer  (window.DATA)
// ════════════════════════════════════════════════════════════════════
(function () {
  // ── Event categories (17) — colours from the Citizens Connect repo ──
  const EVENT_CATEGORIES = [
    { id: 'worship-prayer',      name: 'Worship & Prayer',      short: 'Worship',     hex: '#B8860B', icon: 'HeartHandshake' },
    { id: 'church-services',     name: 'Church Services',       short: 'Church',      hex: '#D4AF37', icon: 'Building2' },
    { id: 'outreach-missions',   name: 'Outreach & Missions',   short: 'Outreach',    hex: '#1ABC9C', icon: 'Globe' },
    { id: 'markets-expos',       name: 'Markets & Expos',       short: 'Markets',     hex: '#F39C12', icon: 'Store' },
    { id: 'sport-recreation',    name: 'Sport & Recreation',    short: 'Sport',       hex: '#2ECC71', icon: 'CircleDot' },
    { id: 'arts-culture',        name: 'Arts & Culture',        short: 'Arts',        hex: '#FF6B35', icon: 'Palette' },
    { id: 'social-gatherings',   name: 'Social Gatherings',     short: 'Social',      hex: '#E91E63', icon: 'Wine' },
    { id: 'community-upliftment',name: 'Community Upliftment',  short: 'Upliftment',  hex: '#9B59B6', icon: 'HeartHandshake' },
    { id: 'education-equipping', name: 'Education & Equipping',  short: 'Education',   hex: '#3498DB', icon: 'GraduationCap' },
    { id: 'marriage-family',     name: 'Marriage & Family',     short: 'Family',      hex: '#E74C3C', icon: 'Users' },
    { id: 'mens-community',      name: "Men's Community",        short: "Men's",       hex: '#34495E', icon: 'User' },
    { id: 'womens-community',    name: "Women's Community",      short: "Women's",     hex: '#C71585', icon: 'UserRound' },
    { id: 'youth-students',      name: 'Youth & Students',      short: 'Youth',       hex: '#FF8C42', icon: 'Flame' },
    { id: 'kids',                name: 'Kids',                  short: 'Kids',        hex: '#00BCD4', icon: 'Candy' },
    { id: 'care-recovery',       name: 'Care & Recovery',       short: 'Care',        hex: '#8E44AD', icon: 'HandHeart' },
    { id: 'members-only',        name: 'Members Only',          short: 'Members',     hex: '#212121', icon: 'KeyRound' },
    { id: 'conferences-summits', name: 'Conferences & Summits', short: 'Conferences', hex: '#5D6D7E', icon: 'Mic' },
  ];

  const PLACE_CATEGORIES = [
    { id: 'churches-ministries', name: 'Churches & Ministries', short: 'Churches',   hex: '#D4AF37', icon: 'Building2' },
    { id: 'hospitality-cafes',   name: 'Hospitality & Cafés',   short: 'Cafés',      hex: '#8B4513', icon: 'Coffee' },
    { id: 'recreation-sport',    name: 'Recreation & Sport',    short: 'Recreation', hex: '#2ECC71', icon: 'Dumbbell' },
    { id: 'media-broadcasting',  name: 'Media & Broadcasting',  short: 'Media',      hex: '#9B59B6', icon: 'Radio' },
    { id: 'retail-shopping',     name: 'Retail & Shopping',     short: 'Retail',     hex: '#E91E63', icon: 'ShoppingBag' },
    { id: 'health-wellness',     name: 'Health & Wellness',     short: 'Health',     hex: '#E74C3C', icon: 'Stethoscope' },
    { id: 'education-training',  name: 'Education & Training',  short: 'Training',   hex: '#3498DB', icon: 'BookOpen' },
    { id: 'arts-creative',       name: 'Arts & Creative',       short: 'Creative',   hex: '#FF6B35', icon: 'Palette' },
    { id: 'christian-businesses',name: 'Christian Businesses', short: 'Business',   hex: '#A67C00', icon: 'Store' },
    { id: 'safe-spaces',         name: 'Safe Spaces',           short: 'Safe',       hex: '#B59CD9', icon: 'Heart' },
  ];

  const getEventCategory = (id) => EVENT_CATEGORIES.find((c) => c.id === id);
  const getPlaceCategory = (id) => PLACE_CATEGORIES.find((c) => c.id === id);
  const getCategory = (id) => getEventCategory(id) || getPlaceCategory(id);

  // ── Involvement tiers (ascending) ──
  const TIERS = [
    { id: 'shepherd', name: 'Shepherd', min: 0,  desc: 'Newly approved contributor' },
    { id: 'beacon',   name: 'Beacon',   min: 5,  desc: 'Active, consistent presence' },
    { id: 'pillar',   name: 'Pillar',   min: 15, desc: 'A cornerstone of the community' },
  ];

  // ── Contributors (organisations) ──
  const contributors = [
    {
      id: 'c1', name: 'Grace City Church',
      bio: 'A vibrant community of believers committed to authentic worship, discipleship, and transforming our city through the love of Jesus.',
      profilePhoto: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=200&h=200&fit=crop',
      coverPhoto: 'https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=900&h=400&fit=crop',
      category: 'worship-prayer', website: 'gracecity.church', contactEmail: 'hello@gracecity.church',
      location: 'Jubilee Quarter', members: ['Grace City Worship Team', 'Youth Ministry', 'Care Team', 'Outreach Crew'],
      followerCount: 2841, dominantNiche: 'Worship & Discipleship', involvementLevel: 'Pillar', collaborators: ['c2', 'c3'],
      socials: { instagram: 'gracecity', youtube: 'gracecitychurch', facebook: 'gracecity' },
    },
    {
      id: 'c2', name: 'Kingdom Harvest Ministries',
      bio: 'Equipping believers for works of service in every sphere of society — marketplace, arts, education, and beyond.',
      profilePhoto: 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?w=200&h=200&fit=crop',
      coverPhoto: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=900&h=400&fit=crop',
      category: 'outreach-missions', website: 'kingdomharvest.org', contactEmail: 'connect@kingdomharvest.org',
      location: 'New Jerusalem District', members: ['Apostle James Mwangi', 'Prophet Abena Asante', 'Pastor Ruth Kimani'],
      followerCount: 1560, dominantNiche: 'Missions & Marketplace', involvementLevel: 'Beacon', collaborators: ['c1', 'c4'],
      socials: { instagram: 'kingdomharvest', youtube: 'kingdomharvest' },
    },
    {
      id: 'c3', name: 'Arise Youth Movement',
      bio: 'A generation rising in faith, creativity, and purpose. We host dynamic events for 16–30s that ignite passion for God.',
      profilePhoto: 'https://images.unsplash.com/photo-1540479859555-17af45c78602?w=200&h=200&fit=crop',
      coverPhoto: 'https://images.unsplash.com/photo-1501699169021-3759ee435d66?w=900&h=400&fit=crop',
      category: 'youth-students', website: 'ariseyouth.co', contactEmail: 'hype@ariseyouth.co',
      location: 'Creative Quarter', members: ['Daniel Osei', 'Priya Krishnan', 'Micah Abara'],
      followerCount: 3204, dominantNiche: 'Youth & Creative Arts', involvementLevel: 'Beacon', collaborators: ['c1'],
      socials: { instagram: 'ariseyouth', tiktok: 'ariseyouth' },
    },
    {
      id: 'c4', name: 'Lighthouse Community Centre',
      bio: 'Where faith meets action. Our centre serves as a hub for community development, social care, and creative expression.',
      profilePhoto: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=200&h=200&fit=crop',
      coverPhoto: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&h=400&fit=crop',
      category: 'community-upliftment', website: 'lighthousecc.org', contactEmail: 'info@lighthousecc.org',
      location: 'Southside', members: ['Director Amara Diallo', 'Youth Lead Blessing Eze', 'Care Coordinator Joel Park'],
      followerCount: 982, dominantNiche: 'Community Development', involvementLevel: 'Shepherd', collaborators: ['c2'],
      socials: { instagram: 'lighthousecc' },
    },
  ];

  // ── Events (mapX/mapY are % positions on the stylized map) ──
  const events = [
    {
      id: 'e1', title: 'Sunday Glory Service', category: 'worship-prayer',
      description: 'An encounter with the living God through anointed worship, powerful preaching, and community. Come as you are, leave transformed.',
      date: '2026-06-08', time: '10:00 AM', endTime: '12:30 PM',
      location: 'Grace City Church Main Auditorium', address: '14 Elim Way, Jubilee Quarter',
      organizerName: 'Grace City Church', organizerId: 'c1', isLive: true, isBusy: true,
      connectCount: 312, considerCount: 89, volunteeringEnabled: true,
      coverPhoto: 'https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=800&h=500&fit=crop',
      gallery: ['https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=400&h=300&fit=crop', 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?w=400&h=300&fit=crop'],
      broadcast: { message: '🔥 We are LIVE! Join us right now — the Spirit is moving!', minsAgo: 30 },
      website: 'gracecity.church/sunday', mapX: 42, mapY: 40,
      upcomingDates: ['2026-06-15', '2026-06-22', '2026-06-29'], tags: ['worship', 'sunday', 'family-friendly'],
    },
    {
      id: 'e2', title: 'Night of Prayer & Intercession', category: 'worship-prayer',
      description: 'A sacred night set apart for corporate prayer, warfare intercession, and seeking the face of God for our city, nation, and the nations of the earth.',
      date: '2026-06-06', time: '9:00 PM', endTime: '12:00 AM',
      location: 'Kingdom Harvest Ministries', address: '7 Covenant Street, New Jerusalem District',
      organizerName: 'Kingdom Harvest Ministries', organizerId: 'c2', isLive: false, isBusy: false,
      connectCount: 147, considerCount: 63, volunteeringEnabled: false,
      coverPhoto: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=800&h=500&fit=crop',
      gallery: [], broadcast: null, website: 'kingdomharvest.org/prayer', mapX: 63, mapY: 56,
      upcomingDates: ['2026-06-13', '2026-06-20'], tags: ['prayer', 'intercession', '18+'],
    },
    {
      id: 'e3', title: 'Arise Youth Night', category: 'youth-students',
      description: 'The most electric gathering of young believers in the city. Expect high-energy worship, a Word that hits different, creative arts, and real community.',
      date: '2026-06-07', time: '6:30 PM', endTime: '10:00 PM',
      location: 'The Refinery Arts Space', address: '22 Creative Quarter Blvd',
      organizerName: 'Arise Youth Movement', organizerId: 'c3', isLive: false, isBusy: true,
      connectCount: 428, considerCount: 201, volunteeringEnabled: true,
      coverPhoto: 'https://images.unsplash.com/photo-1501699169021-3759ee435d66?w=800&h=500&fit=crop',
      gallery: ['https://images.unsplash.com/photo-1540479859555-17af45c78602?w=400&h=300&fit=crop'],
      broadcast: { message: '🎵 Tonight is going to be history. See you at 6:30!', minsAgo: 120 },
      website: 'ariseyouth.co/friday', mapX: 28, mapY: 62,
      upcomingDates: ['2026-06-14', '2026-06-28'], tags: ['youth', 'creative', '16-30'],
    },
    {
      id: 'e4', title: 'Feed the City — Community Kitchen', category: 'outreach-missions',
      description: 'Every Saturday our volunteers prepare and serve hundreds of hot meals to families and individuals in need. Come with your hands ready to serve.',
      date: '2026-06-07', time: '8:00 AM', endTime: '2:00 PM',
      location: 'Lighthouse Community Centre', address: '3 Mercy Lane, Southside',
      organizerName: 'Lighthouse Community Centre', organizerId: 'c4', isLive: true, isBusy: false,
      connectCount: 96, considerCount: 44, volunteeringEnabled: true,
      coverPhoto: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&h=500&fit=crop',
      gallery: [], broadcast: { message: '🍲 Kitchen is open! We need 10 more hands — come serve!', minsAgo: 60 },
      website: 'lighthousecc.org/kitchen', mapX: 71, mapY: 31,
      upcomingDates: ['2026-06-14', '2026-06-21'], tags: ['outreach', 'service', 'all-ages'],
    },
    {
      id: 'e5', title: 'Kingdom Creative Arts Workshop', category: 'arts-culture',
      description: 'Unlock your God-given creativity. A full-day workshop covering visual arts, music production, spoken word, and how faith integrates with every creative calling.',
      date: '2026-06-14', time: '10:00 AM', endTime: '6:00 PM',
      location: 'Grace City Church — Studio Wing', address: '14 Elim Way, Jubilee Quarter',
      organizerName: 'Grace City Church', organizerId: 'c1', isLive: false, isBusy: false,
      connectCount: 74, considerCount: 112, volunteeringEnabled: false,
      coverPhoto: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&h=500&fit=crop',
      gallery: [], broadcast: null, website: 'gracecity.church/arts', mapX: 50, mapY: 47,
      upcomingDates: [], tags: ['arts', 'workshop', 'creative'],
    },
    {
      id: 'e6', title: "Men's Covenant Breakfast", category: 'mens-community',
      description: 'Iron sharpens iron. A monthly gathering of men who are serious about walking in covenant, accountability, and Kingdom purpose.',
      date: '2026-06-10', time: '7:00 AM', endTime: '9:30 AM',
      location: 'The Covenant Hall', address: '5 Elders Row, Central District',
      organizerName: 'Kingdom Harvest Ministries', organizerId: 'c2', isLive: false, isBusy: false,
      connectCount: 58, considerCount: 27, volunteeringEnabled: false,
      coverPhoto: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&h=500&fit=crop',
      gallery: [], broadcast: null, website: 'kingdomharvest.org/men', mapX: 56, mapY: 23,
      upcomingDates: ['2026-07-08'], tags: ['men', 'fellowship', 'breakfast'],
    },
    {
      id: 'e7', title: 'City Prayer Walk', category: 'outreach-missions',
      description: 'A 4km prayer walk through the heart of the city — gathering at the plaza and finishing at the riverside, interceding for every street we pass.',
      date: '2026-06-12', time: '6:00 AM', endTime: '8:00 AM',
      location: 'Central Plaza → Riverside', address: 'Starts: Central Plaza',
      organizerName: 'Kingdom Harvest Ministries', organizerId: 'c2', isLive: false, isBusy: false,
      connectCount: 134, considerCount: 58, volunteeringEnabled: true,
      coverPhoto: 'https://images.unsplash.com/photo-1476611338391-6f395a0ebc7b?w=800&h=500&fit=crop',
      gallery: [], broadcast: null, website: 'kingdomharvest.org/walk',
      isMobile: true, route: [{ x: 33, y: 28 }, { x: 40, y: 35 }, { x: 47, y: 33 }, { x: 54, y: 42 }, { x: 60, y: 48 }],
      mapX: 33, mapY: 28, upcomingDates: ['2026-07-12'], tags: ['prayer', 'walk', 'mobile'],
    },
  ];

  // ── Places ──
  const places = [
    {
      id: 'p1', name: 'Grace City Church', category: 'churches-ministries',
      description: 'A place where heaven touches earth. Our main auditorium holds 1,200 and we have multiple studio spaces, a café, children\'s wing, and prayer rooms.',
      address: '14 Elim Way, Jubilee Quarter', organizerName: 'Grace City Church', organizerId: 'c1',
      coverPhoto: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=800&h=500&fit=crop',
      gallery: ['https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=400&h=300&fit=crop'],
      openHours: 'Mon–Sat: 9AM–9PM, Sun: 7AM–2PM', website: 'gracecity.church', volunteeringEnabled: true,
      followerCount: 2841, mapX: 44, mapY: 41, associatedEventIds: ['e1', 'e5'],
    },
    {
      id: 'p2', name: 'Lighthouse Community Centre', category: 'churches-ministries',
      description: 'A multi-purpose community space open to all. Featuring a main hall, commercial kitchen, counselling rooms, and a creative studio available for hire.',
      address: '3 Mercy Lane, Southside', organizerName: 'Lighthouse Community Centre', organizerId: 'c4',
      coverPhoto: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800&h=500&fit=crop',
      gallery: [], openHours: 'Mon–Fri: 7AM–10PM, Sat: 8AM–8PM', website: 'lighthousecc.org', volunteeringEnabled: true,
      followerCount: 982, mapX: 73, mapY: 33, associatedEventIds: ['e4'],
    },
    {
      id: 'p3', name: 'The Refinery Arts Space', category: 'arts-creative',
      description: 'A consecrated creative space for artists, musicians, and storytellers who carry the Kingdom. Available for rehearsals, recording, and creative gatherings.',
      address: '22 Creative Quarter Blvd', organizerName: 'Arise Youth Movement', organizerId: 'c3',
      coverPhoto: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=500&fit=crop',
      gallery: [], openHours: 'Tue–Sun: 11AM–11PM', website: 'ariseyouth.co/refinery', volunteeringEnabled: false,
      followerCount: 647, mapX: 30, mapY: 64, associatedEventIds: ['e3'],
    },
  ];

  // ── Citizens (users) ──
  const citizens = [
    {
      id: 'u1', name: 'Lydia Mensah',
      bio: 'Worshipper, intercessor, and community builder. Passionate about seeing the Kingdom manifest in every neighbourhood.',
      profilePhoto: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=200&fit=crop',
      coverPhoto: 'https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=800&h=400&fit=crop',
      isPublic: true, connectedEvents: ['e1', 'e4'], considerList: ['e3', 'e6'],
      friends: ['u2', 'u3'], followedContributors: ['c1', 'c3'], weeklyContribution: null,
    },
    {
      id: 'u2', name: 'Emmanuel Asiedu',
      bio: 'Kingdom entrepreneur and youth leader. Covenant brother, builder, and all-round goer.',
      profilePhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      coverPhoto: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=800&h=400&fit=crop',
      isPublic: true, connectedEvents: ['e3', 'e6'], considerList: ['e1'], friends: ['u1'],
      followedContributors: ['c2', 'c3'],
      weeklyContribution: { id: 'we1', title: 'Parklands Community Prayer Walk', category: 'worship-prayer', date: '2026-06-11', status: 'approved' },
    },
    {
      id: 'u3', name: 'Naomi Ferreira',
      bio: 'Creative soul, intercessor, and lover of people. Serving through arts and hospitality.',
      profilePhoto: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&h=200&fit=crop',
      coverPhoto: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&h=400&fit=crop',
      isPublic: false, connectedEvents: ['e3', 'e4'], considerList: ['e2'], friends: ['u1'],
      followedContributors: ['c1', 'c4'], weeklyContribution: null,
    },
  ];

  // ── Conversations (messaging) ──
  const conversations = [
    {
      id: 'conv1', isOrg: true, participantName: 'Grace City Church',
      participantPhoto: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=200&h=200&fit=crop',
      lastMessage: "Thank you for your heart to serve! We'd love to have you on the team.", lastTime: '2:31 PM', unread: 1,
      messages: [
        { id: 'm1', from: 'me', text: "Hi! I saw the volunteer opportunity for Sunday service. I'd love to help with ushering.", time: '1:15 PM', date: 'Today' },
        { id: 'm2', from: 'them', text: "Praise God! We're so glad you reached out, Lydia. Our ushering team meets at 8:45 AM.", time: '1:42 PM', date: 'Today' },
        { id: 'm3', from: 'me', text: 'That works perfectly! Do I need to bring anything?', time: '2:10 PM', date: 'Today' },
        { id: 'm4', from: 'them', text: "Thank you for your heart to serve! We'd love to have you on the team.", time: '2:31 PM', date: 'Today' },
      ],
    },
    {
      id: 'conv2', isOrg: false, participantName: 'Emmanuel Asiedu',
      participantPhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      lastMessage: "You need to come to Arise Youth Night, it's going to be 🔥", lastTime: 'Yesterday', unread: 0,
      messages: [
        { id: 'm1', from: 'them', text: 'Sis! Are you going to Sunday Glory this week?', time: '6:00 PM', date: 'Yesterday' },
        { id: 'm2', from: 'me', text: "Of course! I'm already connected 😊 What about you?", time: '6:15 PM', date: 'Yesterday' },
        { id: 'm3', from: 'them', text: "You need to come to Arise Youth Night, it's going to be 🔥", time: '6:20 PM', date: 'Yesterday' },
      ],
    },
    {
      id: 'conv3', isOrg: true, participantName: 'Arise Youth Movement',
      participantPhoto: 'https://images.unsplash.com/photo-1540479859555-17af45c78602?w=200&h=200&fit=crop',
      lastMessage: "We're looking for spoken word artists for next Friday!", lastTime: 'Mon', unread: 2,
      messages: [
        { id: 'm1', from: 'them', text: "Hey Lydia! We saw you're considering the Youth Night 👀", time: '10:00 AM', date: 'Monday' },
        { id: 'm2', from: 'them', text: "We're looking for spoken word artists for next Friday!", time: '10:02 AM', date: 'Monday' },
      ],
    },
  ];

  // ── Impact / Kingdom Project ideas ──
  const impactIdeas = [
    {
      id: 'idea1', title: 'Rooftop Garden for Homeless Shelter', category: 'outreach-missions',
      description: 'Transform the unused rooftop of the Mercy House shelter into a community garden providing fresh produce and therapeutic green space.',
      authorName: 'Lydia Mensah', authorPhoto: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=80&h=80&fit=crop',
      votes: 847, threshold: 1000, status: 'voting', collaborators: 2, createdAt: '2026-05-15', mapX: 36, mapY: 71,
    },
    {
      id: 'idea2', title: 'Kingdom Skills Training Centre', category: 'education-equipping',
      description: 'A free vocational and digital skills programme for unemployed youth — web development, trades, design, and entrepreneurship from a Kingdom perspective.',
      authorName: 'Emmanuel Asiedu', authorPhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop',
      votes: 1243, threshold: 1000, status: 'confirmed', collaborators: 1, createdAt: '2026-04-20', mapX: 58, mapY: 49,
    },
    {
      id: 'idea3', title: 'Monthly Street Worship Night', category: 'worship-prayer',
      description: 'Bring the sanctuary to the streets — a monthly outdoor worship gathering in the central plaza that creates a moment of encounter for everyone passing by.',
      authorName: 'Naomi Ferreira', authorPhoto: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=80&h=80&fit=crop',
      votes: 512, threshold: 1000, status: 'inProcess', collaborators: 0, createdAt: '2026-05-28', mapX: 48, mapY: 53,
    },
  ];

  // ── Notifications ──
  const notifications = [
    { id: 'n1', type: 'broadcast', title: 'Grace City Church sent a broadcast', body: '🔥 We are LIVE! Join us right now — the Spirit is moving!', time: '30 min ago', read: false, photo: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=80&h=80&fit=crop' },
    { id: 'n2', type: 'friend', title: 'Emmanuel Asiedu wants to connect', body: 'Emmanuel sent you a friend request.', time: '2 hours ago', read: false, photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop' },
    { id: 'n3', type: 'convince', title: 'Naomi is convinced about Arise Youth Night', body: 'Naomi thinks you should go to Arise Youth Night too 👀', time: '4 hours ago', read: true, photo: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=80&h=80&fit=crop' },
    { id: 'n4', type: 'broadcast', title: 'Lighthouse Community Centre broadcast', body: '🍲 Kitchen is open! We need 10 more hands — come serve!', time: '1 hour ago', read: true, photo: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=80&h=80&fit=crop' },
    { id: 'n5', type: 'message', title: 'New message from Grace City Church', body: "Thank you for your heart to serve! We'd love to have you on the team.", time: '2 hours ago', read: true, photo: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=80&h=80&fit=crop' },
    { id: 'n6', type: 'idea', title: 'Impact Idea reached 800 votes!', body: '"Rooftop Garden for Homeless Shelter" is 200 votes from becoming a Kingdom Project!', time: '3 hours ago', read: true, photo: null },
  ];

  // ── Contributor applications (admin review queue) ──
  const applications = [
    {
      id: 'app1', name: 'New Wine Fellowship', photo: 'https://images.unsplash.com/photo-1473177104440-ffee2f376098?w=200&h=200&fit=crop',
      bio: 'A house-church network gathering across the eastside, pursuing intimacy with God and authentic community around the table.',
      category: 'church-services', weeklyEvents: 3, status: 'pending', submittedAt: '2026-06-04',
      reason: "We've outgrown word-of-mouth and want our gatherings visible to seekers across the city. We'd love to broadcast and host volunteer sign-ups.",
      location: 'Eastside', website: 'newwine.fellowship', socials: { instagram: '@newwinefellowship' },
    },
    {
      id: 'app2', name: 'Restore Counselling Hub', photo: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=200&h=200&fit=crop',
      bio: 'Faith-based counselling and recovery support — grief, addiction, marriage, and trauma — offered free to our community.',
      category: 'care-recovery', weeklyEvents: 2, status: 'pending', submittedAt: '2026-06-05',
      reason: 'People in crisis need to find us quickly. A map presence and a direct-message line could be life-changing for someone in a dark place.',
      location: 'Central District', website: 'restorehub.org', socials: { instagram: '@restorehub' },
    },
    {
      id: 'app3', name: 'Salt & Light Marketplace', photo: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=200&h=200&fit=crop',
      bio: 'A monthly market championing Christian-owned small businesses, artisans, and social enterprises.',
      category: 'markets-expos', weeklyEvents: 1, status: 'pending', submittedAt: '2026-06-05',
      reason: 'We want shoppers to discover our vendors on the map and follow for the next market date.',
      location: 'Harbour Quarter', website: 'saltandlight.market', socials: { instagram: '@saltlightmarket' },
    },
    {
      id: 'app4', name: 'Cornerstone Sports League', photo: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=200&h=200&fit=crop',
      bio: 'Community sports — football, netball, and athletics — using the field to disciple young people.',
      category: 'sport-recreation', weeklyEvents: 4, status: 'approved', submittedAt: '2026-05-28', reviewedAt: '2026-05-30',
      reason: 'Reaching unchurched youth through sport. We need to advertise fixtures and recruit coaches as volunteers.',
      reviewNote: 'Strong community track record. Welcome aboard!', location: 'Northgate', website: 'cornerstone.league', socials: { instagram: '@cornerstonesports' },
    },
    {
      id: 'app5', name: 'Anonymous Promotions Co.', photo: 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=200&h=200&fit=crop',
      bio: 'Event promotions company looking to list paid nightlife events.',
      category: 'social-gatherings', weeklyEvents: 6, status: 'rejected', submittedAt: '2026-05-25', reviewedAt: '2026-05-26',
      reason: 'We run a lot of events and want maximum exposure on your platform.',
      reviewNote: 'Outside our community guidelines — not a faith-aligned ministry or community initiative.', location: 'Unknown', website: 'promo.co', socials: {},
    },
  ];

  // ── Volunteer applications (contributor review queue, per event) ──
  const volunteerApplications = [
    // e1 · Sunday Glory Service (Grace City Church · c1)
    { id: 'v1', eventId: 'e1', name: 'Thabo Nkosi', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop', role: 'Ushering & Welcome', message: "I'd love to help welcome people in — I've served on the ushering team for 3 years.", skills: ['Hospitality', 'People'], status: 'pending', appliedAt: '2026-06-05' },
    { id: 'v2', eventId: 'e1', name: 'Grace Abara', photo: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=120&h=120&fit=crop', role: 'Kids Ministry', message: 'I have a real heart for children and a clean background check. Happy to serve in the kids wing.', skills: ['Kids', 'First Aid'], status: 'pending', appliedAt: '2026-06-05' },
    { id: 'v3', eventId: 'e1', name: 'Daniel Osei', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop', role: 'Media & Sound', message: 'I run sound and live-stream for my campus fellowship every week.', skills: ['Audio', 'Streaming'], status: 'pending', appliedAt: '2026-06-04' },
    { id: 'v4', eventId: 'e1', name: 'Priya Krishnan', photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop', role: 'Worship Team', message: 'Vocalist (alto) — would love to join the team for the service.', skills: ['Vocals'], status: 'approved', appliedAt: '2026-06-03', reviewedAt: '2026-06-04' },
    { id: 'v5', eventId: 'e1', name: 'Samuel Boateng', photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=120&h=120&fit=crop', role: 'Hospitality', message: 'Happy to help with tea/coffee, setup and pack-down.', skills: ['Catering', 'Setup'], status: 'pending', appliedAt: '2026-06-06' },
    // e5 · Kingdom Creative Arts Workshop (Grace City · c1) — volunteering off, but a couple keen helpers
    { id: 'v6', eventId: 'e5', name: 'Naomi Ferreira', photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop', role: 'Studio Assistant', message: 'Creative soul — can help facilitators run the visual-arts station.', skills: ['Arts', 'Facilitation'], status: 'pending', appliedAt: '2026-06-06' },
    // e4 · Feed the City (Lighthouse · c4)
    { id: 'v7', eventId: 'e4', name: 'Joel Park', photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&h=120&fit=crop', role: 'Kitchen Prep', message: 'Done commercial kitchen work — can prep from early.', skills: ['Catering'], status: 'pending', appliedAt: '2026-06-05' },
    { id: 'v8', eventId: 'e4', name: 'Blessing Eze', photo: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=120&h=120&fit=crop', role: 'Serving', message: 'Love serving the community — count me in for the serving line.', skills: ['People'], status: 'approved', appliedAt: '2026-06-04', reviewedAt: '2026-06-05' },
    // e3 · Arise Youth Night (Arise · c3)
    { id: 'v9', eventId: 'e3', name: 'Micah Abara', photo: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=120&h=120&fit=crop', role: 'Stage & Setup', message: 'Strong, reliable, and good with rigging and setup.', skills: ['Setup', 'Tech'], status: 'pending', appliedAt: '2026-06-05' },
    // e7 · City Prayer Walk (Kingdom Harvest · c2)
    { id: 'v10', eventId: 'e7', name: 'Ruth Kimani', photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop', role: 'Route Marshal', message: 'Happy to marshal a section and keep walkers safe.', skills: ['Safety', 'People'], status: 'pending', appliedAt: '2026-06-04' },
  ];

  // ── Content reports (admin moderation queue) ──
  const reports = [
    { id: 'rep1', targetType: 'event', targetName: 'Late-Night Glow Party', reason: 'Not faith-aligned', detail: 'Listing is a commercial nightlife event with no ministry or community connection — appears to game the platform for reach.', reporter: 'Lydia Mensah', reporterPhoto: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=80&h=80&fit=crop', date: '2026-06-05', status: 'open', severity: 'medium' },
    { id: 'rep2', targetType: 'user', targetName: 'kingdom_deals_92', reason: 'Spam / scam', detail: 'Account is mass-messaging citizens advertising a “Kingdom investment” crypto scheme. Multiple complaints.', reporter: 'Emmanuel Asiedu', reporterPhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop', date: '2026-06-05', status: 'open', severity: 'high' },
    { id: 'rep3', targetType: 'place', targetName: 'Restoration Wellness Rooms', reason: 'Misleading info', detail: 'Place claims affiliation with three named churches that say they have no connection to it.', reporter: 'Naomi Ferreira', reporterPhoto: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=80&h=80&fit=crop', date: '2026-06-04', status: 'open', severity: 'low' },
    { id: 'rep4', targetType: 'message', targetName: 'DMs to a youth member', reason: 'Harassment', detail: 'Repeated unwanted contact after the recipient asked the sender to stop.', reporter: 'Arise Youth Movement', reporterPhoto: 'https://images.unsplash.com/photo-1540479859555-17af45c78602?w=80&h=80&fit=crop', date: '2026-06-03', status: 'resolved', severity: 'high', resolution: 'Sender removed and account suspended.' },
    { id: 'rep5', targetType: 'event', targetName: 'Salt & Light Marketplace', reason: 'Duplicate listing', detail: 'The same market was posted three times within an hour.', reporter: 'Citizen report', reporterPhoto: null, date: '2026-06-02', status: 'resolved', severity: 'low', resolution: 'Duplicates merged into one listing.' },
    { id: 'rep6', targetType: 'broadcast', targetName: 'Broadcast from “Promo Co.”', reason: 'Spam', detail: 'Used the broadcast bubble for unrelated paid advertising.', reporter: 'Citizen report', reporterPhoto: null, date: '2026-06-01', status: 'dismissed', severity: 'low', resolution: 'Reviewed — within guidelines, no action.' },
  ];

  window.DATA = {
    EVENT_CATEGORIES, PLACE_CATEGORIES, TIERS,
    getEventCategory, getPlaceCategory, getCategory,
    contributors, events, places, citizens, conversations, impactIdeas, notifications, applications,
    volunteerApplications, reports,
  };
})();
