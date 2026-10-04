// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — listing automation, owner side (Phase 1)
//
//  With a Contributor's consent, Citizens reads their PUBLIC website, YouTube
//  channel and calendar and turns what it finds into SUGGESTIONS that wait here
//  (events, news posts, profile updates). The owner approves, edits or dismisses
//  each one; at the "events_auto" level future events are published for them
//  (labelled, with one tap to undo). This file is the owner's half:
//
//    window.useAutomation(app)        data + actions (one hook, called by DashboardPage)
//    window.AutomaticUpdatesCard      Profile tab: the level, the sources, "Pause everything"
//    window.SuggestionsTab            the inbox, and what was published automatically
//    window.CC_AUTOMATION_HELPERS     the pure parts, unit-tested without a browser
//
//  Everything runs on the owner's OWN session (RLS) and three SECURITY DEFINER
//  functions (mig 181): get_my_automation_settings, set_my_automation_level,
//  decide_listing_suggestion. The consent columns are private and server-owned;
//  nothing here can write them directly. A suggestion's text is rendered as text
//  (never HTML). No third-party images are imported (the CSP would block them).
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect, useCallback } = React;
  const { cx, Button, Field, Input, Textarea, Toggle, Empty } = window.UI;
  const Icon = window.Icon;

  const LEVELS = [
    { value: 'off', title: 'Off', desc: 'Nothing is read and nothing is suggested.' },
    { value: 'suggest', title: 'Suggest updates for my approval', desc: 'We read your public sources and suggest updates. You approve, edit or dismiss each one.' },
    { value: 'events_auto', title: 'Publish events automatically, suggest the rest', desc: 'New upcoming events go live marked "Imported from" their source, with one tap to undo. News and profile changes still wait for you.' },
  ];

  // Facebook, Instagram and TikTok can be listed but not read yet (they need the page owner to connect an account).
  const SOURCE_KINDS = [
    { value: 'website', label: 'Website', readable: true, placeholder: 'https://yourchurch.org' },
    { value: 'youtube', label: 'YouTube channel', readable: true, placeholder: 'https://www.youtube.com/@yourchannel' },
    { value: 'calendar', label: 'Calendar link (.ics)', readable: true, placeholder: 'https://example.org/events.ics' },
    { value: 'facebook', label: 'Facebook page', readable: false, placeholder: 'https://www.facebook.com/yourpage' },
    { value: 'instagram', label: 'Instagram', readable: false, placeholder: 'https://www.instagram.com/yourhandle/' },
    { value: 'tiktok', label: 'TikTok', readable: false, placeholder: 'https://www.tiktok.com/@yourhandle' },
  ];
  const kindInfo = (kind) => SOURCE_KINDS.find((k) => k.value === kind) || { value: kind, label: kind, readable: false };

  const CONSENT_FROM = { google_form: 'the sign-up form', dashboard: 'your dashboard', admin: 'an admin' };

  // ── pure helpers (no React, no DOM beyond Date) ──────────────────────────

  const two = (n) => (n < 10 ? '0' : '') + n;
  const localDate = (d) => d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
  const localTime = (d) => two(d.getHours()) + ':' + two(d.getMinutes());

  /** An https link from what a person types ("example.org" is fine), or null. */
  function parseSourceUrl(raw) {
    if (typeof raw !== 'string') return null;
    let t = raw.trim();
    if (!t || t.length > 500) return null;
    // Anything that is not already http(s):// gets https:// put in front of it, so the scheme can only
    // ever end up https: "javascript:x" becomes the (invalid) host "javascript" and is refused below.
    if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
    let u;
    try { u = new URL(t); } catch (e) { return null; }
    if (u.username || u.password || !u.hostname.includes('.')) return null;
    u.protocol = 'https:';
    u.hash = '';
    const out = u.toString();
    return out.length > 500 ? null : out;
  }

  /** "https://www.church.example/x" → "church.example". */
  function sourceDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  /** "Never checked" / "Checked 3 hours ago". */
  function timeAgo(iso, now) {
    if (!iso) return 'Never checked';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return 'Never checked';
    const mins = Math.max(0, Math.round(((now || Date.now()) - t) / 60000));
    if (mins < 1) return 'Checked just now';
    if (mins < 60) return 'Checked ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
    const hours = Math.round(mins / 60);
    if (hours < 48) return 'Checked ' + hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
    const days = Math.round(hours / 24);
    return 'Checked ' + days + ' days ago';
  }

  /** The create-event form values for a suggested event, in the owner's own timezone. */
  function eventFormFromPayload(p) {
    const start = new Date(p.start);
    let endTime = '';
    if (p.end) {
      const end = new Date(p.end);
      if (!isNaN(end.getTime()) && localDate(end) === localDate(start)) endTime = localTime(end);
    }
    return {
      title: p.title || '', category: p.category || 'church-services', description: p.description || '',
      date: isNaN(start.getTime()) ? '' : localDate(start), time: isNaN(start.getTime()) ? '' : localTime(start), endTime,
      location: p.location || '', address: '', coverPhoto: '', gallery: [], socials: {}, volunteeringEnabled: false,
    };
  }

  /** The news-post form values; the source link rides along as a plain line (a post has no link column). */
  function newsFormFromPayload(p) {
    const body = (p.body || '') + (p.link ? '\n\nSource: ' + p.link : '');
    return { title: p.title || '', body, date: p.post_date || '' };
  }

  // profile suggestion field → the store's updateContributorProfile() shape
  const SOCIAL_KEY_BY_FIELD = {
    instagram_handle: 'instagram', facebook_url: 'facebook', tiktok_handle: 'tiktok',
    youtube_url: 'youtube', x_handle: 'x', linkedin_url: 'linkedin',
  };
  function profileFieldsFrom(field, value, contributor) {
    if (field === 'bio') return { bio: value };
    if (field === 'website_url') return { website: value };
    if (field === 'contact_email') return { contactEmail: value };
    const key = SOCIAL_KEY_BY_FIELD[field];
    // Merge: updateContributorProfile clears every social that is not in the object.
    if (key) return { socials: Object.assign({}, (contributor && contributor.socials) || {}, { [key]: value }) };
    return null;
  }

  const FIELD_LABEL = {
    bio: 'About text', website_url: 'Website', contact_email: 'Contact email', instagram_handle: 'Instagram',
    facebook_url: 'Facebook', tiktok_handle: 'TikTok', youtube_url: 'YouTube', x_handle: 'X', linkedin_url: 'LinkedIn',
  };

  window.CC_AUTOMATION_HELPERS = {
    LEVELS, SOURCE_KINDS, parseSourceUrl, sourceDomain, timeAgo, eventFormFromPayload, newsFormFromPayload,
    profileFieldsFrom, FIELD_LABEL,
  };

  // ── the hook ─────────────────────────────────────────────────────────────

  function useAutomation(app) {
    const { realUser, role, toast } = app;
    const sb = window.CC_SUPABASE;
    const enabled = !!(sb && realUser && role === 'contributor');
    // status: 'idle' (not applicable) | 'loading' | 'ready' | 'unavailable'
    const [data, setData] = useState({ status: 'idle', settings: null, sources: [], suggestions: [] });
    const [busy, setBusy] = useState(false);
    const uid = realUser ? realUser.id : null;

    const load = useCallback(async () => {
      if (!enabled) { setData({ status: 'idle', settings: null, sources: [], suggestions: [] }); return; }
      try {
        const [settings, sources, suggestions] = await Promise.all([
          sb.rpc('get_my_automation_settings'),
          sb.from('listing_sources').select('id, kind, url, enabled, last_checked_at, last_status, created_at').eq('contributor_id', uid).order('created_at', { ascending: true }),
          sb.from('listing_suggestions').select('id, kind, payload, source_url, status, published_ref, created_at, decided_at').eq('contributor_id', uid).order('created_at', { ascending: false }).limit(200),
        ]);
        if (settings.error || !settings.data || !settings.data.success || sources.error || suggestions.error) {
          setData({ status: 'unavailable', settings: null, sources: [], suggestions: [] });
          return;
        }
        setData({ status: 'ready', settings: settings.data, sources: sources.data || [], suggestions: suggestions.data || [] });
      } catch (e) {
        setData({ status: 'unavailable', settings: null, sources: [], suggestions: [] });
      }
    }, [enabled, uid]);

    useEffect(() => { load(); }, [load]);

    const guard = (fn) => async (...args) => {
      if (data.status !== 'ready') return false;
      setBusy(true);
      try { return await fn(...args); } finally { setBusy(false); }
    };
    const failed = (what) => { toast('Could not ' + what + '. Please try again.', 'red'); return false; };

    const setLevel = guard(async (level) => {
      const { data: res, error } = await sb.rpc('set_my_automation_level', { _level: level });
      if (error || !res || !res.success) return failed('change that setting');
      toast(level === 'off' ? 'Automatic updates are off. Nothing more will be read.' : 'Saved. Automatic updates are on.', level === 'off' ? 'gold' : 'green');
      await load();
      return true;
    });

    const addSource = guard(async (kind, rawUrl) => {
      const url = parseSourceUrl(rawUrl);
      if (!url) { toast('That does not look like a web link. Try something like https://yourchurch.org', 'red'); return false; }
      const info = kindInfo(kind);
      const on = info.readable && data.settings.level !== 'off';
      const { error } = await sb.from('listing_sources').insert({ contributor_id: uid, kind, url, enabled: on });
      if (error) {
        if (error.code === '23505') { toast('That source is already in your list.', 'gold'); return false; }
        if (/too_many_sources/.test(error.message || '')) { toast('You can list up to 12 sources. Remove one first.', 'gold'); return false; }
        return failed('add that source');
      }
      await load();
      return true;
    });

    const toggleSource = guard(async (id, on) => {
      const { error } = await sb.from('listing_sources').update({ enabled: on }).eq('id', id);
      if (error) return failed('change that source');
      await load();
      return true;
    });

    const removeSource = guard(async (id) => {
      const { error } = await sb.from('listing_sources').delete().eq('id', id);
      if (error) return failed('remove that source');
      await load();
      return true;
    });

    const decide = async (id, action, ref) => {
      const { data: res, error } = await sb.rpc('decide_listing_suggestion', { _id: id, _action: action, _ref: ref || null });
      return !error && !!res && !!res.success;
    };

    const dismiss = guard(async (id) => {
      if (!(await decide(id, 'dismiss'))) return failed('dismiss that suggestion');
      await load();
      return true;
    });

    // Publish a pending suggestion. `edited` (optional) is the owner's inline edit of the payload.
    const publish = guard(async (s, edited) => {
      const p = Object.assign({}, s.payload, edited || {});
      const finishWith = async (ok, ref) => {
        if (!ok) return false; // the create function already told the owner
        // An event or post must be linked to the suggestion (the database checks it is theirs).
        if (s.kind !== 'profile' && !ref) {
          toast('Published, but we could not link it to the suggestion. Please dismiss the suggestion.', 'gold');
        } else if (!(await decide(s.id, 'published', ref))) {
          toast('Published, but we could not tidy the suggestion away. You can dismiss it.', 'gold');
        }
        await load();
        return true;
      };
      if (s.kind === 'event') {
        return new Promise((resolve) => {
          app.createEvent(eventFormFromPayload(p), (ok, row) => { finishWith(ok, row && row.id).then(resolve); });
        });
      }
      if (s.kind === 'news') {
        return new Promise((resolve) => {
          app.createNewsPost(newsFormFromPayload(p), (ok, row) => { finishWith(ok, row && row.id).then(resolve); });
        });
      }
      const fields = profileFieldsFrom(p.field, p.value, app.activeContributor);
      if (!fields) return failed('apply that update');
      return new Promise((resolve) => {
        app.updateContributorProfile(fields, (ok) => { finishWith(ok, null).then(resolve); });
      });
    });

    // Undo an automatically published event: the database cancels it and clears the suggestion.
    const unpublish = guard(async (s) => {
      if (!(await decide(s.id, 'unpublish'))) return failed('unpublish that event');
      if (s.published_ref && app.setEventStatus) app.setEventStatus(s.published_ref, 'cancelled');
      await load();
      return true;
    });

    const pending = data.suggestions.filter((s) => s.status === 'pending');
    const autoPublished = data.suggestions.filter((s) => s.status === 'auto_published');
    return Object.assign({}, data, { enabled, busy, pending, autoPublished, reload: load, setLevel, addSource, toggleSource, removeSource, dismiss, publish, unpublish });
  }

  // ── Profile tab: the card ────────────────────────────────────────────────

  function AutomaticUpdatesCard({ auto }) {
    const [kind, setKind] = useState('website');
    const [url, setUrl] = useState('');
    const [confirmPause, setConfirmPause] = useState(false);
    if (!auto || auto.status === 'idle') return null;
    const shell = (children) => h('div', { className: 'bg-card rounded-2xl border border-border p-4 space-y-4 fade-in', 'data-card': 'automatic-updates' }, children);
    const title = h('div', { className: 'flex items-start gap-2.5' },
      h('div', { className: 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-accent text-gold-dark' }, h(Icon, { name: 'Sparkles', size: 17 })),
      h('div', null,
        h('p', { className: 'text-sm font-bold text-foreground leading-tight' }, 'Automatic updates'),
        h('p', { className: 'text-xs text-muted-foreground mt-0.5 leading-relaxed' },
          'Keeping a listing current takes time. With your permission, Citizens can read your public website, YouTube channel and calendar and suggest events, news and profile updates here. Nothing changes without your yes, unless you choose to have new events published for you.')));
    if (auto.status === 'loading') return shell([h(F, { key: 'head' }, title), h('p', { key: 'l', className: 'text-xs text-muted-foreground' }, 'Loading your settings…')]);
    if (auto.status === 'unavailable') {
      return shell([h(F, { key: 'head' }, title), h('p', { key: 'u', className: 'text-xs text-muted-foreground' }, 'Automatic updates are not available for your account right now. Please check back soon.')]);
    }

    const level = auto.settings.level;
    const on = level !== 'off';
    const consentLine = auto.settings.consent_at
      ? 'Your choice was recorded on ' + new Date(auto.settings.consent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' (from ' + (CONSENT_FROM[auto.settings.consent_source] || 'your dashboard') + ').'
      : null;
    const info = kindInfo(kind);

    return shell([
      h(F, { key: 'head' }, title),
      h('div', { key: 'levels', role: 'radiogroup', 'aria-label': 'Automatic updates level', className: 'space-y-2' },
        LEVELS.map((l) => h('button', {
          key: l.value, type: 'button', role: 'radio', 'aria-checked': level === l.value, disabled: auto.busy,
          onClick: () => { if (level !== l.value) auto.setLevel(l.value); },
          className: cx('w-full text-left p-3 rounded-xl border-2 transition-all disabled:opacity-60', level === l.value ? 'border-gold bg-accent/50' : 'border-border bg-white/60 hover:border-gold/40'),
        },
          h('span', { className: 'flex items-center gap-2' },
            h('span', { className: cx('w-4 h-4 rounded-full border-2 shrink-0', level === l.value ? 'border-gold bg-gold' : 'border-muted-foreground/40') }),
            h('span', { className: 'text-sm font-bold text-foreground' }, l.title)),
          h('span', { className: 'block text-xs text-muted-foreground mt-1 ml-6 leading-relaxed' }, l.desc)))),
      consentLine && h('p', { key: 'consent', className: 'text-[11px] text-muted-foreground' }, consentLine),
      h('p', { key: 'privacy', className: 'text-[11px] text-muted-foreground leading-relaxed' },
        'We only read what your organisation has already made public. We never import personal phone numbers or email addresses, and you can pause everything at any time.'),

      h('div', { key: 'sources', className: 'space-y-2' },
        h('p', { className: 'text-xs font-bold text-muted-foreground uppercase tracking-widest' }, 'Where we look'),
        auto.sources.length === 0 && h('p', { className: 'text-xs text-muted-foreground' }, 'No sources yet. Add your website, YouTube channel or calendar link below.'),
        auto.sources.map((s) => {
          const ki = kindInfo(s.kind);
          return h('div', { key: s.id, className: 'flex items-center gap-3 p-3 rounded-xl border border-border bg-white/60', 'data-source': s.kind },
            h('div', { className: 'flex-1 min-w-0' },
              h('p', { className: 'text-sm font-semibold text-foreground' }, ki.label),
              h('p', { className: 'text-xs text-muted-foreground truncate' }, sourceDomain(s.url) + (s.url.replace(/^https:\/\/[^/]+/, '').length > 1 ? ' …' : '')),
              ki.readable
                ? h('p', { className: 'text-[11px] text-muted-foreground mt-0.5' }, timeAgo(s.last_checked_at) + (s.last_status ? ' · ' + s.last_status : ''))
                : h('p', { className: 'text-[11px] text-gold-dark mt-0.5' }, 'Coming soon — needs a page connection')),
            ki.readable && h('div', { className: 'shrink-0', title: on ? '' : 'Turn automatic updates on first' },
              h(Toggle, { checked: !!s.enabled && on, onChange: (v) => { if (on) auto.toggleSource(s.id, v); } })),
            h('button', { type: 'button', 'aria-label': 'Remove ' + ki.label, disabled: auto.busy, onClick: () => auto.removeSource(s.id), className: 'w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50' },
              h(Icon, { name: 'Trash2', size: 14 })));
        }),
        h('div', { className: 'flex flex-col sm:flex-row gap-2 pt-1' },
          h('select', { value: kind, onChange: (e) => setKind(e.target.value), 'aria-label': 'Source type', className: 'px-3 py-2.5 bg-white/70 border border-border rounded-xl text-sm text-foreground' },
            SOURCE_KINDS.map((k) => h('option', { key: k.value, value: k.value }, k.label))),
          h(Input, { value: url, onChange: (e) => setUrl(e.target.value), placeholder: info.placeholder, 'aria-label': 'Source link', className: 'flex-1' }),
          h(Button, { variant: 'outline', size: 'sm', icon: 'Plus', disabled: auto.busy || !url.trim(), onClick: async () => { if (await auto.addSource(kind, url)) setUrl(''); } }, 'Add'))),

      on && h('div', { key: 'pause', className: 'pt-1' },
        confirmPause
          ? h('div', { className: 'p-3 rounded-xl border border-border bg-white/60 space-y-2' },
              h('p', { className: 'text-xs text-foreground leading-relaxed' }, 'Pausing switches off every source and clears the suggestions waiting for you. Pause now?'),
              h('div', { className: 'flex gap-2' },
                h(Button, { variant: 'danger', size: 'sm', disabled: auto.busy, onClick: async () => { await auto.setLevel('off'); setConfirmPause(false); } }, 'Pause everything'),
                h(Button, { variant: 'outline', size: 'sm', onClick: () => setConfirmPause(false) }, 'Keep it on')))
          : h(Button, { variant: 'outline', size: 'sm', icon: 'Pause', onClick: () => setConfirmPause(true) }, 'Pause everything')),
    ]);
  }

  // ── Suggestions tab ──────────────────────────────────────────────────────

  function Card({ children, kind }) {
    return h('div', { className: 'bg-card rounded-2xl border border-border p-4 space-y-3', 'data-suggestion': kind }, children);
  }

  function SourceLine({ url }) {
    if (!url) return null;
    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', className: 'inline-flex items-center gap-1 text-[11px] text-gold-dark hover:underline' },
      h(Icon, { name: 'ExternalLink', size: 11 }), 'From ' + sourceDomain(url));
  }

  const whenText = (iso) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  function SuggestionCard({ s, auto }) {
    const [editing, setEditing] = useState(false);
    const p = s.payload || {};
    const [draft, setDraft] = useState(() => (
      s.kind === 'event' ? { title: p.title || '', description: p.description || '', location: p.location || '' }
      : s.kind === 'news' ? { title: p.title || '', body: p.body || '' }
      : { value: p.value || '' }));
    const set = (k) => (e) => setDraft((d) => Object.assign({}, d, { [k]: e.target.value }));
    const edited = editing ? draft : null;

    const head = s.kind === 'event'
      ? h('div', null,
          h('p', { className: 'text-sm font-bold text-foreground' }, p.title),
          h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, [whenText(p.start), p.location].filter(Boolean).join(' · ')))
      : s.kind === 'news'
        ? h('p', { className: 'text-sm font-bold text-foreground' }, p.title)
        : h('p', { className: 'text-sm font-bold text-foreground' }, 'Update your ' + (FIELD_LABEL[p.field] || 'profile'));
    const body = s.kind === 'profile' ? p.value : (s.kind === 'news' ? p.body : p.description);

    return h(Card, { kind: s.kind },
      head,
      !editing && body && h('p', { className: 'text-xs text-muted-foreground leading-relaxed line-clamp-4 whitespace-pre-line' }, body),
      editing && h('div', { className: 'space-y-2' },
        s.kind !== 'profile' && h(Field, { label: 'Title' }, h(Input, { value: draft.title, onChange: set('title'), maxLength: 120, 'aria-label': 'Title' })),
        s.kind === 'event' && h(Field, { label: 'Where' }, h(Input, { value: draft.location, onChange: set('location'), maxLength: 300, 'aria-label': 'Where' })),
        s.kind === 'event' && h(Field, { label: 'Details' }, h(Textarea, { value: draft.description, onChange: set('description'), rows: 4, maxLength: 2000, 'aria-label': 'Details' })),
        s.kind === 'news' && h(Field, { label: 'Post' }, h(Textarea, { value: draft.body, onChange: set('body'), rows: 5, maxLength: 4000, 'aria-label': 'Post' })),
        s.kind === 'profile' && h(Field, { label: FIELD_LABEL[p.field] || 'New value' }, h(Textarea, { value: draft.value, onChange: set('value'), rows: 3, maxLength: 1000, 'aria-label': FIELD_LABEL[p.field] || 'New value' }))),
      h(SourceLine, { url: s.source_url }),
      h('div', { className: 'flex flex-wrap gap-2' },
        h(Button, { variant: 'primary', size: 'sm', icon: 'Check', disabled: auto.busy, onClick: () => auto.publish(s, edited) }, s.kind === 'profile' ? 'Apply' : 'Publish'),
        h(Button, { variant: 'outline', size: 'sm', icon: 'Pencil', disabled: auto.busy, onClick: () => setEditing((v) => !v) }, editing ? 'Stop editing' : 'Edit'),
        h(Button, { variant: 'ghost', size: 'sm', icon: 'X', disabled: auto.busy, onClick: () => auto.dismiss(s.id) }, 'Dismiss')));
  }

  function SuggestionsTab({ auto, onOpenSettings, onViewEvent }) {
    if (!auto || auto.status === 'idle') {
      return h(Empty, { icon: 'Sparkles', title: 'Suggestions appear here', sub: 'Sign in with your Contributor account to see updates suggested from your public website, YouTube channel and calendar.' });
    }
    if (auto.status === 'loading') return h('p', { className: 'text-xs text-muted-foreground py-8 text-center' }, 'Loading…');
    if (auto.status === 'unavailable') {
      return h(Empty, { icon: 'Sparkles', title: 'Suggestions are not available right now', sub: 'Please check back soon.' });
    }
    const groups = [['event', 'Events'], ['news', 'News posts'], ['profile', 'Profile updates']];
    const level = auto.settings.level;
    return h('div', { className: 'space-y-4 fade-in' },
      h('p', { className: 'text-xs text-muted-foreground leading-relaxed' },
        level === 'off'
          ? 'Automatic updates are off, so nothing new will arrive. '
          : 'Updates we found on your public sources wait here for your decision. ',
        h('button', { type: 'button', onClick: onOpenSettings, className: 'text-gold-dark font-semibold hover:underline' }, 'Change your automatic updates')),
      auto.pending.length === 0 && h(Empty, {
        icon: 'Sparkles', title: 'Nothing is waiting for you',
        sub: level === 'off' ? 'Turn on automatic updates in your Profile tab and new events, news and profile changes will appear here for you to approve.' : 'When we find something new on your website, YouTube channel or calendar it will appear here for you to approve.',
      }),
      groups.map(([kind, label]) => {
        const rows = auto.pending.filter((s) => s.kind === kind);
        if (!rows.length) return null;
        return h(F, { key: kind },
          h('p', { className: 'text-xs font-bold text-muted-foreground uppercase tracking-widest pt-1' }, label),
          rows.map((s) => h(SuggestionCard, { key: s.id, s, auto })));
      }),
      auto.autoPublished.length > 0 && h(F, null,
        h('p', { className: 'text-xs font-bold text-muted-foreground uppercase tracking-widest pt-2' }, 'Published automatically'),
        auto.autoPublished.map((s) => h(Card, { key: s.id, kind: 'auto' },
          h('div', null,
            h('p', { className: 'text-sm font-bold text-foreground' }, (s.payload && s.payload.title) || 'Event'),
            h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, [s.payload && whenText(s.payload.start), s.payload && s.payload.location].filter(Boolean).join(' · '))),
          h(SourceLine, { url: s.source_url }),
          h('div', { className: 'flex flex-wrap gap-2' },
            s.published_ref && h(Button, { variant: 'outline', size: 'sm', icon: 'Calendar', onClick: () => onViewEvent(s.published_ref) }, 'View event'),
            h(Button, { variant: 'danger', size: 'sm', icon: 'Undo2', disabled: auto.busy, onClick: () => auto.unpublish(s) }, 'Unpublish'))))));
  }

  window.useAutomation = useAutomation;
  window.AutomaticUpdatesCard = AutomaticUpdatesCard;
  window.SuggestionsTab = SuggestionsTab;
})();
