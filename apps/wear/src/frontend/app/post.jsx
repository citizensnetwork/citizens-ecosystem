// ── Post detail: media, engagement, comments ───────────────────────
// GET /api/posts/:id (+like/save/comments) — the app's analog of the
// design's apparel-detail overlay, built on real post data.
(function () {
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, INK, Avatar, BrandLogo, Spinner, ErrorNote, ScreenHeader, timeAgo, fmtCount } = window.CWUI;

  function PostScreen({ params }) {
    const { pop, openBrand, openUser } = useStore();
    const [state, setState] = useState({ loading: true, error: null, data: null });
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await window.CW_API.get('/api/posts/' + params.id);
        setState({ loading: false, error: null, data });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, [params.id]);
    useEffect(() => { load(); }, [load]);

    if (state.loading) return h('div', { style: { height: '100%', background: '#fff' } }, h(ScreenHeader, { title: 'Post', onBack: pop }), h(Spinner, {}));
    if (state.error || !state.data) {
      return h('div', { style: { height: '100%', background: '#fff' } },
        h(ScreenHeader, { title: 'Post', onBack: pop }),
        h(ErrorNote, { message: state.error || 'Post not found.', onRetry: load }));
    }

    const { post, likeCount, viewerLiked, viewerSaved, comments } = state.data;
    const author = post.brand
      ? { name: post.brand.name, sub: post.brand.tagline || '@' + post.brand.slug }
      : post.author
        ? { name: post.author.displayName, sub: '@' + post.author.handle }
        : { name: 'Unknown', sub: '' };

    const toggleLike = async () => {
      try {
        const res = viewerLiked
          ? await window.CW_API.del('/api/posts/' + post.id + '/like')
          : await window.CW_API.post('/api/posts/' + post.id + '/like');
        setState((s) => ({ ...s, data: { ...s.data, viewerLiked: res.liked, likeCount: res.likeCount } }));
      } catch (e) { /* leave state */ }
    };
    const toggleSave = async () => {
      try {
        const res = await window.CW_API.post('/api/posts/' + post.id + '/save');
        setState((s) => ({ ...s, data: { ...s.data, viewerSaved: res.saved } }));
      } catch (e) { /* leave state */ }
    };
    const sendComment = async () => {
      const text = draft.trim();
      if (!text || sending) return;
      setSending(true);
      try {
        await window.CW_API.post('/api/posts/' + post.id + '/comments', { body: text });
        setDraft('');
        await load();
      } catch (e) {
        setState((s) => ({ ...s, error: e.message }));
      } finally {
        setSending(false);
      }
    };

    return h(
      'div',
      { className: 'fade-in', style: { height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' } },
      h(ScreenHeader, { title: 'Post', onBack: pop }),
      h('div', { className: 'cwsc', style: { flex: 1, overflowY: 'auto', paddingBottom: 10 } },
        // author
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 11, padding: '6px 18px 12px' } },
          h('button', {
            onClick: () => (post.brand ? openBrand(post.brand.slug) : post.author && openUser(post.author.handle)),
            style: { border: 'none', background: 'none', padding: 0 },
          }, post.brand ? h(BrandLogo, { brand: post.brand, size: 40 }) : h(Avatar, { user: post.author, size: 40 })),
          h('div', { style: { flex: 1, lineHeight: 1.3, minWidth: 0 } },
            h('div', { style: { fontSize: 14, fontWeight: 700 } }, author.name),
            h('div', { style: { fontSize: 11.5, color: '#a09e97', fontWeight: 500 } }, author.sub),
          ),
          h('span', { style: { fontSize: 10.5, color: '#c2c0b9', fontWeight: 600, letterSpacing: '0.3px' } }, timeAgo(post.createdAt).toUpperCase() + ' AGO'),
        ),
        // media
        post.media && post.media.length
          ? post.media.map((m, i) =>
              h('img', { key: i, src: m.url, alt: m.altText || '', style: { width: '100%', display: 'block', background: '#1a1a1a' } }))
          : null,
        // body
        h('div', { style: { padding: '14px 18px 4px', fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, post.body),
        // actions
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 19, padding: '10px 18px 12px', borderBottom: '1px solid #f3f1ee' } },
          h('button', { onClick: toggleLike, style: { display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: 0 } },
            Icon('heart', { size: 25, color: viewerLiked ? GOLD : INK, fill: viewerLiked ? GOLD : null }),
            h('span', { style: { fontSize: 12.5, fontWeight: 700, color: viewerLiked ? GOLD : INK } }, fmtCount(likeCount)),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            Icon('comment', { size: 25 }),
            h('span', { style: { fontSize: 12.5, fontWeight: 700 } }, fmtCount(comments.length)),
          ),
          h('div', { style: { flex: 1 } }),
          h('button', { onClick: toggleSave, style: { border: 'none', background: 'none', padding: 0 } },
            Icon('bookmark', { size: 23, color: viewerSaved ? GOLD : INK, fill: viewerSaved ? GOLD : null }),
          ),
        ),
        // comments
        h('div', { style: { padding: '14px 18px 20px' } },
          h('div', { style: { fontSize: 13.5, fontWeight: 800, marginBottom: 10 } }, 'Comments'),
          comments.length === 0
            ? h('div', { style: { fontSize: 12.5, color: '#a09e97', fontWeight: 500 } }, 'Be the first to encourage.')
            : comments.map((c) =>
                h('div', { key: c.id, style: { display: 'flex', gap: 10, padding: '8px 0' } },
                  h(Avatar, { user: c.author, size: 32 }),
                  h('div', { style: { flex: 1, minWidth: 0 } },
                    h('div', { style: { fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word' } },
                      h('span', { style: { fontWeight: 700 } }, (c.author ? c.author.displayName : 'Unknown') + ' '),
                      c.body,
                    ),
                    h('div', { style: { fontSize: 10.5, color: '#c2c0b9', fontWeight: 600, marginTop: 3 } }, timeAgo(c.createdAt)),
                  ),
                )),
        ),
      ),
      // comment composer
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px calc(12px + var(--safe-bottom))', borderTop: '1px solid #f0eee9', background: '#fff' } },
        h('input', {
          value: draft,
          onChange: (e) => setDraft(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') sendComment(); },
          placeholder: 'Add a comment…',
          style: { flex: 1, background: '#f2f0ea', border: 'none', borderRadius: 13, padding: '12px 15px', fontSize: 13.5, fontWeight: 500, outline: 'none' },
        }),
        h('button', {
          onClick: sendComment, disabled: sending,
          style: { border: 'none', background: GOLD, borderRadius: 12, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
        }, Icon('send', { size: 16, color: '#fff' })),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Post = PostScreen;
})();
