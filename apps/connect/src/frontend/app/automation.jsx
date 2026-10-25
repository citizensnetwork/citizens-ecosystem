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
  const { useState, useEffect, useCallback, useRef } = React;
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

  // ── choosing several suggestions at once (pure) ──────────────────────────

  /** What a suggestion is called to someone using a screen reader: its title, or what it would change. */
  function suggestionTitle(s) {
    const p = (s && s.payload) || {};
    if (s && s.kind === 'profile') return 'Update your ' + (FIELD_LABEL[p.field] || 'profile');
    return p.title || (s && s.kind === 'news' ? 'News post' : 'Event');
  }

  /** `picked` is a list of ids. Add or remove one, never duplicating. */
  function toggled(picked, id, on) {
    const rest = picked.filter((x) => x !== id);
    return on ? rest.concat(id) : rest;
  }

  /**
   * The selection as it stands against what is STILL waiting: a card decided somewhere else (another
   * tab, an editor, a per-card Dismiss) drops out, so a count or a confirm can never mention it.
   */
  function selectionOf(pending, picked) {
    const ids = pending.map((s) => s.id).filter((id) => picked.indexOf(id) !== -1);
    const total = pending.length;
    return { ids, count: ids.length, total, all: total > 0 && ids.length === total, some: ids.length > 0 && ids.length < total };
  }

  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const selectionText = (count, total) => (count === 0 ? 'None selected' : count + ' of ' + total + ' selected');
  const dismissQuestion = (count) => 'Dismiss ' + plural(count, 'suggestion', 'suggestions') + '?';

  /** The toast after a batch Dismiss. `failed` of `total` were not dismissed and stay selected. */
  function dismissedText(total, failed) {
    if (!failed) return 'Dismissed ' + plural(total, 'suggestion', 'suggestions') + '.';
    return 'Dismissed ' + (total - failed) + ' of ' + total + '. ' + failed + (failed === 1 ? ' is' : ' are') + ' still selected. Please try again.';
  }

  /** Run `fn` over `items`, `size` at a time, keeping the order of the results. */
  async function mapInChunks(items, size, fn) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
      out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    }
    return out;
  }

  // ── editing a suggestion that is still waiting (pure) ────────────────────

  /** The fields an owner can change, as the form shows them (an event's start split into their local date and time). */
  function draftFromSuggestion(s) {
    const p = (s && s.payload) || {};
    if (s && s.kind === 'event') {
      const start = new Date(p.start);
      const ok = !isNaN(start.getTime());
      return { title: p.title || '', description: p.description || '', location: p.location || '', date: ok ? localDate(start) : '', time: ok ? localTime(start) : '' };
    }
    if (s && s.kind === 'news') return { title: p.title || '', body: p.body || '' };
    return { value: p.value || '' };
  }

  /**
   * What the owner changed, in payload terms (the keys the server accepts), or null when nothing differs.
   * A new date or time becomes `start`, an ISO instant from their local clock; an unreadable one becomes ''
   * so the server's own rule refuses it with its own reason.
   */
  function changesFromDraft(s, draft) {
    const before = draftFromSuggestion(s);
    const changes = {};
    Object.keys(before).forEach((k) => {
      if (k !== 'date' && k !== 'time' && draft[k] !== before[k]) changes[k] = draft[k];
    });
    if (s.kind === 'event' && (draft.date !== before.date || draft.time !== before.time)) {
      const when = draft.date && draft.time ? new Date(draft.date + 'T' + draft.time) : null;
      changes.start = when && !isNaN(when.getTime()) ? when.toISOString() : '';
    }
    return Object.keys(changes).length ? changes : null;
  }

  /** The suggestion's payload with `changes` laid over it. Moving an event's start moves its end too (the length is kept), as on the server. */
  function applyChanges(s, changes) {
    const p = Object.assign({}, s.payload, changes || {});
    if (s.kind === 'event' && changes && changes.start && !('end' in changes) && s.payload.end) {
      const was = Date.parse(s.payload.start);
      const wasEnd = Date.parse(s.payload.end);
      const next = Date.parse(changes.start);
      if (isFinite(was) && isFinite(wasEnd) && isFinite(next)) p.end = new Date(next + (wasEnd - was)).toISOString();
    }
    return p;
  }

  const EDIT_ERRORS = {
    event_title_required: 'Please give it a title of at least 3 letters.',
    news_title_required: 'Please give it a title of at least 3 letters.',
    news_body_required: 'A news post needs some text.',
    event_start_invalid: 'Please check the date and the time.',
    event_start_out_of_range: 'That date is too far away to be right. Please check it.',
    profile_value_required: 'Please type the new text.',
    profile_value_invalid: 'That does not look right for this field. Please check it.',
    not_pending: 'This one has already been dealt with, so it has left your list.',
    not_found: 'This one is no longer in your list.',
    consent_off: 'Automatic updates are off, so nothing can be saved.',
    rate_limited: 'Too many tries. Please wait a moment.',
    edit_unavailable: 'Saving changes is not switched on yet. You can still change the text and publish it.',
  };
  const editErrorText = (reason) => EDIT_ERRORS[reason] || 'Could not save that change. Please try again.';

  window.CC_AUTOMATION_HELPERS = {
    LEVELS, SOURCE_KINDS, parseSourceUrl, sourceDomain, timeAgo, eventFormFromPayload, newsFormFromPayload,
    profileFieldsFrom, FIELD_LABEL, suggestionTitle, toggled, selectionOf, selectionText, dismissQuestion,
    dismissedText, mapInChunks, draftFromSuggestion, changesFromDraft, applyChanges, editErrorText,
  };

  // ── the hook ─────────────────────────────────────────────────────────────

  function useAutomation(app) {
    const { realUser, role, toast, activeContributorId, listingRole: givenRole } = app;
    const sb = window.CC_SUPABASE;
    const listingRole = givenRole || (role === 'contributor' ? 'owner' : null);
    const canManageConsent = listingRole === 'owner';
    const viewOnly = listingRole === 'viewer';
    const enabled = !!(sb && realUser && (listingRole === 'owner' || listingRole === 'editor'));
    // status: 'idle' (not applicable) | 'loading' | 'ready' | 'unavailable'
    const [data, setData] = useState({ status: 'idle', settings: null, sources: [], suggestions: [] });
    const [busy, setBusy] = useState(false);
    // Set when the server says it cannot save edits yet (the database function is not deployed): the form then stops offering Save.
    const [saveOff, setSaveOff] = useState(false);
    // An editor writes sources against the listing, not their own profile.
    const uid = listingRole === 'editor' ? activeContributorId : (realUser ? realUser.id : null);

    const load = useCallback(async () => {
      if (!enabled || !uid) { setData({ status: 'idle', settings: null, sources: [], suggestions: [] }); return; }
      try {
        const [settings, sources, suggestions] = await Promise.all([
          canManageConsent
            ? sb.rpc('get_my_automation_settings')
            : Promise.resolve({ data: { success: true, level: 'suggest' }, error: null }),
          sb.from('listing_sources').select('id, kind, url, enabled, last_checked_at, last_status, created_at').eq('contributor_id', uid).order('created_at', { ascending: true }),
          sb.from('listing_suggestions').select('id, kind, payload, source_url, status, published_ref, created_at, decided_at').eq('contributor_id', uid).order('created_at', { ascending: false }).limit(200),
        ]);
        if ((canManageConsent && (settings.error || !settings.data || !settings.data.success)) || sources.error || suggestions.error) {
          setData({ status: 'unavailable', settings: null, sources: [], suggestions: [] });
          return;
        }
        setData({ status: 'ready', settings: settings.data, sources: sources.data || [], suggestions: suggestions.data || [] });
      } catch (e) {
        setData({ status: 'unavailable', settings: null, sources: [], suggestions: [] });
      }
    }, [enabled, uid, canManageConsent]);

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

    // Dismiss several at once: the same database call as one Dismiss, a few at a time. A dismissed row
    // stays (only its status changes), so its fingerprint still tells the Reader "already known" and the
    // same item is not suggested again. Resolves to { total, failedIds }, or false when not ready.
    const dismissOne = async (id) => {
      const { data: res, error } = await sb.rpc('decide_listing_suggestion', { _id: id, _action: 'dismiss', _ref: null });
      if (error || !res) return 'failed';
      if (res.success) return 'done';
      // Already decided somewhere else, or removed: it is out of the inbox either way.
      return res.reason === 'not_pending' || res.reason === 'not_found' ? 'gone' : 'failed';
    };
    const dismissMany = guard(async (ids) => {
      const outcomes = await mapInChunks(ids, 6, dismissOne);
      const failedIds = ids.filter((_, i) => outcomes[i] === 'failed');
      toast(dismissedText(ids.length, failedIds.length), failedIds.length ? 'red' : 'green');
      await load();
      return { total: ids.length, failedIds };
    });

    // Keep an edit of a waiting suggestion without publishing it. The server checks it with the same rules as
    // a suggestion from the Reader (validateSuggestion) and that the caller may edit this listing; it resolves
    // to { ok: true, payload, warnings } or { ok: false, message }.
    const saveEdit = guard(async (s, changes) => {
      let res;
      let body = null;
      try {
        res = await window.authedFetch('/api/automation/suggestions/' + encodeURIComponent(s.id), { method: 'PATCH', body: JSON.stringify({ edits: changes }) });
        body = await res.json().catch(() => null);
      } catch (e) {
        return { ok: false, message: editErrorText() };
      }
      if (!res.ok || !body || !body.payload) {
        // A missing route or function, a proxy error page: all "not available", never a half-save.
        const reason = (body && body.error) || ([404, 405, 501, 502, 503].indexOf(res.status) !== -1 ? 'edit_unavailable' : undefined);
        if (reason === 'edit_unavailable') setSaveOff(true);
        if (reason === 'not_pending' || reason === 'not_found') await load(); // it has left the list
        return { ok: false, message: editErrorText(reason) };
      }
      const warnings = body.warnings || [];
      toast(warnings.length ? 'Saved. ' + warnings.join(' ') : 'Saved. It is still waiting for you to publish or dismiss.', warnings.length ? 'gold' : 'green');
      await load();
      return { ok: true, payload: body.payload, warnings };
    });

    // Publish a pending suggestion. `edited` (optional) is what the owner changed in the form, in payload terms.
    const publish = guard(async (s, edited) => {
      const p = applyChanges(s, edited);
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
    return Object.assign({}, data, { enabled, busy, pending, autoPublished, canManageConsent, viewOnly, saveOff, reload: load, setLevel, addSource, toggleSource, removeSource, dismiss, dismissMany, saveEdit, publish, unpublish });
  }

  // ── Profile tab: the card ────────────────────────────────────────────────

  function AutomaticUpdatesCard({ auto }) {
    const [kind, setKind] = useState('website');
    const [url, setUrl] = useState('');
    const [confirmPause, setConfirmPause] = useState(false);
    if (!auto || auto.status === 'idle' || auto.viewOnly) return null;
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
    const on = !auto.canManageConsent || level !== 'off';
    const consentLine = auto.settings.consent_at
      ? 'Your choice was recorded on ' + new Date(auto.settings.consent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' (from ' + (CONSENT_FROM[auto.settings.consent_source] || 'your dashboard') + ').'
      : null;
    const info = kindInfo(kind);

    return shell([
      h(F, { key: 'head' }, title),
      auto.canManageConsent && h('div', { key: 'levels', role: 'radiogroup', 'aria-label': 'Automatic updates level', className: 'space-y-2' },
        LEVELS.map((l) => h('button', {
          key: l.value, type: 'button', role: 'radio', 'aria-checked': level === l.value, disabled: auto.busy,
          onClick: () => { if (level !== l.value) auto.setLevel(l.value); },
          className: cx('w-full text-left p-3 rounded-xl border-2 transition-all disabled:opacity-60', level === l.value ? 'border-gold bg-accent/50' : 'border-border bg-white/60 hover:border-gold/40'),
        },
          h('span', { className: 'flex items-center gap-2' },
            h('span', { className: cx('w-4 h-4 rounded-full border-2 shrink-0', level === l.value ? 'border-gold bg-gold' : 'border-muted-foreground/40') }),
            h('span', { className: 'text-sm font-bold text-foreground' }, l.title)),
          h('span', { className: 'block text-xs text-muted-foreground mt-1 ml-6 leading-relaxed' }, l.desc)))),
      auto.canManageConsent && consentLine && h('p', { key: 'consent', className: 'text-[11px] text-muted-foreground' }, consentLine),
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

      auto.canManageConsent && on && h('div', { key: 'pause', className: 'pt-1' },
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

  function Card({ children, kind, selected }) {
    return h('div', {
      className: cx('bg-card rounded-2xl border p-4 space-y-3 transition-colors', selected ? 'border-gold bg-accent/30' : 'border-border'),
      'data-suggestion': kind, 'data-selected': selected ? 'true' : undefined,
    }, children);
  }

  // A native checkbox, so Space, the screen reader's "checkbox, not checked" and the browser's own
  // focus ring all work. The label around it makes the whole 44 x 44 px square tappable.
  function PickBox({ checked, onChange, label, disabled }) {
    return h('label', { className: 'shrink-0 w-11 h-11 flex items-center justify-center cursor-pointer' },
      h('input', {
        type: 'checkbox', checked, disabled, 'aria-label': label,
        onChange: (e) => onChange(e.target.checked),
        className: 'w-5 h-5 accent-[#A67C00] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A67C00]',
      }));
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

  function SuggestionCard({ s, auto, pick }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(() => draftFromSuggestion(s));
    const [problem, setProblem] = useState('');
    const rowRef = useRef(null);
    const backToEdit = useRef(false);
    const p = s.payload || {};
    const set = (k) => (e) => { setProblem(''); setDraft((d) => Object.assign({}, d, { [k]: e.target.value })); };
    // What would change if this were saved or published now (null: nothing).
    const changes = editing ? changesFromDraft(s, draft) : null;
    const tall = 'min-h-[44px]';

    // After the form closes, a keyboard or screen-reader user lands back on "Edit", not on nothing.
    useEffect(() => {
      if (editing || !backToEdit.current) return;
      backToEdit.current = false;
      const el = rowRef.current && rowRef.current.querySelector('[data-focus="edit"]');
      if (el) el.focus();
    }, [editing]);

    const startEditing = () => { setDraft(draftFromSuggestion(s)); setProblem(''); setEditing(true); };
    const stopEditing = (from) => { backToEdit.current = true; setProblem(''); setDraft(draftFromSuggestion(from || s)); setEditing(false); };
    const save = async () => {
      if (!changes) return;
      const res = await auto.saveEdit(s, changes);
      if (!res) return;
      if (!res.ok) { setProblem(res.message); return; }
      stopEditing({ kind: s.kind, payload: res.payload });
    };

    const head = s.kind === 'event'
      ? h('div', null,
          h('p', { className: 'text-sm font-bold text-foreground' }, p.title),
          h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, [whenText(p.start), p.location].filter(Boolean).join(' · ')))
      : s.kind === 'news'
        ? h('p', { className: 'text-sm font-bold text-foreground' }, p.title)
        : h('p', { className: 'text-sm font-bold text-foreground' }, 'Update your ' + (FIELD_LABEL[p.field] || 'profile'));
    const body = s.kind === 'profile' ? p.value : (s.kind === 'news' ? p.body : p.description);
    const valueLabel = FIELD_LABEL[p.field] || 'New value';

    return h(Card, { kind: s.kind, selected: !!(pick && pick.checked) },
      h('div', { className: 'flex items-start gap-1' },
        pick && h('div', { className: '-ml-3 -mt-2 -mb-2' },
          h(PickBox, { checked: pick.checked, disabled: pick.disabled, onChange: pick.onChange, label: 'Select ' + suggestionTitle(s) })),
        h('div', { className: cx('flex-1 min-w-0', pick && 'pt-0.5') }, head)),
      !editing && body && h('p', { className: 'text-xs text-muted-foreground leading-relaxed line-clamp-4 whitespace-pre-line' }, body),
      editing && h('div', { className: 'space-y-2', onKeyDown: (e) => { if (e.key === 'Escape') stopEditing(); }, 'data-editing': s.kind },
        s.kind !== 'profile' && h(Field, { label: 'Title' }, h(Input, { value: draft.title, onChange: set('title'), maxLength: 120, 'aria-label': 'Title', autoFocus: true, className: tall })),
        s.kind === 'event' && h('div', { className: 'grid grid-cols-2 gap-2' },
          h(Field, { label: 'Date' }, h(Input, { type: 'date', value: draft.date, onChange: set('date'), 'aria-label': 'Date', className: tall })),
          h(Field, { label: 'Time' }, h(Input, { type: 'time', value: draft.time, onChange: set('time'), 'aria-label': 'Time', className: tall }))),
        s.kind === 'event' && h(Field, { label: 'Where' }, h(Input, { value: draft.location, onChange: set('location'), maxLength: 300, 'aria-label': 'Where', className: tall })),
        s.kind === 'event' && h(Field, { label: 'Details' }, h(Textarea, { value: draft.description, onChange: set('description'), rows: 4, maxLength: 2000, 'aria-label': 'Details' })),
        s.kind === 'news' && h(Field, { label: 'Post' }, h(Textarea, { value: draft.body, onChange: set('body'), rows: 5, maxLength: 4000, 'aria-label': 'Post' })),
        s.kind === 'profile' && h(Field, { label: valueLabel }, h(Textarea, { value: draft.value, onChange: set('value'), rows: 3, maxLength: 1000, 'aria-label': valueLabel, autoFocus: true })),
        problem && h('p', { role: 'alert', className: 'text-xs font-semibold text-destructive' }, problem),
        h('p', { className: 'text-[11px] text-muted-foreground leading-relaxed' },
          auto.saveOff
            ? 'Saving changes is not switched on yet. Publish this when it looks right, or dismiss it.'
            : 'Save keeps your changes here and nothing is published yet. You can publish or dismiss it later.')),
      h(SourceLine, { url: s.source_url }),
      !auto.viewOnly && h('div', { ref: rowRef, className: 'flex flex-wrap gap-2' },
        h(Button, { variant: 'primary', size: 'sm', icon: 'Check', className: tall, disabled: auto.busy, onClick: () => auto.publish(s, changes) }, s.kind === 'profile' ? 'Apply' : 'Publish'),
        editing
          ? (!auto.saveOff && h(Button, { variant: 'soft', size: 'sm', icon: 'Save', className: tall, disabled: auto.busy || !changes, onClick: save }, 'Save changes'))
          : h(Button, { 'data-focus': 'edit', variant: 'outline', size: 'sm', icon: 'Pencil', className: tall, disabled: auto.busy, onClick: startEditing }, 'Edit'),
        editing && h(Button, { variant: 'outline', size: 'sm', className: tall, disabled: auto.busy, onClick: () => stopEditing() }, 'Cancel'),
        h(Button, { variant: 'ghost', size: 'sm', icon: 'X', className: tall, disabled: auto.busy, onClick: () => auto.dismiss(s.id) }, 'Dismiss')));
  }

  function SuggestionsTab({ auto, onOpenSettings, onViewEvent }) {
    if (auto && auto.viewOnly) {
      return h(Empty, { icon: 'Sparkles', title: 'View only', sub: 'You can look at this listing. Suggesting and publishing updates stays with an editor or the owner.' });
    }
    if (!auto || auto.status === 'idle') {
      return h(Empty, { icon: 'Sparkles', title: 'Suggestions appear here', sub: 'Sign in with your Contributor account to see updates suggested from your public website, YouTube channel and calendar.' });
    }
    if (auto.status === 'loading') return h('p', { className: 'text-xs text-muted-foreground py-8 text-center' }, 'Loading…');
    if (auto.status === 'unavailable') {
      return h(Empty, { icon: 'Sparkles', title: 'Suggestions are not available right now', sub: 'Please check back soon.' });
    }
    return h(Inbox, { auto, onOpenSettings, onViewEvent });
  }

  // The selection bar: "Select all", how many are chosen (announced politely as it changes), and the one
  // batch action. Dismissing asks first, in the page, and says how many.
  function SelectionBar({ auto, sel, setPicked, onDismissed }) {
    const [confirming, setConfirming] = useState(false);
    const allRef = useRef(null);
    const barRef = useRef(null);
    // (Button does not forward a ref, so a control is found by its data-focus name.)
    const focusOn = (name) => { const el = barRef.current && barRef.current.querySelector('[data-focus="' + name + '"]'); if (el) el.focus(); };
    useEffect(() => { if (allRef.current) allRef.current.indeterminate = sel.some; });
    useEffect(() => { if (confirming) focusOn('confirm'); }, [confirming]);
    // A different selection is a different question, so an open confirm closes.
    useEffect(() => { setConfirming(false); }, [sel.count]);

    const cancel = () => { setConfirming(false); focusOn('open'); };
    const confirm = async () => {
      const res = await auto.dismissMany(sel.ids);
      setConfirming(false);
      if (!res) return;
      setPicked(res.failedIds); // only what could not be dismissed stays selected
      onDismissed();
    };
    const question = dismissQuestion(sel.count);

    return h('div', { ref: barRef, className: 'bg-card rounded-2xl border border-border p-2 space-y-2', 'data-bar': 'selection' },
      h('div', { className: 'flex flex-wrap items-center gap-x-3 gap-y-1' },
        h('label', { className: 'flex items-center gap-1 min-h-[44px] pr-2 cursor-pointer' },
          h('span', { className: 'w-11 h-11 flex items-center justify-center' },
            h('input', {
              ref: allRef, type: 'checkbox', checked: sel.all, disabled: auto.busy,
              onChange: (e) => setPicked(e.target.checked ? auto.pending.map((s) => s.id) : []),
              className: 'w-5 h-5 accent-[#A67C00] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A67C00]',
            })),
          h('span', { className: 'text-xs font-bold text-foreground' }, 'Select all (' + sel.total + ')')),
        h('p', { role: 'status', 'aria-live': 'polite', 'data-selection-count': sel.count, className: 'text-xs text-muted-foreground flex-1' }, selectionText(sel.count, sel.total)),
        sel.count > 0 && h('div', { className: 'flex gap-2' },
          h(Button, { 'data-focus': 'open', variant: 'danger', size: 'sm', icon: 'Trash2', className: 'min-h-[44px]', disabled: auto.busy, 'aria-expanded': confirming, onClick: () => setConfirming(true) }, 'Dismiss selected (' + sel.count + ')'),
          h(Button, { variant: 'ghost', size: 'sm', className: 'min-h-[44px]', disabled: auto.busy, onClick: () => setPicked([]) }, 'Clear'))),
      confirming && sel.count > 0 && h('div', {
        role: 'group', 'aria-label': question, onKeyDown: (e) => { if (e.key === 'Escape') cancel(); },
        className: 'p-3 rounded-xl border border-border bg-white/60 space-y-2', 'data-confirm': 'dismiss',
      },
        h('p', { className: 'text-sm font-bold text-foreground' }, question),
        h('p', { className: 'text-xs text-muted-foreground leading-relaxed' }, 'They leave this list, and we will not suggest these same items again. Nothing is deleted from your listing.'),
        h('div', { className: 'flex flex-wrap gap-2' },
          h(Button, { 'data-focus': 'confirm', variant: 'danger', size: 'sm', className: 'min-h-[44px]', disabled: auto.busy, onClick: confirm }, 'Yes, dismiss ' + sel.count),
          h(Button, { variant: 'outline', size: 'sm', className: 'min-h-[44px]', disabled: auto.busy, onClick: cancel }, 'Keep them'))));
  }

  function Inbox({ auto, onOpenSettings, onViewEvent }) {
    const [picked, setPicked] = useState([]);
    const introRef = useRef(null);
    const groups = [['event', 'Events'], ['news', 'News posts'], ['profile', 'Profile updates']];
    const level = auto.settings.level;
    const sel = selectionOf(auto.pending, picked);
    return h('div', { className: 'space-y-4 fade-in' },
      h('p', { ref: introRef, tabIndex: -1, className: 'text-xs text-muted-foreground leading-relaxed outline-none' },
        level === 'off'
          ? 'Automatic updates are off, so nothing new will arrive. '
          : 'Updates we found on your public sources wait here for your decision. ',
        h('button', { type: 'button', onClick: onOpenSettings, className: 'text-gold-dark font-semibold hover:underline' }, 'Change your automatic updates')),
      auto.pending.length === 0 && h(Empty, {
        icon: 'Sparkles', title: 'Nothing is waiting for you',
        sub: level === 'off' ? 'Turn on automatic updates in your Profile tab and new events, news and profile changes will appear here for you to approve.' : 'When we find something new on your website, YouTube channel or calendar it will appear here for you to approve.',
      }),
      auto.pending.length > 0 && h(SelectionBar, { auto, sel, setPicked, onDismissed: () => { if (introRef.current) introRef.current.focus(); } }),
      groups.map(([kind, label]) => {
        const rows = auto.pending.filter((s) => s.kind === kind);
        if (!rows.length) return null;
        return h(F, { key: kind },
          h('p', { className: 'text-xs font-bold text-muted-foreground uppercase tracking-widest pt-1' }, label),
          rows.map((s) => h(SuggestionCard, {
            key: s.id, s, auto,
            pick: { checked: sel.ids.indexOf(s.id) !== -1, disabled: auto.busy, onChange: (on) => setPicked((cur) => toggled(cur, s.id, on)) },
          })));
      }),
      auto.autoPublished.length > 0 && h(F, null,
        h('p', { className: 'text-xs font-bold text-muted-foreground uppercase tracking-widest pt-2' }, 'Published automatically'),
        auto.autoPublished.map((s) => h(Card, { key: s.id, kind: 'auto' },
          h('div', null,
            h('p', { className: 'text-sm font-bold text-foreground' }, (s.payload && s.payload.title) || 'Event'),
            h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, [s.payload && whenText(s.payload.start), s.payload && s.payload.location].filter(Boolean).join(' · '))),
          h(SourceLine, { url: s.source_url }),
          h('div', { className: 'flex flex-wrap gap-2' },
            s.published_ref && h(Button, { variant: 'outline', size: 'sm', icon: 'Calendar', className: 'min-h-[44px]', onClick: () => onViewEvent(s.published_ref) }, 'View event'),
            h(Button, { variant: 'danger', size: 'sm', icon: 'Undo2', className: 'min-h-[44px]', disabled: auto.busy, onClick: () => auto.unpublish(s) }, 'Unpublish'))))));
  }

  window.useAutomation = useAutomation;
  window.AutomaticUpdatesCard = AutomaticUpdatesCard;
  window.SuggestionsTab = SuggestionsTab;
})();
