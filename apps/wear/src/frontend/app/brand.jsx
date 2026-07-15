// ── Brand profile ──────────────────────────────────────────────────
// GET /api/brands/:slug (brand + owner + posts). Follow acts on the
// owner (Wear's follow graph is user-id space); Message DMs the owner.
(function () {
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { Crown, Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, Avatar, Spinner, ErrorNote, ScreenHeader, FollowButton } = window.CWUI;
  const PostCard = () => window.CWScreens.PostCard;

  /**
   * Owner-only verification panel (mig 157): verification now gates
   * marketplace power (only verified brands may propose/claim), so the
   * request lifecycle lives right on the brand page. Status comes from
   * GET /api/brands/:slug/verification; the badge itself is authoritative
   * from wear.brands.verified.
   */
  function VerificationSection({ brand }) {
    const [state, setState] = useState({ loading: true, verification: null });
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
      try {
        const res = await window.CW_API.get(
          '/api/brands/' + encodeURIComponent(brand.slug) + '/verification',
        );
        setState({ loading: false, verification: res.verification });
      } catch (e) {
        setState({ loading: false, verification: null });
      }
    }, [brand.slug]);
    useEffect(() => {
      load();
    }, [load]);

    if (state.loading || brand.verified) return null;
    const v = state.verification;
    const canRequest = !v || v.status === 'rejected';

    const request = async () => {
      setBusy(true);
      setError(null);
      try {
        await window.CW_API.post(
          '/api/brands/' + encodeURIComponent(brand.slug) + '/verification',
          { note },
        );
        await load();
      } catch (e) {
        setError(e.message || 'Could not send the request.');
      } finally {
        setBusy(false);
      }
    };

    return h(
      'div',
      {
        style: {
          margin: '14px 0 0',
          border: '1px solid #f0e2b0',
          background: '#fdf9ec',
          borderRadius: 14,
          padding: '13px 15px',
        },
      },
      h(
        'div',
        { style: { fontSize: 12.5, fontWeight: 800, color: '#7a6212' } },
        v && v.status === 'pending'
          ? 'Verification pending review'
          : v && v.status === 'rejected'
            ? 'Verification was rejected'
            : v && v.status === 'revoked'
              ? 'Verification was revoked'
              : 'Get verified to join the Concepts marketplace',
      ),
      h(
        'div',
        { style: { fontSize: 11.5, color: '#8a7a3a', fontWeight: 500, lineHeight: 1.5, marginTop: 3 } },
        v && v.status === 'pending'
          ? 'An admin will review your request. Only verified brands can propose on concepts.'
          : v && v.reviewNote
            ? 'Reviewer: ' + v.reviewNote
            : 'Only verified brands can propose on concepts and claim designs.',
      ),
      canRequest
        ? h(
            'div',
            { style: { marginTop: 10 } },
            h('input', {
              value: note,
              onChange: (e) => setNote(e.target.value),
              maxLength: 2000,
              placeholder: 'Business details, registration, links…',
              style: {
                width: '100%',
                border: '1px solid #efe4bd',
                borderRadius: 11,
                padding: '10px 12px',
                fontSize: 12.5,
                fontWeight: 500,
                outline: 'none',
                background: '#fff',
                marginBottom: 8,
              },
            }),
            error
              ? h(
                  'div',
                  { style: { fontSize: 11.5, fontWeight: 700, color: '#8f4a2b', marginBottom: 8 } },
                  error,
                )
              : null,
            h(
              'button',
              {
                onClick: request,
                disabled: busy,
                style: {
                  border: 'none',
                  background: GOLD,
                  color: '#fff',
                  borderRadius: 11,
                  padding: '9px 18px',
                  fontSize: 12.5,
                  fontWeight: 700,
                },
              },
              busy ? 'Sending…' : v ? 'Re-request verification' : 'Request verification',
            ),
          )
        : null,
    );
  }

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
          const ownerProfile = await window.CW_API.get(
            '/api/users/' + encodeURIComponent(data.owner.handle),
          ).catch(() => null);
          if (ownerProfile) setFollowing(!!ownerProfile.viewerFollows);
        }
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, [params.slug]);
    useEffect(() => {
      load();
    }, [load]);

    if (state.loading)
      return h(
        'div',
        { style: { height: '100%', background: '#fff' } },
        h(ScreenHeader, { title: 'Brand', onBack: pop }),
        h(Spinner, {}),
      );
    if (state.error || !state.data) {
      return h(
        'div',
        { style: { height: '100%', background: '#fff' } },
        h(ScreenHeader, { title: 'Brand', onBack: pop }),
        h(ErrorNote, { message: state.error || 'Brand not found.', onRetry: load }),
      );
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
      } catch (e) {
        /* self-DM etc. */
      }
    };

    const Card = PostCard();

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 100, background: '#fff' },
      },
      // banner
      h(
        'div',
        { style: { position: 'relative', height: 200, background: '#161616' } },
        h(
          'div',
          {
            style: {
              position: 'absolute',
              top: 'calc(14px + var(--safe-top))',
              left: 16,
              right: 16,
              zIndex: 30,
              display: 'flex',
              justifyContent: 'space-between',
            },
          },
          h(
            'button',
            {
              onClick: pop,
              style: {
                border: 'none',
                background: '#fff',
                borderRadius: '50%',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              },
            },
            Icon('back', { size: 20 }),
          ),
        ),
        h(
          'div',
          {
            style: {
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.55))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            },
          },
          brand.logoUrl
            ? h('img', {
                src: brand.logoUrl,
                alt: brand.name,
                style: { width: 84, height: 84, borderRadius: '50%', objectFit: 'cover' },
              })
            : h(
                'div',
                {
                  style: {
                    width: 84,
                    height: 84,
                    borderRadius: '50%',
                    background: '#0e0e0e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                },
                h(Crown, { size: 44 }),
              ),
          brand.tagline
            ? h(
                'div',
                {
                  style: {
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.34em',
                    textTransform: 'uppercase',
                    padding: '0 20px',
                    textAlign: 'center',
                  },
                },
                brand.tagline,
              )
            : null,
        ),
      ),
      // header block
      h(
        'div',
        { style: { padding: '18px 20px 0' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('div', { style: { fontSize: 20, fontWeight: 800 } }, brand.name),
          brand.verified
            ? h(
                'span',
                { title: 'Verified', style: { display: 'flex' } },
                Icon('check', { size: 16, color: GOLD, sw: 2.6 }),
              )
            : null,
        ),
        h(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 3,
              color: '#a09e97',
              fontSize: 12.5,
              fontWeight: 600,
            },
          },
          h('span', null, '@' + brand.slug),
        ),
        owner
          ? h(
              'button',
              {
                onClick: () => openUser(owner.handle),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'none',
                  padding: '12px 0 0',
                },
              },
              h(Avatar, { user: owner, size: 26 }),
              h(
                'span',
                { style: { fontSize: 12.5, fontWeight: 600, color: '#4a4a4a' } },
                'Led by ' + owner.displayName,
              ),
            )
          : null,
        brand.websiteUrl
          ? h(
              'a',
              {
                href: brand.websiteUrl,
                target: '_blank',
                rel: 'noreferrer noopener',
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: GOLD,
                  textDecoration: 'none',
                },
              },
              Icon('link', { size: 14, color: GOLD }),
              brand.websiteUrl.replace(/^https?:\/\//, ''),
            )
          : null,
        isOwner ? h(VerificationSection, { brand }) : null,
        !isOwner && owner
          ? h(
              'div',
              { style: { display: 'flex', gap: 10, marginTop: 16 } },
              h(
                'div',
                { style: { flex: 1 } },
                h(
                  'button',
                  {
                    onClick: toggleFollow,
                    style: {
                      width: '100%',
                      border: '1.5px solid ' + (following ? '#e6e3dc' : GOLD),
                      background: following ? '#fff' : GOLD,
                      color: following ? '#9a9892' : '#fff',
                      borderRadius: 13,
                      padding: 12,
                      fontSize: 13.5,
                      fontWeight: 700,
                    },
                  },
                  following ? 'Following' : 'Follow',
                ),
              ),
              h(
                'button',
                {
                  onClick: message,
                  style: {
                    flex: 1,
                    border: '1.5px solid #e6e3dc',
                    background: '#fff',
                    color: '#1a1a1a',
                    borderRadius: 13,
                    padding: 12,
                    fontSize: 13.5,
                    fontWeight: 700,
                  },
                },
                'Message',
              ),
            )
          : null,
      ),
      // posts
      h(
        'div',
        { style: { marginTop: 18, borderTop: '1px solid #f3f1ee' } },
        posts.items.length === 0
          ? h(
              'div',
              {
                style: {
                  padding: '30px 20px',
                  textAlign: 'center',
                  fontSize: 12.5,
                  color: '#a09e97',
                  fontWeight: 500,
                },
              },
              isOwner
                ? 'No posts yet — share your first drop from Create.'
                : 'No posts from this brand yet.',
            )
          : posts.items.map((p) => h(Card, { key: p.id, post: p })),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Brand = BrandScreen;
})();
