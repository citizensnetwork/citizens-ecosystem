// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Moments, the Contributor's side (tracker P2-05, ADAPTED; migration 188).
//  ------------------------------------------------------------------
//  One component, PURE ON ITS PROPS (the Supabase client, the person's id and the toast are passed in), so a test can mount
//  it against a stand-in client and the Dashboard just places it:
//    MomentsBox  "Post a note": up to 280 characters and one optional picture, plus the Contributor's own live notes with
//                "Take down". The ONLY mention of time is "This clears itself after a day."
//  What it never shows (the attention test, tracker Q4): a countdown, a time left, a ring, who or how many saw a note.
//  Every call goes through window.CCMoments (moments-lib.jsx), whose rules the database enforces again.
//
//  Public surface: window.MomentsBox.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useCallback } = React;
  const { Field, Textarea, Button, MediaPicker } = window.UI;
  const smallBtn = 'min-h-[44px] px-3 rounded-full text-xs font-bold border border-border bg-card text-foreground hover:bg-accent/60 disabled:opacity-50';

  /**
   * sb          the signed-in Supabase client (window.CC_SUPABASE); without it the box says to sign in
   * me          the signed-in Contributor's id (a note is always posted AS the person who is signed in)
   * toast       (message, kind) => void
   * onChanged   optional: called after a note is posted or taken down, so a cached copy of the public page can be dropped
   */
  function MomentsBox({ sb, me, toast, onChanged }) {
    const M = window.CCMoments;
    const [mine, setMine] = useState(null);      // null = loading; [] none; { error: true } the read failed
    const [text, setText] = useState('');
    const [image, setImage] = useState('');
    const [busy, setBusy] = useState('');        // 'post' | the id being taken down

    const refresh = useCallback(() => {
      if (!sb || !me) { setMine([]); return Promise.resolve(); }
      return M.listMine(sb, me).then(setMine).catch(() => setMine({ error: true }));
    }, [sb, me]);
    useEffect(() => { refresh(); }, [refresh]);

    if (!sb || !me) return h('div', { 'data-moments-box': '', className: 'bg-card rounded-2xl border border-border p-4 text-xs text-muted-foreground' }, 'Sign in to post a note.');

    const list = Array.isArray(mine) ? mine : [];
    const used = M.size(M.clean(text));
    const verdict = M.check(text);
    const full = list.length >= M.MAX_LIVE;
    const over = used > M.MAX_CHARS;
    const ago = (m) => (window.MapV2Time ? window.MapV2Time.postedAgo(m.created_at, Date.now()) : '');

    const post = async () => {
      if (verdict !== 'ok' || full || busy) return;
      setBusy('post');
      try {
        const r = await M.post(sb, me, text, image);
        if (r.status === 'posted') {
          toast('Your note is up. It clears itself after a day.', 'gold');
          setText(''); setImage('');
          await refresh();
          if (onChanged) onChanged();
        } else if (r.status === 'limit') {
          toast('You already have ' + M.MAX_LIVE + ' notes up. Take one down to post another.', 'red');
          await refresh();
        } else if (r.status === 'not_allowed') {
          toast('Only an approved Contributor can post a note.', 'red');
        } else {
          toast(r.status === 'too_long' ? 'That note is too long.' : 'Write something first.', 'red');
        }
      } catch (e) {
        toast('We could not post your note. Please try again.', 'red');
      }
      setBusy('');
    };

    const takeDown = async (m) => {
      setBusy(m.id);
      try {
        await M.takeDown(sb, m.id);
        toast('Note taken down.', 'gold');
        await refresh();
        if (onChanged) onChanged();
      } catch (e) {
        toast('We could not take that down. Please try again.', 'red');
      }
      setBusy('');
    };

    return h('div', { 'data-moments-box': '', className: 'bg-card rounded-2xl border border-border p-4 space-y-3' },
      h('div', null,
        h('p', { className: 'text-sm font-bold text-foreground' }, 'Post a note'),
        h('p', { className: 'text-xs text-muted-foreground' }, 'A short word for today, on your page under Today. This clears itself after a day.')),
      full
        ? h('p', { 'data-moments-full': '', className: 'text-xs text-muted-foreground' }, 'You have ' + M.MAX_LIVE + ' notes up. Take one down to post another.')
        : h('div', { className: 'space-y-3' },
            h(Field, { label: 'Note' },
              h(Textarea, { value: text, rows: 3, 'data-moments-text': '', 'aria-label': 'Your note for today', 'aria-describedby': 'moments-count', onChange: (e) => setText(e.target.value), placeholder: 'e.g. Tonight’s prayer walk starts at the north gate.' })),
            h('p', { id: 'moments-count', 'data-moments-count': over ? 'over' : 'ok', className: 'text-xs ' + (over ? 'text-red-600 font-bold' : 'text-muted-foreground') },
              over ? (used - M.MAX_CHARS) + ' too many' : (M.MAX_CHARS - used) + ' left'),
            h(Field, { label: 'Photo (optional)' }, h(MediaPicker, { value: image, onChange: setImage, aspect: '16/9', label: 'photo', scope: 'event-cover' })),
            h(Button, { variant: 'gold', className: 'w-full', icon: 'Check', 'data-moments-post': '', disabled: verdict !== 'ok' || !!busy, onClick: post }, busy === 'post' ? 'Posting…' : 'Post')),
      mine === null && h('p', { role: 'status', className: 'text-xs text-muted-foreground' }, 'Loading your notes…'),
      mine && mine.error && h('p', { role: 'alert', className: 'text-xs text-red-600' }, 'We could not load your notes. Close this tab and open it again.'),
      list.length > 0 && h('ul', { 'data-moments-list': '', role: 'list', className: 'space-y-2 pt-1' },
        list.map((m) => h('li', { key: m.id, 'data-moment-row': m.id, className: 'p-3 rounded-xl border border-border bg-white/60' },
          m.image_url && window.UI.safeUrl(m.image_url) && h('img', { src: m.image_url, alt: '', loading: 'lazy', className: 'w-full h-28 object-cover rounded-lg mb-2' }),
          h('p', { 'data-moment-body': '', className: 'text-sm text-foreground whitespace-pre-line break-words' }, m.body),
          h('div', { className: 'flex items-center justify-between gap-2 mt-2' },
            h('span', { className: 'text-[11px] text-muted-foreground' }, ago(m)),
            h('button', { type: 'button', 'data-moment-takedown': m.id, disabled: busy === m.id, className: smallBtn,
              'aria-label': 'Take down the note: ' + String(m.body).slice(0, 40), onClick: () => takeDown(m) }, 'Take down')))))
    );
  }

  window.MomentsBox = MomentsBox;
})();
