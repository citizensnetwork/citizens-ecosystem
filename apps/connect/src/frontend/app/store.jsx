// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — app store (state + actions + tiny router)
// ════════════════════════════════════════════════════════════════════
(function () {
  const { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } = React;
  const AppCtx = createContext(null);

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = (p) => p + Math.random().toString(36).slice(2, 7);

  // Real (DB) ids are UUIDs; mock prototype ids ('e1','p1',…) are not. Only real
  // ids may be written through to the API — mock entities stay local-only during
  // the mock→real data migration (e.g. places are still mock this phase).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isRealId = (id) => typeof id === 'string' && UUID_RE.test(id);

  // The route table (routes.jsx) is the one place that knows which URL belongs to
  // which screen; nothing here writes a path string by hand.
  const ROUTES = window.CC_ROUTES;
  const HOME_NAV = { page: 'home', params: {} };
  // JSON-safe copy of a nav for history.state (pushState structured-clones it).
  const plainNav = (n) => {
    try { return { page: n.page, params: JSON.parse(JSON.stringify(n.params || {})) }; } catch (e) { return HOME_NAV; }
  };
  // Where the address bar says we are on page load (a deep link, or a refresh), plus
  // the history.state we stamped on this entry if it is a reload of a screen we opened.
  function readBootRoute() {
    try {
      const r = ROUTES.navFromPath(window.location.pathname, window.location.search);
      const st = window.history && window.history.state;
      return { ...r, state: st && st.cc ? st : null };
    } catch (e) {
      return { ok: true, nav: HOME_NAV, canonical: '/', legacy: false, state: null };
    }
  }
  // After a Google sign-in the browser comes back to the site ROOT (a fixed,
  // allow-listed redirect). The screen the person was on is carried across in
  // sessionStorage, written by stashReturnPath() and read ONCE by takeReturnPath().
  // Both ends go through routes.jsx safeReturnPath, so only a known app path (never
  // a host, scheme or query string) can ever come back out.
  const RETURN_KEY = 'cc_return_to';
  const RETURN_MAX_AGE_MS = 60 * 60 * 1000;
  function stashReturnPath() {
    try {
      const path = ROUTES.safeReturnPath(window.location.pathname + window.location.search);
      if (path && path !== '/') sessionStorage.setItem(RETURN_KEY, JSON.stringify({ p: path, t: Date.now() }));
      else sessionStorage.removeItem(RETURN_KEY);
    } catch (e) { /* storage blocked: we just land on the map after sign-in */ }
  }
  function takeReturnPath() {
    try {
      const raw = sessionStorage.getItem(RETURN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (!v || typeof v.t !== 'number' || Date.now() - v.t > RETURN_MAX_AGE_MS) return null;
      return ROUTES.safeReturnPath(v.p);
    } catch (e) { return null; }
  }

  // Authenticated cross-origin fetch to the API. The static frontend's Supabase
  // session lives in localStorage (no cookie), so authenticated mutations must
  // carry the access token as a Bearer header (see src/lib/supabase/route.ts).
  async function authedFetch(path, opts) {
    opts = opts || {};
    const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
    const token = window.CC_AUTH ? await window.CC_AUTH.getAccessToken() : null;
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(base + path, Object.assign({}, opts, { headers }));
  }

  // Upload a real image file → Supabase Storage, returning its public URL. Two
  // server paths by scope:
  //   • 'avatar'                      → POST /api/avatar (multipart); ALSO persists
  //                                     profiles.avatar_url for the signed-in user.
  //   • 'event-cover' | 'place-cover' → POST /api/media/upload mints a signed upload
  //                                     URL, then bytes go straight to Storage (one hop).
  // Requires a real signed-in user (Bearer). In demo / unconfigured mode there is no
  // token, so we throw a friendly error and the caller keeps the stock/URL options.
  async function uploadImage(file, opts) {
    opts = opts || {};
    const scope = opts.scope || 'event-cover';
    if (!window.CC_AUTH) throw new Error('Sign in to upload your own photo.');
    const token = await window.CC_AUTH.getAccessToken();
    if (!token) throw new Error('Sign in to upload your own photo.');
    const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
    const readErr = async (res, fallback) => {
      const body = await res.json().catch(() => ({}));
      return new Error((body && body.error) || fallback);
    };

    if (scope === 'avatar') {
      const fd = new FormData();
      fd.append('file', file);
      // NB: do NOT set Content-Type — the browser adds the multipart boundary itself.
      const res = await fetch(base + '/api/avatar', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd,
      });
      if (!res.ok) throw await readErr(res, 'Could not upload your photo. Please try again.');
      return (await res.json()).avatar_url;
    }

    if (scope === 'contributor-cover') {
      const fd = new FormData();
      fd.append('file', file);
      if (opts.caption) fd.append('caption', opts.caption);
      // NB: do NOT set Content-Type — the browser adds the multipart boundary itself.
      const res = await fetch(base + '/api/contributor/cover-photos', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd,
      });
      if (!res.ok) throw await readErr(res, 'Could not upload your cover photo. Please try again.');
      return (await res.json()).photos;
    }

    // Cover scopes: mint a signed upload URL, then push the bytes to Storage directly.
    const signRes = await authedFetch('/api/media/upload', {
      method: 'POST',
      body: JSON.stringify({ scope, filename: file.name, contentType: file.type, size: file.size }),
    });
    if (!signRes.ok) throw await readErr(signRes, 'Could not start the upload. Please try again.');
    const { bucket, path, token: uploadToken, publicUrl } = await signRes.json();
    const { error } = await window.CC_AUTH.supabase.storage.from(bucket).uploadToSignedUrl(path, uploadToken, file);
    if (error) throw new Error('Upload failed. Please try again.');
    return publicUrl;
  }

  // Forward-geocode a free-text address via MapTiler (key already in env for
  // the basemap). South-Africa-biased. Returns {lat,lng} or null — callers
  // decide whether coordinates are required (places) or optional (events).
  async function geocodeAddress(q) {
    try {
      const key = window.__CC_ENV && window.__CC_ENV.MAPTILER_KEY;
      if (!key || !q || !q.trim()) return null;
      const res = await fetch('https://api.maptiler.com/geocoding/' + encodeURIComponent(q.trim()) + '.json?key=' + key + '&limit=1&country=za');
      if (!res.ok) return null;
      const json = await res.json();
      const f = json && json.features && json.features[0];
      if (!f || !Array.isArray(f.center)) return null;
      return { lng: f.center[0], lat: f.center[1] };
    } catch (e) { return null; }
  }
  window.geocodeAddress = geocodeAddress;

  // Reverse-geocode a dropped pin back into a human-readable address (same
  // MapTiler key/endpoint as geocodeAddress, just {lng,lat} instead of a
  // query string). Powers the location-picker map — drag the pin, the
  // address field fills in. Returns a string or null.
  async function reverseGeocode(lat, lng) {
    try {
      const key = window.__CC_ENV && window.__CC_ENV.MAPTILER_KEY;
      if (!key || typeof lat !== 'number' || typeof lng !== 'number') return null;
      const res = await fetch('https://api.maptiler.com/geocoding/' + lng + ',' + lat + '.json?key=' + key + '&limit=1');
      if (!res.ok) return null;
      const json = await res.json();
      const f = json && json.features && json.features[0];
      return (f && f.place_name) || null;
    } catch (e) { return null; }
  }
  window.reverseGeocode = reverseGeocode;

  // Lazy slug → category_id map (places.category_id is a uuid FK; the create
  // form works in slugs). Cached after the first lookup; fails open to null
  // so an unknown slug lands in custom_category instead.
  let _categoryIdBySlug = null;
  async function getCategoryId(slug) {
    if (!slug) return null;
    if (!_categoryIdBySlug) {
      try {
        const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
        const res = await fetch(base + '/api/v1/categories');
        const json = await res.json();
        _categoryIdBySlug = new Map(((json && json.data) || []).map((c) => [c.slug, c.id]));
      } catch (e) { _categoryIdBySlug = new Map(); }
    }
    return _categoryIdBySlug.get(slug) || null;
  }

  // ── Live data adapter: /api/v1/events row → app event shape ──────────
  //  The public API is sparse (no organiser name / connect counts yet), so we
  //  fill honest defaults (0 counts, blank organiser) and compute `isLive` from
  //  the event window. Coordinates carry through as lat/lng for the real map.
  // Real rows with no image get an EMPTY photo (not a stock stand-in): the UI's
  // SmartImage/Avatar then render an honest, category-tinted placeholder rather
  // than a generic stranger's photo masquerading as a real venue/person.
  const fmtTime = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  // Raw 24h "HH:MM" for native <input type="time"> — fmtTime above is
  // 12h/AM-PM for display and cannot round-trip through a time input.
  const to24 = (d) => d ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '';
  // Compact relative timestamp for list rows ("now", "5m", "3h", "2d", "4 Mar").
  const timeAgo = (iso) => {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 604800) return Math.floor(s / 86400) + 'd';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const fmtDateLabel = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    if (sameDay(d, new Date())) return 'Today';
    if (sameDay(d, new Date(Date.now() - 86400000))) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  function adaptEvent(r) {
    const dt = r.date ? new Date(r.date) : null;
    const endDt = r.end_time ? new Date(r.end_time) : null;
    const now = new Date();
    const validDt = dt && !isNaN(dt.getTime()) ? dt : null;
    const validEnd = endDt && !isNaN(endDt.getTime()) ? endDt : null;
    return {
      id: r.id, title: r.title || 'Untitled event', category: r.category,
      description: r.description || '',
      date: validDt ? validDt.toISOString().slice(0, 10) : '',
      time: fmtTime(validDt), endTime: fmtTime(validEnd),
      time24: to24(validDt), endTime24: to24(validEnd),
      // Raw instants, for window.DATA.isPastEvent (date/time above are display strings).
      startsAt: validDt ? validDt.toISOString() : '', endsAt: validEnd ? validEnd.toISOString() : '',
      status: r.status || 'published',
      // The public feed only ever returns public rows (so this defaults to 'public');
      // the owner's own read returns private ones too, which DATA.publicRows must hide.
      visibility: r.visibility || 'public',
      location: r.location || '', address: r.location || '',
      // organizerId = created_by (UUID). community_contributor is a BOOLEAN on
      // the live schema (community-posted flag) — only use it as a name if some
      // upstream shape ever sends a string; never render `true` as a name.
      organizerName: typeof r.community_contributor === 'string' ? r.community_contributor : '',
      organizerId: r.created_by || null,
      isLive: !!(validDt && validEnd && validDt <= now && now <= validEnd),
      isBusy: false, connectCount: 0, considerCount: 0,
      volunteeringEnabled: !!r.volunteer_openings,
      coverPhoto: r.image_url || '',
      gallery: [], broadcast: null, website: r.website_url || '',
      // One table, one mapping — window.DATA.SOCIAL_COLUMNS. This used to be
      // a hand-written literal that quietly dropped tiktok_url (a column the
      // events table has had since migration 098), which is exactly the class
      // of drift the shared map exists to stop.
      socials: window.DATA.socialsFromRow(r, window.DATA.SOCIAL_COLUMNS.event),
      lat: typeof r.latitude === 'number' ? r.latitude : null,
      lng: typeof r.longitude === 'number' ? r.longitude : null,
      tags: [], upcomingDates: [],
      createdAt: r.created_at || '',
    };
  }

  // Admin moderation queue row (GET /api/admin/reports) → app report shape.
  // Severity is a TRIAGE HINT derived from the reason (the DB stores none) —
  // it orders the queue, it is not a stored judgement.
  const SEVERITY_BY_REASON = { harassment: 'high', hate: 'high', violence: 'high', threat: 'high', abuse: 'high', spam: 'medium', misleading: 'medium', impersonation: 'medium' };
  function adaptReport(r) {
    return {
      id: r.id,
      targetType: r.target_type,
      targetName: r.target_name || 'A ' + r.target_type,
      reason: r.reason || 'other',
      severity: SEVERITY_BY_REASON[r.reason] || 'low',
      detail: r.body || '',
      reporter: r.reporter_name || 'A citizen',
      reporterPhoto: r.reporter_avatar || '',
      date: r.created_at,
      // DB vocab: open | actioned | dismissed. UI vocab keeps resolved/removed
      // as presentation of 'actioned' (the notes carry the distinction).
      status: r.status === 'actioned' ? 'resolved' : r.status,
      resolution: r.resolution_notes || '',
    };
  }

  // API contributor row (public /api/v1/contributors → a profiles row) → app
  // contributor shape. The public directory is sparse, so anything it doesn't
  // expose (follower counts, involvement tier, niche) gets honest, crash-safe
  // defaults — never fabricated numbers (VISION: honour the small honestly).
  function adaptContributor(r) {
    const socials = window.DATA.socialsFromRow(r, window.DATA.SOCIAL_COLUMNS.contributor);
    return {
      id: r.id,
      name: r.full_name || (r.contributor_slug
        ? r.contributor_slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Unnamed Ministry'),
      role: 'contributor',
      kind: r.contributor_kind || 'organization',
      slug: r.contributor_slug || null,
      profilePhoto: r.logo_url || r.avatar_url || '',
      // cover_photo_urls is an ordered [{url, caption}] array (POST/PATCH/
      // DELETE /api/contributor/cover-photos) — the first entry is the
      // public hero image; the full array is kept as coverPhotos for the
      // dashboard's cover-photo manager.
      coverPhoto: (Array.isArray(r.cover_photo_urls) && r.cover_photo_urls[0] && r.cover_photo_urls[0].url) || '',
      coverPhotos: Array.isArray(r.cover_photo_urls) ? r.cover_photo_urls : [],
      bio: r.bio || '',
      website: r.website_url || '',
      // Public-facing contact email a contributor chooses to display —
      // distinct from the private notification_email (see /api/contributor/
      // profile). Honestly blank until they set one; never fabricated.
      contactEmail: r.contact_email || '',
      location: r.physical_address || '',
      // Map presence: category sets pin colour/icon (window.DATA.getCategory);
      // lat/lng comes from a forward-geocode of physical_address done at
      // application time (see submitApplication). /api/v1/contributors
      // returns these as physical_latitude/physical_longitude (unlike
      // events/places, which are already renamed to latitude/longitude).
      category: r.category || '',
      lat: typeof r.physical_latitude === 'number' ? r.physical_latitude : null,
      lng: typeof r.physical_longitude === 'number' ? r.physical_longitude : null,
      // Online / mobile / no permanent office — intentionally no map pin
      // (lat/lng stay null above, which home.jsx already filters out).
      noFixedLocation: !!r.no_fixed_location,
      followerCount: 0,
      involvementLevel: 'Shepherd',
      dominantNiche: '',
      socials,
      gallery: r.gallery_urls || [],
      collaborators: [],
      members: [],
      verified: true,
    };
  }

  // socials {platformKey: value} → the /api/contributor/* payload fields, keyed
  // by the profiles column names in window.DATA.SOCIAL_COLUMNS.contributor.
  // Values are sent RAW (handle or URL) — the server normalises both shapes
  // now (normaliseSocialValue), so a handle typed into a URL-shaped box no
  // longer fails validation and take the whole save with it.
  //   mode 'create' → blanks are omitted (nothing to clear yet)
  //   mode 'update' → blanks are sent as '' so a removed handle really clears
  const contributorSocialPayload = (socials, mode) => {
    const cols = window.DATA.SOCIAL_COLUMNS.contributor;
    const out = {};
    Object.keys(cols).forEach((k) => {
      const raw = socials && socials[k];
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (v) out[cols[k]] = v;
      else if (mode === 'update') out[cols[k]] = '';
    });
    return out;
  };

  // Every direct `profiles` select that feeds adaptContributor() MUST use
  // this exact column list. Three call sites each hand-copied a subset in
  // the past and drifted (missing category broke map-pin colours; missing
  // lat/lng on the sign-in hydration effect could wipe a contributor's map
  // presence entirely on re-hydration since it's merged over the existing
  // record). One constant, used everywhere, so that can't happen again.
  const CONTRIBUTOR_SELECT = 'id, full_name, contributor_slug, contributor_kind, bio, logo_url, avatar_url, ' +
    'website_url, category:contributor_category, physical_address, physical_latitude, physical_longitude, ' +
    'no_fixed_location:contributor_no_fixed_location, instagram_handle, facebook_url, tiktok_handle, youtube_url, ' +
    'x_handle, linkedin_url, whatsapp_number, ' +
    'gallery_urls, cover_photo_urls, contact_email:contributor_contact_email';

  // API place row (public /api/v1/places) → app place shape. Places carry real
  // lat/lng (NOT NULL in the DB) so they anchor on the map directly. The public
  // row is sparse, so follower counts / associated events get honest defaults
  // (never fabricated). organizerId = created_by → resolves its real organiser
  // identity against the merged contributors directory (same path as events).
  function adaptPlace(r) {
    return {
      id: r.id,
      name: r.name || 'Place',
      category: r.category || r.custom_category || '',
      description: r.description || '',
      address: r.address || '',
      organizerName: '', organizerId: r.created_by || null,
      coverPhoto: r.image_url || '',
      gallery: [],
      openHours: r.open_hours || '',
      status: r.status || 'published',
      website: r.website || '', phone: r.phone || '',
      // Places could not store a single social handle before migration 172 —
      // the create/edit form collected them and the insert silently dropped
      // them on the floor. Same seven columns as an event now.
      socials: window.DATA.socialsFromRow(r, window.DATA.SOCIAL_COLUMNS.place),
      volunteeringEnabled: !!r.volunteer_openings,
      followerCount: 0,
      verified: !!r.verified,
      // No event↔place FK exists (events carry free-text location + created_by,
      // not a place_id), so we cannot honestly list "events at this place" yet.
      associatedEventIds: [],
      lat: typeof r.latitude === 'number' ? r.latitude : null,
      lng: typeof r.longitude === 'number' ? r.longitude : null,
      tags: [],
    };
  }

  // DB news_posts row → app shape. A contributor-authored update/story shown
  // on their own public listing — distinct from broadcast_messages (24h map
  // bubble tied to one event/place). post_date is contributor-editable and is
  // what the feed sorts by, separate from created_at.
  function adaptNewsPost(r) {
    return {
      id: r.id, contributorId: r.contributor_id,
      title: r.title || '', body: r.body || '',
      image: r.image_url || '',
      date: r.post_date || (r.created_at ? r.created_at.slice(0, 10) : ''),
      createdAt: r.created_at || '',
    };
  }

  // ── Notification + conversation adapters (API rows → app shapes) ─────
  //  DB notification types collapse onto the design's display buckets so the
  //  Notifications screen can keep its small icon map.
  const NOTIF_TYPE_MAP = {
    broadcast_sent: 'broadcast',
    dm_received: 'message', dm_response: 'message', new_message: 'message',
    friend_convince: 'convince',
    friend_attending: 'friend', new_follower: 'friend',
    suggestion_response: 'idea',
    event_reminder: 'event', new_event_match: 'event', event_update: 'event',
    event_cancelled: 'event', review_prompt: 'event',
    volunteer_application: 'volunteer', volunteer_application_response: 'volunteer',
    team_invite: 'team', team_invite_response: 'team', team_owner_transfer: 'team',
    contributor_approved: 'admin', contributor_rejected: 'admin',
    admin_elevation_request: 'admin', spam_flag: 'admin', broadcast_flood: 'admin',
  };
  function adaptNotification(r) {
    const d = (r && typeof r.data === 'object' && r.data) || {};
    const url = typeof d.url === 'string' ? d.url : '';
    const evMatch = url.match(/\/events\/([0-9a-f-]{36})/i);
    const msgMatch = url.match(/\/messages\/([0-9a-f-]{36})/i);
    return {
      id: r.id,
      type: NOTIF_TYPE_MAP[r.type] || 'bell',
      title: r.title || 'Notification',
      body: r.body || '',
      time: timeAgo(r.created_at),
      read: !!r.read,
      photo: d.photo || d.avatar_url || '',
      // Deep-link targets for the in-app router (event profile / message thread).
      eventId: d.event_id || (evMatch ? evMatch[1] : null),
      convId: d.conversation_id || (msgMatch ? msgMatch[1] : null),
    };
  }

  function adaptConversation(r) {
    const other = r.other_user || {};
    return {
      id: r.id,
      isOrg: !!other.is_contributor,
      participantId: other.id || null,
      participantName: other.full_name || 'Citizen',
      participantPhoto: other.avatar_url || '',
      lastMessage: r.last_message ? r.last_message.body : 'Start the conversation…',
      lastTime: timeAgo(r.last_message ? r.last_message.created_at : r.updated_at),
      unread: r.unread_count || 0,
      status: r.status || 'active',
      muted: !!r.muted,
      messages: [],
      messagesLoaded: false, // thread loads on open
    };
  }
  function adaptMessage(m, myId) {
    return {
      id: m.id,
      from: m.sender_id === myId ? 'me' : 'them',
      text: m.body,
      time: fmtTime(new Date(m.created_at)),
      date: fmtDateLabel(m.created_at),
    };
  }

  // ── Impact Idea adapter (get_community_ideas RPC row → app idea shape) ──
  //  Legacy ideas from the old Next.js page encoded category as a "[cat:slug]"
  //  body prefix; prefer the real category column, fall back to parsing it.
  const IDEA_STATUS_MAP = { voting: 'voting', in_process: 'inProcess', confirmed: 'confirmed' };
  function adaptIdea(r) {
    let description = r.body || '';
    let category = r.category || '';
    const m = description.match(/^\[cat:([a-z0-9-]+)\]\s*/i);
    if (m) { if (!category) category = m[1]; description = description.slice(m[0].length); }
    return {
      id: r.id,
      title: r.title || 'Untitled idea',
      description,
      category,
      votes: Number(r.vote_count) || 0,
      threshold: r.vote_threshold || 1,
      status: IDEA_STATUS_MAP[r.idea_status] || 'voting',
      tier: r.tier || 'community',
      tierLabel: r.tier_label || '',
      votedByMe: !!r.voted_by_me,
      authorName: r.author_name || 'A Citizen',
      authorPhoto: r.author_avatar || '',
      projectLeadId: r.project_lead_id || null,
      associatedEventId: r.associated_event_id || null,
      collaborators: null, // honest: real collaborator counts arrive with Phase-4 projects
      createdAt: r.created_at || '',
      lat: typeof r.latitude === 'number' ? r.latitude : null,
      lng: typeof r.longitude === 'number' ? r.longitude : null,
    };
  }

  // Volunteer application row (GET /api/contributor/<slug>/volunteers) → app shape.
  function adaptVolunteer(r) {
    const prof = Array.isArray(r.applicant) ? r.applicant[0] : r.applicant;
    return {
      id: r.id,
      eventId: r.entity_type === 'event' ? r.entity_id : null,
      placeId: r.entity_type === 'place' ? r.entity_id : null,
      name: (prof && prof.full_name) || 'A Citizen',
      photo: (prof && prof.avatar_url) || '',
      role: 'Volunteer',
      message: r.message || '',
      skills: [],
      status: r.status,
      userId: r.applicant_id,
      createdAt: r.created_at,
    };
  }

  // ── session persistence (login survives refresh) ──
  const SESSION_KEY = 'cc_session_v1';
  const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { return null; } };

  // Guest browsing (landing screen "Browse as Guest") — deliberately separate
  // from SESSION_KEY/authed: a guest never has a Supabase session, so the
  // real-session bootstrap effect below must never see or touch this flag.
  // sessionStorage (not localStorage) so guest mode doesn't outlive the tab —
  // browsing as a guest is a per-visit choice, not a saved account state.
  const GUEST_KEY = 'cc_guest_browse_v1';
  const loadGuestFlag = () => { try { return sessionStorage.getItem(GUEST_KEY) === '1'; } catch (e) { return false; } };

  // Does this browser probably hold a Supabase session, or is it mid sign-in
  // return (PKCE `?code=`, implicit `#access_token=`)? Only then is the sign-in
  // landing held back behind the loading splash while the session resolves
  // (`authResolved`); a first-time visitor has neither, so they see the landing
  // at once with no splash flash. The `$` anchor skips the PKCE
  // `…-auth-token-code-verifier` key, which can outlive an abandoned sign-in.
  const likelySession = () => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return true;
      }
    } catch (e) { /* storage blocked: no session to wait for */ }
    return /[?&#](code|access_token)=/.test(window.location.search + window.location.hash);
  };

  // Neutral identity scaffolds per role. The signed-in person's REAL identity
  // (name/photo/bio from their profiles row) is overlaid onto these — see the
  // `user` derivation below. They are never a fabricated persona: with no real
  // session the app stays on the sign-in screen, so these only show as a brief,
  // honest placeholder (initials/empty) while the real session resolves.
  const CITIZEN_BASE = {
    id: 'me', name: '', role: 'citizen',
    profilePhoto: '', coverPhoto: '', bio: '',
  };
  const ADMIN_BASE = {
    id: 'admin', name: '', role: 'admin',
    profilePhoto: '', coverPhoto: '', bio: '',
  };

  function AppProvider({ children }) {
    const _saved = loadSession();
    const [authed, setAuthed] = useState(!!(_saved && _saved.authed));
    const [guestMode, setGuestMode] = useState(loadGuestFlag);
    // False only while a probable session is still resolving (see likelySession):
    // the shell shows the loading splash instead of the sign-in landing until it
    // flips. Demo mode (no CC_AUTH) and first-time visitors start resolved.
    const [authResolved, setAuthResolved] = useState(() => !window.CC_AUTH || !likelySession());
    const [role, setRole] = useState(_saved && _saved.role ? _saved.role : 'citizen');
    // Read the address bar once, before the first render, so a deep link or a
    // refresh opens the right screen straight away (no flash of the map).
    const boot = useRef(null);
    if (boot.current === null) boot.current = readBootRoute();
    const [nav, setNav] = useState(boot.current.nav);
    const [createKind, setCreateKind] = useState(null); // null | 'event' | 'place'
    const [createEditing, setCreateEditing] = useState(null); // null | the existing event/place object being edited
    const [creationStyle, setCreationStyle] = useState('sheet'); // sheet | modal | side  (tweakable)
    const [bubbleStyle, setBubbleStyle] = useState('speech'); // speech | tag | minimal (tweakable)

    // ONE merged list per kind: the public feed (published rows) plus the signed-in
    // owner's own rows of EVERY status (their dashboard must never lose a cancelled
    // item). `events` / `places` below are the PUBLIC view (published and public
    // only) and are what the map, Kingdom Discovery, search and every public list
    // read; the owner's view is `ownEvents` / `ownPlaces`. Writers (create, edit,
    // cancel, restore, the live feed) all go through setEvents / setPlaces, so both
    // views move together without a reload.
    const [eventRows, setEvents] = useState(() => DATA.events.map((e) => ({ ...e })));
    const [placeRows, setPlaces] = useState(() => DATA.places.map((p) => ({ ...p })));
    const events = useMemo(() => DATA.publicRows(eventRows), [eventRows]);
    const places = useMemo(() => DATA.publicRows(placeRows), [placeRows]);
    // Which loads have finished (success or not), so a deep-linked page can tell
    // "still loading" from "not found" (see entityStatus).
    const [feedsSettled, setFeedsSettled] = useState({ events: false, places: false, contributors: false });
    const [ownerRowsSettled, setOwnerRowsSettled] = useState(false);
    const [entityLookup, setEntityLookup] = useState({});
    const [contributors, setContributors] = useState(() => DATA.contributors.map((c) => ({ ...c })));
    const [applications, setApplications] = useState(() => DATA.applications.map((a) => ({ ...a })));
    const [conversations, setConversations] = useState(() => DATA.conversations.map((c) => ({ ...c, messages: c.messages.slice() })));
    const [notifications, setNotifications] = useState(() => DATA.notifications.map((n) => ({ ...n })));
    const [volunteerApps, setVolunteerApps] = useState(() => DATA.volunteerApplications.map((v) => ({ ...v })));
    const [reports, setReports] = useState(() => DATA.reports.map((r) => ({ ...r })));
    const [ideas, setIdeas] = useState(() => DATA.impactIdeas.map((i) => ({ ...i, votedByMe: false })));

    // contributor onboarding state
    const [myApplication, setMyApplication] = useState(null); // {id,status,...}
    const [myContributor, setMyContributor] = useState(null); // contributor obj once onboarded
    const [assistMode, setAssistMode] = useState(false); // admin assisting as a contributor
    const [realUser, setRealUser] = useState(null); // {id,name,avatarUrl,email} from Supabase (null in demo mode)
    const [contributorDash, setContributorDash] = useState(null); // real dashboard stats/activity/week (null in demo)
    const [adminStats, setAdminStats] = useState(null); // {totalUsers} for the real admin overview
    const [cityReach, setCityReach] = useState(null); // [{area, count}] from rsvps.location_snapshot (real contributors)
    const [myProfileMeta, setMyProfileMeta] = useState(null); // {bio, discoverable, notificationPrefs} — own profiles row
    const [newsPosts, setNewsPosts] = useState([]); // contributor-authored update feed (real only — empty in demo mode)

    // citizen RSVP state (mock seeds for demo mode; replaced by the user's real
    // rows once a real Supabase session loads — see the seeding effect below).
    const [connected, setConnected] = useState(() => new Set(['e1', 'e4']));
    const [considering, setConsidering] = useState(() => new Set(['e3', 'e6']));
    const [followedOrgs, setFollowedOrgs] = useState(() => new Set());
    const [followedPlaces, setFollowedPlaces] = useState(() => new Set());

    // toasts
    const [toasts, setToasts] = useState([]);
    const toast = useCallback((msg, kind = 'gold') => {
      const id = uid('t');
      setToasts((t) => [...t, { id, msg, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    }, []);

    // Pages that write real data on a real account — a genuine guest (browsing
    // without ever signing in, Supabase IS configured) must not reach these:
    // submitApplication/completeOnboarding's `!realUser` branch is a SILENT
    // local-only fake-success built for the e2e/demo case (CC_AUTH entirely
    // absent), not for "signed-out visitor" — a guest completing the wizard
    // would believe they went live and lose the work on refresh. Send them to
    // the sign-in screen instead (showSignIn — Google or an emailed code). Demo
    // mode (no CC_AUTH at all, incl. the Playwright fallback) is untouched —
    // window.CC_AUTH is null there, so this guard never fires.
    const AUTH_REQUIRED_PAGES = new Set(['apply', 'onboarding']);

    // ── Navigation = the browser's own history ───────────────────────────
    //  Every screen has a real URL (routes.jsx), so the browser's stack does the
    //  work: go() pushes an entry, Back/Forward walk them (popstate, below), a
    //  refresh reopens the same screen, a link can be shared. history.state carries
    //  { cc, idx, nav }: idx is our depth (0 = the entry the person arrived on, which
    //  IS the first screen), nav lets Back restore a screen exactly, params and all.
    //  What the browser cannot see are OVERLAYS (preview card, menus, the create
    //  sheet): each registers a "back guard", which pushes one { guard: true } entry
    //  at the moment the overlay opens, so Back pops that entry and closes the overlay
    //  instead of moving the screen (see registerBackGuard and the popstate handler).
    //  RULE: an entry is only ever pushed inside a tap (go(), or a guard right after
    //  the tap that opened an overlay), never on page load and never from popstate.
    //  Chrome (Android) skips entries a page added without a user gesture when Back
    //  is pressed, which made Back leave Connect altogether (founder, 2026-10-03).
    const histIdx = useRef(0);
    const selfPops = useRef(0); // history.back() calls we made ourselves; popstate ignores them
    const navRef = useRef(nav);
    const backGuards = useRef([]);
    const contributorsRef = useRef(contributors);
    contributorsRef.current = contributors;
    const canHistory = () => !!(window.history && window.history.pushState);
    const sameNav = (a, b) => {
      if (!a || a.page !== b.page) return false;
      const ka = Object.keys(a.params || {}), kb = Object.keys(b.params || {});
      return ka.length === kb.length && ka.every((k) => a.params[k] === b.params[k]);
    };
    // The address for a screen; null when it has none (an entity id that is not a
    // UUID, which only demo data has). A Contributor's id becomes its /c/<slug> link.
    const pathOf = useCallback((n) => ROUTES.pathFor(n, {
      slugFor: (id) => { const c = contributorsRef.current.find((x) => x.id === id); return c && c.slug ? c.slug : null; },
    }), []);
    // Write `next` into history: pushState for a new screen, replaceState for a
    // replace / the same screen again (no duplicate entries). Never throws.
    // An overlay's guard entry on top is only a copy of the screen under it, so moving
    // on REPLACES it instead of stacking on it (no leftover entry, one Back per screen).
    const writeHistory = useCallback((next, replace) => {
      if (!canHistory()) return;
      const path = pathOf(next);
      const url = path !== null ? path : window.location.pathname + window.location.search;
      try {
        const cur = window.history.state;
        const onGuard = !!(cur && cur.cc && cur.guard);
        if (replace || onGuard) {
          const state = { cc: 1, idx: histIdx.current, nav: plainNav(next) };
          if (onGuard && sameNav(cur.nav, state.nav)) state.guard = true; // same screen: the overlay is still open
          window.history.replaceState(state, '', url);
        } else {
          window.history.pushState({ cc: 1, idx: histIdx.current + 1, nav: plainNav(next) }, '', url);
          histIdx.current += 1;
        }
      } catch (e) { /* pushState is rate-limited in some webviews; the screen still changes */ }
    }, [pathOf]);

    // An open overlay registers here so Back dismisses it before it moves the app off
    // the current screen. This runs right after the tap that opened the overlay, so the
    // entry it pushes counts as user-initiated. Returns the unregister function.
    const ownsTopEntry = () => backGuards.current.some((g) => g.idx === histIdx.current);
    const registerBackGuard = useCallback((close) => {
      const entry = { close, idx: -1 };
      backGuards.current.push(entry);
      if (canHistory()) {
        try {
          const cur = window.history.state;
          if (cur && cur.cc && cur.guard && !ownsTopEntry() && sameNav(cur.nav, plainNav(navRef.current))) {
            // An overlay that is being replaced by another (same commit: its cleanup has
            // run, its pop is still pending) left its entry on top: take it over.
            entry.idx = histIdx.current;
          } else {
            window.history.pushState(
              { cc: 1, idx: histIdx.current + 1, nav: plainNav(navRef.current), guard: true }, '',
              window.location.pathname + window.location.search + window.location.hash);
            histIdx.current += 1;
            entry.idx = histIdx.current;
          }
        } catch (e) { /* no entry: Back then moves the screen as well as closing the overlay */ }
      }
      return () => {
        backGuards.current = backGuards.current.filter((g) => g !== entry);
        // Closed by a button or a tap outside (not by Back): take our entry back off the
        // stack. Deferred to the end of the current task so a replacement overlay can adopt
        // it first (history.back() is asynchronous, a pushState is not), and only while it
        // is still the top entry and nobody owns it. If the person moved on, writeHistory
        // already replaced it; if Back popped it, histIdx has moved below it.
        Promise.resolve().then(() => {
          const cur = canHistory() ? window.history.state : null;
          if (entry.idx !== -1 && entry.idx === histIdx.current && cur && cur.guard && !ownsTopEntry()) {
            selfPops.current += 1;
            window.history.back();
          }
        });
      };
    }, []);

    const scrollTop = () => {
      const main = document.getElementById('main-scroll');
      if (main) main.scrollTop = 0;
    };

    const commitNav = useCallback((next, replace, scroll) => {
      const same = sameNav(navRef.current, next);
      navRef.current = next;
      setNav(next);
      writeHistory(next, replace || same);
      if (scroll) scrollTop();
    }, [writeHistory]);

    const go = useCallback((page, params = {}, opts) => {
      if (AUTH_REQUIRED_PAGES.has(page) && !realUser && window.CC_AUTH) {
        showSignIn();
        return;
      }
      commitNav({ page, params }, !!(opts && opts.replace), !(opts && opts.keepScroll));
    }, [realUser, commitNav]);

    // Hard reset: the address is REPLACED, not pushed — for transitions where the
    // screen we were on must not be a Back away (sign-out, post-auth routing, a
    // deep link landing on a screen the person may not have).
    const resetNav = useCallback((page, params = {}) => {
      commitNav({ page, params }, true, true);
    }, [commitNav]);

    // One Back press from the platform's own button (Capacitor). Returns false only
    // when there is genuinely nothing left to dismiss, and the caller then exits.
    // The browser's Back button never comes through here: popstate handles it. Closing
    // the overlay unregisters its guard, which pops the guard's own history entry.
    const handleBack = useCallback(() => {
      const guards = backGuards.current;
      if (guards.length) {
        const g = guards[guards.length - 1];
        try { g.close(); } catch (e) { /* a closed overlay is still handled */ }
        // If close() did not unmount it (a stale guard), drop it ourselves.
        backGuards.current = backGuards.current.filter((x) => x !== g);
        return true;
      }
      // idx 0 is the entry the person arrived on, i.e. the first screen.
      if (canHistory() && histIdx.current > 0) { window.history.back(); return true; }
      return false;
    }, []);

    // "Browse as Guest" — dismiss the landing screen without signing in.
    // Independent of `authed`: the real-session bootstrap effect only ever
    // sets `authed`/`realUser`, never reads or clears this flag, so a guest
    // who later taps "Continue with Google" from within the app transitions
    // cleanly from guest → real session without a stale guest flag lingering.
    const browseAsGuest = useCallback(() => {
      try { sessionStorage.setItem(GUEST_KEY, '1'); } catch (e) {}
      // A link to a signed-in-only screen (/messages, /dashboard...) shows the sign-in
      // landing; choosing "browse as guest" there must land on the map, not that screen.
      if (window.CC_AUTH && ROUTES.accessFor(navRef.current) !== 'public') commitNav(HOME_NAV, true, true);
      setGuestMode(true);
    }, [commitNav]);
    // The way back: leave guest browsing and show the landing screen, where
    // every way in lives (Google, emailed code). In-app "sign in" prompts use
    // this rather than jumping straight to Google, so a person without a Google
    // account (e.g. an owner on Outlook mail) is never dead-ended.
    const showSignIn = useCallback(() => {
      try { sessionStorage.removeItem(GUEST_KEY); } catch (e) {}
      setGuestMode(false);
    }, []);
    // openCreate(kind) opens a blank create sheet; openCreate(kind, record)
    // opens the same sheet pre-filled to edit that record.
    const openCreate = useCallback((kind, record) => { setCreateEditing(record || null); setCreateKind(kind); }, []);
    const closeCreate = useCallback(() => { setCreateKind(null); setCreateEditing(null); }, []);

    // ── Settle the screen the ADDRESS named against who the person is ─────────
    //  Only for screens reached by URL (a deep link, a refresh, Back/Forward): in-app
    //  go() keeps its own rules. The URL grants nothing; this just routes sensibly and
    //  the real walls (RLS, the admin/RPC guards) stay where they were:
    //    signed-in-only screen, signed out -> the sign-in landing, and the screen is KEPT
    //      so signing in lands right on it (email code: same page; Google: the stashed path)
    //    /dashboard, not a Contributor     -> the Become-a-Contributor nudge (an admin: /admin)
    //    /admin, not an admin              -> the map
    const gatePending = useRef(ROUTES.accessFor(boot.current.nav) !== 'public');
    const authRef = useRef({ authed, role, guest: guestMode });
    authRef.current = { authed, role, guest: guestMode };
    const settleRoute = useCallback((facts) => {
      if (!gatePending.current || !window.CC_AUTH) return;
      const n = navRef.current;
      const need = ROUTES.accessFor(n);
      if (need === 'public') { gatePending.current = false; return; }
      if (!facts.authed) {
        if (facts.guest) showSignIn();
        return; // keep waiting: the landing is showing and the screen is kept
      }
      gatePending.current = false;
      if (need === 'contributor' && facts.role !== 'contributor') {
        if (facts.role === 'admin') resetNav('admin');
        else { resetNav('apply'); toast('Become a Contributor to unlock your portal.', 'gold'); }
      } else if (need === 'admin' && facts.role !== 'admin') {
        resetNav('home');
        toast('That page is for admins.', 'red');
      }
    }, [resetNav, showSignIn, toast]);

    // Back from Google: we are on the site root; carry on to the screen the person
    // was on when they tapped sign-in (stashReturnPath). A deep link in the address bar wins.
    const restoreReturnPath = useCallback(() => {
      const rt = takeReturnPath();
      if (!rt || window.location.pathname !== '/' || navRef.current.page !== 'home') return;
      const r = ROUTES.navFromPath(rt, '');
      if (!r.ok || sameNav(r.nav, HOME_NAV)) return;
      commitNav(r.nav, true, true);
      gatePending.current = ROUTES.accessFor(r.nav) !== 'public';
    }, [commitNav]);

    // active org the contributor manages: their real org (signed-in
    // contributor), an assist-mode/freshly-onboarded org, else demo Grace City.
    // Crash-safe: always resolves to SOME contributor object.
    const activeContributorId = myContributor
      ? myContributor.id
      : (realUser && role === 'contributor' ? realUser.id : 'c1');
    // The active Contributor's own events / places, whatever their status
    // (cancelled ones stay listed, with Restore). Dashboard only; never a public list.
    const ownEvents = useMemo(() => DATA.ownedRows(eventRows, activeContributorId), [eventRows, activeContributorId]);
    const ownPlaces = useMemo(() => DATA.ownedRows(placeRows, activeContributorId), [placeRows, activeContributorId]);
    // Look one up by id for its own page. Searches every row we hold, cancelled
    // included: a cancelled row is only ever in memory for its owner (or an admin
    // assisting them), so this cannot hand one to the public.
    const findEvent = useCallback((id) => eventRows.find((e) => e.id === id) || null, [eventRows]);
    const findPlace = useCallback((id) => placeRows.find((p) => p.id === id) || null, [placeRows]);
    const activeContributor =
      (myContributor && myContributor.id === activeContributorId ? myContributor : null)
      || contributors.find((c) => c.id === activeContributorId)
      || contributors[0]
      || { id: 'c1', name: 'My Ministry', profilePhoto: '', coverPhoto: '', bio: '', involvementLevel: 'Shepherd', followerCount: 0, dominantNiche: '', website: '', location: '', socials: {}, gallery: [] };

    const baseUser =
      role === 'admin' ? ADMIN_BASE
      : role === 'contributor'
        ? {
            id: activeContributor.id, name: activeContributor.name, role: 'contributor',
            profilePhoto: activeContributor.profilePhoto, coverPhoto: activeContributor.coverPhoto,
            bio: activeContributor.bio, involvementLevel: activeContributor.involvementLevel,
            followerCount: activeContributor.followerCount, orgId: activeContributor.id,
          }
        : CITIZEN_BASE;
    // Overlay the signed-in person's real identity for citizen/admin (the
    // contributor view still draws org data from the contributor record until
    // that is wired in a later phase).
    const user = (realUser && role !== 'contributor')
      ? { ...baseUser,
          id: realUser.id || baseUser.id,
          name: realUser.name || baseUser.name,
          // Empty (not the demo stock face) when the real user has no avatar →
          // Avatar renders their initials. Demo mode keeps baseUser's stock photo.
          profilePhoto: realUser.avatarUrl || '',
          // Real bio (may be empty — honest), never the demo persona's bio.
          bio: myProfileMeta ? (myProfileMeta.bio || '') : '',
          coverPhoto: '' }
      : baseUser;

    // ── actions ─────────────────────────────────────────────────────
    // v1 self-serve go-live (V1_SCOPE.md, migration 164): no admin wait —
    // submitting IS approving. Mirrors createEvent/createPlace's
    // geocode-then-write shape (same geocodeAddress helper) and their
    // (form, done) signature so the wizard can show a submitting state
    // instead of navigating before the write actually lands.
    const submitApplication = useCallback((form, done) => {
      const finish = (ok) => { if (done) done(ok); };
      const app = {
        id: 'app-mine', name: form.orgName, photo: (realUser && realUser.avatarUrl) || '',
        bio: form.bio, category: form.category, weeklyEvents: 1, status: 'approved',
        submittedAt: today(), location: form.noFixedLocation ? '' : form.location,
        lat: form.noFixedLocation ? null : form.lat, lng: form.noFixedLocation ? null : form.lng,
        noFixedLocation: !!form.noFixedLocation,
        website: form.website, socials: form.socials || {}, applicantName: (realUser && realUser.name) || '', isMine: true,
      };
      if (!realUser) {
        setMyApplication(app);
        setApplications((prev) => [app, ...prev.filter((a) => a.id !== 'app-mine')]);
        toast("You're live! Set up your contributor profile.", 'green');
        go('onboarding');
        finish(true);
        return;
      }
      (async () => {
        try {
          // Prefer the location picker's own pin (user placed/confirmed it
          // directly on the map) over a blind re-geocode of the typed
          // address — MapTiler often can't resolve informal Pretoria
          // addresses, and the picker is the manual-correction path for
          // exactly that. Skip geocoding entirely for a "no fixed location"
          // contributor — there's no address to resolve, and the server
          // nulls physical_* regardless of what's sent here.
          const geo = form.noFixedLocation
            ? null
            : (typeof form.lat === 'number' && typeof form.lng === 'number')
              ? { lat: form.lat, lng: form.lng }
              : await geocodeAddress(form.location);
          const res = await authedFetch('/api/contributor/apply', {
            method: 'POST',
            body: JSON.stringify({
              display_name: form.orgName,
              contributor_category: form.category,
              bio: form.bio,
              no_fixed_location: !!form.noFixedLocation,
              physical_address: form.noFixedLocation ? null : form.location,
              physical_latitude: geo ? geo.lat : null,
              physical_longitude: geo ? geo.lng : null,
              website_url: form.website || null,
              // The applications table carries only the original four social
              // columns; the route reads exactly the keys it stores, so the
              // extra platforms in this payload are simply ignored there and
              // are captured on the profile itself during onboarding.
              ...contributorSocialPayload(form.socials || {}, 'create'),
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            // A 400 from this route is always a field-level message written
            // for the applicant (see /api/contributor/apply) — showing it
            // beats "please try again" when the fix is one field away.
            toast(body.error === 'already_pending' || body.error === 'already_approved'
              ? 'You already have a contributor application on file.'
              : (res.status === 400 && typeof body.error === 'string' && body.error)
                || 'Could not submit — please try again.', 'red');
            finish(false);
            return;
          }
          const approved = body.approved !== false;
          setMyApplication({ ...app, status: approved ? 'approved' : 'pending' });
          setApplications((prev) => [app, ...prev.filter((a) => a.id !== 'app-mine')]);
          toast(approved ? "You're live! Set up your contributor profile." : 'Application submitted — finishing setup shortly.', approved ? 'green' : 'gold');
          go('onboarding');
          finish(true);
        } catch (e) {
          console.warn('[apply] network error', e);
          toast('Could not submit — please check your connection and try again.', 'red');
          finish(false);
        }
      })();
    }, [realUser, toast, go]);

    const reviewApplication = useCallback((id, status, note) => {
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status, reviewNote: note || a.reviewNote, reviewedAt: today() } : a)));
      setMyApplication((m) => (m && m.id === id ? { ...m, status, reviewNote: note, reviewedAt: today() } : m));
      toast(status === 'approved' ? 'Application approved — contributor access granted.' : 'Application rejected.', status === 'approved' ? 'green' : 'red');
    }, [toast]);

    // Review a volunteer application; writes through to the volunteers API
    // (which notifies the applicant) for real contributors, with rollback.
    const reviewVolunteer = useCallback((id, status) => {
      const prevRow = volunteerApps.find((v) => v.id === id);
      setVolunteerApps((prev) => prev.map((v) => (v.id === id ? { ...v, status, reviewedAt: today() } : v)));
      toast(status === 'approved' ? 'Volunteer approved — they’ll be notified.' : 'Volunteer application declined.', status === 'approved' ? 'green' : 'gold');
      const slug = myContributor && myContributor.slug;
      if (!realUser || !isRealId(id) || !slug) return;
      (async () => {
        try {
          const res = await authedFetch('/api/contributor/' + slug + '/volunteers', {
            method: 'POST',
            body: JSON.stringify({ action: 'update_status', application_id: id, status }),
          });
          if (!res.ok) throw new Error('volunteer review ' + res.status);
        } catch (e) {
          if (prevRow) setVolunteerApps((prev) => prev.map((v) => (v.id === id ? prevRow : v)));
          toast('Could not save the review — please try again.', 'red');
        }
      })();
    }, [volunteerApps, myContributor, realUser, toast]);

    // Citizen applies to serve at an event/place. The handle segment is only
    // used by the API for the notification deep-link; the contributor is
    // resolved from the entity itself.
    const applyToVolunteer = useCallback((entityType, entityId, orgSlug) => {
      if (!realUser || !isRealId(entityId)) { toast('Volunteer application sent! 🙌', 'green'); return; }
      (async () => {
        try {
          const res = await authedFetch('/api/contributor/' + (orgSlug || 'apply') + '/volunteers', {
            method: 'POST',
            body: JSON.stringify({ action: 'apply', entity_type: entityType, entity_id: entityId }),
          });
          if (res.status === 409) { toast('You have already applied to serve here.', 'gold'); return; }
          const json = await res.json().catch(() => ({}));
          if (!res.ok) { toast(json.error || 'Could not send your application.', 'red'); return; }
          toast('Volunteer application sent! 🙌', 'green');
        } catch (e) { toast('Could not send your application.', 'red'); }
      })();
    }, [realUser, toast]);

    // Resolve a moderation report. UI statuses resolved/removed both persist
    // as 'actioned' (the notes carry the distinction); dismissed maps 1:1.
    const resolveReport = useCallback((id, status, resolution) => {
      const prevRow = reports.find((r) => r.id === id);
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status, resolution: resolution || r.resolution, reviewedAt: today() } : r)));
      toast(status === 'resolved' ? 'Report resolved.' : status === 'removed' ? 'Content removed.' : 'Report dismissed.', status === 'dismissed' ? 'gold' : 'green');
      if (!realUser || !isRealId(id)) return;
      (async () => {
        try {
          const res = await authedFetch('/api/admin/reports/' + id, {
            method: 'PATCH',
            body: JSON.stringify({ status: status === 'dismissed' ? 'dismissed' : 'actioned', resolution_notes: resolution || null }),
          });
          if (!res.ok) throw new Error('report patch ' + res.status);
        } catch (e) {
          if (prevRow) setReports((prev) => prev.map((r) => (r.id === id ? prevRow : r)));
          toast('Could not update the report — please try again.', 'red');
        }
      })();
    }, [reports, realUser, toast]);

    // Broadcast: optimistic local bubble; for a real contributor on a real
    // entity it writes through to the broadcasts API (which fans out
    // notifications + creates the 24h map bubble via DB trigger).
    const sendBroadcast = useCallback((kind, id, message) => {
      const setColl = kind === 'event' ? setEvents : setPlaces;
      setColl((prev) => prev.map((x) => (x.id === id ? { ...x, broadcast: { message, minsAgo: 0 } } : x)));
      const slug = myContributor && myContributor.slug;
      if (realUser && isRealId(id) && slug) {
        (async () => {
          try {
            const res = await authedFetch('/api/contributor/' + slug + '/broadcasts', {
              method: 'POST',
              body: JSON.stringify({ entity_type: kind, entity_id: id, body: message }),
            });
            if (!res.ok) throw new Error('broadcast ' + res.status);
            toast('Broadcast sent — bubble live on the map for 24h.', 'gold');
          } catch (e) {
            setColl((prev) => prev.map((x) => (x.id === id ? { ...x, broadcast: null } : x)));
            toast('Broadcast failed — please try again.', 'red');
          }
        })();
        return;
      }
      // Demo: keep the prototype's local notification for flavour.
      setNotifications((prev) => [{ id: uid('n'), type: 'broadcast', title: activeContributor.name + ' sent a broadcast', body: message, time: 'just now', read: false, photo: activeContributor.profilePhoto }, ...prev]);
      toast('Broadcast sent — bubble live on the map for 24h.', 'gold');
    }, [activeContributor, myContributor, realUser, toast]);

    // Create event: demo mode stays local; a real signed-in user writes the
    // row through the supabase client (RLS: created_by = auth.uid()). The pin
    // location comes from geocoding the address — no coordinates is still a
    // valid event (it lists, but can't sit on the map yet).
    const createEvent = useCallback((form, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser || !window.CC_SUPABASE) {
        const ev = {
          id: uid('e'), title: form.title, category: form.category, description: form.description,
          date: form.date, time: form.time, endTime: form.endTime, location: form.location, address: form.address,
          organizerName: activeContributor.name, organizerId: activeContributorId,
          isLive: false, isBusy: false, connectCount: 0, considerCount: 0,
          volunteeringEnabled: !!form.volunteeringEnabled,
          coverPhoto: form.coverPhoto || '',
          gallery: form.gallery || [], broadcast: null, website: form.website || activeContributor.website,
          socials: form.socials || {}, upcomingDates: form.upcomingDates || [], tags: form.tags || [],
          mapX: form.mapX || 48, mapY: form.mapY || 50,
        };
        setEvents((prev) => [ev, ...prev]);
        if (form.launchBroadcast) {
          ev.broadcast = { message: form.launchBroadcast, minsAgo: 0 };
          setNotifications((prev) => [{ id: uid('n'), type: 'broadcast', title: activeContributor.name + ' sent a broadcast', body: form.launchBroadcast, time: 'just now', read: false, photo: activeContributor.profilePhoto }, ...prev]);
        }
        toast('Event created — now live on the map!', 'green');
        finish(true);
        return;
      }
      (async () => {
        try {
          const start = form.date ? new Date(form.date + 'T' + (form.time || '09:00')) : null;
          if (!start || isNaN(start.getTime())) { toast('Please pick a date and start time.', 'red'); finish(false); return; }
          const end = form.endTime ? new Date(form.date + 'T' + form.endTime) : null;
          const geo = await geocodeAddress(form.address || form.location);
          const socials = form.socials || {};
          const row = {
            title: form.title,
            description: form.description || '',
            category: form.category || 'church-services',
            date: start.toISOString(),
            end_time: end && !isNaN(end.getTime()) ? end.toISOString() : null,
            location: [form.location, form.address].filter(Boolean).join(', '),
            created_by: realUser.id,
            image_url: form.coverPhoto || null,
            volunteer_openings: !!form.volunteeringEnabled,
            latitude: geo ? geo.lat : null,
            longitude: geo ? geo.lng : null,
            ...window.DATA.socialsToRow(socials, 'event'),
          };
          const { data, error } = await window.CC_SUPABASE.from('events').insert(row).select('*').single();
          if (error) throw error;
          setEvents((prev) => [adaptEvent(data), ...prev]);
          toast(geo ? 'Event published — now live on the map!' : 'Event published! We couldn’t place that address on the map — refine it later.', 'green');
          if (form.launchBroadcast && role === 'contributor') sendBroadcast('event', data.id, form.launchBroadcast);
          finish(true);
        } catch (e) {
          console.warn('[createEvent]', e);
          toast('Could not publish the event — please try again.', 'red');
          finish(false);
        }
      })();
    }, [activeContributor, activeContributorId, realUser, role, sendBroadcast, toast]);

    // Update event: same field mapping as createEvent, targeted with .eq('id').
    // RLS already grants UPDATE to the owner (or admin) — no server route needed.
    // Re-geocodes only if the location/address text actually changed, so a plain
    // "fix a typo in the description" edit doesn't cost a network round-trip.
    const updateEvent = useCallback((id, form, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser || !window.CC_SUPABASE) {
        setEvents((prev) => prev.map((e) => (e.id === id ? {
          ...e, title: form.title, category: form.category, description: form.description,
          date: form.date, time: form.time, endTime: form.endTime, location: form.location, address: form.address,
          coverPhoto: form.coverPhoto || e.coverPhoto, socials: form.socials || {},
        } : e)));
        toast('Event updated.', 'green');
        finish(true);
        return;
      }
      (async () => {
        try {
          const start = form.date ? new Date(form.date + 'T' + (form.time || '09:00')) : null;
          if (!start || isNaN(start.getTime())) { toast('Please pick a date and start time.', 'red'); finish(false); return; }
          const end = form.endTime ? new Date(form.date + 'T' + form.endTime) : null;
          const existing = eventRows.find((e) => e.id === id);
          const newLocation = [form.location, form.address].filter(Boolean).join(', ');
          const locationChanged = !existing || newLocation !== existing.location;
          const geo = locationChanged ? await geocodeAddress(form.address || form.location) : null;
          const socials = form.socials || {};
          const row = {
            title: form.title,
            description: form.description || '',
            category: form.category || 'church-services',
            date: start.toISOString(),
            end_time: end && !isNaN(end.getTime()) ? end.toISOString() : null,
            location: newLocation,
            image_url: form.coverPhoto || null,
            volunteer_openings: !!form.volunteeringEnabled,
            ...window.DATA.socialsToRow(socials, 'event'),
          };
          if (locationChanged) { row.latitude = geo ? geo.lat : null; row.longitude = geo ? geo.lng : null; }
          const { data, error } = await window.CC_SUPABASE.from('events').update(row).eq('id', id).select('*').single();
          if (error) throw error;
          setEvents((prev) => prev.map((e) => (e.id === id ? { ...adaptEvent(data), status: e.status } : e)));
          toast('Event updated.', 'green');
          finish(true);
        } catch (e) {
          console.warn('[updateEvent]', e);
          toast('Could not save changes — please try again.', 'red');
          finish(false);
        }
      })();
    }, [eventRows, realUser, toast]);

    // Cancel/restore: a status flip only, never a delete — a cancelled event
    // stays in the DB and remains directly viewable (RLS explicitly allows
    // status='cancelled' reads), it just drops off primary discovery surfaces.
    const setEventStatus = useCallback((id, status, done) => {
      const finish = (ok) => { if (done) done(ok); };
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
      if (!realUser || !window.CC_SUPABASE) { finish(true); return; }
      (async () => {
        try {
          const { error } = await window.CC_SUPABASE.from('events').update({ status }).eq('id', id);
          if (error) throw error;
          toast(status === 'cancelled' ? 'Event cancelled.' : 'Event restored.', 'gold');
          finish(true);
        } catch (e) {
          console.warn('[setEventStatus]', e);
          setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, status: status === 'cancelled' ? 'published' : 'cancelled' } : ev)));
          toast('Could not update the event — please try again.', 'red');
          finish(false);
        }
      })();
    }, [realUser, toast]);

    // Create place: places.latitude/longitude are NOT NULL, so a real place
    // needs a geocodable address — we refuse (with guidance) rather than
    // fabricate coordinates.
    const createPlace = useCallback((form, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser || !window.CC_SUPABASE) {
        const pl = {
          id: uid('p'), name: form.name, category: form.category, description: form.description,
          address: form.address, organizerName: activeContributor.name, organizerId: activeContributorId,
          coverPhoto: form.coverPhoto || '',
          gallery: form.gallery || [], openHours: form.openHours || '', website: form.website || activeContributor.website,
          volunteeringEnabled: !!form.volunteeringEnabled, followerCount: 0,
          mapX: form.mapX || 52, mapY: form.mapY || 46, associatedEventIds: [], socials: form.socials || {},
        };
        setPlaces((prev) => [pl, ...prev]);
        toast('Place added to the map!', 'green');
        finish(true);
        return;
      }
      (async () => {
        try {
          const geo = await geocodeAddress(form.address);
          if (!geo) { toast('We couldn’t find that address — add a suburb and city, then try again.', 'red'); finish(false); return; }
          const categoryId = await getCategoryId(form.category);
          const row = {
            name: form.name,
            description: form.description || '',
            address: form.address,
            category_id: categoryId,
            custom_category: categoryId ? null : (form.category || null),
            image_url: form.coverPhoto || null,
            latitude: geo.lat,
            longitude: geo.lng,
            created_by: realUser.id,
            volunteer_openings: !!form.volunteeringEnabled,
            ...window.DATA.socialsToRow(form.socials || {}, 'place'),
          };
          const { data, error } = await window.CC_SUPABASE.from('places').insert(row).select('*').single();
          if (error) throw error;
          // The insert returns a raw row (no category embed); resolve the slug locally.
          setPlaces((prev) => [{ ...adaptPlace(data), category: form.category || '' }, ...prev]);
          toast('Place published — now live on the map!', 'green');
          finish(true);
        } catch (e) {
          console.warn('[createPlace]', e);
          toast('Could not publish the place — please try again.', 'red');
          finish(false);
        }
      })();
    }, [activeContributor, activeContributorId, realUser, toast]);

    // Update place: same field mapping as createPlace. Re-geocodes only when
    // the address text actually changed. open_hours/status are new v1 columns
    // (migration 167 — supabase/migrations/167_place_status_open_hours_news_posts.sql).
    const updatePlace = useCallback((id, form, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser || !window.CC_SUPABASE) {
        setPlaces((prev) => prev.map((p) => (p.id === id ? {
          ...p, name: form.name, category: form.category, description: form.description,
          address: form.address, coverPhoto: form.coverPhoto || p.coverPhoto,
          openHours: form.openHours || '', socials: form.socials || {},
        } : p)));
        toast('Place updated.', 'green');
        finish(true);
        return;
      }
      (async () => {
        try {
          const existing = placeRows.find((p) => p.id === id);
          const addressChanged = !existing || form.address !== existing.address;
          const geo = addressChanged ? await geocodeAddress(form.address) : null;
          if (addressChanged && !geo) { toast('We couldn’t find that address — add a suburb and city, then try again.', 'red'); finish(false); return; }
          const categoryId = await getCategoryId(form.category);
          const row = {
            name: form.name,
            description: form.description || '',
            address: form.address,
            category_id: categoryId,
            custom_category: categoryId ? null : (form.category || null),
            image_url: form.coverPhoto || null,
            open_hours: form.openHours || null,
            volunteer_openings: !!form.volunteeringEnabled,
            ...window.DATA.socialsToRow(form.socials || {}, 'place'),
          };
          if (addressChanged) { row.latitude = geo.lat; row.longitude = geo.lng; }
          const { data, error } = await window.CC_SUPABASE.from('places').update(row).eq('id', id).select('*').single();
          if (error) throw error;
          setPlaces((prev) => prev.map((p) => (p.id === id ? { ...adaptPlace(data), category: form.category || p.category, status: p.status } : p)));
          toast('Place updated.', 'green');
          finish(true);
        } catch (e) {
          console.warn('[updatePlace]', e);
          toast('Could not save changes — please try again.', 'red');
          finish(false);
        }
      })();
    }, [placeRows, realUser, toast]);

    const setPlaceStatus = useCallback((id, status, done) => {
      const finish = (ok) => { if (done) done(ok); };
      setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
      if (!realUser || !window.CC_SUPABASE) { finish(true); return; }
      (async () => {
        try {
          const { error } = await window.CC_SUPABASE.from('places').update({ status }).eq('id', id);
          if (error) throw error;
          toast(status === 'cancelled' ? 'Place cancelled.' : 'Place restored.', 'gold');
          finish(true);
        } catch (e) {
          console.warn('[setPlaceStatus]', e);
          setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, status: status === 'cancelled' ? 'published' : 'cancelled' } : p)));
          toast('Could not update the place — please try again.', 'red');
          finish(false);
        }
      })();
    }, [realUser, toast]);

    // Onboarding: for a real (admin-approved) contributor this persists the
    // profile via /api/contributor/setup (+ the contributor-profile route for
    // logo/address/socials), then flips the in-app surface to their dashboard.
    const completeOnboarding = useCallback((form, done) => {
      const finish = (ok) => { if (done) done(ok); };
      const localOrg = {
        id: realUser ? realUser.id : uid('c'),
        name: form.name || (myApplication && myApplication.name) || 'My Ministry',
        role: 'contributor', kind: 'organization', slug: null,
        bio: form.bio, profilePhoto: form.profilePhoto || '', coverPhoto: form.coverPhoto || '',
        category: form.category, website: form.website, contactEmail: form.contactEmail || '',
        location: form.noFixedLocation ? '' : (form.location || ''), members: form.members || [], followerCount: 0,
        noFixedLocation: !!form.noFixedLocation,
        dominantNiche: (DATA.getItemCategory({ type: 'contributor', category: form.category }) || { name: 'Community' }).name,
        involvementLevel: 'Shepherd', collaborators: [], socials: form.socials || {}, isMine: true, verified: true,
      };
      if (!realUser) {
        // Demo mode still geocodes (same helper, same MapTiler key) so a
        // demo contributor shows up on the map exactly like a real one —
        // this is also what makes the flow deterministically e2e-testable
        // without a live Supabase session. Prefers the location picker's own
        // pin (see submitApplication) over a blind re-geocode. Skipped
        // entirely for a "no fixed location" contributor — no pin by design.
        (async () => {
          const geo = form.noFixedLocation
            ? null
            : (typeof form.lat === 'number' && typeof form.lng === 'number')
              ? { lat: form.lat, lng: form.lng }
              : await geocodeAddress(form.location);
          const org = { ...localOrg, lat: geo ? geo.lat : null, lng: geo ? geo.lng : null };
          setContributors((prev) => [...prev, org]);
          setMyContributor(org);
          setRole('contributor');
          toast('Welcome aboard! Your contributor profile is live.', 'green');
          go('dashboard');
          finish(true);
        })();
        return;
      }
      (async () => {
        try {
          const asUrl = (v) => (v && v.trim() ? (/^https?:\/\//i.test(v.trim()) ? v.trim() : 'https://' + v.trim()) : null);
          const setupRes = await authedFetch('/api/contributor/setup', {
            method: 'POST',
            body: JSON.stringify({
              display_name: form.name || 'My Ministry',
              contact_email: form.contactEmail || null,
              website_url: asUrl(form.website),
              bio: form.bio || null,
            }),
          });
          if (!setupRes.ok) {
            const body = await setupRes.json().catch(() => ({}));
            toast(body.error || 'Could not complete setup — please try again.', 'red');
            finish(false);
            return;
          }
          // Best-effort extras — profile route is additive and allowlisted.
          // Geocode (or use the location picker's own pin) so this step's
          // address doesn't leave physical_latitude/longitude stale against
          // whatever apply.jsx wrote earlier — the route has always accepted
          // these two fields, this call just never sent them before.
          const socials = form.socials || {};
          let onboardGeo = form.noFixedLocation
            ? null
            : (typeof form.lat === 'number' && typeof form.lng === 'number')
              ? { lat: form.lat, lng: form.lng }
              : null;
          if (!form.noFixedLocation && !onboardGeo && form.location) onboardGeo = await geocodeAddress(form.location);
          await authedFetch('/api/contributor/profile', {
            method: 'POST',
            body: JSON.stringify({
              bio: form.bio || undefined,
              website_url: asUrl(form.website) || undefined,
              contributor_no_fixed_location: !!form.noFixedLocation,
              physical_address: form.noFixedLocation ? null : (form.location || undefined),
              physical_latitude: form.noFixedLocation ? null : (onboardGeo ? onboardGeo.lat : undefined),
              physical_longitude: form.noFixedLocation ? null : (onboardGeo ? onboardGeo.lng : undefined),
              logo_url: form.profilePhoto && /^https:\/\//i.test(form.profilePhoto) ? form.profilePhoto : undefined,
              ...contributorSocialPayload(socials, 'create'),
              contributor_contact_email: form.contactEmail || undefined,
            }),
          }).catch(() => {});
          // Refresh identity from the DB (slug included) so the dashboard is real.
          const { data: prof } = await window.CC_SUPABASE
            .from('profiles')
            .select(CONTRIBUTOR_SELECT)
            .eq('id', realUser.id)
            .maybeSingle();
          const org = prof ? { ...adaptContributor(prof), isMine: true } : localOrg;
          setContributors((prev) => {
            const byId = new Map(prev.map((c) => [c.id, c]));
            byId.set(org.id, org);
            return [...byId.values()];
          });
          setMyContributor(org);
          setRole('contributor');
          toast('Welcome aboard! Your contributor profile is live.', 'green');
          go('dashboard');
          finish(true);
        } catch (e) {
          console.warn('[onboarding]', e);
          toast('Could not complete setup — please try again.', 'red');
          finish(false);
        }
      })();
    }, [myApplication, realUser, toast, go]);

    // Edit-later counterpart to completeOnboarding: /api/contributor/profile
    // already existed and already allowlists exactly these fields server-side
    // (bio, website, socials, address, logo, gallery) — it was just never
    // called again after the one-time onboarding wizard. Same route, reused.
    // Re-geocodes only when the address text actually changed (same guard
    // shape as updateEvent/updatePlace) — otherwise an address edit here
    // would silently leave the map pin at its old location.
    const updateContributorProfile = useCallback((fields, done) => {
      const finish = (ok) => { if (done) done(ok); };
      const asUrl = (v) => (v && v.trim() ? (/^https?:\/\//i.test(v.trim()) ? v.trim() : 'https://' + v.trim()) : null);
      const locationChanged = fields.location !== undefined && fields.location !== activeContributor.location;
      const payload = {
        bio: fields.bio ?? undefined,
        website_url: fields.website !== undefined ? asUrl(fields.website) : undefined,
        contributor_no_fixed_location: fields.noFixedLocation !== undefined ? !!fields.noFixedLocation : undefined,
        physical_address: fields.noFixedLocation ? null : (fields.location ?? undefined),
        logo_url: fields.profilePhoto && /^https:\/\//i.test(fields.profilePhoto) ? fields.profilePhoto : undefined,
        ...(fields.socials ? contributorSocialPayload(fields.socials, 'update') : {}),
        gallery_urls: fields.gallery ?? undefined,
        contributor_contact_email: fields.contactEmail !== undefined ? (fields.contactEmail || null) : undefined,
      };
      if (!realUser) {
        setMyContributor((prev) => prev ? { ...prev, bio: fields.bio, website: fields.website, contactEmail: fields.contactEmail !== undefined ? fields.contactEmail : prev.contactEmail, location: fields.noFixedLocation ? '' : fields.location, noFixedLocation: !!fields.noFixedLocation, profilePhoto: fields.profilePhoto || prev.profilePhoto, socials: fields.socials || prev.socials, gallery: fields.gallery || prev.gallery } : prev);
        toast('Profile updated.', 'green');
        finish(true);
        return;
      }
      (async () => {
        try {
          if (!fields.noFixedLocation && locationChanged) {
            const geo = await geocodeAddress(fields.location);
            payload.physical_latitude = geo ? geo.lat : null;
            payload.physical_longitude = geo ? geo.lng : null;
          } else if (fields.noFixedLocation) {
            payload.physical_latitude = null;
            payload.physical_longitude = null;
          }
          const res = await authedFetch('/api/contributor/profile', { method: 'POST', body: JSON.stringify(payload) });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            toast(body.error || 'Could not save your profile — please try again.', 'red');
            finish(false);
            return;
          }
          const { data: prof } = await window.CC_SUPABASE
            .from('profiles')
            .select(CONTRIBUTOR_SELECT)
            .eq('id', realUser.id)
            .maybeSingle();
          if (prof) {
            const org = { ...adaptContributor(prof), isMine: true };
            setContributors((prev) => { const byId = new Map(prev.map((c) => [c.id, c])); byId.set(org.id, org); return [...byId.values()]; });
            setMyContributor(org);
          }
          toast('Profile updated.', 'green');
          finish(true);
        } catch (e) {
          console.warn('[updateContributorProfile]', e);
          toast('Could not save your profile — please try again.', 'red');
          finish(false);
        }
      })();
    }, [activeContributor, realUser, toast]);

    // ── Cover photos ── consumes the already-built, tested multi-photo store
    // (/api/contributor/cover-photos: POST upload+append, PATCH reorder/
    // caption, DELETE by index; up to 5, first = the public hero image). This
    // had no dashboard UI at all until now.
    const applyCoverPhotos = useCallback((photos) => {
      const patch = { coverPhotos: photos, coverPhoto: (photos[0] && photos[0].url) || '' };
      setMyContributor((prev) => (prev ? { ...prev, ...patch } : prev));
      setContributors((prev) => prev.map((c) => (c.id === activeContributorId ? { ...c, ...patch } : c)));
    }, [activeContributorId]);

    const addCoverPhoto = useCallback((file, caption, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser) { toast('Sign in to upload a cover photo.', 'gold'); finish(false); return; }
      (async () => {
        try {
          const photos = await uploadImage(file, { scope: 'contributor-cover', caption });
          applyCoverPhotos(photos);
          toast('Cover photo added.', 'green');
          finish(true);
        } catch (e) {
          toast((e && e.message) || 'Could not upload your cover photo.', 'red');
          finish(false);
        }
      })();
    }, [realUser, toast, applyCoverPhotos]);

    const deleteCoverPhoto = useCallback((index, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser) { finish(false); return; }
      (async () => {
        try {
          const res = await authedFetch('/api/contributor/cover-photos?index=' + index, { method: 'DELETE' });
          if (!res.ok) { toast('Could not remove that photo — please try again.', 'red'); finish(false); return; }
          const { photos } = await res.json();
          applyCoverPhotos(photos);
          finish(true);
        } catch (e) {
          toast('Could not remove that photo — please try again.', 'red');
          finish(false);
        }
      })();
    }, [realUser, toast, applyCoverPhotos]);

    const updateCoverPhotoCaption = useCallback((index, caption, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser) { finish(false); return; }
      const current = (activeContributor.coverPhotos || []).map((p, i) => (i === index ? { ...p, caption } : p));
      (async () => {
        try {
          const res = await authedFetch('/api/contributor/cover-photos', { method: 'PATCH', body: JSON.stringify({ photos: current }) });
          if (!res.ok) { toast('Could not save that caption — please try again.', 'red'); finish(false); return; }
          const { photos } = await res.json();
          applyCoverPhotos(photos);
          finish(true);
        } catch (e) {
          toast('Could not save that caption — please try again.', 'red');
          finish(false);
        }
      })();
    }, [realUser, toast, applyCoverPhotos, activeContributor]);

    // ── News posts ──  A contributor-authored update feed shown on their own
    // listing page — separate from the ephemeral 24h Broadcast map bubble.
    // Requires migration 167 (supabase/migrations/167_place_status_open_hours_news_posts.sql).
    const createNewsPost = useCallback((form, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser || !window.CC_SUPABASE) {
        setNewsPosts((prev) => [{ id: uid('n'), contributorId: activeContributorId, title: form.title, body: form.body, image: form.image || '', date: form.date || today(), createdAt: new Date().toISOString() }, ...prev]);
        toast('News post published.', 'green');
        finish(true);
        return;
      }
      (async () => {
        try {
          const row = { contributor_id: realUser.id, title: form.title, body: form.body, image_url: form.image || null, post_date: form.date || today() };
          const { data, error } = await window.CC_SUPABASE.from('news_posts').insert(row).select('*').single();
          if (error) throw error;
          setNewsPosts((prev) => [adaptNewsPost(data), ...prev]);
          toast('News post published.', 'green');
          finish(true);
        } catch (e) {
          console.warn('[createNewsPost]', e);
          toast('Could not publish that post — please try again.', 'red');
          finish(false);
        }
      })();
    }, [activeContributorId, realUser, toast]);

    const updateNewsPost = useCallback((id, form, done) => {
      const finish = (ok) => { if (done) done(ok); };
      setNewsPosts((prev) => prev.map((n) => (n.id === id ? { ...n, title: form.title, body: form.body, image: form.image || n.image, date: form.date || n.date } : n)));
      if (!realUser || !window.CC_SUPABASE) { finish(true); return; }
      (async () => {
        try {
          const row = { title: form.title, body: form.body, image_url: form.image || null, post_date: form.date || today() };
          const { error } = await window.CC_SUPABASE.from('news_posts').update(row).eq('id', id);
          if (error) throw error;
          toast('News post updated.', 'green');
          finish(true);
        } catch (e) {
          console.warn('[updateNewsPost]', e);
          toast('Could not save changes — please try again.', 'red');
          finish(false);
        }
      })();
    }, [realUser, toast]);

    const deleteNewsPost = useCallback((id, done) => {
      const finish = (ok) => { if (done) done(ok); };
      const prevPosts = newsPosts;
      setNewsPosts((prev) => prev.filter((n) => n.id !== id));
      if (!realUser || !window.CC_SUPABASE) { finish(true); return; }
      (async () => {
        try {
          const { error } = await window.CC_SUPABASE.from('news_posts').delete().eq('id', id);
          if (error) throw error;
          toast('News post removed.', 'gold');
          finish(true);
        } catch (e) {
          console.warn('[deleteNewsPost]', e);
          setNewsPosts(prevPosts);
          toast('Could not remove that post — please try again.', 'red');
          finish(false);
        }
      })();
    }, [newsPosts, realUser, toast]);

    // Send: optimistic append, then write through for real conversations. The
    // temp id is swapped for the DB id on success so realtime dedup works.
    const sendMessage = useCallback((convId, text) => {
      const stamp = new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
      const tempId = uid('m');
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, { id: tempId, from: 'me', text, time: stamp, date: 'Today' }], lastMessage: text, lastTime: 'now', unread: 0 } : c)));
      if (!realUser || !isRealId(convId)) return;
      (async () => {
        try {
          const res = await authedFetch('/api/conversations/' + convId + '/messages', { method: 'POST', body: JSON.stringify({ body: text }) });
          if (!res.ok) throw new Error('send failed');
          const json = await res.json().catch(() => ({}));
          if (json.message && json.message.id) {
            setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: c.messages.map((m) => (m.id === tempId ? { ...m, id: json.message.id } : m)) } : c)));
          }
        } catch (e) {
          setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)));
          toast('Message not sent — please try again.', 'red');
        }
      })();
    }, [realUser, toast]);

    // Open: zero the unread badge, mark read server-side, and (re)load the
    // thread. Mock conversations keep their local messages untouched.
    const openConversation = useCallback((convId) => {
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)));
      if (!realUser || !isRealId(convId)) return;
      authedFetch('/api/conversations/' + convId + '/read', { method: 'PATCH' }).catch(() => {});
      (async () => {
        try {
          const res = await authedFetch('/api/conversations/' + convId + '/messages?limit=100');
          if (!res.ok) return;
          const json = await res.json();
          const msgs = (json.messages || []).map((m) => adaptMessage(m, realUser.id));
          setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: msgs, messagesLoaded: true } : c)));
        } catch (e) { /* keep whatever is shown — thread load is best-effort */ }
      })();
    }, [realUser]);

    const acceptRequest = useCallback((convId) => {
      if (!realUser || !isRealId(convId)) return;
      (async () => {
        try {
          const res = await authedFetch('/api/conversations/' + convId, { method: 'PATCH', body: JSON.stringify({ action: 'accept' }) });
          if (!res.ok) { toast('Could not accept request.', 'red'); return; }
          setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, status: 'active' } : c)));
        } catch (e) { toast('Could not accept request.', 'red'); }
      })();
    }, [realUser, toast]);

    const rejectRequest = useCallback((convId) => {
      if (!realUser || !isRealId(convId)) return;
      (async () => {
        try {
          const res = await authedFetch('/api/conversations/' + convId, { method: 'PATCH', body: JSON.stringify({ action: 'reject' }) });
          if (!res.ok) { toast('Could not decline request.', 'red'); return; }
          setConversations((prev) => prev.filter((c) => c.id !== convId));
          go('messages');
        } catch (e) { toast('Could not decline request.', 'red'); }
      })();
    }, [realUser, toast, go]);

    const muteConversation = useCallback((convId) => {
      if (!realUser || !isRealId(convId)) return;
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, muted: true } : c)));
      authedFetch('/api/conversations/' + convId, { method: 'PATCH', body: JSON.stringify({ action: 'mute' }) })
        .catch(() => {
          setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, muted: false } : c)));
          toast('Could not mute conversation.', 'red');
        });
    }, [realUser, toast]);

    const unmuteConversation = useCallback((convId) => {
      if (!realUser || !isRealId(convId)) return;
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, muted: false } : c)));
      authedFetch('/api/conversations/' + convId, { method: 'PATCH', body: JSON.stringify({ action: 'unmute' }) })
        .catch(() => {
          setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, muted: true } : c)));
          toast('Could not unmute conversation.', 'red');
        });
    }, [realUser, toast]);

    const blockUser = useCallback((blockedId, convId) => {
      if (!realUser || !isRealId(blockedId)) return;
      (async () => {
        try {
          const res = await authedFetch('/api/blocks', { method: 'POST', body: JSON.stringify({ blocked_id: blockedId }) });
          if (!res.ok) { const j = await res.json().catch(() => ({})); toast(j.error || 'Could not block user.', 'red'); return; }
          if (convId) setConversations((prev) => prev.filter((c) => c.id !== convId));
          go('messages');
          toast('User blocked.', 'green');
        } catch (e) { toast('Could not block user.', 'red'); }
      })();
    }, [realUser, go, toast]);

    // Start (or resume) a DM. For a real signed-in user with a real recipient
    // profile UUID this creates/fetches the conversation server-side (block +
    // permission rules enforced by the API); otherwise it stays a local mock.
    const startConversationWith = useCallback((name, photo, isOrg, recipientId) => {
      if (realUser && recipientId && isRealId(recipientId)) {
        if (recipientId === realUser.id) { toast('That’s your own profile — no need to message yourself.', 'gold'); return; }
        const existing = conversations.find((c) => c.participantId === recipientId);
        if (existing) { go('messages', { convId: existing.id }); return; }
        (async () => {
          try {
            const res = await authedFetch('/api/conversations', { method: 'POST', body: JSON.stringify({ recipient_id: recipientId }) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { toast(json.error || 'Could not start the conversation.', 'red'); return; }
            const convId = json.conversation_id;
            setConversations((prev) => (prev.some((c) => c.id === convId) ? prev : [{
              id: convId, isOrg: !!isOrg, participantId: recipientId, participantName: name,
              participantPhoto: photo || '', lastMessage: 'Start the conversation…', lastTime: 'now',
              unread: 0, status: 'active', messages: [], messagesLoaded: false,
            }, ...prev]));
            go('messages', { convId });
          } catch (e) { toast('Could not start the conversation.', 'red'); }
        })();
        return;
      }
      const existing = conversations.find((c) => c.participantName === name);
      if (existing) { go('messages', { convId: existing.id }); return; }
      const id = uid('conv');
      setConversations((prev) => [{ id, isOrg: !!isOrg, participantName: name, participantPhoto: photo, lastMessage: 'Start the conversation…', lastTime: 'now', unread: 0, messages: [] }, ...prev]);
      go('messages', { convId: id });
    }, [conversations, realUser, go, toast]);

    // Connect (attending) and Consider (considering) are two states of ONE rsvps
    // row, so they're mutually exclusive. Each toggle updates the UI optimistically,
    // then (for a real signed-in user on a real event) writes through to the API
    // and rolls back on failure. The backend RPCs only add/remove their own state
    // (safe_rsvp 409s if any row exists; toggle_consider noops on an attending row),
    // so a state transition clears the other side first — clearing 'considering' via
    // the consider endpoint (not rsvp DELETE) so we don't log a false cancellation.
    const toggleConnect = useCallback((eventId) => {
      const wasConnected = connected.has(eventId);
      const wasConsidering = considering.has(eventId);
      setConnected((prev) => { const n = new Set(prev); wasConnected ? n.delete(eventId) : n.add(eventId); return n; });
      if (!wasConnected && wasConsidering) setConsidering((prev) => { const n = new Set(prev); n.delete(eventId); return n; });

      if (!realUser || !isRealId(eventId)) return; // demo / mock event → local only

      (async () => {
        try {
          if (wasConnected) {
            const res = await authedFetch('/api/rsvp', { method: 'DELETE', body: JSON.stringify({ event_id: eventId }) });
            if (!res.ok) throw new Error('rsvp delete');
          } else {
            if (wasConsidering) {
              const c = await authedFetch('/api/consider', { method: 'POST', body: JSON.stringify({ event_id: eventId }) });
              if (!c.ok) throw new Error('clear considering');
            }
            const res = await authedFetch('/api/rsvp', { method: 'POST', body: JSON.stringify({ event_id: eventId }) });
            if (!res.ok) throw new Error('rsvp post');
          }
        } catch (e) {
          setConnected((prev) => { const n = new Set(prev); wasConnected ? n.add(eventId) : n.delete(eventId); return n; });
          if (!wasConnected && wasConsidering) setConsidering((prev) => { const n = new Set(prev); n.add(eventId); return n; });
          toast('Could not save — please try again.', 'red');
        }
      })();
    }, [connected, considering, realUser, toast]);

    const toggleConsider = useCallback((eventId) => {
      const wasConnected = connected.has(eventId);
      const wasConsidering = considering.has(eventId);
      setConsidering((prev) => { const n = new Set(prev); wasConsidering ? n.delete(eventId) : n.add(eventId); return n; });
      if (!wasConsidering && wasConnected) setConnected((prev) => { const n = new Set(prev); n.delete(eventId); return n; });

      if (!realUser || !isRealId(eventId)) return;

      (async () => {
        try {
          if (wasConsidering) {
            const res = await authedFetch('/api/consider', { method: 'POST', body: JSON.stringify({ event_id: eventId }) });
            if (!res.ok) throw new Error('consider remove');
          } else {
            if (wasConnected) {
              const d = await authedFetch('/api/rsvp', { method: 'DELETE', body: JSON.stringify({ event_id: eventId }) });
              if (!d.ok) throw new Error('clear attending');
            }
            const res = await authedFetch('/api/consider', { method: 'POST', body: JSON.stringify({ event_id: eventId }) });
            if (!res.ok) throw new Error('consider add');
          }
        } catch (e) {
          setConsidering((prev) => { const n = new Set(prev); wasConsidering ? n.add(eventId) : n.delete(eventId); return n; });
          if (!wasConsidering && wasConnected) setConnected((prev) => { const n = new Set(prev); n.add(eventId); return n; });
          toast('Could not save — please try again.', 'red');
        }
      })();
    }, [connected, considering, realUser, toast]);

    const toggleFollow = useCallback((orgId, name) => {
      const was = followedOrgs.has(orgId);
      setFollowedOrgs((prev) => { const n = new Set(prev); was ? n.delete(orgId) : n.add(orgId); return n; });
      toast(was ? ('Unfollowed' + (name ? ' ' + name : '')) : ('Now following' + (name ? ' ' + name : '')), 'gold');
      if (!realUser || !isRealId(orgId)) return;
      (async () => {
        try {
          const res = await authedFetch('/api/follow', { method: was ? 'DELETE' : 'POST', body: JSON.stringify({ followee_id: orgId }) });
          if (!res.ok && res.status !== 409) throw new Error('follow'); // 409 = already following ≈ success
        } catch (e) {
          setFollowedOrgs((prev) => { const n = new Set(prev); was ? n.add(orgId) : n.delete(orgId); return n; });
          toast('Could not save — please try again.', 'red');
        }
      })();
    }, [followedOrgs, realUser, toast]);

    const togglePlaceFollow = useCallback((placeId, name) => {
      const was = followedPlaces.has(placeId);
      setFollowedPlaces((prev) => { const n = new Set(prev); was ? n.delete(placeId) : n.add(placeId); return n; });
      toast(was ? ('Unfollowed' + (name ? ' ' + name : '')) : ('Now following' + (name ? ' ' + name : '')), 'gold');
      if (!realUser || !isRealId(placeId)) return; // mock places stay local until real places land
      (async () => {
        try {
          const res = await authedFetch('/api/place-follow', { method: was ? 'DELETE' : 'POST', body: JSON.stringify({ place_id: placeId }) });
          if (!res.ok && res.status !== 409) throw new Error('place follow');
        } catch (e) {
          setFollowedPlaces((prev) => { const n = new Set(prev); was ? n.add(placeId) : n.delete(placeId); return n; });
          toast('Could not save — please try again.', 'red');
        }
      })();
    }, [followedPlaces, realUser, toast]);

    // Dismiss a map broadcast bubble for this user only (per-user, ~24h).
    const dismissBubble = useCallback((bubbleId, eventId) => {
      const target = events.find((e) => e.id === eventId);
      const prevBroadcast = target ? target.broadcast : null;
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, broadcast: null } : e)));
      if (!realUser || !isRealId(bubbleId)) return;
      (async () => {
        try {
          const res = await authedFetch('/api/map/bubbles/' + bubbleId + '/dismiss', { method: 'POST' });
          if (!res.ok) throw new Error('dismiss');
        } catch (e) {
          setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, broadcast: prevBroadcast } : e)));
          toast('Could not dismiss — please try again.', 'red');
        }
      })();
    }, [events, realUser, toast]);

    // ── Vision: deduplicated event impression tracking ────────────────
    //  Calls record_event_impression() RPC (SECURITY DEFINER) which inserts
    //  into event_impressions (deduped by PK) and increments impression_count
    //  only on the first view. Fire-and-forget — no UI effect.
    const trackImpression = useCallback((eventId) => {
      const sb = window.CC_SUPABASE;
      if (!sb || !realUser || !isRealId(eventId)) return;
      sb.rpc('record_event_impression', { p_user_id: realUser.id, p_event_id: eventId })
        .then(({ error }) => { if (error) console.warn('[trackImpression]', error.message); });
    }, [realUser]);

    // ── Kingdom Projects / Impact Ideas ───────────────────────────────
    //  Read path: anon-callable get_community_ideas RPC (controlled fields).
    //  Replace the demo seeds whenever the RPC answers (even with []) so a
    //  reachable backend always shows the REAL board, never mock ideas.
    const fetchIdeas = useCallback(async () => {
      const sb = window.CC_SUPABASE;
      if (!sb) return;
      try {
        const { data, error } = await sb.rpc('get_community_ideas');
        if (!error && Array.isArray(data)) setIdeas(data.map(adaptIdea));
      } catch (e) { /* fail open — keep current list */ }
    }, []);

    // Toggle a vote ("Collaborate") on an idea. Real ideas require a real
    // signed-in session (the RPC is authenticated-only); demo/mock ideas
    // toggle locally so the prototype experience still works offline.
    const toggleIdeaVote = useCallback((ideaId) => {
      const idea = ideas.find((i) => i.id === ideaId);
      if (!idea) return;
      if (!isRealId(ideaId)) {
        setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, votedByMe: !i.votedByMe, votes: i.votes + (i.votedByMe ? -1 : 1) } : i)));
        return;
      }
      if (!realUser) { toast('Sign in to vote on ideas.', 'gold'); return; }
      const was = idea.votedByMe;
      setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, votedByMe: !was, votes: i.votes + (was ? -1 : 1) } : i)));
      (async () => {
        try {
          const { data, error } = await window.CC_SUPABASE.rpc('vote_on_idea', { p_idea_id: ideaId });
          if (error) throw error;
          // Reconcile with the authoritative count from the RPC.
          setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, votedByMe: !!data.voted, votes: data.vote_count } : i)));
          if (data.action === 'added' && data.threshold_reached) {
            toast('This idea has reached its vote goal! 🎉', 'green');
          }
        } catch (e) {
          setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, votedByMe: was, votes: i.votes + (was ? 1 : -1) } : i)));
          toast('Could not save your vote — please try again.', 'red');
        }
      })();
    }, [ideas, realUser, toast]);

    // Submit a new Impact Idea. Real users write through (then re-sync the
    // board); demo users get a local-only idea so the flow stays explorable.
    const submitIdea = useCallback((form, done) => {
      if (!realUser) {
        const local = {
          id: uid('idea'), title: form.title, description: form.description, category: form.category || '',
          votes: 0, threshold: form.voteThreshold || 50, status: 'voting', tier: form.tier || 'community',
          tierLabel: form.tierLabel || '', votedByMe: false, authorName: user.name, authorPhoto: user.profilePhoto,
          collaborators: null, createdAt: today(), lat: null, lng: null,
        };
        setIdeas((prev) => [local, ...prev]);
        toast('Idea posted to the board (demo) — sign in to make it real.', 'gold');
        if (done) done(true);
        return;
      }
      (async () => {
        try {
          const res = await authedFetch('/api/suggestions', {
            method: 'POST',
            body: JSON.stringify({
              title: form.title,
              body: form.description,
              page_url: window.location.origin + '/community',
              tier: form.tier,
              vote_threshold: form.voteThreshold,
              category: form.category || undefined,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) { toast(json.error || 'Could not post your idea.', 'red'); if (done) done(false); return; }
          toast('Idea posted to the board! 💡', 'green');
          fetchIdeas();
          if (done) done(true);
        } catch (e) {
          toast('Could not post your idea — please try again.', 'red');
          if (done) done(false);
        }
      })();
    }, [realUser, user, toast, fetchIdeas]);

    // Lead schedules the kickoff (founder decision: NO placeholder dates —
    // the event is born only when the lead picks a real date). The RPC creates
    // the event at the idea's location, auto-RSVPs every voter and notifies them.
    const scheduleKingdomProject = useCallback((ideaId, dateIso, endIso, location, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser || !isRealId(ideaId) || !window.CC_SUPABASE) {
        toast('Sign in to schedule this project.', 'gold');
        finish(false);
        return;
      }
      (async () => {
        try {
          const { error } = await window.CC_SUPABASE.rpc('schedule_kingdom_project', {
            p_idea_id: ideaId, p_date: dateIso, p_end: endIso || null, p_location: location || null,
          });
          if (error) throw error;
          toast('Kickoff scheduled — all voters are connected automatically! 🗓', 'green');
          fetchIdeas();
          finish(true);
        } catch (e) {
          toast((e && e.message) || 'Could not schedule — please try again.', 'red');
          finish(false);
        }
      })();
    }, [realUser, toast, fetchIdeas]);

    // Admin confirms an In Process project (suggestions_update_admin RLS).
    const confirmIdea = useCallback((ideaId) => {
      if (!realUser || !isRealId(ideaId) || !window.CC_SUPABASE) {
        setIdeas((prev) => prev.map((i) => (i.id === ideaId ? { ...i, status: 'confirmed' } : i)));
        toast('Project confirmed. 🎉', 'green');
        return;
      }
      (async () => {
        try {
          const { error } = await window.CC_SUPABASE.from('suggestions').update({ idea_status: 'confirmed' }).eq('id', ideaId);
          if (error) throw error;
          toast('Project confirmed. 🎉', 'green');
          fetchIdeas();
        } catch (e) { toast('Could not confirm — please try again.', 'red'); }
      })();
    }, [realUser, toast, fetchIdeas]);

    const markNotifsRead = useCallback(() => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      if (!realUser) return;
      authedFetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({ all: true }) }).catch(() => {});
    }, [realUser]);

    // Mark ONE notification read (row tap), then deep-link via the caller.
    const readNotification = useCallback((id) => {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      if (!realUser || !isRealId(id)) return;
      authedFetch('/api/notifications', { method: 'PATCH', body: JSON.stringify({ id }) }).catch(() => {});
    }, [realUser]);

    const assistLoginAs = useCallback((cid) => {
      const c = contributors.find((x) => x.id === cid);
      if (!c) return;
      setMyContributor(c);
      setAssistMode(true);
      setRole('contributor');
      go('dashboard');
      toast('Assist mode — you are now viewing as ' + c.name, 'gold');
    }, [contributors, go, toast]);

    const exitAssist = useCallback(() => {
      setAssistMode(false);
      setMyContributor(null);
      setRole('admin');
      go('admin');
      toast('Returned to your admin account.', 'gold');
    }, [go, toast]);

    // ── auth actions ────────────────────────────────────────────────
    //  In production these are backed by Supabase Google OAuth (see
    //  supabase-auth.js). Here they set local session state.
    const signIn = useCallback((intent) => {
      // intent: 'citizen' (default) | 'contributor'
      // Real path: Google OAuth via Supabase. This navigates away to Google
      // and returns to the app; the bootstrap effect below resolves the
      // session + role (from profiles.role) on return. Contributor access is
      // still only granted after apply -> admin-approval -> onboarding.
      if (window.CC_AUTH) {
        // Returned so callers (e.g. the landing screen's button) can reset
        // their own loading state in a .finally() \u2014 this never rejects, it
        // always resolves once the redirect attempt is settled either way.
        stashReturnPath(); // Google returns to the site root; remember the screen
        return window.CC_AUTH.signInWithGoogle(intent).catch((e) => {
          console.error('[signIn]', e);
          toast('Sign-in failed \u2014 please try again.', 'red');
        });
      }
      // No Supabase configured \u2192 we CANNOT authenticate a real person. Never
      // fake a session (that previously dropped users into a fictitious persona).
      // Fail honestly so a misconfigured deploy is obvious and fixable.
      console.error('[signIn] CC_AUTH unavailable \u2014 Supabase env not configured (config.js).');
      toast('Sign-in is temporarily unavailable. Please try again shortly.', 'red');
      return Promise.resolve();
    }, [toast]);

    // Email-code sign-in. The landing screen maps a rejection to a plain-language
    // message, so these just hand the promise through. Success needs no follow-up
    // here: supabase-js fires SIGNED_IN and the bootstrap effect below resolves
    // the profile + role (and an owner's listing landing), exactly as for Google.
    const sendEmailCode = useCallback((email) => {
      if (!window.CC_AUTH) return Promise.reject(new Error('Sign-in is not configured.'));
      stashReturnPath(); // the emailed link (a fallback to the code) returns to the site root
      return window.CC_AUTH.sendEmailCode(email);
    }, []);
    const verifyEmailCode = useCallback((email, token) => (
      window.CC_AUTH ? window.CC_AUTH.verifyEmailCode(email, token) : Promise.reject(new Error('Sign-in is not configured.'))
    ), []);

    const signOut = useCallback(() => {
      if (window.CC_AUTH) { window.CC_AUTH.signOut().catch(() => {}); }
      setRealUser(null);
      setAuthed(false);
      setGuestMode(false);
      setRole('citizen');
      setMyContributor(null);
      setMyApplication(null);
      setAssistMode(false);
      resetNav('home');
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
      try { sessionStorage.removeItem(GUEST_KEY); } catch (e) {}
      try { sessionStorage.removeItem(RETURN_KEY); } catch (e) {}
    }, [resetNav]);

    // ── real Supabase session bootstrap (no-op in demo mode) ──
    //  Source of truth when CC_AUTH is present: resolves the session + role on
    //  load and on every auth change (incl. the OAuth redirect return).
    useEffect(() => {
      if (!window.CC_AUTH) return;
      let active = true;
      // Every screen has a real URL, so a deep link (/dashboard/events, /admin, ...)
      // has already opened its screen (the nav state starts from the address bar).
      // Once the session and role resolve, settleRoute() checks that the person may
      // be there: a Contributor stays on their Dashboard, anyone else is nudged to
      // apply. It runs once per URL-originated screen (gatePending), so a later auth
      // event (a token refresh) never yanks the person back.
      // Owners of a listing made FOR them (Google Form intake, or admin
      // Create) land on their own dashboard the first time they sign in —
      // once per browser session, best-effort (the account menu's "Claim a
      // Contributor listing" stays as the manual fallback):
      //  (a) Supabase linked their same-email Google sign-in to the listing
      //      account, so they ARE the contributor: stamp the claim
      //      (mark_own_listing_claimed, mig 173 — a no-op for anyone else).
      //  (b) a separate citizen account with the listing's email: claim it
      //      (copies the listing onto this account), then reload into the
      //      dashboard so the new role is picked up everywhere.
      let landingTried = false;
      const landOwnListing = async (s) => {
        if (landingTried) return;
        landingTried = true;
        const key = 'cc_listing_landing_v1:' + s.user.id;
        try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) { /* still try once */ }
        try {
          if (s.role === 'contributor') {
            const { data } = await window.CC_AUTH.supabase.rpc('mark_own_listing_claimed');
            if (active && data && data.success) {
              resetNav('dashboard');
              toast('Welcome to Citizens Connect! Your listing is live — manage it here.', 'green');
            }
          } else if (s.role === 'citizen' && s.contributorStatus === 'not_applied') {
            const res = await authedFetch('/api/contributor/claim', { method: 'POST' });
            // A full load, on purpose: the claim just changed this account's role in the
            // database, and the whole app (role, listing, menus) re-reads it on a fresh load.
            if (active && res.ok) window.location.href = '/dashboard';
          }
        } catch (e) { /* best-effort */ }
      };
      const apply = async () => {
        try {
          const s = await window.CC_AUTH.loadSession();
          if (!active) return;
          if (s) {
            setRealUser({ id: s.user.id, name: s.name, avatarUrl: s.avatarUrl, email: s.user.email, nameIsFallback: !!s.nameIsFallback });
            setAuthed(true);
            setRole(s.role || 'citizen');
            if (s.routeToApply) { window.CC_AUTH.clearPendingIntent(); resetNav('apply'); }
            else {
              restoreReturnPath();
              settleRoute({ authed: true, role: s.role || 'citizen' });
            }
            landOwnListing(s);
          } else {
            setRealUser(null);
            setAuthed(false);
          }
        } finally {
          // Resolved either way (signed in, signed out, or loadSession threw), so
          // the loading splash never outlives the first attempt.
          setAuthResolved(true);
        }
      };
      apply();
      // Safety net: if the session lookup hangs (offline, slow network), drop the
      // splash after 8 s and show the landing rather than spinning forever.
      const splashTimer = setTimeout(() => setAuthResolved(true), 8000);
      const sub = window.CC_AUTH.onAuthChange((event) => {
        if (event === 'SIGNED_OUT') { setRealUser(null); setAuthed(false); setRole('citizen'); }
        else { apply(); }
      });
      return () => {
        active = false;
        clearTimeout(splashTimer);
        if (sub && sub.data && sub.data.subscription) sub.data.subscription.unsubscribe();
      };
    }, []);

    useEffect(() => {
      try {
        if (authed) localStorage.setItem(SESSION_KEY, JSON.stringify({ authed: true, role }));
        else localStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    }, [authed, role]);

    // ── Seed real interaction state for a signed-in user ─────────────
    //  Replace the mock connected/considering/followed seeds with the user's
    //  ACTUAL rows so the buttons reflect reality (filled hearts for what they've
    //  already done). Read directly through the authed client (RLS-scoped to the
    //  caller); no dedicated endpoint needed. Best-effort: on error we keep
    //  whatever state we have rather than blanking the UI.
    useEffect(() => {
      const sb = window.CC_SUPABASE;
      if (!sb || !realUser) return;
      let active = true;
      (async () => {
        try {
          const uidv = realUser.id;
          const [rsvpRes, followRes, placeRes] = await Promise.all([
            sb.from('rsvps').select('event_id,status').eq('user_id', uidv),
            sb.from('follows').select('followee_id').eq('follower_id', uidv),
            sb.from('place_follows').select('place_id').eq('user_id', uidv),
          ]);
          if (!active) return;
          if (rsvpRes.data) {
            setConnected(new Set(rsvpRes.data.filter((r) => r.status === 'attending').map((r) => r.event_id)));
            setConsidering(new Set(rsvpRes.data.filter((r) => r.status === 'considering').map((r) => r.event_id)));
          }
          if (followRes.data) setFollowedOrgs(new Set(followRes.data.map((f) => f.followee_id)));
          if (placeRes.data) setFollowedPlaces(new Set(placeRes.data.map((p) => p.place_id)));
        } catch (e) { /* seeding is best-effort */ }
      })();
      return () => { active = false; };
    }, [realUser]);

    // ── Own profile meta (bio / discoverable / notification prefs) ────
    //  Kept OUTSIDE realUser so updating it never re-triggers the
    //  realUser-keyed fetch effects.
    useEffect(() => {
      const sb = window.CC_SUPABASE;
      if (!sb || !realUser) { setMyProfileMeta(null); return; }
      let active = true;
      (async () => {
        try {
          // notification_prefs is a private column (migs 176/177): it comes
          // from the caller-row RPC; bio/discoverable are public.
          const [pub, priv] = await Promise.all([
            sb.from('profiles').select('bio, discoverable').eq('id', realUser.id).maybeSingle(),
            sb.rpc('get_my_profile_private').select('notification_prefs').maybeSingle(),
          ]);
          const data = pub.data;
          if (active && data) setMyProfileMeta({ bio: data.bio || '', discoverable: data.discoverable !== false, notificationPrefs: (priv.data && priv.data.notification_prefs) || {} });
        } catch (e) { /* meta is best-effort */ }
      })();
      return () => { active = false; };
    }, [realUser]);

    // ── Real admin data (Phase 3): applications, reports, platform stats ──
    useEffect(() => {
      if (!realUser || role !== 'admin') { setAdminStats(null); return; }
      let active = true;
      (async () => {
        try {
          const res = await authedFetch('/api/admin/contributor-applications');
          if (!res.ok) return;
          const json = await res.json();
          if (active && Array.isArray(json.data)) setApplications(json.data);
        } catch (e) { /* fail open — demo list stays */ }
      })();
      (async () => {
        try {
          const res = await authedFetch('/api/admin/reports');
          if (!res.ok) return;
          const json = await res.json();
          if (active && Array.isArray(json.reports)) setReports(json.reports.map(adaptReport));
        } catch (e) { /* fail open */ }
      })();
      (async () => {
        try {
          const res = await authedFetch('/api/admin/users?page=1');
          if (!res.ok) return;
          const json = await res.json();
          if (active && json.meta) setAdminStats({ totalUsers: json.meta.total || 0 });
        } catch (e) { /* overview falls back to demo counts */ }
      })();
      return () => { active = false; };
    }, [realUser, role]);

    // ── Real contributor identity (Phase 3) ──────────────────────────
    //  A signed-in contributor manages THEIR org, not the demo's Grace City:
    //  hydrate myContributor from their own profiles row (slug included, which
    //  the dashboard/broadcast APIs key on). Assist mode is left untouched.
    useEffect(() => {
      const sb = window.CC_SUPABASE;
      if (!sb || !realUser || role !== 'contributor' || assistMode) return;
      let active = true;
      (async () => {
        try {
          const { data } = await sb
            .from('profiles')
            .select(CONTRIBUTOR_SELECT)
            .eq('id', realUser.id)
            .maybeSingle();
          if (!active || !data) return;
          const org = { ...adaptContributor(data), isMine: true };
          setMyContributor((prev) => (prev && prev.id === org.id ? { ...prev, ...org } : org));
          setContributors((prev) => {
            const byId = new Map(prev.map((c) => [c.id, c]));
            byId.set(org.id, { ...(byId.get(org.id) || {}), ...org });
            return [...byId.values()];
          });
        } catch (e) { /* identity hydration is best-effort */ }
      })();
      return () => { active = false; };
    }, [realUser, role, assistMode]);

    // ── Real contributor dashboard data (Phase 3) ─────────────────────
    //  1. /api/manage/events → real per-event connect/consider/view counts.
    //  2. /api/contributor/<slug>/dashboard + analytics → stats, activity, week.
    useEffect(() => {
      if (!realUser || role !== 'contributor') { setContributorDash(null); return; }
      let active = true;
      (async () => {
        try {
          const res = await authedFetch('/api/manage/events');
          if (!res.ok) return;
          const json = await res.json();
          const byId = new Map(((json && json.events) || []).map((e) => [e.id, e]));
          if (!active || !byId.size) return;
          setEvents((prev) => prev.map((e) => (byId.has(e.id)
            ? { ...e, connectCount: byId.get(e.id).attendee_count || 0, considerCount: byId.get(e.id).consider_count || 0, viewCount: byId.get(e.id).view_count || 0 }
            : e)));
        } catch (e) { /* counts stay at honest 0 */ }
      })();
      // City reach: province snapshots of everyone connected to my events
      // (rsvps.location_snapshot, populated by safe_rsvp since migration 132).
      (async () => {
        try {
          const sb = window.CC_SUPABASE;
          if (!sb) return;
          const { data } = await sb
            .from('rsvps')
            .select('location_snapshot, events!inner(created_by)')
            .eq('events.created_by', realUser.id)
            .not('location_snapshot', 'is', null);
          if (!active || !Array.isArray(data)) return;
          const counts = {};
          data.forEach((r) => { counts[r.location_snapshot] = (counts[r.location_snapshot] || 0) + 1; });
          setCityReach(Object.entries(counts).map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count));
        } catch (e) { /* reach card shows honest empty */ }
      })();
      const slug = myContributor && myContributor.slug;
      if (slug) {
        (async () => {
          try {
            const res = await authedFetch('/api/contributor/' + slug + '/volunteers');
            if (!res.ok) return;
            const json = await res.json();
            if (active && Array.isArray(json.volunteers)) setVolunteerApps(json.volunteers.map(adaptVolunteer));
          } catch (e) { /* manager shows demo seeds */ }
        })();
        (async () => {
          try {
            const [dashRes, weekRes] = await Promise.all([
              authedFetch('/api/contributor/' + slug + '/dashboard?period=30'),
              authedFetch('/api/contributor/' + slug + '/analytics?period=7'),
            ]);
            const dash = dashRes.ok ? await dashRes.json() : null;
            const week = weekRes.ok ? await weekRes.json() : null;
            if (!active || (!dash && !week)) return;
            setContributorDash({
              stats: dash ? dash.stats : null,
              recentActivity: dash ? dash.recent_activity : [],
              topEvent: dash ? dash.top_event : null,
              week: week ? week.series : null,
              weekTotals: week ? week.totals : null,
            });
          } catch (e) { /* dashboard shows honest demo placeholders */ }
        })();
      }
      return () => { active = false; };
    }, [realUser, role, myContributor]);

    // ── Real Impact Ideas (Phase 3) ───────────────────────────────────
    //  Re-runs after sign-in so voted_by_me reflects the real user.
    useEffect(() => { fetchIdeas(); }, [fetchIdeas, realUser]);

    // ── Real notifications + conversations (Phase 3) ─────────────────
    //  For a real signed-in user these REPLACE the demo seeds even when empty:
    //  showing another (mock) person's inbox to a real user would be dishonest.
    useEffect(() => {
      if (!realUser) return;
      let active = true;
      (async () => {
        try {
          const res = await authedFetch('/api/notifications');
          if (!res.ok) return;
          const json = await res.json();
          if (active && Array.isArray(json.notifications)) setNotifications(json.notifications.map(adaptNotification));
        } catch (e) { /* fail open — keep current list */ }
      })();
      (async () => {
        try {
          const res = await authedFetch('/api/conversations');
          if (!res.ok) return;
          const json = await res.json();
          if (active && Array.isArray(json.conversations)) setConversations(json.conversations.map(adaptConversation));
        } catch (e) { /* fail open */ }
      })();
      return () => { active = false; };
    }, [realUser]);

    // ── Realtime: incoming messages for the OPEN thread ───────────────
    //  Own sends are appended optimistically (and deduped by id swap), so only
    //  the other side's inserts are appended here. If realtime isn't enabled on
    //  the messages table this simply never fires — the thread still loads on open.
    useEffect(() => {
      const sb = window.CC_SUPABASE;
      const convId = nav.page === 'messages' ? nav.params.convId : null;
      if (!sb || !realUser || !convId || !isRealId(convId)) return;
      const me = realUser.id;
      const ch = sb.channel('cc-msgs-' + convId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + convId }, (payload) => {
          const m = payload && payload.new;
          if (!m || m.sender_id === me) return;
          setConversations((prev) => prev.map((c) => {
            if (c.id !== convId || c.messages.some((x) => x.id === m.id)) return c;
            return { ...c, messages: [...c.messages, adaptMessage(m, me)], lastMessage: m.body, lastTime: 'now' };
          }));
          authedFetch('/api/conversations/' + convId + '/read', { method: 'PATCH' }).catch(() => {});
        })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) { /* already gone */ } };
    }, [nav, realUser]);

    // ── Realtime: inbox badge + preview for non-open conversations ────
    //  Subscribes to all message inserts visible to the user (RLS-filtered).
    //  Own inserts are skipped; for messages in other conversations the unread
    //  badge increments and the preview line updates without a page refresh.
    //  Uses a navRef so the subscription outlives navigation changes.
    useEffect(() => {
      const sb = window.CC_SUPABASE;
      if (!sb || !realUser) return;
      const me = realUser.id;
      const ch = sb.channel('cc-inbox')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const m = payload && payload.new;
          if (!m || m.sender_id === me) return;
          const convId = m.conversation_id;
          const currentNav = navRef.current;
          const isOpen = currentNav.page === 'messages' && currentNav.params && currentNav.params.convId === convId;
          setConversations((prev) => {
            if (!prev.some((c) => c.id === convId)) return prev;
            return prev.map((c) => {
              if (c.id !== convId) return c;
              return { ...c, lastMessage: m.body, lastTime: 'now', unread: isOpen ? c.unread : (c.unread || 0) + 1 };
            });
          });
        })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) { /* already gone */ } };
    }, [realUser]);

    // ── Live events + map bubbles (Phase 2) ──────────────────────────
    //  Replace the demo events with the real public feed when reachable, then
    //  attach any active broadcast bubbles (anon RPC). Fails open: on any error
    //  we keep the demo data so the app still runs offline / without the API.
    useEffect(() => {
      // API base is an OPTIONAL prefix: '' means same-origin (the standard
      // Vercel topology where this static app and the API ship together). We
      // ALWAYS fetch — `fetch('/api/v1/events')` is a valid same-origin request.
      // (Guarding on a truthy base previously skipped every fetch in production,
      // leaving the map blank once the mock arrays were removed.)
      const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
      let active = true;

      // 1) Real events — set as soon as they arrive (do NOT wait on bubbles).
      (async () => {
        try {
          const res = await fetch(base + '/api/v1/events?limit=100');
          if (!res.ok) return;
          const json = await res.json();
          const adapted = ((json && json.data) || []).map(adaptEvent);
          if (active) setEvents((prev) => DATA.mergeRowsById(prev, adapted));
        } catch (e) { console.warn('[events] live fetch failed', e); } finally { setFeedsSettled((f) => ({ ...f, events: true })); }
      })();

      // 1b) Real places at real coordinates (NOT NULL lat/lng → anchor directly).
      (async () => {
        try {
          const res = await fetch(base + '/api/v1/places?limit=100');
          if (!res.ok) return;
          const json = await res.json();
          const adapted = ((json && json.data) || []).map(adaptPlace);
          if (active) setPlaces((prev) => DATA.mergeRowsById(prev, adapted));
        } catch (e) { console.warn('[places] live fetch failed', e); } finally { setFeedsSettled((f) => ({ ...f, places: true })); }
      })();

      // 2) Real Contributors — merge into the directory so real events/places
      //    resolve their organiser identity (name + logo). On id collision the
      //    real row wins; merge (not replace) is harmless now that seeds are empty.
      (async () => {
        try {
          const res = await fetch(base + '/api/v1/contributors?limit=100');
          if (!res.ok) return;
          const json = await res.json();
          const adapted = ((json && json.data) || []).map(adaptContributor);
          if (!active || !adapted.length) return;
          setContributors((prev) => {
            const byId = new Map(prev.map((c) => [c.id, c]));
            adapted.forEach((c) => byId.set(c.id, c));
            return [...byId.values()];
          });
        } catch (e) { /* directory is optional — org falls back to its name */ } finally { setFeedsSettled((f) => ({ ...f, contributors: true })); }
      })();

      // 3) Active map bubbles (anon RPC) — attach to whatever events are loaded.
      (async () => {
        try {
          const sb = window.CC_SUPABASE;
          if (!sb) return;
          const { data } = await sb.rpc('get_active_map_bubbles');
          if (!active || !Array.isArray(data) || !data.length) return;
          const byEvent = new Map(data.map((b) => [b.event_id, b]));
          setEvents((prev) => prev.map((e) => (byEvent.has(e.id)
            ? { ...e, broadcast: { message: byEvent.get(e.id).body, minsAgo: 0, bubbleId: byEvent.get(e.id).id } }
            : e)));
        } catch (e) { /* bubbles are optional */ }
      })();

      return () => { active = false; };
    }, []);

    // ── The owner's own events + places, every status (C1 / C1b) ─────────
    //  /api/v1/* is the PUBLIC feed: published rows only, so a cancelled event or
    //  place fell out of its owner's dashboard on the next reload and could never be
    //  restored. A Contributor (or an admin assisting one: activeContributorId is
    //  the assisted org) therefore also reads their own rows straight from
    //  Supabase with the signed-in session, scoped by created_by. RLS already
    //  allows exactly this (events: published/cancelled, or created_by = me, or
    //  admin; places: readable) and gives nobody anyone else's drafts, so no
    //  migration and no service_role. The rows merge into the same list the public
    //  feed fills; `events` / `places` stay published-only, so the map is untouched.
    const ownerId = realUser && isRealId(activeContributorId) ? activeContributorId : null;
    useEffect(() => {
      const sb = window.CC_SUPABASE;
      if (!sb || !ownerId) return undefined;
      let active = true;
      setOwnerRowsSettled(false);
      (async () => {
        try {
          const [ev, pl] = await Promise.all([
            sb.from('events').select('*').eq('created_by', ownerId).limit(500),
            // A raw places row carries category_id, not the slug the API embeds.
            sb.from('places').select('*, categories(slug)').eq('created_by', ownerId).limit(500),
          ]);
          if (!active) return;
          if (ev.error) console.warn('[owner events] read failed', ev.error);
          else setEvents((prev) => DATA.mergeRowsById(prev, (ev.data || []).map(adaptEvent)));
          if (pl.error) console.warn('[owner places] read failed', pl.error);
          else {
            setPlaces((prev) => DATA.mergeRowsById(prev, (pl.data || []).map((r) =>
              adaptPlace({ ...r, category: r.categories ? r.categories.slug : null }))));
          }
        } catch (e) { console.warn('[owner rows] read failed', e); } finally { if (active) setOwnerRowsSettled(true); }
      })();
      return () => { active = false; };
    }, [ownerId]);

    // Admin Listings tab: reflect a hide/unhide on this admin's own map and
    // Kingdom Discovery straight away (everyone else's next
    // /api/v1/contributors read already excludes hidden listings).
    const syncListingVisibility = async ({ id, slug, hidden }) => {
      if (hidden) { setContributors((prev) => prev.filter((c) => c.id !== id)); return; }
      if (!slug) return;
      try {
        const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
        const res = await fetch(base + '/api/v1/contributors/' + encodeURIComponent(slug));
        const json = res.ok ? await res.json() : null;
        if (!json || !json.data || !json.data.profile) return;
        const listing = adaptContributor(json.data.profile);
        setContributors((prev) => [...prev.filter((c) => c.id !== listing.id), listing]);
      } catch (e) { /* it shows on the next load */ }
    };

    // News posts: public SELECT RLS (like places/broadcasts), so a direct
    // client read is consistent with the map-bubbles read just above — no
    // dedicated API route needed. Requires migration 167.
    useEffect(() => {
      let active = true;
      (async () => {
        try {
          const sb = window.CC_SUPABASE;
          if (!sb) return;
          const { data, error } = await sb.from('news_posts').select('*').order('post_date', { ascending: false }).limit(200);
          if (error) throw error;
          if (active && Array.isArray(data)) setNewsPosts(data.map(adaptNewsPost));
        } catch (e) { /* table may not exist yet until migration 167 is applied — feed stays empty */ }
      })();
      return () => { active = false; };
    }, []);

    const unreadNotifs = notifications.filter((n) => !n.read).length;
    const unreadMsgs = conversations.reduce((a, c) => a + c.unread, 0);

    // Reflect a freshly-uploaded avatar immediately (header + profile). The
    // /api/avatar route already persisted it to profiles.avatar_url, so this is
    // just the optimistic in-session overlay for citizen/admin. No-op in demo mode.
    // Copy (or, on a phone, hand to the share sheet) the real address of a screen. The
    // native shell's own origin is not a web address, so it shares the public site.
    const shareLink = useCallback(async (n) => {
      const path = pathOf(n || navRef.current);
      if (path === null) { toast('This page has no shareable link yet.', 'red'); return; }
      const isNative = !!(window.CapCore && window.CapCore.isNativePlatform && window.CapCore.isNativePlatform());
      const url = (isNative ? 'https://www.citizenscentral.co.za' : window.location.origin) + path;
      try {
        if (navigator.share && /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent)) { await navigator.share({ url }); return; }
      } catch (e) {
        if (e && e.name === 'AbortError') return; // the person closed the share sheet
      }
      try { await navigator.clipboard.writeText(url); toast('Link copied', 'gold'); }
      catch (e) { toast('Copy this link: ' + url, 'gold'); }
    }, [pathOf, toast]);

    const updateAvatar = useCallback((url) => {
      setRealUser((prev) => (prev ? { ...prev, avatarUrl: url } : prev));
    }, []);

    // ── Settings write paths ──────────────────────────────────────────
    //  Own-row profiles updates go straight through the RLS client (the
    //  addendum's pattern for simple user-scoped writes).
    const saveProfile = useCallback((fields, done) => {
      const finish = (ok) => { if (done) done(ok); };
      if (!realUser || !window.CC_SUPABASE) { toast('Profile saved', 'green'); finish(true); return; }
      (async () => {
        try {
          // A blank name leaves full_name alone: an email-code sign-up has none
          // yet, and the readable stand-in the UI shows (displayNameFor) must
          // never be saved by accident.
          const patch = { bio: fields.bio };
          if (fields.name) patch.full_name = fields.name;
          const { error } = await window.CC_SUPABASE
            .from('profiles')
            .update(patch)
            .eq('id', realUser.id);
          if (error) throw error;
          setRealUser((prev) => (prev ? { ...prev, ...(fields.name ? { name: fields.name, nameIsFallback: false } : {}) } : prev));
          setMyProfileMeta((prev) => ({ ...(prev || {}), bio: fields.bio }));
          toast('Profile saved', 'green');
          finish(true);
        } catch (e) { toast('Could not save your profile — please try again.', 'red'); finish(false); }
      })();
    }, [realUser, toast]);

    const setDiscoverable = useCallback((value) => {
      setMyProfileMeta((prev) => ({ ...(prev || {}), discoverable: value }));
      if (!realUser || !window.CC_SUPABASE) return;
      (async () => {
        try {
          const { error } = await window.CC_SUPABASE.from('profiles').update({ discoverable: value }).eq('id', realUser.id);
          if (error) throw error;
        } catch (e) {
          setMyProfileMeta((prev) => ({ ...(prev || {}), discoverable: !value }));
          toast('Could not update your privacy setting.', 'red');
        }
      })();
    }, [realUser, toast]);

    const saveNotificationPref = useCallback((key, value) => {
      setMyProfileMeta((prev) => prev ? { ...prev, notificationPrefs: { ...(prev.notificationPrefs || {}), [key]: value } } : prev);
      if (!realUser) return;
      (async () => {
        try {
          const res = await authedFetch('/api/notifications/preferences', {
            method: 'PATCH',
            body: JSON.stringify({ notification_prefs: { [key]: value } }),
          });
          if (!res.ok) throw new Error('prefs ' + res.status);
        } catch (e) {
          setMyProfileMeta((prev) => prev ? { ...prev, notificationPrefs: { ...(prev.notificationPrefs || {}), [key]: !value } } : prev);
          toast('Could not save that preference.', 'red');
        }
      })();
    }, [realUser, toast]);

    // ── Browser Back / Forward (popstate) ───────────────────────────────
    //  The browser's own stack walks the screens now. Cases, in order:
    //   0. A history.back() we made ourselves (an overlay closed by a button popped its
    //      own guard entry): nothing to do but note where we are.
    //   1. Back with an overlay open: its guard entry was just popped, so close the
    //      overlay and stay on the screen. Nothing is pushed back (see the RULE above).
    //   2. We landed on a guard entry no open overlay owns (a leftover: an overlay under
    //      another one was closed first). Going Back, step over it, since it is only a copy
    //      of the screen below it; going Forward, make it an ordinary entry.
    //   3. A screen: restore it exactly (history.state.nav), or parse the address, then
    //      check the person may be there (settleRoute).
    useEffect(() => {
      if (!canHistory()) return undefined;
      const onPop = (e) => {
        const st = e.state && e.state.cc ? e.state : null;
        const from = histIdx.current;
        histIdx.current = st && typeof st.idx === 'number' ? st.idx : 0;
        if (selfPops.current > 0) { selfPops.current -= 1; return; }
        const goingBack = histIdx.current < from;
        const guards = backGuards.current;
        let closed = null;
        if (guards.length && goingBack) {
          closed = guards[guards.length - 1];
          backGuards.current = guards.slice(0, -1);
          try { closed.close(); } catch (err) { /* a closed overlay is still handled */ }
        }
        const leftover = !!(st && st.guard) && !ownsTopEntry();
        // The overlay's own entry was the one just popped when we are back on the same
        // screen. If the screen was replaced under the overlay, follow the entry instead.
        if (closed && closed.idx !== -1 && !leftover && st && sameNav(st.nav, plainNav(navRef.current))) return;
        let state = st;
        if (leftover) {
          if (goingBack && histIdx.current > 0) { window.history.back(); return; }
          try {
            state = { cc: 1, idx: state.idx, nav: state.nav };
            window.history.replaceState(state, '', window.location.pathname + window.location.search + window.location.hash);
          } catch (err) { /* the entry just keeps its flag */ }
        }
        let next = state && state.nav && ROUTES.PAGES.indexOf(state.nav.page) !== -1 ? state.nav : null;
        if (!next) next = ROUTES.navFromPath(window.location.pathname, window.location.search).nav;
        navRef.current = next;
        setNav(next);
        scrollTop();
        gatePending.current = ROUTES.accessFor(next) !== 'public';
        settleRoute(authRef.current);
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, [settleRoute]);

    // ── The platform's own Back button (Capacitor / Android) ─────────────
    //  Registering a 'backButton' listener overrides Capacitor's default
    //  (history.back(), else exit), so the whole decision is ours: close the topmost
    //  overlay, else step back through the screens, else exit the app from the first one.
    useEffect(() => {
      const isNative = !!(window.CapCore && window.CapCore.isNativePlatform && window.CapCore.isNativePlatform());
      if (!isNative || !window.CapApp || !window.CapApp.addListener) return undefined;
      let handle = null, cancelled = false;
      Promise.resolve(window.CapApp.addListener('backButton', () => {
        if (handleBack()) return;
        if (window.CapApp.exitApp) window.CapApp.exitApp();
      })).then((hnd) => {
        if (cancelled) { if (hnd && hnd.remove) hnd.remove(); } else handle = hnd;
      }).catch(() => {});
      return () => { cancelled = true; if (handle && handle.remove) handle.remove(); };
    }, [handleBack]);

    // ── Page load: stamp the arrival entry, and tidy the address ───────────────
    //  The entry the person arrived on IS the first screen: it is only REPLACED (state
    //  stamped, address made canonical), never added to. Nothing is pushed on page load
    //  (the RULE above), so Back from the first screen leaves Connect, as it should, and
    //  from the second screen lands on the first. Old and alias addresses
    //  (/index.html, /map, ?c=<slug>, a trailing slash, an unknown tab) are replaced by
    //  the canonical one. A reload keeps its depth, so Back/Forward still line up.
    //
    //  A shared listing (/e/<id>, /p/<id>, /c/<slug>) is the only entry a fresh tab has, so
    //  Back from it would leave Connect. The map goes UNDER it the first time the visitor
    //  taps or presses a key, inside that gesture: the arrival entry is replaced by the map
    //  and the listing pushed again, so Back from a shared link then lands on the map and
    //  the visitor keeps discovering. A Back before any interaction simply leaves, as it
    //  does on any web page.
    useEffect(() => {
      const b = boot.current;
      let disarm = () => {};
      if (canHistory()) {
        const here = b.legacy || !b.ok ? b.canonical : window.location.pathname + window.location.search + window.location.hash;
        try {
          // A reload while an overlay's guard entry was on top: the overlay is gone, so
          // the entry becomes an ordinary one (the stamp below carries no guard flag).
          histIdx.current = b.state && typeof b.state.idx === 'number' ? b.state.idx : 0;
          window.history.replaceState({ cc: 1, idx: histIdx.current, nav: plainNav(b.nav) }, '', here);
        } catch (e) { /* history is best-effort; the screen is already open */ }
        if (!b.state && b.ok && ROUTES.isEntityRoute(b.nav)) {
          const arm = () => {
            disarm();
            try {
              const cur = window.history.state;
              // Nothing to do if something already moved on, or the link turned out to be
              // nothing (an unknown /c/<slug> falls back to the map: no listing to put it under).
              if (histIdx.current !== 0 || !cur || cur.idx !== 0 || !ROUTES.isEntityRoute(navRef.current)) return;
              const listing = window.location.pathname + window.location.search + window.location.hash;
              window.history.replaceState({ cc: 1, idx: 0, nav: HOME_NAV }, '', '/');
              window.history.pushState({ cc: 1, idx: 1, nav: plainNav(navRef.current) }, '', listing);
              histIdx.current = 1;
            } catch (e) { /* the listing simply stays the first entry */ }
          };
          disarm = () => {
            document.removeEventListener('click', arm, true);
            document.removeEventListener('keydown', arm, true);
          };
          // Capture phase: runs before the app's own handler for the same tap, so any
          // entry that tap pushes lands on top of the two.
          document.addEventListener('click', arm, true);
          document.addEventListener('keydown', arm, true);
        }
      }
      if (!b.ok) toast("That link doesn't match anything in Connect, so here is the map.", 'gold');
      // A shared public link (/e/<id>, /c/<slug>, /discover...) opens for a signed-out
      // visitor as a guest, not behind the sign-in screen.
      if (!authed && b.ok && b.nav.page !== 'home' && ROUTES.accessFor(b.nav) === 'public') browseAsGuest();
      return () => disarm();
    }, []);

    // The screen the address named is checked against who the person is as soon as
    // that is known (and again if they sign in later from the landing).
    useEffect(() => {
      if (authResolved) settleRoute({ authed, role, guest: guestMode });
    }, [authResolved, authed, role, guestMode, settleRoute]);

    // ── A Contributor listing link: /c/<slug> (and the old /index.html?c=<slug>) ──
    //  The route carries a slug until we know whose it is. Resolve it directly (so it
    //  works beyond the directory's first page), add it to the directory, and swap the
    //  screen for that Contributor's profile, keeping /c/<slug> in the address bar.
    useEffect(() => {
      // Validated again here: a nav can also come back out of history.state, and a slug
      // is only ever put into a request path once it matches the route table's own rule.
      const slug = nav.page === 'profile' && !nav.params.id && ROUTES.isSlug(nav.params.slug) ? nav.params.slug : null;
      if (!slug) return undefined;
      let active = true;
      (async () => {
        let listing = null;
        try {
          const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
          const res = await fetch(base + '/api/v1/contributors/' + slug);
          const json = res.ok ? await res.json() : null;
          if (json && json.data && json.data.profile) listing = adaptContributor(json.data.profile);
        } catch (e) { /* reported below */ }
        if (!active) return;
        if (!listing) {
          toast('That Contributor listing could not be found.', 'red');
          commitNav(HOME_NAV, true, true);
          return;
        }
        setContributors((prev) => [...prev.filter((c) => c.id !== listing.id), listing]);
        contributorsRef.current = [...contributorsRef.current.filter((c) => c.id !== listing.id), listing];
        commitNav({ page: 'profile', params: { id: listing.id } }, true, true);
      })();
      return () => { active = false; };
    }, [nav.page, nav.params.slug, nav.params.id]);

    // ── An event or place opened by link that the public lists do not hold ─────
    //  /e/<id> and /p/<id> work for anything published, not just the first 100 rows the
    //  map loaded: a past event, a place beyond the page. Events come from
    //  /api/v1/events/<id> (published and public only, 404 otherwise); places straight
    //  from Supabase (published only, whoever asks). The Contributor's own cancelled or
    //  private rows were already loaded by the owner read above. entityStatus() tells a
    //  page whether to show "loading" or "not found".
    const lookupRef = useRef(new Set());
    useEffect(() => {
      const kind = nav.page === 'event' || nav.page === 'place' ? nav.page : null;
      const id = nav.params && nav.params.id;
      if (!kind || !isRealId(id)) return;
      const key = kind + ':' + id;
      const have = kind === 'event' ? eventRows.some((e) => e.id === id) : placeRows.some((x) => x.id === id);
      if (have || lookupRef.current.has(key)) return;
      if (!feedsSettled[kind === 'event' ? 'events' : 'places']) return; // still arriving: it is probably in there
      lookupRef.current.add(key);
      (async () => {
        try {
          if (kind === 'event') {
            const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
            const res = await fetch(base + '/api/v1/events/' + id);
            const json = res.ok ? await res.json() : null;
            if (json && json.data && json.data.id === id) setEvents((prev) => DATA.mergeRowsById(prev, [adaptEvent(json.data)]));
          } else if (window.CC_SUPABASE) {
            const { data } = await window.CC_SUPABASE.from('places').select('*, categories(slug)').eq('id', id).eq('status', 'published').maybeSingle();
            if (data) setPlaces((prev) => DATA.mergeRowsById(prev, [adaptPlace({ ...data, category: data.categories ? data.categories.slug : null })]));
          }
        } catch (e) { /* shown as not found below */ }
        setEntityLookup((m) => ({ ...m, [key]: true }));
      })();
    }, [nav.page, nav.params.id, eventRows, placeRows, feedsSettled]);
    const entityStatus = useCallback((kind, id) => {
      if (kind === 'profile') {
        if (contributors.some((c) => c.id === id)) return 'ready';
        return feedsSettled.contributors || !isRealId(id) ? 'missing' : 'loading';
      }
      const rows = kind === 'event' ? eventRows : placeRows;
      if (rows.some((x) => x.id === id)) return 'ready';
      if (!isRealId(id)) return 'missing';
      const ownerReady = ownerRowsSettled || (authResolved && !ownerId);
      if (!feedsSettled[kind === 'event' ? 'events' : 'places'] || !ownerReady || !entityLookup[kind + ':' + id]) return 'loading';
      return 'missing';
    }, [eventRows, placeRows, contributors, feedsSettled, ownerRowsSettled, entityLookup, authResolved, ownerId]);

    // ── Tab / history title ───────────────────────────────────────────────
    useEffect(() => {
      const p = nav.params || {};
      let name;
      if (nav.page === 'event') { const e = eventRows.find((x) => x.id === p.id); name = e && e.title; }
      else if (nav.page === 'place') { const x = placeRows.find((y) => y.id === p.id); name = x && x.name; }
      else if (nav.page === 'profile') { const c = contributors.find((y) => y.id === p.id); name = c && c.name; }
      document.title = ROUTES.titleFor(nav, name);
    }, [nav, eventRows, placeRows, contributors]);

    useEffect(() => { window.__cc = { go, setRole, openCreate, closeCreate, setNav, submitApplication, reviewApplication, completeOnboarding, createEvent, createPlace, sendBroadcast }; });

    const value = {
      authed, signIn, signOut, sendEmailCode, verifyEmailCode,
      guestMode, browseAsGuest, showSignIn, authResolved,
      role, setRole, nav, go, resetNav, handleBack, registerBackGuard,
      user, activeContributor, activeContributorId,
      events, places, ownEvents, ownPlaces, findEvent, findPlace, entityStatus, shareLink,
      contributors, applications, conversations, notifications,
      ideas, toggleIdeaVote, submitIdea, scheduleKingdomProject, confirmIdea,
      citizens: DATA.citizens,
      volunteerApps, reviewVolunteer, applyToVolunteer, cityReach, reports, resolveReport,
      assistMode, assistLoginAs, exitAssist,
      myApplication, myContributor, contributorDash,
      connected, considering, followedOrgs, followedPlaces,
      realUser,
      isAdmin: role === 'admin', isContributor: role === 'contributor', isCitizen: role === 'citizen',
      unreadNotifs, unreadMsgs, toasts, toast,
      createKind, createEditing, openCreate, closeCreate, updateAvatar,
      updateEvent, setEventStatus, updatePlace, setPlaceStatus,
      updateContributorProfile, addCoverPhoto, deleteCoverPhoto, updateCoverPhotoCaption,
      newsPosts, createNewsPost, updateNewsPost, deleteNewsPost,
      adminStats, myProfileMeta, saveProfile, setDiscoverable, saveNotificationPref,
      creationStyle, setCreationStyle, bubbleStyle, setBubbleStyle,
      submitApplication, reviewApplication, completeOnboarding, syncListingVisibility,
      createEvent, createPlace, sendBroadcast, sendMessage, openConversation, startConversationWith,
      acceptRequest, rejectRequest, muteConversation, unmuteConversation, blockUser,
      toggleConnect, toggleConsider, toggleFollow, togglePlaceFollow, dismissBubble, markNotifsRead, readNotification,
      trackImpression,
    };
    return React.createElement(AppCtx.Provider, { value }, children);
  }

  function useApp() {
    const ctx = useContext(AppCtx);
    if (!ctx) throw new Error('useApp must be used inside AppProvider');
    return ctx;
  }

  // ── useBackGuard(active, onBack) ──────────────────────────────────
  //  Declares "while I am open, a Back press should close me, not navigate".
  //  Guards are consumed LIFO, so nested overlays unwind in the order a user
  //  expects. Deliberately reads the context directly instead of useApp() so
  //  a component rendered outside the provider degrades to a no-op.
  function useBackGuard(active, onBack) {
    const ctx = useContext(AppCtx);
    const cb = useRef(onBack);
    cb.current = onBack;
    const register = ctx && ctx.registerBackGuard;
    useEffect(() => {
      if (!active || !register) return undefined;
      return register(() => { if (cb.current) cb.current(); });
    }, [active, register]);
  }

  window.AppProvider = AppProvider;
  window.useApp = useApp;
  window.useBackGuard = useBackGuard;
  window.authedFetch = authedFetch;
  window.uploadImage = uploadImage;
})();
