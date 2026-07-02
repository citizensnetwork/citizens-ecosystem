// ── Brand profile ──────────────────────────────────────────────────
// GET /api/brands/:slug (brand + owner + posts). Follow acts on the
// owner (Wear's follow graph is user-id space); Message DMs the owner.
(function () {
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { Crown, Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, Avatar, Spinner, ErrorNote, ScreenHeader, FollowButton } = window.CWUI;
  const PostCard = () => window.CWScreens.PostCard;

  function BrandScreen({ params }) {
    const { pop, me, openUser, setTab } = useStore();
    const [state, setState] = useState({ loading: true, error: null, data: null });
    const [following, setFollowing] = useState(false);

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await window.CW_API.get('/api/brands/' + encodeURIComponent(params.slug));
        setState({ loading: false, error: null, data });
        if (data.owner) {
          const ownerProfile = await window.CW_API.get('/api/users/' + encodeURIComponent(data.owner.handle)).catch(() => null);
          if (ownerProfile) setFollowing(!!ownerProfile.viewerFollows);
        }
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, [params.slug]);
    useEffect(() => { load(); }, [load]);

    if (state.loading) return h('div', { style: { height: '100%', background: '#fff' } }, h(ScreenHeader, { title: 'Brand', onBack: pop }), h(Spinner, {}));
    if (state.error || !state.data) {
      return h('div', { style: { height: '100%', background: '#fff' } },
        h(ScreenHeader, { title: 'Brand', onBack: pop }),
        h(ErrorNote, { message: state.error || 'Brand not found.', onRetry: load }));
    }

    const { brand, owner, posts } = state.data;
    const isOwner = me && me.user && owner && me.user.id === owner.id;

    const toggleFollow = async () => {
      if (!owner) return;
      const next = !following;
      setFollowing(next);
      try {
        if (next) await window.CW_API.post('/api/follows', { handle: owner.handle });
        else await window.CW_API.del('/api/follows', { handle: owner.handle });
      } catch (e) {
        setFollowing(!next);
      }
    };

    const message = async () => {
      if (!owner) return;
      try {
        await window.CW_API.post('/api/conversations', { handle: owner.handle });
        setTab('inbox'); // conversation now sits at the top of the inbox
      } catch (e) { /* self-DM etc. */ }
    };

    const Card = PostCard();

    return h(
      'div',
      { className: 'cwsc fade-in', style: { height: '100%', overflowY: 'auto', paddingBottom: 100, background: '#fff' } },
      // banner
      h('div', { style: { position: 'relative', height: 200, background: '#161616' } },
        h('div', { style: { position: 'absolute', top: 'calc(14px + var(--safe-top))', left: 16, right: 16, zIndex: 30, display: 'flex', justifyContent: 'space-between' } },
          h('button', { onClick: pop, style: { border: 'none', background: '#fff', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' } }, Icon('back', { size: 20 })),
        ),
        h('div', { style: { position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.55))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 } },
          brand.logoUrl
            ? h('img', { src: brand.logoUrl, alt: brand.name, style: { width: 84, height: 84, borderRadius: '50%', objectFit: 'cover' } })
            : h('div', { style: { width: 84, height: 84, borderRadius: '50%', background: '#0e0e0e', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, h(Crown, { size: 44 })),
          brand.tagline
            ? h('div', { style: { color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase', padding: '0 20px', textAlign: 'center' } }, brand.tagline)
            : null,
        ),
      ),
      // header block
      h('div', { style: { padding: '18px 20px 0' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('div', { style: { fontSize: 20, fontWeight: 800 } }, brand.name),
          brand.verified ? h('span', { title: 'Verified', style: { display: 'flex' } }, Icon('check', { size: 16, color: GOLD, sw: 2.6 })) : null,
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, color: '#a09e97', fontSize: 12.5, fontWeight: 600 } },
          h('span', null, '@' + brand.slug),
        ),
        owner
          ? h('button', { onClick: () => openUser(owner.handle), style: { display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'none', padding: '12px 0 0' } },
              h(Avatar, { user: owner, size: 26 }),
              h('span', { style: { fontSize: 12.5, fontWeight: 600, color: '#4a4a4a' } }, 'Led by ' + owner.displayName),
            )
          : null,
        brand.websiteUrl
          ? h('a', { href: brand.websiteUrl, target: '_blank', rel: 'noreferrer noopener', style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, fontWeight: 600, color: GOLD, textDecoration: 'none' } },
              Icon('link', { size: 14, color: GOLD }), brand.websiteUrl.replace(/^https?:\/\//, ''))
          : null,
        !isOwner && owner
          ? h('div', { style: { display: 'flex', gap: 10, marginTop: 16 } },
              h('div', { style: { flex: 1 } },
                h('button', {
                  onClick: toggleFollow,
                  style: {
                    width: '100%', border: '1.5px solid ' + (following ? '#e6e3dc' : GOLD),
                    background: following ? '#fff' : GOLD, color: following ? '#9a9892' : '#fff',
                    borderRadius: 13, padding: 12, fontSize: 13.5, fontWeight: 700,
                  },
                }, following ? 'Following' : 'Follow'),
              ),
              h('button', {
                onClick: message,
                style: { flex: 1, border: '1.5px solid #e6e3dc', background: '#fff', color: '#1a1a1a', borderRadius: 13, padding: 12, fontSize: 13.5, fontWeight: 700 },
              }, 'Message'),
            )
          : null,
      ),
      // posts
      h('div', { style: { marginTop: 18, borderTop: '1px solid #f3f1ee' } },
        posts.items.length === 0
          ? h('div', { style: { padding: '30px 20px', textAlign: 'center', fontSize: 12.5, color: '#a09e97', fontWeight: 500 } },
              isOwner ? 'No posts yet — share your first drop from Create.' : 'No posts from this brand yet.')
          : posts.items.map((p) => h(Card, { key: p.id, post: p })),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Brand = BrandScreen;
})();
