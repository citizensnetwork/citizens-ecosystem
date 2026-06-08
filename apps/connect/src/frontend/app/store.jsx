// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — app store (state + actions + tiny router)
// ════════════════════════════════════════════════════════════════════
(function () {
  const { createContext, useContext, useState, useCallback, useRef, useEffect } = React;
  const AppCtx = createContext(null);

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = (p) => p + Math.random().toString(36).slice(2, 7);

  // ── Live data adapter: /api/v1/events row → app event shape ──────────
  //  The public API is sparse (no organiser name / connect counts yet), so we
  //  fill honest defaults (0 counts, blank organiser) and compute `isLive` from
  //  the event window. Coordinates carry through as lat/lng for the real map.
  const FALLBACK_COVER = 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&h=500&fit=crop';
  const fmtTime = (d) => d ? d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' }) : '';
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
      organizerName: '', organizerId: r.created_by || null,
      isLive: !!(validDt && validEnd && validDt <= now && now <= validEnd),
      isBusy: false, connectCount: 0, considerCount: 0, volunteeringEnabled: false,
      coverPhoto: r.image_url || FALLBACK_COVER,
      gallery: [], broadcast: null, website: r.website_url || '',
      lat: typeof r.latitude === 'number' ? r.latitude : null,
      lng: typeof r.longitude === 'number' ? r.longitude : null,
      tags: [], upcomingDates: [],
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

    // citizen RSVP state
    const [connected, setConnected] = useState(() => new Set(['e1', 'e4']));
    const [considering, setConsidering] = useState(() => new Set(['e3', 'e6']));

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

    const toggleConnect = useCallback((eventId) => {
      setConnected((prev) => { const n = new Set(prev); n.has(eventId) ? n.delete(eventId) : n.add(eventId); return n; });
    }, []);
    const toggleConsider = useCallback((eventId) => {
      setConsidering((prev) => { const n = new Set(prev); n.has(eventId) ? n.delete(eventId) : n.add(eventId); return n; });
    }, []);

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

      // 2) Active map bubbles (anon RPC) — attach to whatever events are loaded.
      (async () => {
        try {
          const sb = window.CC_SUPABASE;
          if (!sb) return;
          const { data } = await sb.rpc('get_active_map_bubbles');
          if (!active || !Array.isArray(data) || !data.length) return;
          const byEvent = new Map(data.map((b) => [b.event_id, b]));
          setEvents((prev) => prev.map((e) => (byEvent.has(e.id)
            ? { ...e, broadcast: { message: byEvent.get(e.id).body, minsAgo: 0 } }
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
      connected, considering,
      isAdmin: role === 'admin', isContributor: role === 'contributor', isCitizen: role === 'citizen',
      unreadNotifs, unreadMsgs, toasts, toast,
      createKind, openCreate, closeCreate,
      creationStyle, setCreationStyle, pinStyle, setPinStyle, bubbleStyle, setBubbleStyle,
      submitApplication, reviewApplication, completeOnboarding,
      createEvent, createPlace, sendBroadcast, sendMessage, openConversation, startConversationWith,
      toggleConnect, toggleConsider, markNotifsRead,
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
