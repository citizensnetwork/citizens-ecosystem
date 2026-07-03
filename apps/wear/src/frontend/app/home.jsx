// ── Home: stories tray + feed ──────────────────────────────────────
// GET /api/stories (tray) + GET /api/feed (hydrated cards with counts).
// PostCard is the design's canonical feed card, reused by brand/profile.
(function () {
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { Crown, Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, INK, Avatar, BrandLogo, Spinner, EmptyState, ErrorNote, timeAgo, fmtCount } =
    window.CWUI;

  /** Feed card, faithful to the design (header / media / actions / caption). */
  function PostCard({ post }) {
    const { openPost, openBrand, openUser } = useStore();
    const [liked, setLiked] = useState(!!post.viewerLiked);
    const [saved, setSaved] = useState(!!post.viewerSaved);
    const [likeCount, setLikeCount] = useState(post.likeCount || 0);

    const author = post.brand
      ? { name: post.brand.name, sub: post.brand.tagline || '@' + post.brand.slug }
      : post.author
        ? { name: post.author.displayName, sub: '@' + post.author.handle }
        : { name: 'Unknown', sub: '' };

    const openAuthor = () => {
      if (post.brand) openBrand(post.brand.slug);
      else if (post.author) openUser(post.author.handle);
    };

    const toggleLike = async () => {
      const next = !liked;
      setLiked(next);
      setLikeCount((c) => c + (next ? 1 : -1));
      try {
        const res = next
          ? await window.CW_API.post('/api/posts/' + post.id + '/like')
          : await window.CW_API.del('/api/posts/' + post.id + '/like');
        // Adopt the server's count only when it confirms one.
        if (typeof res.likeCount === 'number') setLikeCount(res.likeCount);
      } catch (e) {
        setLiked(!next);
        setLikeCount((c) => c + (next ? -1 : 1));
      }
    };

    const toggleSave = async () => {
      const next = !saved;
      setSaved(next);
      try {
        const res = await window.CW_API.post('/api/posts/' + post.id + '/save');
        if (typeof res.saved === 'boolean') setSaved(res.saved);
      } catch (e) {
        setSaved(!next);
      }
    };

    return h(
      'div',
      { style: { borderBottom: '1px solid #f3f1ee' } },
      // header
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px 11px' } },
        h(
          'button',
          { onClick: openAuthor, style: { border: 'none', background: 'none', padding: 0 } },
          post.brand
            ? h(BrandLogo, { brand: post.brand, size: 38 })
            : h(Avatar, { user: post.author, size: 38 }),
        ),
        h(
          'div',
          { style: { flex: 1, lineHeight: 1.3, minWidth: 0 } },
          h('div', { style: { fontSize: 13.5, fontWeight: 700 } }, author.name),
          h(
            'div',
            {
              style: {
                fontSize: 11,
                color: '#a09e97',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            },
            author.sub,
          ),
        ),
      ),
      // media
      post.media && post.media.length
        ? h(
            'button',
            {
              onClick: () => openPost(post.id),
              style: {
                display: 'block',
                width: '100%',
                border: 'none',
                padding: 0,
                background: '#1a1a1a',
              },
            },
            h('img', {
              src: post.media[0].url,
              alt: post.media[0].altText || '',
              style: { width: '100%', aspectRatio: '4/5', objectFit: 'cover', display: 'block' },
            }),
          )
        : null,
      // actions
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 19, padding: '12px 16px 5px' } },
        h(
          'button',
          {
            onClick: toggleLike,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              background: 'none',
              padding: 0,
            },
          },
          Icon('heart', { size: 25, color: liked ? GOLD : INK, fill: liked ? GOLD : null }),
          h(
            'span',
            { style: { fontSize: 12.5, fontWeight: 700, color: liked ? GOLD : INK } },
            fmtCount(likeCount),
          ),
        ),
        h(
          'button',
          {
            onClick: () => openPost(post.id),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              background: 'none',
              padding: 0,
            },
          },
          Icon('comment', { size: 25 }),
          h(
            'span',
            { style: { fontSize: 12.5, fontWeight: 700, color: INK } },
            fmtCount(post.commentCount || 0),
          ),
        ),
        h('div', { style: { flex: 1 } }),
        h(
          'button',
          { onClick: toggleSave, style: { border: 'none', background: 'none', padding: 0 } },
          Icon('bookmark', { size: 23, color: saved ? GOLD : INK, fill: saved ? GOLD : null }),
        ),
      ),
      // caption
      h(
        'div',
        { style: { padding: '2px 16px 14px' } },
        h(
          'button',
          {
            onClick: () => openPost(post.id),
            style: {
              border: 'none',
              background: 'none',
              padding: 0,
              textAlign: 'left',
              width: '100%',
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: 13.5,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              },
            },
            h('span', { style: { fontWeight: 700 } }, author.name + ' '),
            post.body,
          ),
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 7,
            },
          },
          h(
            'button',
            {
              onClick: () => openPost(post.id),
              style: {
                border: 'none',
                background: 'none',
                padding: 0,
                fontSize: 11.5,
                color: '#a09e97',
                fontWeight: 500,
              },
            },
            'View comments',
          ),
          h(
            'span',
            {
              style: { fontSize: 10.5, color: '#c2c0b9', fontWeight: 600, letterSpacing: '0.3px' },
            },
            timeAgo(post.createdAt).toUpperCase() + ' AGO',
          ),
        ),
      ),
    );
  }

  function StoriesTray({ tray }) {
    const { setTab, openUser } = useStore();
    const items = [{ you: true, name: 'Your Story' }].concat(tray || []);
    return h(
      'div',
      {
        className: 'cwsc',
        style: { display: 'flex', gap: 15, overflowX: 'auto', padding: '15px 18px 8px' },
      },
      items.map((s, i) => {
        const you = !!s.you;
        const ring = you
          ? '#dcd9d2'
          : s.hasUnseen
            ? 'linear-gradient(135deg,#e8c45c,#b8902a)'
            : '#dcd9d2';
        const name = you
          ? 'Your Story'
          : (s.author && (s.author.displayName || s.author.handle)) || 'Story';
        const onClick = you ? () => setTab('create') : () => s.author && openUser(s.author.handle);
        return h(
          'button',
          {
            key: i,
            onClick,
            style: {
              flex: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 7,
              border: 'none',
              background: 'none',
              width: 62,
              padding: 0,
            },
          },
          h(
            'div',
            {
              style: {
                width: 60,
                height: 60,
                borderRadius: '50%',
                padding: 2.5,
                background: ring,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
            },
            h(
              'div',
              {
                style: {
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: you ? '#f2f0ea' : '#0e0e0e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2.5px solid #fff',
                },
              },
              you
                ? Icon('plus', { color: GOLD, size: 22, sw: 2.3 })
                : s.author
                  ? h(Avatar, { user: s.author, size: 49 })
                  : h(Crown, { size: 26 }),
            ),
          ),
          h(
            'span',
            {
              style: {
                fontSize: 10.5,
                color: '#4a4a4a',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 62,
              },
            },
            name,
          ),
        );
      }),
    );
  }

  function HomeScreen() {
    const { setTab } = useStore();
    const [state, setState] = useState({
      loading: true,
      error: null,
      feed: [],
      tray: [],
      suggested: [],
    });

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const [feedRes, storiesRes, brandsRes] = await Promise.all([
          window.CW_API.get('/api/feed'),
          window.CW_API.get('/api/stories').catch(() => ({ tray: [] })),
          window.CW_API.get('/api/brands?limit=3').catch(() => ({ items: [] })),
        ]);
        setState({
          loading: false,
          error: null,
          feed: feedRes.items,
          tray: storiesRes.tray,
          suggested: brandsRes.items,
        });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, []);

    useEffect(() => {
      load();
    }, [load]);

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 100, background: '#fff' },
      },
      // sticky header
      h(
        'div',
        {
          style: {
            position: 'sticky',
            top: 0,
            zIndex: 30,
            background: '#fbfaf8',
            padding: 'calc(14px + var(--safe-top)) 18px 12px',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              marginBottom: 14,
            },
          },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 9 } },
            h(Crown, { size: 22 }),
            h(
              'span',
              { style: { fontSize: 15, letterSpacing: '0.34em', fontWeight: 700 } },
              'CITIZENS',
            ),
          ),
        ),
        h(
          'button',
          {
            onClick: () => setTab('discover'),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#f2f0ea',
              borderRadius: 14,
              padding: '11px 14px',
              width: '100%',
              border: 'none',
              textAlign: 'left',
            },
          },
          Icon('search', { size: 18, color: '#a09e97' }),
          h(
            'span',
            { style: { color: '#a09e97', fontSize: 13.5, fontWeight: 500 } },
            'Search apparel, brands, and more…',
          ),
        ),
      ),
      h(StoriesTray, { tray: state.tray }),
      h('div', { style: { height: 1, background: '#efedea', margin: '6px 18px 0' } }),
      state.loading
        ? h(Spinner, {})
        : state.error
          ? h(ErrorNote, { message: state.error, onRetry: load })
          : state.feed.length === 0
            ? h(EmptyState, {
                icon: 'tee',
                title: 'Your feed is quiet',
                note: 'Follow brands and citizens in Discover to fill your feed with Kingdom drops and testimonies.',
              })
            : state.feed.map((p) => h(PostCard, { key: p.id, post: p })),
      // suggested brands
      state.suggested.length
        ? h(
            'div',
            { style: { padding: '16px 16px 24px' } },
            h(
              'div',
              { style: { fontSize: 13, fontWeight: 700, marginBottom: 12 } },
              'Suggested for you',
            ),
            state.suggested.map((b) => h(SuggestedBrandRow, { key: b.id, brand: b })),
          )
        : null,
    );
  }

  function SuggestedBrandRow({ brand }) {
    const { openBrand } = useStore();
    return h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 11, padding: '7px 0' } },
      h(BrandLogo, { brand, size: 42 }),
      h(
        'div',
        { style: { flex: 1, lineHeight: 1.3, minWidth: 0 } },
        h('div', { style: { fontSize: 13.5, fontWeight: 700 } }, brand.name),
        h(
          'div',
          {
            style: {
              fontSize: 11.5,
              color: '#a09e97',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          },
          brand.tagline || '@' + brand.slug,
        ),
      ),
      h(
        'button',
        {
          onClick: () => openBrand(brand.slug),
          style: {
            border: '1px solid #F2BA1B',
            background: '#F2BA1B',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 700,
            padding: '7px 18px',
            borderRadius: 10,
          },
        },
        'View',
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Home = HomeScreen;
  window.CWScreens.PostCard = PostCard;
})();
