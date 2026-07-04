// ── Profile: own profile + any citizen by handle ───────────────────
// GET /api/users/:handle (user/profile/counts/brands/posts) and, for
// the owner, GET /api/me/saves (boards tab). Follow/unfollow + DM.
(function () {
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, INK, Avatar, BrandLogo, Spinner, EmptyState, ErrorNote, ScreenHeader, fmtCount } =
    window.CWUI;

  function ProfileScreen({ params }) {
    const { me, pop, setTab, openBrand, openPost, openSettings } = useStore();
    const own = !params || !params.handle; // profile tab (no handle) = me
    const handle = own ? me && me.user && me.user.handle : params.handle;

    const [state, setState] = useState({ loading: true, error: null, data: null });
    const [boards, setBoards] = useState(null);
    const [tab, setTabState] = useState('posts'); // posts | boards
    const [following, setFollowing] = useState(false);

    const load = useCallback(async () => {
      if (!handle) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await window.CW_API.get('/api/users/' + encodeURIComponent(handle));
        setState({ loading: false, error: null, data });
        setFollowing(!!data.viewerFollows);
        if (own) {
          const saves = await window.CW_API.get('/api/me/saves').catch(() => null);
          if (saves) setBoards(saves.collections);
        }
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, [handle, own]);
    useEffect(() => {
      load();
    }, [load]);

    if (!handle) {
      return h(
        'div',
        { style: { height: '100%', background: '#fff' } },
        h(ErrorNote, {
          message: 'Your Wear profile is still being set up — pull to retry.',
          onRetry: load,
        }),
      );
    }
    if (state.loading) {
      return h(
        'div',
        { style: { height: '100%', background: '#fff' } },
        own ? null : h(ScreenHeader, { title: '@' + handle, onBack: pop }),
        h(Spinner, {}),
      );
    }
    if (state.error || !state.data) {
      return h(
        'div',
        { style: { height: '100%', background: '#fff' } },
        own ? null : h(ScreenHeader, { title: '@' + handle, onBack: pop }),
        h(ErrorNote, { message: state.error || 'Profile not found.', onRetry: load }),
      );
    }

    const { user, profile, counts, brands, posts } = state.data;

    const toggleFollow = async () => {
      const next = !following;
      setFollowing(next);
      try {
        if (next) await window.CW_API.post('/api/follows', { handle: user.handle });
        else await window.CW_API.del('/api/follows', { handle: user.handle });
      } catch (e) {
        setFollowing(!next);
      }
    };

    const message = async () => {
      try {
        await window.CW_API.post('/api/conversations', { handle: user.handle });
        setTab('inbox');
      } catch (e) {
        /* self-DM */
      }
    };

    const stat = (n, l) =>
      h(
        'div',
        { style: { textAlign: 'center' } },
        h('div', { style: { fontSize: 17, fontWeight: 800 } }, fmtCount(n)),
        h('div', { style: { fontSize: 11.5, color: '#a09e97', fontWeight: 600, marginTop: 1 } }, l),
      );

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 100, background: '#fff' },
      },
      // header row
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'calc(16px + var(--safe-top)) 18px 6px',
          },
        },
        own
          ? h('div', { style: { width: 34 } })
          : h(
              'button',
              {
                onClick: pop,
                style: {
                  border: 'none',
                  background: '#f2f0ea',
                  borderRadius: '50%',
                  width: 34,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              },
              Icon('back', { size: 19 }),
            ),
        h(
          'span',
          { style: { fontSize: 14, fontWeight: 800, letterSpacing: '0.2px' } },
          '@' + user.handle,
        ),
        own
          ? h(
              'button',
              { onClick: openSettings, style: { border: 'none', background: 'none', padding: 4 } },
              Icon('sliders', { size: 22 }),
            )
          : h('div', { style: { width: 34 } }),
      ),
      // identity block
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '14px 20px 0',
          },
        },
        h(Avatar, { user, size: 90 }),
        h(
          'div',
          { style: { fontSize: 18, fontWeight: 800, marginTop: 12 } },
          (own && me && me.settings && me.settings.displayNameOverride) || user.displayName,
        ),
        h(
          'div',
          { style: { fontSize: 13, color: '#a09e97', fontWeight: 500, marginTop: 1 } },
          '@' + user.handle,
        ),
        h(
          'div',
          { style: { display: 'flex', gap: 38, marginTop: 18 } },
          stat(posts.items.length, 'Posts'),
          stat(counts.followers, 'Followers'),
          stat(counts.following, 'Following'),
        ),
        profile && profile.bio
          ? h(
              'div',
              {
                style: {
                  textAlign: 'center',
                  marginTop: 16,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: '#2a2a2a',
                  maxWidth: 280,
                  whiteSpace: 'pre-wrap',
                },
              },
              profile.bio,
            )
          : null,
        h(
          'div',
          { style: { display: 'flex', gap: 10, width: '100%', marginTop: 18 } },
          own
            ? h(
                'button',
                {
                  onClick: openSettings,
                  style: {
                    flex: 1,
                    border: '1px solid #e6e3dc',
                    background: '#fff',
                    borderRadius: 12,
                    padding: 11,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#1a1a1a',
                  },
                },
                'Edit Profile',
              )
            : h(
                React.Fragment,
                null,
                h(
                  'button',
                  {
                    onClick: toggleFollow,
                    style: {
                      flex: 1,
                      border: '1.5px solid ' + (following ? '#e6e3dc' : GOLD),
                      background: following ? '#fff' : GOLD,
                      color: following ? '#9a9892' : '#fff',
                      borderRadius: 12,
                      padding: 11,
                      fontSize: 13,
                      fontWeight: 700,
                    },
                  },
                  following ? 'Following' : 'Follow',
                ),
                h(
                  'button',
                  {
                    onClick: message,
                    style: {
                      flex: 1,
                      border: '1px solid #e6e3dc',
                      background: '#fff',
                      borderRadius: 12,
                      padding: 11,
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#1a1a1a',
                    },
                  },
                  'Message',
                ),
              ),
        ),
      ),
      // owned brands
      brands && brands.length
        ? h(
            'div',
            { style: { padding: '18px 18px 0' } },
            h(
              'div',
              { style: { fontSize: 13, fontWeight: 800, marginBottom: 10 } },
              own ? 'Your Brands' : 'Brands',
            ),
            h(
              'div',
              { className: 'cwsc', style: { display: 'flex', gap: 16, overflowX: 'auto' } },
              brands.map((b) =>
                h(
                  'button',
                  {
                    key: b.id,
                    onClick: () => openBrand(b.slug),
                    style: {
                      flex: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 7,
                      border: 'none',
                      background: 'none',
                      width: 64,
                      padding: 0,
                    },
                  },
                  h(BrandLogo, { brand: b, size: 56 }),
                  h(
                    'span',
                    {
                      style: {
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: '#4a4a4a',
                        textAlign: 'center',
                        lineHeight: 1.2,
                        maxWidth: 64,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    },
                    b.name,
                  ),
                ),
              ),
            ),
          )
        : null,
      // tabs
      h(
        'div',
        {
          style: {
            display: 'flex',
            borderTop: '1px solid #f3f1ee',
            borderBottom: '1px solid #f3f1ee',
            marginTop: 20,
          },
        },
        [['posts', 'grid'], own ? ['boards', 'bookmark'] : null].filter(Boolean).map(([k, icon]) =>
          h(
            'button',
            {
              key: k,
              onClick: () => setTabState(k),
              style: {
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '13px 0',
                border: 'none',
                background: 'none',
                borderBottom: '2.5px solid ' + (tab === k ? GOLD : 'transparent'),
              },
            },
            Icon(icon, { size: 22, color: tab === k ? INK : '#bdbbb4' }),
          ),
        ),
      ),
      // grid
      tab === 'posts'
        ? posts.items.length === 0
          ? h(EmptyState, {
              icon: 'grid',
              title: own ? 'Nothing posted yet' : 'No posts yet',
              note: own ? 'Share your first drop or testimony from the Create tab.' : undefined,
            })
          : h(
              'div',
              {
                style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, padding: 2 },
              },
              posts.items.map((p) =>
                h(GridTile, { key: p.id, post: p, onOpen: () => openPost(p.id) }),
              ),
            )
        : h(BoardsGrid, { boards, onOpenPost: openPost }),
    );
  }

  /** Square grid tile: media when present, else the post text as a card. */
  function GridTile({ post, onOpen }) {
    return h(
      'button',
      {
        onClick: onOpen,
        style: {
          border: 'none',
          padding: 0,
          background: '#0e0e0e',
          aspectRatio: '1/1',
          overflow: 'hidden',
          position: 'relative',
        },
      },
      post.media && post.media.length
        ? h('img', {
            src: post.media[0].url,
            alt: '',
            style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
          })
        : h(
            'div',
            {
              style: {
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 10,
              },
            },
            h(
              'div',
              {
                style: {
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: 1.35,
                  color: '#F2BA1B',
                  textAlign: 'center',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                },
              },
              post.body,
            ),
          ),
    );
  }

  function BoardsGrid({ boards, onOpenPost }) {
    if (!boards) return h(Spinner, {});
    if (!boards.length || boards.every((b) => b.posts.length === 0)) {
      return h(EmptyState, {
        icon: 'bookmark',
        title: 'No saved apparel yet',
        note: 'Tap the bookmark on any post to build your boards.',
      });
    }
    return h(
      'div',
      { style: { padding: '18px 18px 8px' } },
      boards.map((bd) =>
        h(
          'div',
          { key: bd.id, style: { marginBottom: 20 } },
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                marginBottom: 10,
              },
            },
            h('div', { style: { fontSize: 14, fontWeight: 800 } }, bd.name),
            h(
              'div',
              { style: { fontSize: 10.5, color: '#a09e97', fontWeight: 600 } },
              bd.postCount + ' saved',
            ),
          ),
          h(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 11 } },
            bd.posts.map((p) =>
              h(
                'div',
                { key: p.id, style: { borderRadius: 14, overflow: 'hidden' } },
                h(GridTile, { post: p, onOpen: () => onOpenPost(p.id) }),
              ),
            ),
          ),
        ),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Profile = ProfileScreen;
})();
