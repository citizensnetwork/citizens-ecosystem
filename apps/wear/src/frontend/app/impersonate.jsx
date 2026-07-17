// ── Impersonate: the read-only "view as user" screen (mig 163) ─────
// Sources EVERY panel from the audited /api/admin/impersonation/view/*
// endpoints — each server call writes an audit row before returning data,
// so there is no way to see the target's account that isn't logged. Nothing
// here mutates anything; settings are shown read-only; DM bodies open only
// behind a per-thread reason (§7.2-3). Any expired/ended session drops the
// whole surface via a silent local exit (the banner + notify are handled
// server-side). Exposes window.CWScreens.Impersonate.
(function () {
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { useStore } = window.CWStore;
  const { Avatar, BrandLogo, Spinner, EmptyState, GOLD, fmtCount, timeAgo } = window.CWUI;
  const { Icon } = window.CWIcons;

  const TABS = [
    { k: 'profile', label: 'Profile' },
    { k: 'feed', label: 'Feed' },
    { k: 'saves', label: 'Saved' },
    { k: 'notifications', label: 'Inbox' },
    { k: 'messages', label: 'Messages' },
  ];

  // A call that treats an expired/ended/missing session as "session over" →
  // drop the whole view (silent local exit; the server already handles the
  // banner-notify path). Everything else bubbles as a normal error.
  function useAuthedCall() {
    const { exitImpersonation } = useStore();
    return useCallback(
      async (fn) => {
        try {
          return await fn();
        } catch (e) {
          const gone =
            e &&
            (e.status === 410 ||
              e.code === 'session_expired' ||
              e.code === 'session_not_active' ||
              e.code === 'session_not_found');
          if (gone) {
            exitImpersonation({ silent: true });
            return null;
          }
          throw e;
        }
      },
      [exitImpersonation],
    );
  }

  function Panel({ children }) {
    return h('div', { className: 'cwsc fade-in', style: { padding: '14px 16px 120px' } }, children);
  }

  function Loading() {
    return h(
      'div',
      { style: { display: 'flex', justifyContent: 'center', padding: 48 } },
      h(Spinner, {}),
    );
  }

  function Row({ label, value }) {
    return h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          padding: '9px 0',
          borderBottom: '1px solid #f4f2ee',
          fontSize: 13,
        },
      },
      h('span', { style: { color: '#8a8880', fontWeight: 600 } }, label),
      h('span', { style: { fontWeight: 700, textAlign: 'right', color: '#2a2a2a' } }, value),
    );
  }

  // ── Profile panel ──
  function ProfilePanel({ sessionId }) {
    const call = useAuthedCall();
    const [data, setData] = useState(null);
    useEffect(() => {
      let live = true;
      call(() =>
        window.CW_API.get('/api/admin/impersonation/view/profile?sessionId=' + sessionId),
      ).then((d) => {
        if (live && d) setData(d);
      });
      return () => {
        live = false;
      };
    }, [sessionId, call]);
    if (!data) return h(Loading, {});
    const s = data.settings || {};
    return h(
      Panel,
      {},
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 13, marginBottom: 6 } },
        h(Avatar, { user: data.user, size: 60 }),
        h(
          'div',
          { style: { minWidth: 0 } },
          h('div', { style: { fontSize: 16, fontWeight: 800 } }, data.user.displayName),
          h('div', { style: { fontSize: 12.5, color: '#a09e97' } }, '@' + data.user.handle),
          data.role
            ? h(
                'span',
                {
                  style: {
                    display: 'inline-block',
                    marginTop: 4,
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    color: '#7a6212',
                    background: '#faf6ec',
                    border: '1px solid #f0e2b0',
                    borderRadius: 6,
                    padding: '2px 7px',
                  },
                },
                data.role,
              )
            : null,
        ),
      ),
      data.profile && data.profile.bio
        ? h(
            'div',
            {
              style: {
                fontSize: 13,
                lineHeight: 1.5,
                color: '#2a2a2a',
                whiteSpace: 'pre-wrap',
                margin: '10px 0 4px',
              },
            },
            data.profile.bio,
          )
        : null,
      h(
        'div',
        { style: { marginTop: 12 } },
        h(Row, { label: 'Posts', value: fmtCount(data.counts.posts) }),
        h(Row, { label: 'Followers', value: fmtCount(data.counts.followers) }),
        h(Row, { label: 'Following', value: fmtCount(data.counts.following) }),
        h(Row, { label: 'Concepts', value: fmtCount(data.counts.concepts) }),
        h(Row, {
          label: 'Creator badge',
          value: data.creator.earned
            ? 'Earned'
            : data.creator.conceptCount + ' / ' + data.creator.threshold,
        }),
        h(Row, {
          label: 'Profile visibility',
          value: (data.profile && data.profile.visibility) || '—',
        }),
        h(Row, {
          label: 'Wear-verified',
          value: data.profile && data.profile.verified ? 'Yes' : 'No',
        }),
        h(Row, { label: 'Display name override', value: s.displayNameOverride || '—' }),
      ),
      data.brands && data.brands.length
        ? h(
            'div',
            { style: { marginTop: 16 } },
            h('div', { style: { fontSize: 12.5, fontWeight: 800, marginBottom: 8 } }, 'Brands'),
            data.brands.map((b) =>
              h(
                'div',
                {
                  key: b.id,
                  style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' },
                },
                h(BrandLogo, { brand: b, size: 32 }),
                h('span', { style: { fontSize: 13, fontWeight: 700 } }, b.name),
                b.verified
                  ? Icon('check', { size: 14, color: GOLD })
                  : h('span', { style: { fontSize: 11, color: '#a09e97' } }, 'unverified'),
              ),
            ),
          )
        : null,
      h(ReadOnlyNote, {}),
    );
  }

  function ReadOnlyNote() {
    return h(
      'div',
      {
        style: {
          marginTop: 18,
          fontSize: 11,
          color: '#a09e97',
          textAlign: 'center',
          lineHeight: 1.4,
        },
      },
      'Read-only. This session is time-boxed and every screen you open is recorded.',
    );
  }

  // ── Feed panel ──
  function PostCard({ p }) {
    const chip = (label, on) =>
      h(
        'span',
        {
          style: {
            fontSize: 10.5,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 20,
            background: on ? '#faf6ec' : '#f4f2ee',
            color: on ? '#7a6212' : '#a09e97',
          },
        },
        label,
      );
    return h(
      'div',
      { style: { padding: '12px 0', borderBottom: '1px solid #f4f2ee' } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 } },
        h(Avatar, { user: p.author, size: 30 }),
        h(
          'div',
          { style: { minWidth: 0, flex: 1 } },
          h(
            'div',
            { style: { fontSize: 12.5, fontWeight: 700 } },
            (p.brand && p.brand.name) || (p.author && p.author.displayName) || 'Unknown',
          ),
          h(
            'div',
            { style: { fontSize: 10.5, color: '#a09e97' } },
            (p.author ? '@' + p.author.handle : '') + ' · ' + (timeAgo ? timeAgo(p.createdAt) : ''),
          ),
        ),
      ),
      p.body ? h('div', { style: { fontSize: 13, lineHeight: 1.5 } }, p.body) : null,
      p.media && p.media.length
        ? h('img', {
            src: p.media[0].url,
            alt: p.media[0].altText || '',
            referrerPolicy: 'no-referrer',
            style: { width: '100%', borderRadius: 10, marginTop: 8, display: 'block' },
          })
        : null,
      h(
        'div',
        { style: { display: 'flex', gap: 7, marginTop: 8, alignItems: 'center' } },
        h(
          'span',
          { style: { fontSize: 11.5, color: '#8a8880' } },
          fmtCount(p.likeCount) + ' likes',
        ),
        h('span', { style: { fontSize: 11.5, color: '#8a8880' } }, '·'),
        h(
          'span',
          { style: { fontSize: 11.5, color: '#8a8880' } },
          fmtCount(p.commentCount) + ' comments',
        ),
        h('div', { style: { flex: 1 } }),
        p.viewerLiked ? chip('Liked', true) : null,
        p.viewerSaved ? chip('Saved', true) : null,
      ),
    );
  }

  function FeedPanel({ sessionId }) {
    const call = useAuthedCall();
    const [mode, setMode] = useState('for-you');
    const [data, setData] = useState(null);
    useEffect(() => {
      let live = true;
      setData(null);
      call(() =>
        window.CW_API.get(
          '/api/admin/impersonation/view/feed?sessionId=' + sessionId + '&mode=' + mode,
        ),
      ).then((d) => {
        if (live && d) setData(d);
      });
      return () => {
        live = false;
      };
    }, [sessionId, mode, call]);
    const toggle = (k, label) =>
      h(
        'button',
        {
          onClick: () => setMode(k),
          style: {
            flex: 1,
            border: 'none',
            background: mode === k ? '#fff' : 'transparent',
            color: mode === k ? '#1a1a1a' : '#8a8880',
            fontWeight: 700,
            fontSize: 12.5,
            borderRadius: 8,
            padding: '7px 0',
            boxShadow: mode === k ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
          },
        },
        label,
      );
    return h(
      Panel,
      {},
      h(
        'div',
        {
          style: {
            display: 'flex',
            gap: 4,
            background: '#f4f2ee',
            borderRadius: 10,
            padding: 3,
            marginBottom: 6,
          },
        },
        toggle('for-you', 'For you'),
        toggle('chronological', 'Following'),
      ),
      !data
        ? h(Loading, {})
        : data.items.length
          ? data.items.map((p) => h(PostCard, { key: p.id, p }))
          : h(EmptyState, { title: 'No posts', note: 'This feed is empty right now.' }),
    );
  }

  // ── Saved panel ──
  function SavesPanel({ sessionId }) {
    const call = useAuthedCall();
    const [data, setData] = useState(null);
    useEffect(() => {
      let live = true;
      call(() =>
        window.CW_API.get('/api/admin/impersonation/view/saves?sessionId=' + sessionId),
      ).then((d) => {
        if (live && d) setData(d);
      });
      return () => {
        live = false;
      };
    }, [sessionId, call]);
    if (!data) return h(Loading, {});
    if (!data.collections.length)
      return h(
        Panel,
        {},
        h(EmptyState, { title: 'No saved boards', note: 'This user has not saved anything.' }),
      );
    return h(
      Panel,
      {},
      data.collections.map((c) =>
        h(
          'div',
          { key: c.id, style: { marginBottom: 18 } },
          h(
            'div',
            { style: { fontSize: 13, fontWeight: 800, marginBottom: 8 } },
            c.name + ' · ' + c.posts.length,
          ),
          c.posts.length
            ? c.posts.map((p) =>
                h(PostCard, { key: p.id, p: { ...p, likeCount: 0, commentCount: 0 } }),
              )
            : h('div', { style: { fontSize: 12, color: '#a09e97' } }, 'Empty board.'),
        ),
      ),
    );
  }

  // ── Notifications panel ──
  function NotificationsPanel({ sessionId }) {
    const call = useAuthedCall();
    const [data, setData] = useState(null);
    useEffect(() => {
      let live = true;
      call(() =>
        window.CW_API.get('/api/admin/impersonation/view/notifications?sessionId=' + sessionId),
      ).then((d) => {
        if (live && d) setData(d);
      });
      return () => {
        live = false;
      };
    }, [sessionId, call]);
    if (!data) return h(Loading, {});
    if (!data.items.length)
      return h(Panel, {}, h(EmptyState, { title: 'Inbox empty', note: 'No notifications.' }));
    return h(
      Panel,
      {},
      h(
        'div',
        { style: { fontSize: 11.5, color: '#a09e97', marginBottom: 8 } },
        data.unreadCount + ' unread',
      ),
      data.items.map((n) =>
        h(
          'div',
          {
            key: n.id,
            style: {
              display: 'flex',
              gap: 10,
              padding: '10px 0',
              borderBottom: '1px solid #f4f2ee',
              opacity: n.readAt ? 0.65 : 1,
            },
          },
          n.actor
            ? h(Avatar, { user: n.actor, size: 34 })
            : h('div', {
                style: { width: 34, height: 34, borderRadius: '50%', background: '#f4f2ee' },
              }),
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontSize: 12.5, fontWeight: 700 } }, n.type.replace(/_/g, ' ')),
            h(
              'div',
              { style: { fontSize: 11.5, color: '#8a8880' } },
              timeAgo ? timeAgo(n.createdAt) : n.createdAt,
            ),
          ),
        ),
      ),
    );
  }

  // ── Messages panel (list = metadata; thread = reason-gated) ──
  function MessagesPanel({ sessionId }) {
    const call = useAuthedCall();
    const [list, setList] = useState(null);
    const [thread, setThread] = useState(null); // {conversationId, data}
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      let live = true;
      call(() =>
        window.CW_API.get('/api/admin/impersonation/view/conversations?sessionId=' + sessionId),
      ).then((d) => {
        if (live && d) setList(d);
      });
      return () => {
        live = false;
      };
    }, [sessionId, call]);

    const openThread = async (conv) => {
      const reason = window.prompt(
        'Reason for reading this conversation (required, logged separately):',
      );
      if (reason === null) return;
      if (reason.trim().length < 5) {
        window.alert('A reason of at least 5 characters is required.');
        return;
      }
      setBusy(true);
      try {
        const d = await call(() =>
          window.CW_API.post('/api/admin/impersonation/view/dm-thread', {
            sessionId,
            conversationId: conv.id,
            reason: reason.trim(),
          }),
        );
        if (d) setThread({ conversationId: conv.id, data: d });
      } catch (e) {
        window.alert(e.message || 'Could not open the thread.');
      } finally {
        setBusy(false);
      }
    };

    if (thread) {
      const d = thread.data;
      const others = d.members || [];
      return h(
        Panel,
        {},
        h(
          'button',
          {
            onClick: () => setThread(null),
            style: {
              border: 'none',
              background: 'none',
              color: GOLD,
              fontWeight: 700,
              fontSize: 12.5,
              marginBottom: 10,
              padding: 0,
            },
          },
          '‹ All conversations',
        ),
        h(
          'div',
          { style: { fontSize: 12, color: '#a09e97', marginBottom: 10 } },
          others.map((m) => '@' + m.handle).join(', '),
        ),
        d.messages.length
          ? d.messages.map((m) =>
              h(
                'div',
                { key: m.id, style: { padding: '7px 0', borderBottom: '1px solid #f7f5f2' } },
                h(
                  'div',
                  { style: { fontSize: 11, color: '#a09e97', marginBottom: 2 } },
                  (m.author ? '@' + m.author.handle : '') +
                    ' · ' +
                    (timeAgo ? timeAgo(m.createdAt) : ''),
                ),
                h(
                  'div',
                  {
                    style: {
                      fontSize: 13,
                      color: m.deleted ? '#b0aea8' : '#2a2a2a',
                      fontStyle: m.deleted ? 'italic' : 'normal',
                    },
                  },
                  m.deleted ? 'Message deleted' : m.body,
                ),
              ),
            )
          : h(EmptyState, { title: 'No messages', note: 'This thread is empty.' }),
      );
    }

    if (!list) return h(Loading, {});
    return h(
      Panel,
      {},
      h(
        'div',
        { style: { fontSize: 11.5, color: '#a09e97', marginBottom: 8 } },
        'Opening a thread logs its own reason.',
      ),
      list.conversations.length
        ? list.conversations.map((c) =>
            h(
              'button',
              {
                key: c.id,
                onClick: () => openThread(c),
                disabled: busy,
                style: {
                  width: '100%',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '11px 4px',
                  border: 'none',
                  borderBottom: '1px solid #f4f2ee',
                  background: 'none',
                },
              },
              h('div', {
                style: {
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#f2f0ea',
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                'aria-hidden': true,
              }),
              h(
                'div',
                { style: { flex: 1, minWidth: 0 } },
                h(
                  'div',
                  { style: { fontSize: 13, fontWeight: 700 } },
                  c.name ||
                    (c.members || []).map((m) => '@' + m.handle).join(', ') ||
                    'Conversation',
                ),
                h(
                  'div',
                  { style: { fontSize: 11.5, color: '#a09e97' } },
                  c.messageCount + ' messages · ' + (timeAgo ? timeAgo(c.updatedAt) : ''),
                ),
              ),
              Icon('chat', { size: 16, color: '#c9c7c1' }),
            ),
          )
        : h(EmptyState, { title: 'No conversations', note: 'This user has no DMs.' }),
    );
  }

  function ImpersonateScreen() {
    const { impersonation, exitImpersonation } = useStore();
    const [tab, setTab] = useState('profile');

    // No active session (e.g. it just expired) → nothing to show; the banner
    // is already gone. Render a minimal placeholder.
    if (!impersonation || !impersonation.session) {
      return h(
        'div',
        {
          style: {
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        h(EmptyState, { title: 'No active session', note: 'This sign-in-as session has ended.' }),
      );
    }
    const sessionId = impersonation.session.id;
    const target = impersonation.target;

    const panel = () => {
      switch (tab) {
        case 'feed':
          return h(FeedPanel, { sessionId });
        case 'saves':
          return h(SavesPanel, { sessionId });
        case 'notifications':
          return h(NotificationsPanel, { sessionId });
        case 'messages':
          return h(MessagesPanel, { sessionId });
        default:
          return h(ProfilePanel, { sessionId });
      }
    };

    return h(
      'div',
      {
        style: {
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          // Clear the fixed impersonation banner at the very top.
          paddingTop: 'calc(52px + var(--safe-top))',
        },
      },
      // Sub-header: whose account + a quick exit.
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderBottom: '1px solid #f0eee9',
          },
        },
        h(Avatar, { user: target, size: 32 }),
        h(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          h(
            'div',
            { style: { fontSize: 13.5, fontWeight: 800 } },
            target ? target.displayName : 'User',
          ),
          h(
            'div',
            { style: { fontSize: 11, color: '#a09e97' } },
            target ? '@' + target.handle : '',
          ),
        ),
        h(
          'button',
          {
            onClick: () => exitImpersonation(),
            style: {
              border: '1px solid #f0c8c2',
              background: '#fdf2f0',
              color: '#b42318',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 800,
            },
          },
          'Exit',
        ),
      ),
      // Tab bar.
      h(
        'div',
        {
          className: 'cwsc',
          style: {
            display: 'flex',
            gap: 4,
            padding: '8px 10px',
            borderBottom: '1px solid #f0eee9',
            overflowX: 'auto',
          },
        },
        TABS.map((t) =>
          h(
            'button',
            {
              key: t.k,
              onClick: () => setTab(t.k),
              style: {
                flex: 'none',
                border: 'none',
                background: tab === t.k ? '#111' : '#f4f2ee',
                color: tab === t.k ? '#fff' : '#6a6a6a',
                borderRadius: 20,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
              },
            },
            t.label,
          ),
        ),
      ),
      // Active panel (its own scroll).
      h('div', { style: { flex: 1, minHeight: 0, overflowY: 'auto' } }, panel()),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Impersonate = ImpersonateScreen;
})();
