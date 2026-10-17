// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Co-hosted events, the screens (tracker P2-09, migration 184).
//  ------------------------------------------------------------------
//  Two small components, both PURE ON THEIR PROPS (the Supabase client, the people and the toast are passed in), so a test
//  can mount one on its own against a stand-in client, and the same code serves the Dashboard and the Notifications screen:
//    CohostPanel          the organiser's panel on one of their events: who is invited, who accepted, find someone, remove
//    CohostInviteActions  the invited Contributor's Accept / Decline under their notification
//  Every change goes through window.CCCohosts (cohost-lib.jsx), whose three database functions check who is asking.
//
//  Public surface: window.CohostPanel, window.CohostInviteActions.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useCallback } = React;
  const { Avatar } = window.UI;
  const Icon = window.Icon;
  const MAX_RESULTS = 6;
  const STATUS_LABEL = { invited: 'Invited', accepted: 'Co-host', declined: 'Declined' };
  const btn = 'min-h-[44px] px-3 rounded-full text-xs font-bold border border-border bg-card text-foreground hover:bg-accent/60 disabled:opacity-50';

  /**
   * The organiser's panel for ONE event.
   *   sb            the signed-in Supabase client (window.CC_SUPABASE); without it the panel says to sign in
   *   event         { id, title }
   *   contributors  the directory ([{ id, name, profilePhoto, ... }]) people are found in and named from
   *   selfId        the organiser's own id (they cannot invite themselves)
   *   toast         (message, kind) => void
   */
  function CohostPanel({ sb, event, contributors, selfId, toast }) {
    const C = window.CCCohosts;
    const [rows, setRows] = useState(null);        // null = loading; [] none; { error: true } the read failed
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState('');          // the contributor id being invited or removed

    const refresh = useCallback(() => {
      if (!sb) { setRows([]); return Promise.resolve(); }
      return C.listForEvent(sb, event.id).then(setRows).catch(() => setRows({ error: true }));
    }, [sb, event.id]);
    useEffect(() => { refresh(); }, [refresh]);

    const nameOf = (cid) => { const c = contributors.find((x) => x.id === cid); return c ? c.name : 'A Contributor'; };
    const list = Array.isArray(rows) ? rows : [];
    const live = list.filter((r) => r.status === 'invited' || r.status === 'accepted');
    const taken = new Set(list.map((r) => r.contributorId));
    const needle = q.trim().toLowerCase();
    const found = needle.length < 2 ? [] : contributors
      .filter((c) => c.id !== selfId && !taken.has(c.id) && String(c.name || '').toLowerCase().indexOf(needle) !== -1)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .slice(0, MAX_RESULTS);

    const act = async (cid, run, okMessage) => {
      setBusy(cid);
      const r = await run();
      setBusy('');
      if (r.ok) { toast(okMessage, 'gold'); setQ(''); await refresh(); } else toast(r.message, 'red');
    };

    if (!sb) return h('div', { 'data-cohosts-panel': event.id, className: 'p-3 text-xs text-muted-foreground' }, 'Sign in to invite a co-host.');
    return h('div', { 'data-cohosts-panel': event.id, className: 'p-3 border-t border-border space-y-3' },
      h('div', null,
        h('p', { className: 'text-sm font-bold text-foreground' }, 'Co-hosts ', h('span', { 'data-cohosts-count': '', className: 'text-xs font-normal text-muted-foreground' }, '(' + live.length + ' of ' + C.MAX + ')')),
        h('p', { className: 'text-xs text-muted-foreground' }, 'Invite another Contributor. They get an invitation, and the event joins their page once they accept.')),
      rows === null && h('p', { role: 'status', className: 'text-xs text-muted-foreground' }, 'Loading…'),
      rows && rows.error && h('p', { role: 'alert', className: 'text-xs text-red-600' }, 'We could not load the co-hosts. Close this and open it again.'),
      list.length > 0 && h('ul', { 'data-cohosts-list': '', role: 'list', className: 'space-y-2' },
        list.map((r) => h('li', { key: r.contributorId, 'data-cohost-row': r.contributorId, 'data-status': r.status, className: 'flex items-center gap-2' },
          h('span', { className: 'flex-1 min-w-0 text-sm text-foreground truncate' }, nameOf(r.contributorId)),
          h('span', { 'data-cohost-status': '', className: 'text-xs text-muted-foreground shrink-0' }, STATUS_LABEL[r.status] || r.status),
          h('button', { type: 'button', 'data-cohost-remove': r.contributorId, disabled: busy === r.contributorId, className: btn,
            'aria-label': (r.status === 'invited' ? 'Withdraw the invitation to ' : 'Remove ') + nameOf(r.contributorId) + (r.status === 'invited' ? '' : ' as a co-host'),
            onClick: () => act(r.contributorId, () => C.remove(sb, event.id, r.contributorId), r.status === 'invited' ? 'Invitation withdrawn.' : 'Co-host removed.') },
            r.status === 'invited' ? 'Withdraw' : 'Remove')))),
      live.length < C.MAX
        ? h('div', { className: 'space-y-2' },
            h('input', { type: 'search', 'data-cohost-search': '', value: q, onChange: (e) => setQ(e.target.value), placeholder: 'Find a Contributor by name', 'aria-label': 'Find a Contributor to invite as a co-host',
              className: 'w-full min-h-[44px] px-3 rounded-xl border border-border bg-white/70 text-sm' }),
            needle.length >= 2 && found.length === 0 && h('p', { 'data-cohost-none': '', className: 'text-xs text-muted-foreground' }, 'No Contributor with that name.'),
            found.length > 0 && h('ul', { 'data-cohost-results': '', role: 'list', className: 'space-y-1' },
              found.map((c) => h('li', { key: c.id, className: 'flex items-center gap-2' },
                h(Avatar, { src: c.profilePhoto, name: c.name, size: 32, rounded: 'xl' }),
                h('span', { className: 'flex-1 min-w-0 text-sm text-foreground truncate' }, c.name),
                h('button', { type: 'button', 'data-cohost-invite': c.id, disabled: busy === c.id, 'aria-label': 'Invite ' + c.name + ' to co-host', className: btn,
                  onClick: () => act(c.id, () => C.invite(sb, event.id, c.id), 'Invitation sent to ' + c.name + '.') }, 'Invite')))))
        : h('p', { 'data-cohost-full': '', className: 'text-xs text-muted-foreground' }, 'This event has all ' + C.MAX + ' co-hosts. Remove one to invite someone else.'));
  }

  /**
   * Accept / Decline under a co-host invitation notification.
   *   sb, me (the signed-in person's id), eventId, toast, onAnswered (optional)
   * Shows the buttons only while the invitation is still open; otherwise it says what became of it.
   */
  function CohostInviteActions({ sb, me, eventId, toast, onAnswered }) {
    const C = window.CCCohosts;
    const [status, setStatus] = useState(undefined);   // undefined = loading; null = none / gone; 'invited' | 'accepted' | 'declined'
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      let live = true;
      if (!sb || !me || !eventId) { setStatus(null); return undefined; }
      C.myInvitations(sb, me).then((m) => { if (live) setStatus(m.get(eventId) || null); }).catch(() => { if (live) setStatus(null); });
      return () => { live = false; };
    }, [sb, me, eventId]);

    const answer = async (accept) => {
      setBusy(true);
      const r = await C.respond(sb, eventId, accept);
      setBusy(false);
      if (r.ok) {
        setStatus(r.status || (accept ? 'accepted' : 'declined'));
        toast(accept ? 'You are now a co-host.' : 'Invitation declined.', 'gold');
        if (onAnswered) onAnswered(accept);
      } else {
        toast(r.message, 'red');
        if (r.reason === 'no_open_invitation') setStatus(null);
      }
    };
    if (status === undefined) return null;
    if (status === 'invited') {
      return h('div', { 'data-cohost-invite-actions': eventId, className: 'flex gap-2 mt-2' },
        h('button', { type: 'button', 'data-cohost-accept': '', disabled: busy, className: btn + ' flex-1 bg-gold text-white border-transparent', onClick: (e) => { e.stopPropagation(); answer(true); } }, 'Accept'),
        h('button', { type: 'button', 'data-cohost-decline': '', disabled: busy, className: btn + ' flex-1', onClick: (e) => { e.stopPropagation(); answer(false); } }, 'Decline'));
    }
    return h('p', { 'data-cohost-invite-state': status || 'closed', className: 'text-xs text-muted-foreground mt-1' },
      status === 'accepted' ? 'You are co-hosting this event.' : status === 'declined' ? 'You declined this invitation.' : 'This invitation is no longer open.');
  }

  window.CohostPanel = CohostPanel;
  window.CohostInviteActions = CohostInviteActions;
})();
