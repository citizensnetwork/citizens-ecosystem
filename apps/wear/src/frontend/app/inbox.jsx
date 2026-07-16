// ── Inbox: conversations + thread + notifications ──────────────────
// GET /api/conversations, GET|POST /api/conversations/:id/messages,
// POST /api/conversations {handle}. Notifications tab: GET /api/notifications
// + POST /api/notifications/read (mig-159 marketplace-event notifications).
(function () {
  const { createElement: h, useState, useEffect, useCallback, useRef } = React;
  const { Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, INK, Avatar, Spinner, EmptyState, ErrorNote, ScreenHeader, GoldButton, timeAgo } =
    window.CWUI;

  // ── Notifications ────────────────────────────────────────────────
  const STAGE_LABEL = {
    claimed: 'Claimed',
    in_production: 'In Production',
    sample_review: 'Sample Review',
    released: 'Released',
    sold_out: 'Sold Out',
  };

  /** Compose the human message from a notification's type + data payload. */
  function notifMessage(n) {
    const d = n.data || {};
    const title = d.conceptTitle ? '“' + d.conceptTitle + '”' : 'your concept';
    switch (n.type) {
      case 'concept_proposal':
        return (d.brandName || 'A verified brand') + ' proposed to make ' + title + '.';
      case 'concept_awarded':
        return 'Your brand was awarded the concept ' + title + '. 🎉';
      case 'concept_advanced':
        return title + ' advanced to ' + (STAGE_LABEL[d.stage] || d.stage) + '.';
      case 'royalty_proof':
        return (
          'Proof of the milestone sale for ' + title + ' was submitted — confirm to close it out.'
        );
      case 'royalty_closed':
        return 'The royalty for ' + title + ' was closed out.';
      case 'conversion_proposed':
        return 'A catalogue conversion was proposed for ' + title + '.';
      case 'conversion_responded':
        return (
          'Your catalogue conversion for ' +
          title +
          (d.accepted ? ' was accepted.' : ' was declined.')
        );
      // Mig 161 — community engagement on Concepts. The actor's name renders
      // from the avatar row; `who` keeps the sentence readable without it.
      case 'concept_comment': {
        const who = n.actor ? n.actor.displayName || '@' + n.actor.handle : 'Someone';
        return (
          who +
          (d.reply ? ' replied to your comment on ' : ' commented on ') +
          title +
          (d.excerpt ? ': “' + d.excerpt + '”' : '.')
        );
      }
      case 'concept_upvote':
        return (
          (n.actor ? n.actor.displayName || '@' + n.actor.handle : 'Someone') +
          ' liked ' +
          title +
          '. ❤️'
        );
      case 'concept_share':
        return (
          (n.actor ? n.actor.displayName || '@' + n.actor.handle : 'Someone') +
          ' shared ' +
          title +
          ' — your design is travelling.'
        );
      // Mig 162 — the Become-a-Brand decision (institutional; no actor).
      case 'brand_application_approved':
        return (
          'Your Become-a-Brand application for “' +
          (d.brandName || 'your brand') +
          '” was approved — welcome, Brand! 🎉 Your page is live.'
        );
      case 'brand_application_rejected':
        return (
          'Your Become-a-Brand application for “' +
          (d.brandName || 'your brand') +
          '” was not approved this time.' +
          (d.reviewNote
            ? ' Note from the team: “' + d.reviewNote + '”'
            : ' You may apply again whenever you are ready.')
        );
      default:
        return 'New activity on ' + title + '.';
    }
  }

  function NotifRow({ n, onOpen }) {
    return h(
      'button',
      {
        onClick: onOpen,
        style: {
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 13,
          padding: '14px 20px',
          border: 'none',
          background: n.read ? 'none' : '#fdf8ec',
          borderBottom: '1px solid #f7f5f2',
          textAlign: 'left',
          cursor: n.conceptId || (n.data && n.data.brandSlug) ? 'pointer' : 'default',
        },
      },
      n.actor
        ? h(Avatar, { user: n.actor, size: 42 })
        : h(
            'div',
            {
              style: {
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: '#faf8f3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #f0eee7',
                flex: 'none',
              },
            },
            Icon('bell', { size: 20, color: GOLD }),
          ),
      h(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        h(
          'div',
          { style: { fontSize: 13.5, fontWeight: 500, color: INK, lineHeight: 1.45 } },
          notifMessage(n),
        ),
        h(
          'div',
          { style: { fontSize: 11, color: '#b5b3ac', fontWeight: 600, marginTop: 4 } },
          timeAgo(n.createdAt),
        ),
      ),
      !n.read
        ? h('span', {
            style: {
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: GOLD,
              flex: 'none',
              marginTop: 6,
            },
          })
        : null,
    );
  }

  function NotificationsTab() {
    const { push } = useStore();
    const [state, setState] = useState({ loading: true, error: null, items: [] });

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await window.CW_API.get('/api/notifications?limit=40');
        setState({ loading: false, error: null, items: res.items });
        // Clear the unread state on view (fire-and-forget).
        if (res.unreadCount > 0) {
          window.CW_API.post('/api/notifications/read', { all: true }).catch(() => {});
        }
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, []);
    useEffect(() => {
      load();
    }, [load]);

    if (state.loading) return h(Spinner, {});
    if (state.error) return h(ErrorNote, { message: state.error, onRetry: load });
    if (!state.items.length) {
      return h(EmptyState, {
        icon: 'bell',
        title: 'No notifications yet',
        note: 'Activity on your concepts — proposals, awards, milestones, royalties — lands here.',
      });
    }
    return h(
      'div',
      null,
      state.items.map((n) =>
        h(NotifRow, {
          key: n.id,
          n: n,
          // Concepts open the concept; a minted-brand decision opens the
          // newborn brand page (slug travels in the trigger payload).
          onOpen: () =>
            n.conceptId
              ? push('concept', { id: n.conceptId })
              : n.data && n.data.brandSlug && push('brand', { slug: n.data.brandSlug }),
        }),
      ),
    );
  }

  function InboxScreen() {
    const [tab, setTab] = useState('messages');
    const [state, setState] = useState({ loading: true, error: null, conversations: [] });
    const [openConv, setOpenConv] = useState(null); // conversation summary
    const [composeTo, setComposeTo] = useState(false);

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await window.CW_API.get('/api/conversations');
        setState({ loading: false, error: null, conversations: res.conversations });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, []);
    useEffect(() => {
      load();
    }, [load]);

    if (openConv) {
      return h(ThreadView, {
        conv: openConv,
        onBack: () => {
          setOpenConv(null);
          load();
        },
      });
    }

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 100, background: '#fff' },
      },
      h(
        'div',
        { style: { padding: 'calc(20px + var(--safe-top)) 20px 0' } },
        h('div', { style: { fontSize: 24, fontWeight: 800, letterSpacing: '-0.4px' } }, 'Inbox'),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            gap: 26,
            padding: '16px 20px 0',
            borderBottom: '1px solid #f3f1ee',
          },
        },
        ['messages', 'notifications'].map((t) =>
          h(
            'button',
            {
              key: t,
              onClick: () => setTab(t),
              style: {
                border: 'none',
                background: 'none',
                padding: '0 0 12px',
                fontSize: 14,
                fontWeight: 700,
                color: tab === t ? INK : '#a09e97',
                position: 'relative',
                textTransform: 'capitalize',
              },
            },
            t,
            tab === t
              ? h('div', {
                  style: {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: -1,
                    height: 2.5,
                    background: GOLD,
                    borderRadius: 2,
                  },
                })
              : null,
          ),
        ),
      ),
      tab === 'notifications'
        ? h(NotificationsTab)
        : state.loading
          ? h(Spinner, {})
          : state.error
            ? h(ErrorNote, { message: state.error, onRetry: load })
            : h(
                'div',
                null,
                state.conversations.length === 0
                  ? h(EmptyState, {
                      icon: 'chat',
                      title: 'No conversations yet',
                      note: 'Start a message with any citizen or brand owner by their @handle.',
                    })
                  : state.conversations.map((c) =>
                      h(ConvRow, { key: c.id, conv: c, onOpen: () => setOpenConv(c) }),
                    ),
                h(
                  'div',
                  { style: { padding: '22px 20px 0' } },
                  h(GoldButton, {
                    label: 'New Message',
                    icon: Icon('edit', { size: 16, color: '#fff' }),
                    onClick: () => setComposeTo(true),
                  }),
                ),
              ),
      composeTo
        ? h(NewMessageSheet, {
            onClose: () => setComposeTo(false),
            onCreated: (conv) => {
              setComposeTo(false);
              setOpenConv(conv);
            },
          })
        : null,
    );
  }

  function convTitle(conv) {
    if (conv.name) return conv.name;
    const other = conv.members && conv.members[0];
    return other ? other.displayName || '@' + other.handle : 'Conversation';
  }

  function ConvRow({ conv, onOpen }) {
    const other = conv.members && conv.members[0];
    return h(
      'button',
      {
        onClick: onOpen,
        style: {
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          padding: '14px 20px',
          border: 'none',
          background: 'none',
          borderBottom: '1px solid #f7f5f2',
          textAlign: 'left',
        },
      },
      h(Avatar, { user: other, size: 48 }),
      h(
        'div',
        { style: { flex: 1, minWidth: 0, lineHeight: 1.35 } },
        h('div', { style: { fontSize: 14, fontWeight: 700 } }, convTitle(conv)),
        h(
          'div',
          {
            style: {
              fontSize: 12.5,
              color: '#8f8d87',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          },
          conv.lastMessage ? conv.lastMessage.body : 'Say hello…',
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 } },
        h(
          'span',
          { style: { fontSize: 11, color: '#b5b3ac', fontWeight: 600 } },
          conv.lastMessage ? timeAgo(conv.lastMessage.createdAt) : timeAgo(conv.updatedAt),
        ),
        conv.unreadCount > 0
          ? h('span', {
              style: {
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: GOLD,
                display: 'block',
              },
            })
          : null,
      ),
    );
  }

  function ThreadView({ conv, onBack }) {
    const { me } = useStore();
    const [state, setState] = useState({ loading: true, error: null, items: [] });
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);

    const load = useCallback(async () => {
      try {
        const res = await window.CW_API.get('/api/conversations/' + conv.id + '/messages?limit=50');
        // API returns newest-first pages; render oldest → newest.
        const items = res.items.slice().reverse();
        setState({ loading: false, error: null, items });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, [conv.id]);
    useEffect(() => {
      load();
    }, [load]);
    useEffect(() => {
      if (bottomRef.current) bottomRef.current.scrollIntoView({ block: 'end' });
    }, [state.items.length]);

    const send = async () => {
      const text = draft.trim();
      if (!text || sending) return;
      setSending(true);
      try {
        const msg = await window.CW_API.post('/api/conversations/' + conv.id + '/messages', {
          body: text,
        });
        setDraft('');
        setState((s) => ({ ...s, items: [...s.items, msg] }));
      } catch (e) {
        setState((s) => ({ ...s, error: e.message }));
      } finally {
        setSending(false);
      }
    };

    const myId = me && me.user && me.user.id;

    return h(
      'div',
      {
        className: 'fade-in',
        style: { height: '100%', display: 'flex', flexDirection: 'column', background: '#fcfbf9' },
      },
      h(ScreenHeader, { title: convTitle(conv), onBack }),
      h(
        'div',
        {
          className: 'cwsc',
          style: {
            flex: 1,
            overflowY: 'auto',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          },
        },
        state.loading ? h(Spinner, {}) : null,
        state.error ? h(ErrorNote, { message: state.error, onRetry: load }) : null,
        state.items.map((m) => {
          const mine = m.authorId === myId;
          return h(
            'div',
            {
              key: m.id,
              style: { display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' },
            },
            h(
              'div',
              {
                style: {
                  maxWidth: '74%',
                  background: mine ? '#1a1a1a' : '#fff',
                  color: mine ? '#fff' : '#1a1a1a',
                  border: '1px solid ' + (mine ? '#1a1a1a' : '#f0eee9'),
                  borderRadius: 16,
                  padding: '11px 15px',
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                },
              },
              m.body,
            ),
          );
        }),
        h('div', { ref: bottomRef }),
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 20px calc(14px + var(--safe-bottom))',
            borderTop: '1px solid #f0eee9',
            background: '#fff',
          },
        },
        h('input', {
          value: draft,
          onChange: (e) => setDraft(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Enter') send();
          },
          placeholder: 'Write a message…',
          style: {
            flex: 1,
            background: '#f2f0ea',
            border: 'none',
            borderRadius: 13,
            padding: '13px 16px',
            fontSize: 13.5,
            fontWeight: 500,
            outline: 'none',
          },
        }),
        h(
          'button',
          {
            onClick: send,
            disabled: sending,
            style: {
              border: 'none',
              background: GOLD,
              borderRadius: 12,
              width: 46,
              height: 46,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            },
          },
          Icon('send', { size: 18, color: '#fff' }),
        ),
      ),
    );
  }

  function NewMessageSheet({ onClose, onCreated }) {
    const [handle, setHandle] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const start = async () => {
      const target = handle.trim().replace(/^@/, '');
      if (!target || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await window.CW_API.post('/api/conversations', { handle: target });
        // Fetch the summary so the thread header has the member hydrated.
        const list = await window.CW_API.get('/api/conversations');
        const conv = list.conversations.find((c) => c.id === res.id) || {
          id: res.id,
          members: [],
          updatedAt: new Date().toISOString(),
        };
        onCreated(conv);
      } catch (e) {
        setError(e.message || 'Could not start the conversation.');
      } finally {
        setBusy(false);
      }
    };

    return h(
      'div',
      {
        style: {
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          background: 'rgba(20,18,14,0.4)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        },
        onClick: onClose,
      },
      h(
        'div',
        {
          className: 'scale-in',
          onClick: (e) => e.stopPropagation(),
          style: {
            width: '100%',
            maxWidth: 560,
            background: '#fff',
            borderRadius: '22px 22px 0 0',
            padding: '22px 20px calc(26px + var(--safe-bottom))',
          },
        },
        h('div', { style: { fontSize: 16, fontWeight: 800, marginBottom: 14 } }, 'New Message'),
        h('input', {
          value: handle,
          onChange: (e) => setHandle(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Enter') start();
          },
          placeholder: '@handle',
          autoFocus: true,
          style: {
            width: '100%',
            border: '1px solid #efedea',
            borderRadius: 14,
            padding: '12px 14px',
            fontSize: 13.5,
            fontWeight: 500,
            outline: 'none',
          },
        }),
        error
          ? h(
              'div',
              { style: { marginTop: 10, fontSize: 12, color: '#8f4a2b', fontWeight: 600 } },
              error,
            )
          : null,
        h(
          'div',
          { style: { marginTop: 16 } },
          h(GoldButton, {
            label: busy ? 'Starting…' : 'Start Conversation',
            onClick: start,
            disabled: busy || !handle.trim(),
          }),
        ),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Inbox = InboxScreen;
})();
