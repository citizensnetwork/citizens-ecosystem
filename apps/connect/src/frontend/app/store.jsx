// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — app store (state + actions + tiny router)
// ════════════════════════════════════════════════════════════════════
(function () {
  const { createContext, useContext, useState, useCallback, useRef, useEffect } = React;
  const AppCtx = createContext(null);

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = (p) => p + Math.random().toString(36).slice(2, 7);

  // Real (DB) ids are UUIDs; mock prototype ids ('e1','p1',…) are not. Only real
  // ids may be written through to the API — mock entities stay local-only during
  // the mock→real data migration (e.g. places are still mock this phase).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isRealId = (id) => typeof id === 'string' && UUID_RE.test(id);

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

  // ── Live data adapter: /api/v1/events row → app event shape ──────────
  //  The public API is sparse (no organiser name / connect counts yet), so we
  //  fill honest defaults (0 counts, blank organiser) and compute `isLive` from
  //  the event window. Coordinates carry through as lat/lng for the real map.
  const FALLBACK_COVER = 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&h=500&fit=crop';
  const FALLBACK_AVATAR = 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?w=200&h=200&fit=crop';
  const fmtTime = (d) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
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
      location: r.location || '', address: r.location || '',
      // organizerId = created_by (UUID). organizerName falls back to the
      // community_contributor text so community-posted events still show a name
      // even when the creator isn't an approved Contributor in the directory.
      organizerName: r.community_contributor || '', organizerId: r.created_by || null,
      isLive: !!(validDt && validEnd && validDt <= now && now <= validEnd),
      isBusy: false, connectCount: 0, considerCount: 0, volunteeringEnabled: false,
      coverPhoto: r.image_url || FALLBACK_COVER,
      gallery: [], broadcast: null, website: r.website_url || '',
      lat: typeof r.latitude === 'number' ? r.latitude : null,
      lng: typeof r.longitude === 'number' ? r.longitude : null,
      tags: [], upcomingDates: [],
    };
  }

  // API contributor row (public /api/v1/contributors → a profiles row) → app
  // contributor shape. The public directory is sparse, so anything it doesn't
  // expose (follower counts, involvement tier, niche) gets honest, crash-safe
  // defaults — never fabricated numbers (VISION: honour the small honestly).
  function adaptContributor(r) {
    const socials = {};
    if (r.instagram_handle) socials.instagram = r.instagram_handle;
    if (r.facebook_url) socials.facebook = r.facebook_url;
    if (r.tiktok_handle) socials.tiktok = r.tiktok_handle;
    if (r.youtube_url) socials.youtube = r.youtube_url;
    return {
      id: r.id,
      name: r.full_name || 'Contributor',
      role: 'contributor',
      kind: r.contributor_kind || 'organization',
      slug: r.contributor_slug || null,
      profilePhoto: r.logo_url || r.avatar_url || FALLBACK_AVATAR,
      coverPhoto: FALLBACK_COVER,
      bio: r.bio || '',
      website: r.website_url || '',
      location: r.physical_address || '',
      followerCount: 0,
      involvementLevel: 'Shepherd',
      dominantNiche: '',
      socials,
      collaborators: [],
      members: [],
      verified: true,
    };
  }

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
      coverPhoto: r.image_url || FALLBACK_COVER,
      gallery: [],
      openHours: '',
      website: r.website || '', phone: r.phone || '',
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

  // ── session persistence (login survives refresh) ──
  const SESSION_KEY = 'cc_session_v1';
  const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { return null; } };

  // user identities per role
  const CITIZEN_BASE = {
    id: 'u1', name: 'Lydia Mensah', role: 'citizen',
    profilePhoto: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=200&fit=crop',
    coverPhoto: 'https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=900&h=400&fit=crop',
    bio: 'Worshipper, intercessor, and community builder. Passionate about seeing the Kingdom manifest in every neighbourhood.',
  };
  const ADMIN_BASE = {
    id: 'admin-1', name: 'Citizens Connect Admin', role: 'admin',
    profilePhoto: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop',
    coverPhoto: 'https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=900&h=400&fit=crop',
    bio: 'Platform administrator. Serving the Citizens Connect community.',
  };

  function AppProvider({ children }) {
    const _saved = loadSession();
    const [authed, setAuthed] = useState(!!(_saved && _saved.authed));
    const [role, setRole] = useState(_saved && _saved.role ? _saved.role : 'citizen');
    const [nav, setNav] = useState({ page: 'home', params: {} });
    const [createKind, setCreateKind] = useState(null); // null | 'event' | 'place'
    const [creationStyle, setCreationStyle] = useState('sheet'); // sheet | modal | side  (tweakable)
    const [pinStyle, setPinStyle] = useState('teardrop'); // teardrop | dot | glass (tweakable)
    const [bubbleStyle, setBubbleStyle] = useState('speech'); // speech | tag | minimal (tweakable)

    const [events, setEvents] = useState(() => DATA.events.map((e) => ({ ...e })));
    const [places, setPlaces] = useState(() => DATA.places.map((p) => ({ ...p })));
    const [contributors, setContributors] = useState(() => DATA.contributors.map((c) => ({ ...c })));
    const [applications, setApplications] = useState(() => DATA.applications.map((a) => ({ ...a })));
    const [conversations, setConversations] = useState(() => DATA.conversations.map((c) => ({ ...c, messages: c.messages.slice() })));
    const [notifications, setNotifications] = useState(() => DATA.notifications.map((n) => ({ ...n })));
    const [volunteerApps, setVolunteerApps] = useState(() => DATA.volunteerApplications.map((v) => ({ ...v })));
    const [reports, setReports] = useState(() => DATA.reports.map((r) => ({ ...r })));

    // contributor onboarding state
    const [myApplication, setMyApplication] = useState(null); // {id,status,...}
    const [myContributor, setMyContributor] = useState(null); // contributor obj once onboarded
    const [assistMode, setAssistMode] = useState(false); // admin assisting as a contributor
    const [realUser, setRealUser] = useState(null); // {id,name,avatarUrl,email} from Supabase (null in demo mode)

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

    const go = useCallback((page, params = {}) => {
      setNav({ page, params });
      const main = document.getElementById('main-scroll');
      if (main) main.scrollTop = 0;
    }, []);
    const openCreate = useCallback((kind) => setCreateKind(kind), []);
    const closeCreate = useCallback(() => setCreateKind(null), []);

    // active org the contributor manages (their new org, else demo Grace City)
    const activeContributorId = myContributor ? myContributor.id : 'c1';
    const activeContributor = contributors.find((c) => c.id === activeContributorId);

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
          profilePhoto: realUser.avatarUrl || baseUser.profilePhoto }
      : baseUser;

    // ── actions ─────────────────────────────────────────────────────
    const submitApplication = useCallback((form) => {
      const app = {
        id: 'app-mine', name: form.orgName, photo: CITIZEN_BASE.profilePhoto,
        bio: form.bio, category: form.category, weeklyEvents: 1, status: 'pending',
        submittedAt: today(), reason: form.reason, location: form.location,
        website: form.website, socials: form.socials || {}, applicantName: CITIZEN_BASE.name, isMine: true,
      };
      setMyApplication(app);
      setApplications((prev) => [app, ...prev.filter((a) => a.id !== 'app-mine')]);
      toast('Application submitted — an admin will review it shortly.', 'gold');
    }, [toast]);

    const reviewApplication = useCallback((id, status, note) => {
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status, reviewNote: note || a.reviewNote, reviewedAt: today() } : a)));
      setMyApplication((m) => (m && m.id === id ? { ...m, status, reviewNote: note, reviewedAt: today() } : m));
      toast(status === 'approved' ? 'Application approved — contributor access granted.' : 'Application rejected.', status === 'approved' ? 'green' : 'red');
    }, [toast]);

    const reviewVolunteer = useCallback((id, status) => {
      setVolunteerApps((prev) => prev.map((v) => (v.id === id ? { ...v, status, reviewedAt: today() } : v)));
      toast(status === 'approved' ? 'Volunteer approved — they’ll be notified.' : 'Volunteer application declined.', status === 'approved' ? 'green' : 'gold');
    }, [toast]);

    const resolveReport = useCallback((id, status, resolution) => {
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status, resolution: resolution || r.resolution, reviewedAt: today() } : r)));
      toast(status === 'resolved' ? 'Report resolved.' : status === 'removed' ? 'Content removed.' : 'Report dismissed.', status === 'dismissed' ? 'gold' : 'green');
    }, [toast]);

    const completeOnboarding = useCallback((form) => {
      const c = {
        id: uid('c'), name: form.name || (myApplication && myApplication.name) || 'My Ministry',
        bio: form.bio, profilePhoto: form.profilePhoto, coverPhoto: form.coverPhoto,
        category: form.category, website: form.website, contactEmail: form.contactEmail || '',
        location: form.location || '', members: form.members || [], followerCount: 0,
        dominantNiche: DATA.getEventCategory(form.category) ? DATA.getEventCategory(form.category).name : 'Community',
        involvementLevel: 'Shepherd', collaborators: [], socials: form.socials || {}, isMine: true,
      };
      setContributors((prev) => [...prev, c]);
      setMyContributor(c);
      setRole('contributor');
      toast('Welcome aboard! Your contributor profile is live.', 'green');
      go('dashboard');
    }, [myApplication, toast, go]);

    const createEvent = useCallback((form) => {
      const ev = {
        id: uid('e'), title: form.title, category: form.category, description: form.description,
        date: form.date, time: form.time, endTime: form.endTime, location: form.location, address: form.address,
        organizerName: activeContributor.name, organizerId: activeContributorId,
        isLive: false, isBusy: false, connectCount: 0, considerCount: 0,
        volunteeringEnabled: !!form.volunteeringEnabled,
        coverPhoto: form.coverPhoto || 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&h=500&fit=crop',
        gallery: form.gallery || [], broadcast: null, website: form.website || activeContributor.website,
        socials: form.socials || {}, isMobile: !!form.isMobile, route: form.route || null,
        mapX: form.mapX || 48, mapY: form.mapY || 50, upcomingDates: form.upcomingDates || [], tags: form.tags || [],
      };
      setEvents((prev) => [ev, ...prev]);
      if (form.launchBroadcast) {
        ev.broadcast = { message: form.launchBroadcast, minsAgo: 0 };
        setNotifications((prev) => [{ id: uid('n'), type: 'broadcast', title: activeContributor.name + ' sent a broadcast', body: form.launchBroadcast, time: 'just now', read: false, photo: activeContributor.profilePhoto }, ...prev]);
      }
      toast('Event created — now live on the map!', 'green');
      return ev;
    }, [activeContributor, activeContributorId, toast]);

    const createPlace = useCallback((form) => {
      const pl = {
        id: uid('p'), name: form.name, category: form.category, description: form.description,
        address: form.address, organizerName: activeContributor.name, organizerId: activeContributorId,
        coverPhoto: form.coverPhoto || 'https://images.unsplash.com/photo-1481253127861-534498168948?w=800&h=500&fit=crop',
        gallery: form.gallery || [], openHours: form.openHours || '', website: form.website || activeContributor.website,
        volunteeringEnabled: !!form.volunteeringEnabled, followerCount: 0,
        mapX: form.mapX || 52, mapY: form.mapY || 46, associatedEventIds: [], socials: form.socials || {},
      };
      setPlaces((prev) => [pl, ...prev]);
      toast('Place added to the map!', 'green');
      return pl;
    }, [activeContributor, activeContributorId, toast]);

    const sendBroadcast = useCallback((kind, id, message) => {
      if (kind === 'event') setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, broadcast: { message, minsAgo: 0 } } : e)));
      else setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, broadcast: { message, minsAgo: 0 } } : p)));
      setNotifications((prev) => [{ id: uid('n'), type: 'broadcast', title: activeContributor.name + ' sent a broadcast', body: message, time: 'just now', read: false, photo: activeContributor.profilePhoto }, ...prev]);
      toast('Broadcast sent — bubble live on the map for 24h.', 'gold');
    }, [activeContributor, toast]);

    const sendMessage = useCallback((convId, text) => {
      const stamp = new Date().toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, { id: uid('m'), from: 'me', text, time: stamp, date: 'Today' }], lastMessage: text, lastTime: stamp, unread: 0 } : c)));
    }, []);

    const openConversation = useCallback((convId) => {
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)));
    }, []);

    const startConversationWith = useCallback((name, photo, isOrg) => {
      const existing = conversations.find((c) => c.participantName === name);
      if (existing) { go('messages', { convId: existing.id }); return; }
      const id = uid('conv');
      setConversations((prev) => [{ id, isOrg: !!isOrg, participantName: name, participantPhoto: photo, lastMessage: 'Start the conversation…', lastTime: 'now', unread: 0, messages: [] }, ...prev]);
      go('messages', { convId: id });
    }, [conversations, go]);

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

    const markNotifsRead = useCallback(() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))), []);

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
        window.CC_AUTH.signInWithGoogle(intent).catch((e) => {
          console.error('[signIn]', e);
          toast('Sign-in failed \u2014 please try again.', 'red');
        });
        return;
      }
      // Fallback (no Supabase configured): local demo session only.
      setAuthed(true);
      setRole('citizen');
      setMyContributor(null);
      setAssistMode(false);
      if (intent === 'contributor') {
        setNav({ page: 'apply', params: {} });
        toast('Signed in \u2014 let\u2019s set up your contributor application.', 'gold');
      } else {
        setNav({ page: 'home', params: {} });
        toast('Welcome to Citizens Connect!', 'gold');
      }
    }, [toast]);

    // DEMO ONLY \u2014 jump straight into a role for review. Safe to delete
    // along with the demo block in app/auth.jsx; nothing else depends on it.
    const signInDemo = useCallback((r) => {
      setAuthed(true);
      setRole(r);
      setMyContributor(null);
      setMyApplication(null);
      setAssistMode(false);
      setNav({ page: r === 'admin' ? 'admin' : r === 'contributor' ? 'dashboard' : 'home', params: {} });
    }, []);

    const signOut = useCallback(() => {
      if (window.CC_AUTH) { window.CC_AUTH.signOut().catch(() => {}); }
      setRealUser(null);
      setAuthed(false);
      setRole('citizen');
      setMyContributor(null);
      setMyApplication(null);
      setAssistMode(false);
      setNav({ page: 'home', params: {} });
      try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    }, []);

    // ── real Supabase session bootstrap (no-op in demo mode) ──
    //  Source of truth when CC_AUTH is present: resolves the session + role on
    //  load and on every auth change (incl. the OAuth redirect return).
    useEffect(() => {
      if (!window.CC_AUTH) return;
      let active = true;
      const apply = async () => {
        const s = await window.CC_AUTH.loadSession();
        if (!active) return;
        if (s) {
          setRealUser({ id: s.user.id, name: s.name, avatarUrl: s.avatarUrl, email: s.user.email });
          setAuthed(true);
          setRole(s.role || 'citizen');
          if (s.routeToApply) { window.CC_AUTH.clearPendingIntent(); setNav({ page: 'apply', params: {} }); }
        } else {
          setRealUser(null);
          setAuthed(false);
        }
      };
      apply();
      const sub = window.CC_AUTH.onAuthChange((event) => {
        if (event === 'SIGNED_OUT') { setRealUser(null); setAuthed(false); setRole('citizen'); }
        else { apply(); }
      });
      return () => {
        active = false;
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

    // ── Live events + map bubbles (Phase 2) ──────────────────────────
    //  Replace the demo events with the real public feed when reachable, then
    //  attach any active broadcast bubbles (anon RPC). Fails open: on any error
    //  we keep the demo data so the app still runs offline / without the API.
    useEffect(() => {
      const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
      let active = true;

      // 1) Real events — set as soon as they arrive (do NOT wait on bubbles).
      if (base) {
        (async () => {
          try {
            const res = await fetch(base + '/api/v1/events?limit=100');
            if (!res.ok) return;
            const json = await res.json();
            const adapted = ((json && json.data) || []).map(adaptEvent);
            if (active && adapted.length) setEvents(adapted);
          } catch (e) { console.warn('[events] live fetch failed — keeping demo data', e); }
        })();
      }

      // 1b) Real places — replace the demo (bbox-projected) places with real DB
      //     places at real coordinates. Same fail-open contract as events: only
      //     swap when real rows arrive, otherwise keep the demo data offline.
      if (base) {
        (async () => {
          try {
            const res = await fetch(base + '/api/v1/places?limit=100');
            if (!res.ok) return;
            const json = await res.json();
            const adapted = ((json && json.data) || []).map(adaptPlace);
            if (active && adapted.length) setPlaces(adapted);
          } catch (e) { console.warn('[places] live fetch failed — keeping demo data', e); }
        })();
      }

      // 2) Real Contributors — merge into the directory so real events/places
      //    resolve their organiser identity (name + logo) instead of a blank or,
      //    worse, the wrong (first-mock) organiser. Merge (not replace) so mock
      //    places still in the tree keep resolving their mock organisers during
      //    the mock→real migration; on id collision the real row wins.
      if (base) {
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
          } catch (e) { /* directory is optional — org falls back to its name */ }
        })();
      }

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

    const unreadNotifs = notifications.filter((n) => !n.read).length;
    const unreadMsgs = conversations.reduce((a, c) => a + c.unread, 0);

    useEffect(() => { window.__cc = { go, setRole, openCreate, closeCreate, setNav, submitApplication, reviewApplication, completeOnboarding, createEvent, createPlace, sendBroadcast }; });

    const value = {
      authed, signIn, signInDemo, signOut,
      role, setRole, nav, go,
      user, activeContributor, activeContributorId,
      events, places, contributors, applications, conversations, notifications,
      citizens: DATA.citizens,
      volunteerApps, reviewVolunteer, reports, resolveReport,
      assistMode, assistLoginAs, exitAssist,
      myApplication, myContributor,
      connected, considering, followedOrgs, followedPlaces,
      isAdmin: role === 'admin', isContributor: role === 'contributor', isCitizen: role === 'citizen',
      unreadNotifs, unreadMsgs, toasts, toast,
      createKind, openCreate, closeCreate,
      creationStyle, setCreationStyle, pinStyle, setPinStyle, bubbleStyle, setBubbleStyle,
      submitApplication, reviewApplication, completeOnboarding,
      createEvent, createPlace, sendBroadcast, sendMessage, openConversation, startConversationWith,
      toggleConnect, toggleConsider, toggleFollow, togglePlaceFollow, dismissBubble, markNotifsRead,
    };
    return React.createElement(AppCtx.Provider, { value }, children);
  }

  function useApp() {
    const ctx = useContext(AppCtx);
    if (!ctx) throw new Error('useApp must be used inside AppProvider');
    return ctx;
  }

  window.AppProvider = AppProvider;
  window.useApp = useApp;
})();
