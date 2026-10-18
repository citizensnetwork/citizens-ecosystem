// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Convince (FEAT-04): the "Friends considering" row on an event.
//  ------------------------------------------------------------------
//  One small component, PURE ON ITS PROPS (the Supabase client, the fetcher, the people and the toast are passed in), so a test can
//  mount it on its own against stand-ins and the same code serves the full event page and the Map v2 sheet:
//    FriendsConsidering   who among my mutual friends is considering this event, each with a gentle Nudge (and an Undo once sent)
//    ConsiderNote         the one line under Consider: friends who follow you back can see it, with a way to the switch
//  Every request goes through window.CCConvince (convince-lib.jsx). The row draws NOTHING while it loads, when no friend is
//  considering, or when the read fails: it is a quiet extra, never an empty box or an error nobody can act on.
//
//  Public surface: window.FriendsConsidering, window.ConsiderNote.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useCallback, useRef } = React;
  const { Avatar } = window.UI;
  const Icon = window.Icon;
  const btn = 'min-h-[44px] px-4 rounded-full text-xs font-bold border transition-colors disabled:opacity-50';

  /**
   * Props: sb (the signed-in Supabase client), eventId, eventTitle, me (the signed-in person's id), myName (their display name, may be
   * blank), authedFetch (window.authedFetch), toast ((message, kind) => void).
   */
  function FriendsConsidering({ sb, eventId, eventTitle, me, myName, authedFetch, toast }) {
    const C = window.CCConvince;
    const [friends, setFriends] = useState([]);
    const [busy, setBusy] = useState('');                 // the friend id a request is in flight for
    const seq = useRef(0);                                 // a late answer for an old event must not overwrite a newer one

    const load = useCallback(async () => {
      const mine = ++seq.current;
      const r = await C.friendsConsidering(sb, eventId);
      if (mine === seq.current) setFriends(r.friends);
    }, [sb, eventId]);
    useEffect(() => {
      setFriends([]);
      if (sb && me) load();
      return () => { seq.current += 1; };
    }, [sb, me, load]);

    const mark = (id, nudged) => setFriends((list) => list.map((f) => (f.id === id ? { ...f, nudged } : f)));

    const nudge = async (f) => {
      if (busy) return;
      setBusy(f.id);
      const r = await C.send(authedFetch, eventId, f.id);
      setBusy('');
      if (r.ok) {
        mark(f.id, true);
        toast(r.state === 'already' ? C.COPY.already(C.nameOf(f)) : C.COPY.sent(C.nameOf(f)), 'gold');
      } else {
        toast(r.message, r.reason === 'rate_limited' ? 'gold' : 'red');
        if (r.reason === 'refused') load();               // the list may have changed under us; say nothing about why
      }
    };
    const undo = async (f) => {
      if (busy) return;
      setBusy(f.id);
      const r = await C.withdraw(authedFetch, eventId, f.id);
      setBusy('');
      if (r.ok) { mark(f.id, false); toast(C.COPY.withdrawn, 'gold'); } else toast(r.message, 'red');
    };

    if (!sb || !me || friends.length === 0) return null;
    return h('section', { 'data-convince': 'row', 'aria-label': C.COPY.title, className: 'bg-card rounded-2xl border border-border p-4 space-y-3' },
      h('div', null,
        h('p', { className: 'text-sm font-bold text-foreground flex items-center gap-1.5' }, h(Icon, { name: 'Sparkles', size: 14, className: 'text-gold' }), C.COPY.title),
        h('p', { className: 'text-xs text-muted-foreground' }, C.COPY.sub)),
      h('ul', { role: 'list', 'data-convince': 'list', className: 'space-y-2' },
        friends.map((f) => {
          const name = C.nameOf(f);
          return h('li', { key: f.id, 'data-convince-friend': f.id, 'data-state': f.nudged ? 'nudged' : 'idle', className: 'flex items-center gap-3' },
            h(Avatar, { src: f.photo, name: f.name || name, size: 36, rounded: 'full' }),
            h('span', { 'data-convince-name': '', className: 'flex-1 min-w-0 text-sm font-semibold text-foreground truncate' }, name),
            f.nudged
              ? h('span', { className: 'flex items-center gap-2 shrink-0' },
                  h('span', { 'data-convince-done': '', className: 'flex items-center gap-1 text-xs font-bold text-gold-dark' }, h(Icon, { name: 'Check', size: 13 }), C.COPY.nudged),
                  h('button', { type: 'button', 'data-convince-undo': f.id, disabled: !!busy, 'aria-label': 'Withdraw your nudge to ' + name, onClick: () => undo(f),
                    className: btn + ' border-border bg-card text-muted-foreground hover:text-foreground' }, C.COPY.undo))
              : h('button', { type: 'button', 'data-convince-send': f.id, disabled: !!busy, 'aria-label': 'Nudge ' + name + ' to go to ' + (eventTitle || 'this event'), onClick: () => nudge(f),
                  className: btn + ' shrink-0 border-gold/50 bg-accent/60 text-gold-dark hover:bg-accent' }, busy === f.id ? '…' : C.COPY.nudge));
        })),
      h('p', { 'data-convince': 'preview', className: 'text-[11px] text-muted-foreground' }, 'They will read: “' + C.previewLine(myName, eventTitle) + '”.'));
  }

  /** The disclosure under Consider. Draws nothing when the person has already switched sharing off. */
  function ConsiderNote({ shared, onOpenSettings }) {
    const C = window.CCConvince;
    if (!shared) return null;
    return h('p', { 'data-consider-note': '', className: 'text-xs text-muted-foreground' },
      C.COPY.shareNote + ' ',
      h('button', { type: 'button', 'data-consider-note-link': '', onClick: onOpenSettings, className: 'underline font-semibold text-foreground/80 hover:text-foreground' }, C.COPY.shareNoteLink));
  }

  window.FriendsConsidering = FriendsConsidering;
  window.ConsiderNote = ConsiderNote;
})();
