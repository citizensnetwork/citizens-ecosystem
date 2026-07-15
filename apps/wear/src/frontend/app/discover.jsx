// ── Discover: search, brands, Kingdom contributors, trending tags ──
// GET /api/brands, /api/users?q=, /api/hashtags/trending and the
// ecosystem rail GET /api/ecosystem/contributors (Connect commons via
// connect-client — mutual discovery across the Citizens ecosystem).
(function () {
  const { createElement: h, useState, useEffect, useCallback, useRef } = React;
  const { Crown, Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, Avatar, BrandLogo, Spinner, EmptyState, ErrorNote } = window.CWUI;

  function DiscoverScreen() {
    const { openBrand, openUser, openConcepts } = useStore();
    const [q, setQ] = useState('');
    const [results, setResults] = useState(null); // {users, brands} | null
    const [searching, setSearching] = useState(false);
    const [state, setState] = useState({
      loading: true,
      error: null,
      brands: [],
      tags: [],
      contributors: [],
    });
    const debounceRef = useRef(null);

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const [brandsRes, tagsRes, contribRes] = await Promise.all([
          window.CW_API.get('/api/brands?limit=12'),
          window.CW_API.get('/api/hashtags/trending?limit=8').catch(() => ({ tags: [] })),
          window.CW_API.get('/api/ecosystem/contributors?limit=8').catch(() => ({ items: [] })),
        ]);
        setState({
          loading: false,
          error: null,
          brands: brandsRes.items,
          tags: tagsRes.tags,
          contributors: contribRes.items,
        });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, []);
    useEffect(() => {
      load();
    }, [load]);

    // Debounced live search across users + brands.
    useEffect(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const term = q.trim();
      if (!term) {
        setResults(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const [users, brands] = await Promise.all([
            window.CW_API.get('/api/users?q=' + encodeURIComponent(term) + '&limit=8'),
            window.CW_API.get('/api/brands?q=' + encodeURIComponent(term) + '&limit=8'),
          ]);
          setResults({ users: users.items, brands: brands.items });
        } catch (e) {
          setResults({ users: [], brands: [] });
        } finally {
          setSearching(false);
        }
      }, 280);
      return () => clearTimeout(debounceRef.current);
    }, [q]);

    const sectionTitle = (label, pad) =>
      h(
        'div',
        { style: { padding: pad || '18px 18px 10px', fontSize: 14, fontWeight: 800 } },
        label,
      );

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 100, background: '#fff' },
      },
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
              textAlign: 'center',
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: '-0.3px',
              marginBottom: 14,
            },
          },
          'Discover',
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#f2f0ea',
              borderRadius: 14,
              padding: '11px 14px',
            },
          },
          Icon('search', { size: 18, color: '#a09e97' }),
          h('input', {
            value: q,
            onChange: (e) => setQ(e.target.value),
            placeholder: 'Search brands, citizens…',
            style: {
              flex: 1,
              border: 'none',
              background: 'none',
              outline: 'none',
              fontSize: 13.5,
              fontWeight: 500,
              color: '#1a1a1a',
            },
          }),
          q
            ? h(
                'button',
                {
                  onClick: () => setQ(''),
                  style: { border: 'none', background: 'none', padding: 2 },
                },
                Icon('close', { size: 16, color: '#a09e97' }),
              )
            : null,
        ),
      ),

      // search results overlay-in-flow
      results
        ? h(
            'div',
            { className: 'fade-in' },
            searching ? h(Spinner, { size: 20 }) : null,
            sectionTitle('Brands'),
            results.brands.length
              ? results.brands.map((b) =>
                  h(
                    'button',
                    { key: b.id, onClick: () => openBrand(b.slug), style: rowStyle() },
                    h(BrandLogo, { brand: b, size: 44 }),
                    rowText(b.name, b.tagline || '@' + b.slug),
                  ),
                )
              : noneNote('No brands match.'),
            sectionTitle('Citizens'),
            results.users.length
              ? results.users.map((u) =>
                  h(
                    'button',
                    { key: u.id, onClick: () => openUser(u.handle), style: rowStyle() },
                    h(Avatar, { user: u, size: 44 }),
                    rowText(u.displayName, '@' + u.handle),
                  ),
                )
              : noneNote('No citizens match.'),
          )
        : state.loading
          ? h(Spinner, {})
          : state.error
            ? h(ErrorNote, { message: state.error, onRetry: load })
            : h(
                'div',
                null,
                // Concepts marketplace entry (mig 157)
                h(
                  'button',
                  {
                    onClick: openConcepts,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 13,
                      margin: '14px 18px 2px',
                      width: 'calc(100% - 36px)',
                      textAlign: 'left',
                      background: '#0e0e0e',
                      border: 'none',
                      borderRadius: 18,
                      padding: '16px 18px',
                    },
                  },
                  h(
                    'div',
                    {
                      style: {
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        background: 'rgba(242,186,27,0.16)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      },
                    },
                    Icon('tee', { size: 22, color: GOLD }),
                  ),
                  h(
                    'div',
                    { style: { flex: 1, minWidth: 0, lineHeight: 1.35 } },
                    h(
                      'div',
                      { style: { fontSize: 14, fontWeight: 800, color: '#fff' } },
                      'Concepts marketplace',
                    ),
                    h(
                      'div',
                      { style: { fontSize: 11.5, color: '#b9b7b0', fontWeight: 500 } },
                      'Post a design · brands propose · royalties honoured',
                    ),
                  ),
                  h(
                    'div',
                    { style: { transform: 'rotate(180deg)', display: 'flex', flex: 'none' } },
                    Icon('back', { size: 18, color: GOLD }),
                  ),
                ),
                // Featured brands rail
                sectionTitle('Featured Brands', '14px 18px 12px'),
                state.brands.length
                  ? h(
                      'div',
                      {
                        className: 'cwsc',
                        style: {
                          display: 'flex',
                          gap: 18,
                          overflowX: 'auto',
                          padding: '0 18px 6px',
                        },
                      },
                      state.brands.map((b) =>
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
                              gap: 8,
                              border: 'none',
                              background: 'none',
                              width: 66,
                              padding: 0,
                            },
                          },
                          h(BrandLogo, { brand: b, size: 62 }),
                          h(
                            'span',
                            {
                              style: {
                                fontSize: 10.5,
                                fontWeight: 600,
                                color: '#4a4a4a',
                                textAlign: 'center',
                                lineHeight: 1.2,
                              },
                            },
                            b.name,
                          ),
                        ),
                      ),
                    )
                  : h(EmptyState, {
                      icon: 'tee',
                      title: 'No brands yet',
                      note: 'Be the first — create your brand from the Create tab.',
                    }),

                // Brand grid (design's "Popular This Week" card grid)
                state.brands.length
                  ? h(
                      'div',
                      null,
                      sectionTitle('Popular This Week'),
                      h(
                        'div',
                        {
                          style: {
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 12,
                            padding: '0 18px',
                          },
                        },
                        state.brands.slice(0, 6).map((b) =>
                          h(
                            'button',
                            {
                              key: b.id,
                              onClick: () => openBrand(b.slug),
                              style: {
                                border: 'none',
                                padding: 0,
                                borderRadius: 16,
                                overflow: 'hidden',
                                background: '#fff',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                                textAlign: 'left',
                              },
                            },
                            h(
                              'div',
                              {
                                style: {
                                  aspectRatio: '1/1',
                                  background: '#0e0e0e',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexDirection: 'column',
                                  gap: 8,
                                },
                              },
                              b.logoUrl
                                ? h('img', {
                                    src: b.logoUrl,
                                    alt: b.name,
                                    style: { width: '100%', height: '100%', objectFit: 'cover' },
                                  })
                                : h(Crown, { size: 44 }),
                            ),
                            h(
                              'div',
                              { style: { padding: '10px 12px 12px' } },
                              h(
                                'div',
                                {
                                  style: {
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    lineHeight: 1.25,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  },
                                },
                                b.name,
                              ),
                              h(
                                'div',
                                {
                                  style: {
                                    fontSize: 11,
                                    color: '#a09e97',
                                    fontWeight: 500,
                                    marginTop: 4,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  },
                                },
                                b.tagline || '@' + b.slug,
                              ),
                            ),
                          ),
                        ),
                      ),
                    )
                  : null,

                // Trending tags
                state.tags.length
                  ? h(
                      'div',
                      null,
                      sectionTitle('Trending Tags'),
                      h(
                        'div',
                        { style: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 18px' } },
                        state.tags.map((t) =>
                          h(
                            'span',
                            {
                              key: t.tag,
                              style: {
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#5a5a5a',
                                background: '#f4f2ec',
                                borderRadius: 999,
                                padding: '6px 12px',
                              },
                            },
                            '#' + t.tag,
                          ),
                        ),
                      ),
                    )
                  : null,

                // From the wider Kingdom (Connect contributors)
                state.contributors.length
                  ? h(
                      'div',
                      { style: { paddingBottom: 10 } },
                      sectionTitle('From the wider Kingdom'),
                      h(
                        'div',
                        {
                          style: {
                            padding: '0 18px',
                            fontSize: 11.5,
                            color: '#a09e97',
                            fontWeight: 500,
                            marginTop: -6,
                            marginBottom: 10,
                          },
                        },
                        'Ministries and organisations on Citizens Connect',
                      ),
                      state.contributors.map((c) =>
                        h(
                          'div',
                          {
                            key: c.id,
                            style: {
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '9px 18px',
                            },
                          },
                          c.logoUrl || c.avatarUrl
                            ? h('img', {
                                src: c.logoUrl || c.avatarUrl,
                                alt: c.name,
                                style: {
                                  width: 44,
                                  height: 44,
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  flex: 'none',
                                },
                              })
                            : h(
                                'div',
                                {
                                  style: {
                                    width: 44,
                                    height: 44,
                                    borderRadius: '50%',
                                    background: '#0e0e0e',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flex: 'none',
                                  },
                                },
                                h(Crown, { size: 22 }),
                              ),
                          h(
                            'div',
                            { style: { flex: 1, minWidth: 0, lineHeight: 1.3 } },
                            h('div', { style: { fontSize: 13, fontWeight: 700 } }, c.name),
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
                              (c.kind
                                ? c.kind.charAt(0).toUpperCase() + c.kind.slice(1)
                                : 'Contributor') + (c.bio ? ' · ' + c.bio : ''),
                            ),
                          ),
                          c.websiteUrl
                            ? h(
                                'a',
                                {
                                  href: c.websiteUrl,
                                  target: '_blank',
                                  rel: 'noreferrer noopener',
                                  style: { display: 'flex' },
                                },
                                Icon('link', { size: 15, color: GOLD }),
                              )
                            : null,
                        ),
                      ),
                    )
                  : null,
              ),
    );

    function rowStyle() {
      return {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '9px 18px',
        border: 'none',
        background: 'none',
        width: '100%',
        textAlign: 'left',
      };
    }
    function rowText(title, sub) {
      return h(
        'div',
        { style: { flex: 1, minWidth: 0, lineHeight: 1.3 } },
        h('div', { style: { fontSize: 13.5, fontWeight: 700 } }, title),
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
          sub,
        ),
      );
    }
    function noneNote(text) {
      return h(
        'div',
        { style: { padding: '2px 18px 10px', fontSize: 12.5, color: '#a09e97', fontWeight: 500 } },
        text,
      );
    }
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Discover = DiscoverScreen;
})();
