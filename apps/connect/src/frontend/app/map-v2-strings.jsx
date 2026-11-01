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
      // P2-04: the same Follow the profile page and the card have (a Contributor only; a Place or an Event keeps its card)
      follow: 'Follow',
      following: 'Following',
      // P2-04: Save is a private bookmark (a Contributor or a Place); only the person sees it, in Settings
      save: 'Save',
      saved: 'Saved',
      // #210: a Place and an Event speak in the same pills (the Event's own Connect and Consider, and a message to its organiser)
      connect: 'Connect',
      connected: 'Connected',
      consider: 'Consider',
      considering: 'Considering',
      message: 'Message',
      by: 'by',
      with: 'with',
      counts: (connected, considering) => connected + ' connected · ' + considering + ' considering',
      website: 'Website',
      call: 'Call',
      email: 'Email',
      viewFull: 'View Full Profile',
      retry: 'Try again',
      tabsLabel: 'More about this listing',
      tabs: { events: 'Events', news: 'News', today: 'Today', gallery: 'Gallery' },
      // P2-09: an event two Contributors run together lists the OTHER host(s) under its title
      withHosts: (names) => 'With ' + names,
      // P2-07: the Events tab shows what is coming first; "Recent" is what already happened, newest first
      eventsSort: { label: 'Which events to show', upcoming: 'Upcoming', recent: 'Recent', noneUpcoming: 'Nothing is coming up.', noneRecent: 'No recent events.' },
      // P2-08: shown only at 100 or more (MapV2.countBucket); never a low number
      followers: (bucket) => bucket + ' followers',
      // P2-06: a QR code for the listing's own link, to print or show at a venue
      qr: {
        action: 'QR code',
        title: (name) => 'QR code for ' + name,
        hint: "Scanning it opens this listing in your phone's browser.",
        printHint: 'Print it or show it at your venue.',
        // inside the phone app there is no download: a screenshot keeps it
        screenshotHint: 'To keep it, take a screenshot of this screen.',
        imageLabel: (name, url) => 'QR code that opens ' + name + ' at ' + url,
        save: 'Save image',
        close: 'Close QR code',
        fileName: (slug) => 'citizens-connect-' + slug + '.png',
      },
      // P2-01: the closest listings to this one, at the bottom of the full sheet (distance only, never popularity)
      nearby: {
        title: 'Nearby',
        hint: 'Closest first.',
        under: 'Under 100 m away',
        metres: (n) => n + ' m away',
        km: (n) => n + ' km away',
        row: { label: 'Nearby listings, closest first' },
      },
      // The sideways rows (News, Nearby): the arrows beside a row, drawn only for a mouse
      row: { prev: 'Previous', next: 'Next' },
      empty: {
        title: (name) => name + ' has not shared events, news or photos yet.',
        hint: 'Everything they have shared is on their full profile.',
      },
      // Issue #216: the centred reader a news card opens. The post itself is data.
      news: {
        readMore: 'Read more',
        close: 'Close news post',
        // The row of the newest posts. "See all" turns it into the full list in place; "Show fewer" puts it back.
        row: {
          label: 'Latest news',
          count: (shown, total) => 'Newest ' + shown + ' of ' + total,
          all: (total) => 'All ' + total + ' posts',
          seeAll: (total) => 'See all ' + total,
          showFewer: 'Show fewer',
        },
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

    // Issue #259 (founder naming rule, 2026-10-21): the PUBLIC side says "Online in this area" and never "serving";
    // every public word for the globe lives in this one group so the wording changes in one place.
    online: {
      title: 'Online in this area',
      // the small tag on each row, chosen by the owner (default online); a mobile ministry is never labelled Online
      tag: { online: 'Online', noFixedPlace: 'No fixed place' },
      alsoReaching: 'Also reaching this area',
      // the globe button on the map (one labelled button, then the list)
      button: (n) => 'Online in this area: ' + n + (n === 1 ? ' listing' : ' listings'),
      // under the sheet title: honest about what the list is (C21: never "on the map")
      subtitle: (area) => 'Online or no fixed place · ' + area,
      count: (n) => n + (n === 1 ? ' listing' : ' listings'),
      closeSheet: 'Close the online list',
      // the main list is grouped by how specific the area they chose is, then A to Z
      groups: { suburb: 'This suburb', place: 'This city or town', province: 'The whole province' },
      rowMeta: (tag, area) => tag + ' · ' + area,
      openProfile: (name) => 'Open ' + name,
      alsoHint: 'A wider reach, nearest first.',
      within: (km, centre) => 'Within ' + km + ' km of ' + centre,
      withinPin: (km) => 'Within ' + km + ' km of their place',
      away: (km) => km + ' km away',
      alsoFoot: 'Nearest first, then A to Z. No ranking.',
      loading: 'Loading',
      loadError: 'We could not load this list.',
      retry: 'Try again',
      empty: 'No one is online in this area right now.',
    },

    // Issue #259, owner side (the area picker in Apply and the Dashboard): this side KEEPS the word "serving".
    serving: {
      title: 'Where do you serve?',
      intro: 'Choose the areas you serve so people there can find you.',
      tickMeaning: 'A tick covers that whole area and everything inside it.',
      noUpward: 'Choosing a suburb never chooses the city above it.',
      searchLabel: 'Search areas',
      levels: { province: 'Province', place: 'City or town', suburb: 'Suburb' },
      expand: (name) => 'Show areas inside ' + name,
      collapse: (name) => 'Hide areas inside ' + name,
      tick: (name) => 'Serve ' + name,
      tickAll: (name) => 'Serve all of ' + name,
      includes: 'Includes everything inside',
      containsChosen: 'Contains a chosen area',
      suburbsHint: 'Suburbs (optional)',
      noSuburbs: 'No suburbs are listed here yet.',
      loadingChildren: 'Loading',
      summaryNone: 'Serving: nothing chosen yet',
      summary: (list) => 'Serving: ' + list,
      allOf: (name) => 'all of ' + name,
      and: 'and',
      more: (n) => n + ' more',
      tooMany: (n) => 'You can choose up to ' + n + ' areas.',
      noMatches: 'No areas match your search.',
      loading: 'Loading areas',
      loadError: 'We could not load the areas.',
      retry: 'Try again',
      radius: {
        title: 'Also reach people within a distance (optional)',
        needsArea: 'Choose an area first. A distance needs a centre.',
        off: 'Off',
        km: (n) => n + ' km',
        measuredFrom: 'Measured from',
        hint: 'People within this distance of the centre will find you.',
      },
      presence: {
        title: 'How do people find you?',
        online: 'You serve people over the internet.',
        noFixedPlace: 'You travel or meet people in person, with no venue.',
      },
      save: 'Save areas',
      saving: 'Saving…',
      saved: 'Saved. Your areas are updated.',
      findableNote: 'Online in this area: people there find you once you are approved.',
      reviewLabel: 'Serving',
      applyFailed: 'Your application is sent. Please add your areas again from your dashboard.',
      errors: {
        generic: 'We could not save your areas. Please try again.',
        offline: 'We could not reach the server. Please check your connection.',
        signIn: 'Please sign in first.',
        forbidden: 'Only the owner or an editor can change this.',
        tooMany: 'That is too many areas. Please choose fewer.',
        slowDown: 'Too many changes at once. Please try again shortly.',
        notReady: 'Your listing is not ready for areas yet.',
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

    // Issue #222. Words the card itself paints. Category and group names are data
    // (window.DATA.getItemCategory), not strings here. Posted-ago and open state
    // stay in `time`. "Read more" stays on sheet.news.
    card: {
      listen: 'Listen',
      live: 'Live',
      loading: 'Loading',
    },

      // Issue #210: the folding navigation (app/map-v2-nav.jsx). Let's, Messages and Alerts live in the
      // account menu that Profile opens. Kingdom Projects stays at /community, linked from the Let's page.
      nav: {
        label: 'Main',
        open: 'Open navigation',
        openUnread: 'Open navigation, you have unread messages or alerts',
        close: 'Close navigation',
        items: { home: 'Home', explore: 'Explore', map: 'Map', profile: 'Profile' },
        menu: { lets: 'Let\'s…', messages: 'Messages', alerts: 'Alerts' },
        unread: (n) => n + ' unread',
      },

      // Issue #313. The Let's page and the starters on event creation. Starter names are data (window.LETS).
      lets: {
        title: 'Let\'s…',
        sub: 'Gather with people near you',
        start: 'Start one',
        happening: 'Happening',
        empty: 'No gatherings yet. Start one above.',
        projects: 'Kingdom Projects',
        projectsHint: 'Ideas, votes and collaboration.',
        error: 'Could not load gatherings.',
        retry: 'Try again',
        signIn: 'Sign in to start one',
        preset: 'Picks a category for the map.',
        cap: 'A gathering started here skips the monthly cap.',
        locked: 'This gathering keeps its starter.',
        loading: 'Loading gatherings',
      },

    // Issue #210: the map home's category pills and the Explore row (app/map-v2-explore.jsx).
    // One muted colour per group (founder, 2026-10-26); the group names are the pills.
    explore: {
      title: 'Explore',
      seeAll: 'See all',
      seeAllLabel: 'See all listings',
      label: 'Listings near you, closest first',
      labelCentre: 'Listings near the middle of the map, closest first',
      pillsLabel: 'Show on the map',
      search: 'Search events, places, people…',
      clearSearch: 'Clear search',
      groups: {
        all: 'All',
        worship: 'Churches & worship',
        events: 'Events',
        business: 'Business',
        serve: 'Serve & care',
        culture: 'Culture & fun',
        learn: 'Learn & grow',
        audiences: 'Audiences',
        ideas: 'Ideas',
      },
      // a card (or a pin) chosen: the card says what the next tap does, in words laid over its picture
      selectedBadge: 'Tap again to open',
      selectedAnnounce: (name) => name + ' is chosen. Press it again to open it.',
      // the panel's own controls (founder, 2026-10-30): the title switches to the category list, the handle lowers the panel
      chooseCategory: 'Choose a category',
      backToListings: 'Back to the listings',
      categoriesLabel: 'Categories',
      lower: 'Lower this panel to see more of the map',
      raise: 'Raise this panel',
      under: 'Under 100 m away',
      metres: (n) => n + ' m away',
      km: (n) => n + ' km away',
      centre: {
        under: 'Under 100 m from the map centre',
        metres: (n) => n + ' m from the map centre',
        km: (n) => n + ' km from the map centre',
      },
      empty: 'Nothing here yet. Move the map or pick another category.',
    },

    // Issue #210 part 3: the Discover page that "See all" and the nav's Explore open (app/map-v2-discover.jsx).
    // The group names are explore.groups; distances use explore's words (or the city centre's, below).
    discover: {
      title: 'Explore',
      pillsLabel: 'Show on this page',
      near: 'Near you',
      nearLabel: 'Listings near you, closest first',
      popular: 'Popular',
      popularHint: 'Busy this month with events or news, in fair turns',
      popularLabel: 'Popular: busy this month with events or news, in fair turns',
      groupLabel: (name) => name + ', closest first',
      row: {
        count: (shown, total) => 'Closest ' + shown + ' of ' + total,
        all: (total) => 'All ' + total + ' listings',
        seeAll: (total) => 'See all ' + total,
        showFewer: 'Show fewer',
      },
      city: {
        under: 'Under 100 m from the city centre',
        metres: (n) => n + ' m from the city centre',
        km: (n) => n + ' km from the city centre',
      },
      empty: 'Nothing here yet. Pick another category.',
    },

    // Issue #160. The same words as CCReport.STR (a test keeps the two copies equal).
    // Map surfaces pass this object in; other screens use STR.
    report: {
      action: 'Report',
      menu: 'Report',
      more: 'More options',
      close: 'Close report',
      title: (noun) => 'Report this ' + noun,
      why: 'Why are you reporting it?',
      reasons: {
        spam: 'Spam',
        harassment: 'Harassment',
        hate_speech: 'Hate speech',
        sexual_content: 'Sexual content',
        violence: 'Violence',
        misinformation: 'Misinformation',
        impersonation: 'Impersonation',
        illegal: 'Something illegal',
        other: 'Something else',
      },
      nouns: {
        event: 'event',
        user: 'person',
        place: 'place',
        comment: 'comment',
        conversation: 'conversation',
        moment: 'moment',
      },
      details: 'Tell us more (optional, 1000 max)',
      counter: (n) => n + '/1000',
      cancel: 'Cancel',
      send: 'Send report',
      sending: 'Sending…',
      thanks: 'Thanks. An admin will look at it.',
      already: "You've already reported this. Thanks, we're looking into it.",
      rate: "You've sent a few reports already. Please try again later.",
      fail: 'Could not send. Please try again.',
    },
  };
})();
