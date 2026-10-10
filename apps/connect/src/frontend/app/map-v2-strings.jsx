// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 strings (tracker P1-10). EVERY piece of new
//  user-visible text in Map v2 lives here, in South African English
//  ("colour", "organisation"), sentence case, plain words, 12 words or fewer
//  per label. One file so a translation later (tracker D7, English only for
//  now) is a copy of this object, and so a test can assert that no component
//  carries a string of its own (src/__tests__/frontend/mapV2Strings.test.ts).
// ════════════════════════════════════════════════════════════════════
(function () {
  window.MapV2Strings = {
    pin: {
      listing: 'Listing',
      live: 'live now',
      type: { event: 'Event', place: 'Place', contributor: 'Contributor', idea: 'Impact idea' },
      kind: { ministry: 'Ministry', organization: 'Organisation', business: 'Business', individual: 'Individual' },
      dismissUpdate: 'Dismiss update',
    },

    sheet: {
      dialogLabel: (name) => name + ', details',
      close: 'Close details',
      expand: 'Show more details',
      collapse: 'Show less',
      snapMessage: { peek: 'Showing a summary', half: 'Showing details', full: 'Showing everything' },
      directions: 'Directions',
      share: 'Share',
      website: 'Website',
      call: 'Call',
      email: 'Email',
      viewFull: 'View Full Profile',
      retry: 'Try again',
      tabsLabel: 'More about this listing',
      tabs: { events: 'Events', news: 'News', gallery: 'Gallery' },
      empty: {
        title: (name) => name + ' has not shared events, news or photos yet.',
        hint: 'Everything they have shared is on their full profile.',
      },
      gallery: {
        loading: 'Loading photos',
        error: 'We could not load the photos.',
        photoOf: (i, n) => 'Photo ' + i + ' of ' + n,
        showAll: (n) => 'Show all ' + n + ' photos',
        viewerLabel: (i, n) => 'Photo ' + i + ' of ' + n,
        closePhoto: 'Close photo',
        prevPhoto: 'Previous photo',
        nextPhoto: 'Next photo',
      },
    },

    // Open state, "Starts in 2 h", "Posted 3 h ago": MapV2Time builds these from the templates below.
    time: {
      open24: 'Open 24 hours',
      closesAt: (t) => 'Open · closes ' + t,
      opensAt: (t) => 'Closed · opens ' + t,
      opensTomorrow: (t) => 'Closed · opens tomorrow ' + t,
      opensDay: (d, t) => 'Closed · opens ' + d + ' ' + t,
      closedToday: 'Closed today',
      closed: 'Closed',
      happeningNow: 'Happening now',
      startsNow: 'Starting now',
      startsInMin: (n) => 'Starts in ' + n + ' min',
      startsInHours: (n) => 'Starts in ' + n + ' h',
      startsTomorrow: (t) => 'Starts tomorrow, ' + t,
      startsDay: (d, t) => 'Starts ' + d + ', ' + t,
      startsDate: (d, t) => 'Starts ' + d + ', ' + t,
      justNow: 'Just now',
      minAgo: (n) => n + ' min ago',
      hAgo: (n) => n + ' h ago',
      yesterday: 'Yesterday',
      daysAgo: (n) => n + ' days ago',
      dayShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      monthShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    },

    // The map-look control (P1-12)
    look: {
      label: 'Map look',
      auto: 'Match my phone',
      light: 'Light',
      dark: 'Dark',
      menuLabel: 'Choose the map look',
    },
  };
})();
