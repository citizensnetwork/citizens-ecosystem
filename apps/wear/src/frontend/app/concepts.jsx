// ── Concepts marketplace (mig 157 + 161) ───────────────────────────
// The COMMUNITY surface (§6.2): browse/detail/create for design Concepts
// with the full engagement triad — like (rides the upvote storage),
// threaded comments, recorded shares — plus the concept-stories bar
// ("concept-statuses", Creator-badge/bootstrap-grace promotions) and every
// marketplace party flow: brand proposals (verified-only), creator award,
// the append-only status stepper, royalty proof/close-out, and the
// catalogue-conversion handshake. All via /api/concepts* (Bearer).
(function () {
  const { createElement: h, useState, useEffect, useCallback, useMemo } = React;
  const { Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const {
    GOLD,
    INK,
    MUTED,
    Avatar,
    BrandLogo,
    GoldButton,
    Spinner,
    EmptyState,
    ErrorNote,
    ScreenHeader,
    ImagePicker,
    StoryViewer,
    shareLink,
    timeAgo,
    fmtCount,
  } = window.CWUI;

  const STAGES = ['proposed', 'claimed', 'in_production', 'sample_review', 'released', 'sold_out'];
  const STAGE_LABEL = {
    proposed: 'Proposed',
    claimed: 'Claimed',
    in_production: 'In Production',
    sample_review: 'Sample Review',
    released: 'Released',
    sold_out: 'Sold Out',
  };
  const stageIdx = (s) => STAGES.indexOf(s);

  const card = {
    background: '#fff',
    border: '1px solid #f0eee9',
    borderRadius: 18,
    padding: '16px 18px',
    margin: '0 18px 14px',
  };
  const field = {
    width: '100%',
    border: '1px solid #efedea',
    borderRadius: 14,
    padding: '12px 14px',
    fontSize: 13.5,
    fontWeight: 500,
    outline: 'none',
    background: '#fff',
    color: INK,
  };
  const label = { fontSize: 12, fontWeight: 700, color: '#4a4a4a', margin: '14px 0 6px' };
  const sectionTitle = { fontSize: 14, fontWeight: 800, marginBottom: 10 };

  function StatusChip({ status }) {
    const released = status === 'released' || status === 'sold_out';
    const open = status === 'proposed';
    return h(
      'span',
      {
        style: {
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
          color: open ? '#3f6f34' : released ? '#fff' : '#7a6212',
          background: open ? '#eef5ea' : released ? INK : '#faf3da',
          border: '1px solid ' + (open ? '#dcead5' : released ? INK : '#f0e2b0'),
          borderRadius: 8,
          padding: '4px 9px',
          flex: 'none',
        },
      },
      STAGE_LABEL[status] || status,
    );
  }

  // The ratified "like" (§6.2) — rides the existing upvote storage/API,
  // re-skinned from star to heart (presentation only, counts carry over).
  function LikeButton({ concept, compact }) {
    const [n, setN] = useState(concept.upvotes || 0);
    const [on, setOn] = useState(!!concept.viewerUpvoted);
    const [busy, setBusy] = useState(false);
    const toggle = async (e) => {
      e.stopPropagation();
      if (busy) return;
      setBusy(true);
      const want = !on;
      setOn(want);
      setN((v) => v + (want ? 1 : -1)); // optimistic
      try {
        const res = want
          ? await window.CW_API.post('/api/concepts/' + concept.id + '/upvote')
          : await window.CW_API.del('/api/concepts/' + concept.id + '/upvote');
        setN(res.upvotes);
        setOn(res.viewerUpvoted);
      } catch (err) {
        setOn(!want);
        setN((v) => v + (want ? -1 : 1));
      } finally {
        setBusy(false);
      }
    };
    return h(
      'button',
      {
        onClick: toggle,
        'aria-label': on ? 'Unlike' : 'Like',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid ' + (on ? GOLD : '#e6e3dc'),
          background: on ? '#fdf6e3' : '#fff',
          borderRadius: 10,
          padding: compact ? '5px 11px' : '8px 15px',
          flex: 'none',
        },
      },
      Icon('heart', {
        size: compact ? 14 : 16,
        color: on ? GOLD : '#9a9892',
        fill: on ? GOLD : null,
      }),
      h(
        'span',
        {
          style: {
            fontSize: compact ? 12 : 13,
            fontWeight: 800,
            color: on ? '#7a6212' : '#6a6a6a',
          },
        },
        fmtCount(n),
      ),
    );
  }

  // Recorded share (§6.2 — distinct-sharer social proof): system share sheet
  // when available, clipboard fallback; the deep link lands on this concept.
  function ShareButton({ concept, compact }) {
    const [n, setN] = useState(concept.shareCount || 0);
    const [done, setDone] = useState(!!concept.viewerShared);
    const [note, setNote] = useState(null); // 'Link copied' toast text
    const share = async (e) => {
      e.stopPropagation();
      const url =
        window.location.origin +
        window.location.pathname +
        '?concept=' +
        encodeURIComponent(concept.id);
      const channel = await shareLink({
        url,
        title: concept.title,
        text: '“' + concept.title + '” — a community concept on Citizens Wear',
      });
      if (!channel) return; // dismissed / no clipboard
      if (channel === 'link') {
        setNote('Link copied');
        setTimeout(() => setNote(null), 1800);
      }
      try {
        const res = await window.CW_API.post('/api/concepts/' + concept.id + '/share', { channel });
        setN(res.shares);
        setDone(res.viewerShared);
      } catch (err) {
        /* recording is best-effort — the share itself already happened */
      }
    };
    return h(
      'button',
      {
        onClick: share,
        'aria-label': 'Share concept',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid ' + (done ? GOLD : '#e6e3dc'),
          background: done ? '#fdf6e3' : '#fff',
          borderRadius: 10,
          padding: compact ? '5px 11px' : '8px 15px',
          flex: 'none',
          position: 'relative',
        },
      },
      Icon('share', { size: compact ? 14 : 16, color: done ? GOLD : '#9a9892' }),
      h(
        'span',
        {
          style: {
            fontSize: compact ? 12 : 13,
            fontWeight: 800,
            color: done ? '#7a6212' : '#6a6a6a',
          },
        },
        note || fmtCount(n),
      ),
    );
  }

  // ── Concept-statuses bar (mig 161) ─────────────────────────────────
  // One bubble per creator with active promotions; gold ring while any of
  // theirs is unseen. Tapping plays them in the shared StoryViewer (each
  // status RENDERS its concept: artwork + title + "View concept" CTA).
  function StatusesBar({ statuses, onSeen }) {
    const { me, push } = useStore();
    const [viewing, setViewing] = useState(null); // creator id whose run is open
    const groups = useMemo(() => {
      const byCreator = new Map();
      for (const s of statuses) {
        if (!s.creator) continue;
        const g = byCreator.get(s.creator.id) || { creator: s.creator, items: [] };
        g.items.push(s);
        byCreator.set(s.creator.id, g);
      }
      return [...byCreator.values()];
    }, [statuses]);

    if (!groups.length) return null;
    const open = groups.find((g) => g.creator.id === viewing);

    return h(
      'div',
      null,
      h(
        'div',
        {
          className: 'cwsc',
          style: { display: 'flex', gap: 14, overflowX: 'auto', padding: '2px 18px 12px' },
        },
        groups.map((g) => {
          const unseen = g.items.some((s) => !s.viewerSeen);
          return h(
            'button',
            {
              key: g.creator.id,
              onClick: () => setViewing(g.creator.id),
              style: {
                flex: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                border: 'none',
                background: 'none',
                width: 60,
                padding: 0,
              },
            },
            h(
              'div',
              {
                style: {
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  padding: 2.5,
                  background: unseen ? 'linear-gradient(135deg,#e8c45c,#b8902a)' : '#dcd9d2',
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
                    border: '2.5px solid #fff',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f2f0ea',
                  },
                },
                h(Avatar, { user: g.creator, size: 46 }),
              ),
            ),
            h(
              'span',
              {
                style: {
                  fontSize: 10.5,
                  color: '#4a4a4a',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 60,
                },
              },
              g.creator.displayName || '@' + g.creator.handle,
            ),
          );
        }),
      ),
      open
        ? h(StoryViewer, {
            author: open.creator,
            items: open.items.map((s) => ({
              id: s.id,
              mediaUrl: s.concept.media && s.concept.media.url,
              caption: s.concept.title,
              subtitle: timeAgo(s.createdAt) + ' ago · community concept',
              cta: {
                label: 'View concept',
                onClick: () => {
                  setViewing(null);
                  push('concept', { id: s.concept.id });
                },
              },
            })),
            onClose: () => setViewing(null),
            onView: (item) => {
              if (!me) return;
              window.CW_API.post('/api/concepts/statuses/' + item.id + '/view').catch(() => {});
              onSeen(item.id);
            },
          })
        : null,
    );
  }

  // ── Browse ─────────────────────────────────────────────────────────
  const FILTERS = [
    { k: '', label: 'All' },
    { k: 'proposed', label: 'Open' },
    { k: 'claimed', label: 'Claimed' },
    { k: 'released', label: 'Released' },
  ];

  function ConceptsScreen() {
    const { pop, push } = useStore();
    const [filter, setFilter] = useState('');
    const [state, setState] = useState({ loading: true, error: null, items: [] });
    const [statuses, setStatuses] = useState([]);

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const [res, bar] = await Promise.all([
          window.CW_API.get('/api/concepts?limit=30' + (filter ? '&status=' + filter : '')),
          window.CW_API.get('/api/concepts/statuses').catch(() => ({ statuses: [] })),
        ]);
        setState({ loading: false, error: null, items: res.items });
        setStatuses(bar.statuses || []);
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, [filter]);
    useEffect(() => {
      load();
    }, [load]);

    const markSeen = useCallback(
      (statusId) =>
        setStatuses((list) =>
          list.map((s) => (s.id === statusId ? { ...s, viewerSeen: true } : s)),
        ),
      [],
    );

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fcfbf9' },
      },
      h(ScreenHeader, {
        title: 'Concepts',
        onBack: pop,
        right: h(
          'button',
          {
            onClick: () => push('createConcept', {}),
            style: {
              border: 'none',
              background: GOLD,
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 14px -6px rgba(242,186,27,0.8)',
            },
          },
          Icon('plus', { size: 19, color: '#fff', sw: 2.2 }),
        ),
      }),
      h(StatusesBar, { statuses, onSeen: markSeen }),
      h(
        'div',
        { style: { display: 'flex', gap: 8, padding: '4px 18px 14px' } },
        FILTERS.map((f) =>
          h(
            'button',
            {
              key: f.k,
              onClick: () => setFilter(f.k),
              style: {
                border: '1.5px solid ' + (filter === f.k ? INK : '#e6e3dc'),
                background: filter === f.k ? INK : '#fff',
                color: filter === f.k ? '#fff' : '#5a5a5a',
                borderRadius: 11,
                padding: '7px 15px',
                fontSize: 12.5,
                fontWeight: 700,
              },
            },
            f.label,
          ),
        ),
      ),
      state.loading
        ? h(Spinner, {})
        : state.error
          ? h(ErrorNote, { message: state.error, onRetry: load })
          : !state.items.length
            ? h(EmptyState, {
                icon: 'tee',
                title: 'No concepts yet',
                note: 'Post a design idea and let Kingdom brands bring it to life.',
              })
            : state.items.map((c) =>
                h(ConceptCard, {
                  key: c.id,
                  concept: c,
                  onOpen: () => push('concept', { id: c.id }),
                }),
              ),
    );
  }

  function ConceptCard({ concept, onOpen }) {
    const media = concept.media && concept.media[0];
    return h(
      'div',
      { style: { ...card, padding: 0, overflow: 'hidden', cursor: 'pointer' }, onClick: onOpen },
      media
        ? h('img', {
            src: media.url,
            alt: media.altText || concept.title,
            style: { width: '100%', height: 190, objectFit: 'cover', display: 'block' },
          })
        : null,
      h(
        'div',
        { style: { padding: '14px 16px 15px' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h(
            'div',
            {
              style: {
                flex: 1,
                minWidth: 0,
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: '-0.2px',
              },
            },
            concept.title,
          ),
          h(StatusChip, { status: concept.status }),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 } },
          h(Avatar, { user: concept.creator, size: 24 }),
          h(
            'span',
            { style: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: '#6a6a6a' } },
            concept.creator ? '@' + concept.creator.handle : 'Unknown creator',
          ),
          concept.proposalCount
            ? h(
                'span',
                { style: { fontSize: 11.5, fontWeight: 700, color: '#7a6212' } },
                concept.proposalCount +
                  (concept.proposalCount === 1 ? ' brand proposed' : ' brands proposed'),
              )
            : null,
          concept.commentCount
            ? h(
                'span',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#8a8880',
                  },
                },
                Icon('comment', { size: 13, color: '#9a9892' }),
                fmtCount(concept.commentCount),
              )
            : null,
          h(LikeButton, { concept, compact: true }),
        ),
      ),
    );
  }

  // ── Status stepper (from the append-only log) ──────────────────────
  function StatusStepper({ status, statusLog }) {
    const reachedAt = {};
    (statusLog || []).forEach((e) => {
      reachedAt[e.status] = e.createdAt;
    });
    const currentIdx = stageIdx(status);
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
      STAGES.map((s, i) => {
        const reached = i <= currentIdx;
        const last = i === STAGES.length - 1;
        return h(
          'div',
          { key: s, style: { display: 'flex', gap: 12, minHeight: last ? 26 : 44 } },
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 22,
                flex: 'none',
              },
            },
            h(
              'div',
              {
                style: {
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: reached ? GOLD : '#fff',
                  border: '2px solid ' + (reached ? GOLD : '#e6e3dc'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                },
              },
              reached ? Icon('check', { size: 12, color: '#fff', sw: 3 }) : null,
            ),
            !last
              ? h('div', {
                  style: { width: 2, flex: 1, background: i < currentIdx ? GOLD : '#eeece6' },
                })
              : null,
          ),
          h(
            'div',
            { style: { paddingTop: 2, paddingBottom: 12, minWidth: 0 } },
            h(
              'div',
              {
                style: {
                  fontSize: 13,
                  fontWeight: reached ? 800 : 600,
                  color: reached ? INK : '#b5b3ac',
                },
              },
              STAGE_LABEL[s],
            ),
            reachedAt[s]
              ? h(
                  'div',
                  { style: { fontSize: 11, color: MUTED, fontWeight: 500, marginTop: 1 } },
                  timeAgo(reachedAt[s]) + ' ago',
                )
              : null,
          ),
        );
      }),
    );
  }

  // ── Detail ─────────────────────────────────────────────────────────
  function ConceptDetailScreen({ params }) {
    const { me, pop, push, openUser, openBrand } = useStore();
    const [state, setState] = useState({ loading: true, error: null, data: null });
    // Party data (loaded lazily when the viewer is a party to the concept).
    const [proposals, setProposals] = useState(null);
    const [royalties, setRoyalties] = useState(null);
    const [conversions, setConversions] = useState(null);
    const [comments, setComments] = useState(null); // public thread (mig 161)
    const [busy, setBusy] = useState(null); // action key currently in flight
    const [note, setNote] = useState(null); // {ok, text}

    const myUserId = me && me.user && me.user.id;
    // Stable reference: a fresh `[]` each render would churn the `load`
    // callback's deps and refetch on every render (pre-existing lint warning).
    const myBrands = useMemo(() => (me && me.brands) || [], [me]);

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await window.CW_API.get('/api/concepts/' + params.id);
        setState({ loading: false, error: null, data });
        window.CW_API.get('/api/concepts/' + params.id + '/comments')
          .then((r) => setComments(r.comments))
          .catch(() => setComments([]));
        const isCreator = data.concept.creator && data.concept.creator.id === myUserId;
        const myClaimBrand = data.claim && myBrands.find((b) => b.id === data.claim.brandId);
        if (myUserId && (isCreator || myBrands.length)) {
          window.CW_API.get('/api/concepts/' + params.id + '/proposals')
            .then((r) => setProposals(r.proposals))
            .catch(() => setProposals([]));
        }
        if (data.claim && (isCreator || myClaimBrand)) {
          window.CW_API.get('/api/claims/' + data.claim.id + '/royalties')
            .then((r) => setRoyalties(r.royalties))
            .catch(() => setRoyalties([]));
          window.CW_API.get('/api/claims/' + data.claim.id + '/conversions')
            .then((r) => setConversions(r.conversions))
            .catch(() => setConversions([]));
        }
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, [params.id, myUserId, myBrands]);
    useEffect(() => {
      load();
    }, [load]);

    const act = async (key, fn, okText) => {
      setBusy(key);
      setNote(null);
      try {
        await fn();
        if (okText) setNote({ ok: true, text: okText });
        await load();
      } catch (e) {
        setNote({ ok: false, text: e.message || 'Action failed.' });
      } finally {
        setBusy(null);
      }
    };

    if (state.loading) {
      return h(
        'div',
        { className: 'cwsc', style: { height: '100%', background: '#fcfbf9' } },
        h(ScreenHeader, { title: 'Concept', onBack: pop }),
        h(Spinner, {}),
      );
    }
    if (state.error || !state.data) {
      return h(
        'div',
        { className: 'cwsc', style: { height: '100%', background: '#fcfbf9' } },
        h(ScreenHeader, { title: 'Concept', onBack: pop }),
        h(ErrorNote, { message: state.error, onRetry: load }),
      );
    }

    const { concept, proposalTags, statusLog, claim } = state.data;
    const isCreator = concept.creator && concept.creator.id === myUserId;
    const open = concept.status === 'proposed';
    const myClaimBrand = claim && myBrands.find((b) => b.id === claim.brandId);
    const openConversion = (conversions || []).find((c) => c.status === 'proposed');
    const converted = (conversions || []).some((c) => c.status === 'accepted');

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fcfbf9' },
      },
      h(ScreenHeader, { title: 'Concept', onBack: pop }),

      // Hero media
      concept.media && concept.media.length
        ? h('img', {
            src: concept.media[0].url,
            alt: concept.media[0].altText || concept.title,
            style: { width: '100%', height: 250, objectFit: 'cover', display: 'block' },
          })
        : null,

      h(
        'div',
        { style: { padding: '16px 0 0' } },
        h(
          'div',
          { style: card },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
            h(
              'div',
              {
                style: {
                  flex: 1,
                  minWidth: 0,
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: '-0.3px',
                  lineHeight: 1.25,
                },
              },
              concept.title,
            ),
            h(StatusChip, { status: concept.status }),
          ),
          concept.description
            ? h(
                'div',
                {
                  style: {
                    fontSize: 13,
                    color: '#5a5a5a',
                    fontWeight: 500,
                    lineHeight: 1.55,
                    marginTop: 8,
                  },
                },
                concept.description,
              )
            : null,
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 } },
            h(
              'button',
              {
                onClick: () => concept.creator && openUser(concept.creator.handle),
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                },
              },
              h(Avatar, { user: concept.creator, size: 30 }),
              h(
                'div',
                { style: { lineHeight: 1.25, minWidth: 0 } },
                h(
                  'div',
                  { style: { fontSize: 12.5, fontWeight: 800 } },
                  (concept.creator && concept.creator.displayName) || 'Unknown',
                ),
                h(
                  'div',
                  { style: { fontSize: 11, color: MUTED, fontWeight: 600 } },
                  concept.creator ? '@' + concept.creator.handle : '',
                ),
              ),
            ),
            h(LikeButton, { concept }),
            h(ShareButton, { concept }),
          ),
        ),

        // Brand proposal tags (public surface)
        proposalTags && proposalTags.length
          ? h(
              'div',
              { style: card },
              h(
                'div',
                { style: sectionTitle },
                proposalTags.length +
                  (proposalTags.length === 1 ? ' brand has proposed' : ' brands have proposed'),
              ),
              h(
                'div',
                { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
                proposalTags.map((t, i) =>
                  t.brand
                    ? h(
                        'button',
                        {
                          key: i,
                          onClick: () => openBrand(t.brand.slug),
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            border: '1px solid #eeece6',
                            background: '#faf9f6',
                            borderRadius: 11,
                            padding: '6px 12px 6px 7px',
                          },
                        },
                        h(BrandLogo, { brand: t.brand, size: 22 }),
                        h('span', { style: { fontSize: 12, fontWeight: 700 } }, t.brand.name),
                        t.brand.verified ? Icon('check', { size: 13, color: GOLD, sw: 3 }) : null,
                      )
                    : null,
                ),
              ),
            )
          : null,

        // Claimed-by
        concept.claimedBy
          ? h(
              'div',
              { style: card },
              h('div', { style: sectionTitle }, 'Claimed by'),
              h(
                'button',
                {
                  onClick: () => openBrand(concept.claimedBy.slug),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: 'none',
                    background: 'none',
                    padding: 0,
                    width: '100%',
                    textAlign: 'left',
                  },
                },
                h(BrandLogo, { brand: concept.claimedBy, size: 38 }),
                h(
                  'div',
                  { style: { flex: 1, minWidth: 0, lineHeight: 1.3 } },
                  h(
                    'div',
                    {
                      style: {
                        fontSize: 13.5,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      },
                    },
                    concept.claimedBy.name,
                    concept.claimedBy.verified
                      ? Icon('check', { size: 14, color: GOLD, sw: 3 })
                      : null,
                  ),
                  claim
                    ? h(
                        'div',
                        { style: { fontSize: 11.5, color: MUTED, fontWeight: 600 } },
                        'Awarded ' + timeAgo(claim.awardedAt) + ' ago',
                      )
                    : null,
                ),
              ),
            )
          : null,

        // Status stepper (the append-only log)
        h(
          'div',
          { style: card },
          h('div', { style: sectionTitle }, 'Journey'),
          h(StatusStepper, { status: concept.status, statusLog }),
          statusLog && statusLog.length && statusLog[statusLog.length - 1].note
            ? h(
                'div',
                {
                  style: {
                    fontSize: 12,
                    color: '#6a6a6a',
                    fontWeight: 500,
                    marginTop: 4,
                    fontStyle: 'italic',
                  },
                },
                '“' + statusLog[statusLog.length - 1].note + '”',
              )
            : null,
        ),

        // Community thread (mig 161)
        h(CommentsCard, { conceptId: concept.id, comments, setComments, me, openUser }),

        note
          ? h(
              'div',
              {
                style: {
                  margin: '0 18px 14px',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: note.ok ? '#3f6f34' : '#8f4a2b',
                },
              },
              note.text,
            )
          : null,

        // ── Creator: award proposals while open ──
        isCreator && open && proposals && proposals.length
          ? h(
              'div',
              { style: card },
              h('div', { style: sectionTitle }, 'Proposals on your concept'),
              proposals.map((p) =>
                h(ProposalRow, {
                  key: p.id,
                  proposal: p,
                  tagBrand: (proposalTags.find((t) => t.brand && t.brand.id === p.brandId) || {})
                    .brand,
                  action:
                    p.status === 'submitted'
                      ? h(GoldButton, {
                          label: busy === 'award:' + p.id ? 'Awarding…' : 'Award concept',
                          disabled: !!busy,
                          onClick: () =>
                            act(
                              'award:' + p.id,
                              () => window.CW_API.post('/api/proposals/' + p.id + '/award'),
                              'Concept awarded — the journey begins.',
                            ),
                          style: { padding: '10px', fontSize: 13 },
                        })
                      : null,
                }),
              ),
            )
          : null,

        // ── Brand owner: propose while open ──
        !isCreator && open && myBrands.length
          ? h(ProposeCard, { conceptId: concept.id, myBrands, proposals, busyKey: busy, act })
          : null,

        // ── Claiming brand: advance the lifecycle ──
        myClaimBrand ? h(AdvanceCard, { concept, claim, busyKey: busy, act, converted }) : null,

        // ── Conversion handshake ──
        claim && (isCreator || myClaimBrand) && conversions !== null
          ? h(ConversionCard, {
              claim,
              concept,
              isCreator: !!isCreator,
              isBrand: !!myClaimBrand,
              openConversion,
              converted,
              busyKey: busy,
              act,
            })
          : null,

        // ── Royalties ──
        claim && (isCreator || myClaimBrand) && royalties && royalties.length
          ? h(RoyaltyCard, {
              royalties,
              isCreator: !!isCreator,
              isBrand: !!myClaimBrand,
              busyKey: busy,
              act,
            })
          : null,
      ),
    );
  }

  // ── Community thread (mig 161) ─────────────────────────────────────
  // Flat list with one-level reply threading (parentCommentId), matching the
  // posts-comments shape. The composer pins replies via a dismissible chip.
  function CommentsCard({ conceptId, comments, setComments, me, openUser }) {
    const [text, setText] = useState('');
    const [replyTo, setReplyTo] = useState(null); // comment being replied to
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const signedIn = !!(me && me.user);

    const roots = (comments || []).filter((c) => !c.parentCommentId);
    const repliesFor = (id) => (comments || []).filter((c) => c.parentCommentId === id);

    const submit = async () => {
      if (!text.trim() || busy) return;
      setBusy(true);
      setError(null);
      try {
        const created = await window.CW_API.post('/api/concepts/' + conceptId + '/comments', {
          body: text,
          parentCommentId: replyTo ? replyTo.id : undefined,
        });
        // The API returns the bare row; hydrate the author locally (it's us).
        setComments((list) => [...(list || []), { ...created, author: me.user }]);
        setText('');
        setReplyTo(null);
      } catch (e) {
        setError(e.message || 'Could not post your comment.');
      } finally {
        setBusy(false);
      }
    };

    const CommentRow = ({ c, depth }) =>
      h(
        'div',
        { style: { display: 'flex', gap: 9, padding: '9px 0 0', marginLeft: depth ? 30 : 0 } },
        h(
          'button',
          {
            onClick: () => c.author && openUser(c.author.handle),
            style: {
              border: 'none',
              background: 'none',
              padding: 0,
              flex: 'none',
              alignSelf: 'flex-start',
            },
          },
          h(Avatar, { user: c.author, size: depth ? 22 : 27 }),
        ),
        h(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          h(
            'div',
            { style: { fontSize: 12.5, lineHeight: 1.5, wordBreak: 'break-word' } },
            h(
              'span',
              { style: { fontWeight: 800 } },
              (c.author ? c.author.displayName : 'Unknown') + ' ',
            ),
            c.body,
          ),
          h(
            'div',
            { style: { display: 'flex', gap: 12, marginTop: 2 } },
            h(
              'span',
              { style: { fontSize: 10.5, color: MUTED, fontWeight: 600 } },
              timeAgo(c.createdAt) + ' ago',
            ),
            signedIn && !depth
              ? h(
                  'button',
                  {
                    onClick: () => setReplyTo(c),
                    style: {
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      fontSize: 10.5,
                      color: '#7a6212',
                      fontWeight: 700,
                    },
                  },
                  'Reply',
                )
              : null,
          ),
        ),
      );

    return h(
      'div',
      { style: card },
      h(
        'div',
        { style: sectionTitle },
        'Conversation' + (comments && comments.length ? ' (' + comments.length + ')' : ''),
      ),
      comments === null
        ? h(Spinner, { size: 18 })
        : !comments.length
          ? h(
              'div',
              { style: { fontSize: 12.5, color: MUTED, fontWeight: 500 } },
              'Be the first to speak life over this design.',
            )
          : roots.map((c) =>
              h(
                'div',
                { key: c.id },
                h(CommentRow, { c, depth: 0 }),
                repliesFor(c.id).map((r) => h(CommentRow, { key: r.id, c: r, depth: 1 })),
              ),
            ),
      signedIn
        ? h(
            'div',
            { style: { marginTop: 13 } },
            replyTo
              ? h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 } },
                  h(
                    'span',
                    {
                      style: {
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#7a6212',
                        background: '#faf6ec',
                        borderRadius: 8,
                        padding: '4px 9px',
                      },
                    },
                    'Replying to ' + (replyTo.author ? '@' + replyTo.author.handle : 'comment'),
                  ),
                  h(
                    'button',
                    {
                      onClick: () => setReplyTo(null),
                      'aria-label': 'Cancel reply',
                      style: {
                        border: 'none',
                        background: 'none',
                        padding: 0,
                        fontSize: 14,
                        color: MUTED,
                        fontWeight: 700,
                      },
                    },
                    '×',
                  ),
                )
              : null,
            h(
              'div',
              { style: { display: 'flex', gap: 8 } },
              h('input', {
                value: text,
                onChange: (e) => setText(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === 'Enter') submit();
                },
                maxLength: 500,
                placeholder: replyTo ? 'Write your reply…' : 'Add to the conversation…',
                style: { ...field, flex: 1 },
              }),
              h(GoldButton, {
                label: busy ? '…' : 'Send',
                disabled: busy || !text.trim(),
                onClick: submit,
                style: { width: 'auto', padding: '11px 18px', fontSize: 13 },
              }),
            ),
            error
              ? h(
                  'div',
                  { style: { marginTop: 7, fontSize: 12, fontWeight: 700, color: '#8f4a2b' } },
                  error,
                )
              : null,
          )
        : null,
    );
  }

  function ProposalRow({ proposal, tagBrand, action }) {
    const bits = [];
    if (proposal.estUnitPrice != null) bits.push('± R' + proposal.estUnitPrice + '/unit');
    if (proposal.moq != null) bits.push('MOQ ' + proposal.moq);
    if (proposal.estTurnaroundDays != null) bits.push(proposal.estTurnaroundDays + ' days');
    return h(
      'div',
      { style: { borderTop: '1px solid #f4f2ed', padding: '12px 0' } },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 9 } },
        tagBrand ? h(BrandLogo, { brand: tagBrand, size: 28 }) : null,
        h(
          'div',
          { style: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800 } },
          tagBrand ? tagBrand.name : 'Brand',
        ),
        h(
          'span',
          {
            style: {
              fontSize: 10.5,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: proposal.status === 'submitted' ? '#3f6f34' : MUTED,
            },
          },
          proposal.status,
        ),
      ),
      proposal.note
        ? h(
            'div',
            {
              style: {
                fontSize: 12.5,
                color: '#5a5a5a',
                fontWeight: 500,
                lineHeight: 1.5,
                marginTop: 6,
              },
            },
            proposal.note,
          )
        : null,
      proposal.materials
        ? h(
            'div',
            { style: { fontSize: 11.5, color: MUTED, fontWeight: 600, marginTop: 4 } },
            'Materials: ' + proposal.materials,
          )
        : null,
      bits.length
        ? h(
            'div',
            { style: { fontSize: 11.5, color: '#7a6212', fontWeight: 700, marginTop: 4 } },
            bits.join(' · '),
          )
        : null,
      action ? h('div', { style: { marginTop: 10 } }, action) : null,
    );
  }

  function ProposeCard({ conceptId, myBrands, proposals, busyKey, act }) {
    const [brandId, setBrandId] = useState(myBrands[0] && myBrands[0].id);
    const [pitch, setPitch] = useState('');
    const [materials, setMaterials] = useState('');
    const [price, setPrice] = useState('');
    const [moq, setMoq] = useState('');
    const [days, setDays] = useState('');
    const [mockup, setMockup] = useState('');
    const brand = myBrands.find((b) => b.id === brandId) || myBrands[0];
    const mine = (proposals || []).find((p) => brand && p.brandId === brand.id);

    if (mine) {
      return h(
        'div',
        { style: card },
        h('div', { style: sectionTitle }, 'Your proposal (' + brand.name + ')'),
        h(ProposalRow, {
          proposal: mine,
          tagBrand: brand,
          action:
            mine.status === 'submitted'
              ? h(
                  'button',
                  {
                    onClick: () =>
                      act(
                        'withdraw',
                        () =>
                          window.CW_API.patch('/api/proposals/' + mine.id, { action: 'withdraw' }),
                        'Proposal withdrawn.',
                      ),
                    disabled: !!busyKey,
                    style: {
                      border: '1.5px solid #e6e3dc',
                      background: '#fff',
                      color: '#8f4a2b',
                      borderRadius: 11,
                      padding: '9px 18px',
                      fontSize: 12.5,
                      fontWeight: 700,
                    },
                  },
                  'Withdraw',
                )
              : mine.status === 'withdrawn' || mine.status === 'declined'
                ? h(
                    'button',
                    {
                      onClick: () =>
                        act(
                          'resubmit',
                          () =>
                            window.CW_API.patch('/api/proposals/' + mine.id, {
                              action: 'resubmit',
                            }),
                          'Proposal re-entered.',
                        ),
                      disabled: !!busyKey,
                      style: {
                        border: '1.5px solid ' + GOLD,
                        background: '#fff',
                        color: '#7a6212',
                        borderRadius: 11,
                        padding: '9px 18px',
                        fontSize: 12.5,
                        fontWeight: 700,
                      },
                    },
                    'Resubmit',
                  )
                : null,
        }),
      );
    }

    if (brand && !brand.verified) {
      return h(
        'div',
        { style: card },
        h('div', { style: sectionTitle }, 'Propose as ' + brand.name),
        h(
          'div',
          { style: { fontSize: 12.5, color: MUTED, fontWeight: 500, lineHeight: 1.55 } },
          'Only verified brands can propose on concepts. Request verification from your brand page.',
        ),
      );
    }

    return h(
      'div',
      { style: card },
      h('div', { style: sectionTitle }, 'Propose to produce this'),
      myBrands.length > 1
        ? h(
            'div',
            { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 } },
            myBrands.map((b) =>
              h(
                'button',
                {
                  key: b.id,
                  onClick: () => setBrandId(b.id),
                  style: {
                    border: '1.5px solid ' + (brandId === b.id ? INK : '#e6e3dc'),
                    background: brandId === b.id ? INK : '#fff',
                    color: brandId === b.id ? '#fff' : '#5a5a5a',
                    borderRadius: 10,
                    padding: '6px 13px',
                    fontSize: 12,
                    fontWeight: 700,
                  },
                },
                b.name,
              ),
            ),
          )
        : null,
      h('div', { style: label }, 'Your pitch'),
      h('textarea', {
        value: pitch,
        onChange: (e) => setPitch(e.target.value),
        rows: 3,
        maxLength: 2000,
        placeholder: 'Why your brand is the right hands for this design…',
        style: { ...field, resize: 'vertical', lineHeight: 1.5 },
      }),
      h('div', { style: label }, 'Materials (optional)'),
      h('input', {
        value: materials,
        onChange: (e) => setMaterials(e.target.value),
        maxLength: 2000,
        placeholder: '100% organic cotton, 220gsm…',
        style: field,
      }),
      h(
        'div',
        { style: { display: 'flex', gap: 10 } },
        h(
          'div',
          { style: { flex: 1 } },
          h('div', { style: label }, 'Unit price'),
          h('input', {
            value: price,
            onChange: (e) => setPrice(e.target.value),
            inputMode: 'decimal',
            placeholder: '199',
            style: field,
          }),
        ),
        h(
          'div',
          { style: { flex: 1 } },
          h('div', { style: label }, 'MOQ'),
          h('input', {
            value: moq,
            onChange: (e) => setMoq(e.target.value),
            inputMode: 'numeric',
            placeholder: '50',
            style: field,
          }),
        ),
        h(
          'div',
          { style: { flex: 1 } },
          h('div', { style: label }, 'Days'),
          h('input', {
            value: days,
            onChange: (e) => setDays(e.target.value),
            inputMode: 'numeric',
            placeholder: '21',
            style: field,
          }),
        ),
      ),
      h('div', { style: label }, 'Mockup URL (optional)'),
      h('input', {
        value: mockup,
        onChange: (e) => setMockup(e.target.value),
        placeholder: 'https://…',
        style: field,
      }),
      h(
        'div',
        { style: { marginTop: 16 } },
        h(GoldButton, {
          label: busyKey === 'propose' ? 'Sending…' : 'Send proposal',
          disabled: !!busyKey || !pitch.trim(),
          onClick: () =>
            act(
              'propose',
              () =>
                window.CW_API.post('/api/concepts/' + conceptId + '/proposals', {
                  brandId: brand.id,
                  note: pitch,
                  materials: materials || undefined,
                  estUnitPrice: price ? Number(price) : undefined,
                  moq: moq ? Number(moq) : undefined,
                  estTurnaroundDays: days ? Number(days) : undefined,
                  mockupUrls: mockup ? [mockup] : [],
                }),
              'Proposal sent — the creator will review it.',
            ),
        }),
      ),
    );
  }

  function AdvanceCard({ concept, claim, busyKey, act, converted }) {
    const [noteText, setNoteText] = useState('');
    const nexts = STAGES.filter(
      (s) => stageIdx(s) > Math.max(stageIdx(concept.status), stageIdx('claimed')),
    );
    if (!nexts.length) return null;
    return h(
      'div',
      { style: card },
      h('div', { style: sectionTitle }, 'Advance the journey'),
      h(
        'div',
        {
          style: { fontSize: 12, color: MUTED, fontWeight: 500, lineHeight: 1.5, marginBottom: 10 },
        },
        'Forward-only — every step is logged publicly on the concept. Releasing auto-publishes the Completed Concept post' +
          (converted ? '.' : ' with the creator tag.'),
      ),
      h('input', {
        value: noteText,
        onChange: (e) => setNoteText(e.target.value),
        maxLength: 500,
        placeholder: 'Optional note (visible on the timeline)…',
        style: { ...field, marginBottom: 10 },
      }),
      h(
        'div',
        { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
        nexts.map((s) =>
          h(
            'button',
            {
              key: s,
              disabled: !!busyKey,
              onClick: () =>
                act(
                  'advance:' + s,
                  () =>
                    window.CW_API.post('/api/concepts/' + concept.id + '/status', {
                      status: s,
                      note: noteText || undefined,
                    }),
                  'Moved to ' + STAGE_LABEL[s] + '.',
                ),
              style: {
                border: '1.5px solid ' + (s === 'released' ? GOLD : '#e6e3dc'),
                background: s === 'released' ? GOLD : '#fff',
                color: s === 'released' ? '#fff' : '#4a4a4a',
                borderRadius: 11,
                padding: '9px 15px',
                fontSize: 12.5,
                fontWeight: 700,
              },
            },
            busyKey === 'advance:' + s ? '…' : STAGE_LABEL[s],
          ),
        ),
      ),
    );
  }

  function ConversionCard({
    claim,
    concept,
    isCreator,
    isBrand,
    openConversion,
    converted,
    busyKey,
    act,
  }) {
    if (converted) {
      return h(
        'div',
        { style: card },
        h('div', { style: sectionTitle }, 'Permanent catalogue'),
        h(
          'div',
          { style: { fontSize: 12.5, color: '#5a5a5a', fontWeight: 500, lineHeight: 1.55 } },
          'This item was converted into the brand’s permanent catalogue: the public creator tag is retired, the concept link is permanent, and a lifetime 5% royalty applies.',
        ),
      );
    }
    if (openConversion) {
      return h(
        'div',
        { style: card },
        h('div', { style: sectionTitle }, 'Catalogue conversion proposed'),
        h(
          'div',
          {
            style: {
              fontSize: 12.5,
              color: '#5a5a5a',
              fontWeight: 500,
              lineHeight: 1.55,
              marginBottom: 12,
            },
          },
          isCreator
            ? 'The brand asks to move this design into its permanent catalogue. Accepting retires your public tag on the item (the concept link itself is permanent) and replaces the milestone royalty with a lifetime 5%.'
            : 'Waiting for the creator to respond to your catalogue-conversion proposal.',
        ),
        isCreator
          ? h(
              'div',
              { style: { display: 'flex', gap: 10 } },
              h(GoldButton, {
                label: busyKey === 'convaccept' ? 'Accepting…' : 'Accept — lifetime 5%',
                disabled: !!busyKey,
                onClick: () =>
                  act(
                    'convaccept',
                    () =>
                      window.CW_API.patch('/api/conversions/' + openConversion.id, {
                        action: 'accept',
                      }),
                    'Conversion accepted.',
                  ),
                style: { padding: '11px', fontSize: 13 },
              }),
              h(
                'button',
                {
                  disabled: !!busyKey,
                  onClick: () =>
                    act(
                      'convdecline',
                      () =>
                        window.CW_API.patch('/api/conversions/' + openConversion.id, {
                          action: 'decline',
                        }),
                      'Conversion declined.',
                    ),
                  style: {
                    flex: 1,
                    border: '1.5px solid #e6e3dc',
                    background: '#fff',
                    color: '#5a5a5a',
                    borderRadius: 14,
                    padding: '11px',
                    fontSize: 13,
                    fontWeight: 700,
                  },
                },
                'Decline',
              ),
            )
          : h(
              'button',
              {
                disabled: !!busyKey,
                onClick: () =>
                  act(
                    'convcancel',
                    () =>
                      window.CW_API.patch('/api/conversions/' + openConversion.id, {
                        action: 'cancel',
                      }),
                    'Proposal cancelled.',
                  ),
                style: {
                  border: '1.5px solid #e6e3dc',
                  background: '#fff',
                  color: '#8f4a2b',
                  borderRadius: 11,
                  padding: '9px 18px',
                  fontSize: 12.5,
                  fontWeight: 700,
                },
              },
              'Cancel proposal',
            ),
      );
    }
    if (isBrand && stageIdx(concept.status) >= stageIdx('released')) {
      return h(
        'div',
        { style: card },
        h('div', { style: sectionTitle }, 'Permanent catalogue'),
        h(
          'div',
          {
            style: {
              fontSize: 12.5,
              color: MUTED,
              fontWeight: 500,
              lineHeight: 1.55,
              marginBottom: 12,
            },
          },
          'Propose converting this released design into your permanent catalogue (creator keeps a permanent concept link; milestone royalty becomes a lifetime 5%).',
        ),
        h(GoldButton, {
          label: busyKey === 'convpropose' ? 'Proposing…' : 'Propose catalogue conversion',
          disabled: !!busyKey,
          onClick: () =>
            act(
              'convpropose',
              () => window.CW_API.post('/api/claims/' + claim.id + '/conversions'),
              'Conversion proposed — awaiting the creator.',
            ),
        }),
      );
    }
    return null;
  }

  function RoyaltyCard({ royalties, isCreator, isBrand, busyKey, act }) {
    const [proofUrl, setProofUrl] = useState('');
    const [proofNote, setProofNote] = useState('');
    const KIND_LABEL = {
      milestone: 'Milestone — 10% of first 100 units',
      lifetime: 'Lifetime — 5% of every sale',
    };
    return h(
      'div',
      { style: card },
      h('div', { style: sectionTitle }, 'Royalties'),
      royalties.map((r) =>
        h(
          'div',
          { key: r.id, style: { borderTop: '1px solid #f4f2ed', padding: '11px 0' } },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h(
              'div',
              { style: { flex: 1, fontSize: 12.5, fontWeight: 800 } },
              KIND_LABEL[r.kind] || r.kind,
            ),
            h(
              'span',
              {
                style: {
                  fontSize: 10.5,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  color:
                    r.status === 'closed'
                      ? MUTED
                      : r.status === 'proof_submitted'
                        ? '#7a6212'
                        : '#3f6f34',
                },
              },
              r.status.replace('_', ' '),
            ),
          ),
          r.proofUrl
            ? h(
                'a',
                {
                  href: r.proofUrl,
                  target: '_blank',
                  rel: 'noreferrer noopener',
                  style: {
                    fontSize: 11.5,
                    color: '#7a6212',
                    fontWeight: 700,
                    marginTop: 3,
                    display: 'inline-block',
                  },
                },
                'View proof of sale ↗',
              )
            : null,
          r.closedNote
            ? h(
                'div',
                { style: { fontSize: 11.5, color: MUTED, fontWeight: 500, marginTop: 3 } },
                r.closedNote,
              )
            : null,

          // Brand: submit proof on the open milestone.
          isBrand && r.kind === 'milestone' && r.status !== 'closed'
            ? h(
                'div',
                { style: { marginTop: 9 } },
                h('input', {
                  value: proofUrl,
                  onChange: (e) => setProofUrl(e.target.value),
                  placeholder: 'https:// proof of the 100th sale…',
                  style: { ...field, marginBottom: 8 },
                }),
                h('input', {
                  value: proofNote,
                  onChange: (e) => setProofNote(e.target.value),
                  maxLength: 500,
                  placeholder: 'Note (optional)',
                  style: { ...field, marginBottom: 8 },
                }),
                h(GoldButton, {
                  label:
                    busyKey === 'proof'
                      ? 'Submitting…'
                      : r.status === 'proof_submitted'
                        ? 'Re-submit proof'
                        : 'Submit proof of 100th sale',
                  disabled: !!busyKey || !proofUrl.trim(),
                  onClick: () =>
                    act(
                      'proof',
                      () =>
                        window.CW_API.post('/api/royalties/' + r.id + '/proof', {
                          proofUrl,
                          note: proofNote || undefined,
                        }),
                      'Proof submitted — awaiting the creator.',
                    ),
                  style: { padding: '10px', fontSize: 13 },
                }),
              )
            : null,

          // Creator: confirm a submitted proof.
          isCreator && r.status === 'proof_submitted'
            ? h(
                'div',
                { style: { marginTop: 9 } },
                h(GoldButton, {
                  label: busyKey === 'close:' + r.id ? 'Closing…' : 'Confirm & close obligation',
                  disabled: !!busyKey,
                  onClick: () =>
                    act(
                      'close:' + r.id,
                      () => window.CW_API.post('/api/royalties/' + r.id + '/close'),
                      'Obligation closed. Well done, good and faithful.',
                    ),
                  style: { padding: '10px', fontSize: 13 },
                }),
              )
            : null,
        ),
      ),
    );
  }

  // ── Create ─────────────────────────────────────────────────────────
  function CreateConceptScreen() {
    const { pop, push, me, refreshMe } = useStore();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const creator = me && me.creator; // { earned, conceptCount, threshold } — derived, §6.1

    const submit = async () => {
      setBusy(true);
      setError(null);
      try {
        const created = await window.CW_API.post('/api/concepts', {
          title,
          description: description || undefined,
          mediaUrls: mediaUrl ? [mediaUrl] : [],
        });
        refreshMe().catch(() => {}); // the badge is derived from concept count
        pop();
        push('concept', { id: created.id });
      } catch (e) {
        setError(e.message || 'Could not publish the concept.');
        setBusy(false);
      }
    };

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fcfbf9' },
      },
      h(ScreenHeader, { title: 'New Concept', onBack: pop }),
      h(
        'div',
        { style: { padding: '4px 0 0' } },
        h(
          'div',
          { style: card },
          h(
            'div',
            { style: { fontSize: 12.5, color: MUTED, fontWeight: 500, lineHeight: 1.55 } },
            'Share a design idea with the Kingdom. Verified brands can propose to produce it — you choose who gets to make it real, and royalties are committed the moment you award it.',
          ),
          // Creator-badge progression (§6.1: auto at >10 Concepts, derived).
          creator
            ? h(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    background: '#faf6ec',
                    borderRadius: 10,
                    padding: '8px 12px',
                    marginTop: 11,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: '#7a6212',
                  },
                },
                Icon('star', { size: 14, color: GOLD, fill: creator.earned ? GOLD : null }),
                creator.earned
                  ? 'Creator — your Concepts join the statuses bar for 24h.'
                  : creator.threshold -
                      creator.conceptCount +
                      ' more Concept' +
                      (creator.threshold - creator.conceptCount === 1 ? '' : 's') +
                      ' to your Creator badge (' +
                      creator.conceptCount +
                      '/' +
                      creator.threshold +
                      ').',
              )
            : null,
          h('div', { style: label }, 'Title'),
          h('input', {
            value: title,
            onChange: (e) => setTitle(e.target.value),
            maxLength: 120,
            placeholder: 'Lion of Judah oversized tee',
            style: field,
          }),
          h('div', { style: label }, 'Description'),
          h('textarea', {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            rows: 4,
            maxLength: 2000,
            placeholder: 'The vision, the verse, the placement…',
            style: { ...field, resize: 'vertical', lineHeight: 1.5 },
          }),
          h('div', { style: label }, 'Artwork'),
          h(ImagePicker, { scope: 'concept', value: mediaUrl, onChange: setMediaUrl }),
          error
            ? h(
                'div',
                { style: { marginTop: 12, fontSize: 12.5, fontWeight: 700, color: '#8f4a2b' } },
                error,
              )
            : null,
          h(
            'div',
            { style: { marginTop: 18 } },
            h(GoldButton, {
              label: busy ? 'Publishing…' : 'Publish concept',
              disabled: busy || !title.trim(),
              onClick: submit,
            }),
          ),
        ),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Concepts = ConceptsScreen;
  window.CWScreens.ConceptDetail = ConceptDetailScreen;
  window.CWScreens.CreateConcept = CreateConceptScreen;
})();
