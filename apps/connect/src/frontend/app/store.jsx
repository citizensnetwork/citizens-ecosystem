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
    if (!window.CC_AUTH) throw new Error('Sign in with Google to upload your own photo.');
    const token = await window.CC_AUTH.getAccessToken();
    if (!token) throw new Error('Sign in with Google to upload your own photo.');
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
    const socials = {};
    if (r.instagram_handle) socials.instagram = r.instagram_handle;
    if (r.facebook_url) socials.facebook = r.facebook_url;
    if (r.tiktok_handle) socials.tiktok = r.tiktok_handle;
    if (r.youtube_url) socials.youtube = r.youtube_url;
    return {
      id: r.id,
      name: r.full_name || (r.contributor_slug
        ? r.contributor_slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Unnamed Ministry'),
      role: 'contributor',
      kind: r.contributor_kind || 'organization',
      slug: r.contributor_slug || null,
      profilePhoto: r.logo_url || r.avatar_url || '',
      coverPhoto: '',
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
      coverPhoto: r.image_url || '',
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

    // active org the contributor manages: their real org (signed-in
    // contributor), an assist-mode/freshly-onboarded org, else demo Grace City.
    // Crash-safe: always resolves to SOME contributor object.
    const activeContributorId = myContributor
      ? myContributor.id
      : (realUser && role === 'contributor' ? realUser.id : 'c1');
    const activeContributor =
      (myContributor && myContributor.id === activeContributorId ? myContributor : null)
      || contributors.find((c) => c.id === activeContributorId)
      || contributors[0]
      || { id: 'c1', name: 'My Ministry', profilePhoto: '', coverPhoto: '', bio: '', involvementLevel: 'Shepherd', followerCount: 0, dominantNiche: '', website: '' };

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
      go('home');
      // Write to the database for real signed-in users (no-op in demo mode).
      if (realUser) {
        (async () => {
          try {
            const res = await authedFetch('/api/contributor/apply', {
              method: 'POST',
              body: JSON.stringify({
                display_name: form.orgName,
                contributor_kind: form.category,
                bio: form.bio,
                motivation_text: form.reason,
                physical_address: form.location,
                website_url: form.website || null,
                instagram_handle: (form.socials && form.socials.instagram) || null,
                facebook_url: (form.socials && form.socials.facebook) || null,
                tiktok_handle: (form.socials && form.socials.tiktok) || null,
                youtube_url: (form.socials && form.socials.youtube) || null,
              }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              console.warn('[apply] API error', res.status, body);
            }
          } catch (e) {
            console.warn('[apply] network error', e);
            // Local state is already set — don't alarm the user over a background write failure.
          }
        })();
      }
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
            instagram_url: socials.instagram || null,
            facebook_url: socials.facebook || null,
            youtube_url: socials.youtube || null,
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
        location: form.location || '', members: form.members || [], followerCount: 0,
        dominantNiche: DATA.getEventCategory(form.category) ? DATA.getEventCategory(form.category).name : 'Community',
        involvementLevel: 'Shepherd', collaborators: [], socials: form.socials || {}, isMine: true, verified: true,
      };
      if (!realUser) {
        setContributors((prev) => [...prev, localOrg]);
        setMyContributor(localOrg);
        setRole('contributor');
        toast('Welcome aboard! Your contributor profile is live.', 'green');
        go('dashboard');
        finish(true);
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
          const socials = form.socials || {};
          await authedFetch('/api/contributor/profile', {
            method: 'POST',
            body: JSON.stringify({
              bio: form.bio || undefined,
              website_url: asUrl(form.website) || undefined,
              physical_address: form.location || undefined,
              logo_url: form.profilePhoto && /^https:\/\//i.test(form.profilePhoto) ? form.profilePhoto : undefined,
              instagram_handle: socials.instagram || undefined,
              tiktok_handle: socials.tiktok || undefined,
            }),
          }).catch(() => {});
          // Refresh identity from the DB (slug included) so the dashboard is real.
          const { data: prof } = await window.CC_SUPABASE
            .from('profiles')
            .select('id, full_name, contributor_slug, contributor_kind, bio, logo_url, avatar_url, website_url, physical_address, instagram_handle, facebook_url, tiktok_handle, youtube_url')
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
      if (!realUser) { toast('Sign in with Google to vote on ideas.', 'gold'); return; }
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
        toast('Sign in with Google to schedule this project.', 'gold');
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

    // ── Own profile meta (bio / discoverable / notification prefs) ────
    //  Kept OUTSIDE realUser so updating it never re-triggers the
    //  realUser-keyed fetch effects.
    useEffect(() => {
      const sb = window.CC_SUPABASE;
      if (!sb || !realUser) { setMyProfileMeta(null); return; }
      let active = true;
      (async () => {
        try {
          const { data } = await sb
            .from('profiles')
            .select('bio, discoverable, notification_prefs')
            .eq('id', realUser.id)
            .maybeSingle();
          if (active && data) setMyProfileMeta({ bio: data.bio || '', discoverable: data.discoverable !== false, notificationPrefs: data.notification_prefs || {} });
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
            .select('id, full_name, contributor_slug, contributor_kind, bio, logo_url, avatar_url, website_url, physical_address, instagram_handle, facebook_url, tiktok_handle, youtube_url')
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

    // Reflect a freshly-uploaded avatar immediately (header + profile). The
    // /api/avatar route already persisted it to profiles.avatar_url, so this is
    // just the optimistic in-session overlay for citizen/admin. No-op in demo mode.
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
          const { error } = await window.CC_SUPABASE
            .from('profiles')
            .update({ full_name: fields.name, bio: fields.bio })
            .eq('id', realUser.id);
          if (error) throw error;
          setRealUser((prev) => (prev ? { ...prev, name: fields.name } : prev));
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

    useEffect(() => { window.__cc = { go, setRole, openCreate, closeCreate, setNav, submitApplication, reviewApplication, completeOnboarding, createEvent, createPlace, sendBroadcast }; });

    const value = {
      authed, signIn, signOut,
      role, setRole, nav, go,
      user, activeContributor, activeContributorId,
      events, places, contributors, applications, conversations, notifications,
      ideas, toggleIdeaVote, submitIdea, scheduleKingdomProject, confirmIdea,
      citizens: DATA.citizens,
      volunteerApps, reviewVolunteer, applyToVolunteer, cityReach, reports, resolveReport,
      assistMode, assistLoginAs, exitAssist,
      myApplication, myContributor, contributorDash,
      connected, considering, followedOrgs, followedPlaces,
      realUser,
      isAdmin: role === 'admin', isContributor: role === 'contributor', isCitizen: role === 'citizen',
      unreadNotifs, unreadMsgs, toasts, toast,
      createKind, openCreate, closeCreate, updateAvatar,
      adminStats, myProfileMeta, saveProfile, setDiscoverable, saveNotificationPref,
      creationStyle, setCreationStyle, pinStyle, setPinStyle, bubbleStyle, setBubbleStyle,
      submitApplication, reviewApplication, completeOnboarding,
      createEvent, createPlace, sendBroadcast, sendMessage, openConversation, startConversationWith,
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

  window.AppProvider = AppProvider;
  window.useApp = useApp;
  window.authedFetch = authedFetch;
  window.uploadImage = uploadImage;
})();
