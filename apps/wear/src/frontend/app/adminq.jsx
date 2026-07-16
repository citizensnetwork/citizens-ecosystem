// ── Admin & moderation queue (mig 145 + 157 + 162) ─────────────────
// Three queues behind the platform-role gate (/api/me → role):
//   Applications  — pending Become-a-Brand applications (mig 162). ADMIN
//                   decides; moderators may view. Approve MINTS the
//                   applicant's brand born-verified (the mig-160 admin
//                   path) and notifies them; reject notes + notifies —
//                   the citizen may re-apply immediately.
//   Verifications — pending brand-verification requests (ADMIN decides;
//                   moderators may view). Approval flips the authoritative
//                   wear.brands.verified badge via the DB trigger.
//   Reports       — the mig-145 triage lifecycle
//                   (open → reviewed → actioned | dismissed).
(function () {
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { useStore } = window.CWStore;
  const { GOLD, INK, MUTED, Avatar, BrandLogo, Spinner, EmptyState, ErrorNote, ScreenHeader, timeAgo } = window.CWUI;

  const card = {
    background: '#fff',
    border: '1px solid #f0eee9',
    borderRadius: 18,
    padding: '15px 17px',
    margin: '0 18px 12px',
  };

  function chipButton(active) {
    return {
      border: '1.5px solid ' + (active ? INK : '#e6e3dc'),
      background: active ? INK : '#fff',
      color: active ? '#fff' : '#5a5a5a',
      borderRadius: 11,
      padding: '7px 16px',
      fontSize: 12.5,
      fontWeight: 700,
    };
  }

  function actionButton(primary) {
    return {
      border: '1.5px solid ' + (primary ? GOLD : '#e6e3dc'),
      background: primary ? GOLD : '#fff',
      color: primary ? '#fff' : '#5a5a5a',
      borderRadius: 10,
      padding: '8px 14px',
      fontSize: 12,
      fontWeight: 700,
    };
  }

  function AdminQueueScreen() {
    const { me, pop, openBrand, openUser } = useStore();
    const role = me && me.role;
    const isAdmin = role === 'admin';
    const [tab, setTab] = useState('applications');
    const [state, setState] = useState({ loading: true, error: null, applications: [], verifications: [], reports: [] });
    const [busy, setBusy] = useState(null);
    const [note, setNote] = useState(null);

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const [a, v, r] = await Promise.all([
          window.CW_API.get('/api/admin/brand-applications'),
          window.CW_API.get('/api/admin/verifications'),
          window.CW_API.get('/api/admin/reports?status=open'),
        ]);
        setState({ loading: false, error: null, applications: a.applications, verifications: v.verifications, reports: r.reports });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    }, []);
    useEffect(() => {
      load();
    }, [load]);

    const act = async (key, fn, okText) => {
      setBusy(key);
      setNote(null);
      try {
        await fn();
        setNote({ ok: true, text: okText });
        await load();
      } catch (e) {
        setNote({ ok: false, text: e.message || 'Action failed.' });
      } finally {
        setBusy(null);
      }
    };

    if (!role) {
      return h(
        'div',
        { className: 'cwsc', style: { height: '100%', background: '#fcfbf9' } },
        h(ScreenHeader, { title: 'Admin', onBack: pop }),
        h(EmptyState, { icon: 'doc', title: 'Moderators only', note: 'This area needs a platform role.' }),
      );
    }

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fcfbf9' },
      },
      h(ScreenHeader, { title: 'Admin & moderation', onBack: pop }),
      h(
        'div',
        { style: { display: 'flex', gap: 8, padding: '4px 18px 14px', overflowX: 'auto' } },
        h('button', { onClick: () => setTab('applications'), style: chipButton(tab === 'applications') }, 'Applications (' + state.applications.length + ')'),
        h('button', { onClick: () => setTab('verifications'), style: chipButton(tab === 'verifications') }, 'Verifications (' + state.verifications.length + ')'),
        h('button', { onClick: () => setTab('reports'), style: chipButton(tab === 'reports') }, 'Reports (' + state.reports.length + ')'),
      ),
      note
        ? h('div', { style: { margin: '0 18px 12px', fontSize: 12.5, fontWeight: 700, color: note.ok ? '#3f6f34' : '#8f4a2b' } }, note.text)
        : null,
      state.loading
        ? h(Spinner, {})
        : state.error
          ? h(ErrorNote, { message: state.error, onRetry: load })
          : tab === 'applications'
            ? h(ApplicationQueue, { items: state.applications, isAdmin, busy, act, openUser })
            : tab === 'verifications'
              ? h(VerificationQueue, { items: state.verifications, isAdmin, busy, act, openBrand })
              : h(ReportQueue, { items: state.reports, busy, act }),
    );
  }

  // ── Become-a-Brand applications (mig 162) ──────────────────────────
  const slugify = (name) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

  function GateChip({ met, text }) {
    return h(
      'span',
      {
        style: {
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.3px',
          color: met ? '#3f6f34' : '#8f4a2b',
          background: met ? '#eef5e9' : '#faf0ea',
          border: '1px solid ' + (met ? '#cfe3c4' : '#f0ddd0'),
          borderRadius: 8,
          padding: '4px 9px',
        },
      },
      text,
    );
  }

  function InfoRow({ label, value }) {
    if (!value) return null;
    return h(
      'div',
      { style: { display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.5, marginTop: 4 } },
      h('span', { style: { color: MUTED, fontWeight: 700, flex: 'none', width: 62 } }, label),
      h('span', { style: { color: '#4a4a4a', fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' } }, value),
    );
  }

  function ApplicationCard({ app, isAdmin, busy, act, openUser }) {
    const [slug, setSlug] = useState(slugify(app.brandName));
    const [reviewNote, setReviewNote] = useState('');
    const e = app.eligibility;
    const input = {
      flex: 1,
      minWidth: 0,
      border: '1px solid #efedea',
      borderRadius: 10,
      padding: '9px 11px',
      fontSize: 12.5,
      fontWeight: 500,
      outline: 'none',
      background: '#fff',
      color: '#1a1a1a',
    };
    return h(
      'div',
      { style: card },
      h(
        'button',
        {
          onClick: () => app.applicant && openUser(app.applicant.handle),
          style: { display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none', padding: 0, width: '100%', textAlign: 'left' },
        },
        app.applicant ? h(Avatar, { user: app.applicant, size: 36 }) : null,
        h(
          'div',
          { style: { flex: 1, minWidth: 0, lineHeight: 1.3 } },
          h('div', { style: { fontSize: 13.5, fontWeight: 800 } }, '“' + app.brandName + '”'),
          h(
            'div',
            { style: { fontSize: 11.5, color: MUTED, fontWeight: 600 } },
            (app.applicant ? (app.applicant.displayName || '@' + app.applicant.handle) + ' · ' : '') + 'applied ' + timeAgo(app.createdAt) + ' ago',
          ),
        ),
      ),
      app.bio
        ? h('div', { style: { fontSize: 12.5, color: '#5a5a5a', fontWeight: 500, lineHeight: 1.5, marginTop: 8 } }, app.bio)
        : null,
      h(
        'div',
        { style: { marginTop: 9 } },
        h(InfoRow, { label: 'Support', value: app.supportEmail }),
        h(InfoRow, { label: 'Contact', value: app.contactNumber }),
        h(InfoRow, { label: 'Delivery', value: app.deliveryOptions }),
        h(InfoRow, {
          label: 'Socials',
          value: Object.entries(app.socials || {})
            .map(([k, v]) => k + ': ' + v)
            .join(' · '),
        }),
      ),
      e
        ? h(
            'div',
            { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 11 } },
            h(GateChip, { met: e.conceptsPosted >= e.conceptsPostedRequired, text: 'POSTED ' + e.conceptsPosted + '/' + e.conceptsPostedRequired }),
            h(GateChip, { met: e.conceptsClaimed >= e.conceptsClaimedRequired, text: 'CLAIMED ' + e.conceptsClaimed + '/' + e.conceptsClaimedRequired }),
            h(GateChip, { met: e.actionedReports === 0, text: e.actionedReports === 0 ? 'REPORTS CLEAR' : e.actionedReports + ' ACTIONED REPORT' + (e.actionedReports > 1 ? 'S' : '') }),
          )
        : null,
      h(
        'div',
        { style: { fontSize: 11, color: MUTED, fontWeight: 600, marginTop: 9 } },
        'Agreed to Ts&Cs · Code of Conduct · monthly platform fees',
      ),
      isAdmin
        ? h(
            'div',
            { style: { marginTop: 12 } },
            h(
              'div',
              { style: { display: 'flex', gap: 8 } },
              h('input', { value: slug, onChange: (ev) => setSlug(slugify(ev.target.value) || ev.target.value.toLowerCase()), placeholder: 'brand-slug', style: input }),
              h('input', { value: reviewNote, onChange: (ev) => setReviewNote(ev.target.value), maxLength: 2000, placeholder: 'Note to the applicant (optional)', style: { ...input, flex: 1.6 } }),
            ),
            h(
              'div',
              { style: { display: 'flex', gap: 8, marginTop: 10 } },
              h(
                'button',
                {
                  disabled: !!busy || !slug,
                  onClick: () =>
                    act(
                      'app-approve:' + app.id,
                      () => window.CW_API.post('/api/admin/brand-applications/' + app.id, { decision: 'approved', slug, reviewNote }),
                      'Brand minted — ' + app.brandName + ' is live and verified.',
                    ),
                  style: actionButton(true),
                },
                busy === 'app-approve:' + app.id ? '…' : 'Approve & mint',
              ),
              h(
                'button',
                {
                  disabled: !!busy,
                  onClick: () =>
                    act(
                      'app-reject:' + app.id,
                      () => window.CW_API.post('/api/admin/brand-applications/' + app.id, { decision: 'rejected', reviewNote }),
                      'Application rejected — the citizen may re-apply once ready.',
                    ),
                  style: actionButton(false),
                },
                busy === 'app-reject:' + app.id ? '…' : 'Reject',
              ),
            ),
          )
        : null,
    );
  }

  function ApplicationQueue({ items, isAdmin, busy, act, openUser }) {
    if (!items.length) {
      return h(EmptyState, { icon: 'check', title: 'Queue is clear', note: 'No pending Become-a-Brand applications.' });
    }
    return h(
      'div',
      null,
      !isAdmin
        ? h('div', { style: { margin: '0 18px 12px', fontSize: 12, color: MUTED, fontWeight: 600 } }, 'You can view the queue; application decisions are admin-only.')
        : null,
      items.map((app) => h(ApplicationCard, { key: app.id, app, isAdmin, busy, act, openUser })),
    );
  }

  function VerificationQueue({ items, isAdmin, busy, act, openBrand }) {
    if (!items.length) {
      return h(EmptyState, { icon: 'check', title: 'Queue is clear', note: 'No pending brand-verification requests.' });
    }
    return h(
      'div',
      null,
      !isAdmin
        ? h('div', { style: { margin: '0 18px 12px', fontSize: 12, color: MUTED, fontWeight: 600 } }, 'You can view the queue; verification decisions are admin-only.')
        : null,
      items.map((v) =>
        h(
          'div',
          { key: v.brandId, style: card },
          h(
            'button',
            {
              onClick: () => v.brand && openBrand(v.brand.slug),
              style: { display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none', padding: 0, width: '100%', textAlign: 'left' },
            },
            v.brand ? h(BrandLogo, { brand: v.brand, size: 36 }) : null,
            h(
              'div',
              { style: { flex: 1, minWidth: 0, lineHeight: 1.3 } },
              h('div', { style: { fontSize: 13.5, fontWeight: 800 } }, v.brand ? v.brand.name : v.brandId),
              h('div', { style: { fontSize: 11.5, color: MUTED, fontWeight: 600 } }, 'Requested ' + timeAgo(v.requestedAt) + ' ago'),
            ),
          ),
          v.note
            ? h('div', { style: { fontSize: 12.5, color: '#5a5a5a', fontWeight: 500, lineHeight: 1.5, marginTop: 8 } }, v.note)
            : null,
          isAdmin
            ? h(
                'div',
                { style: { display: 'flex', gap: 8, marginTop: 12 } },
                h(
                  'button',
                  {
                    disabled: !!busy,
                    onClick: () => act('approve:' + v.brandId, () => window.CW_API.post('/api/admin/verifications/' + v.brandId, { decision: 'approved' }), 'Brand approved — badge is live.'),
                    style: actionButton(true),
                  },
                  busy === 'approve:' + v.brandId ? '…' : 'Approve',
                ),
                h(
                  'button',
                  {
                    disabled: !!busy,
                    onClick: () => act('reject:' + v.brandId, () => window.CW_API.post('/api/admin/verifications/' + v.brandId, { decision: 'rejected' }), 'Request rejected — the owner may re-request.'),
                    style: actionButton(false),
                  },
                  busy === 'reject:' + v.brandId ? '…' : 'Reject',
                ),
              )
            : null,
        ),
      ),
    );
  }

  function ReportQueue({ items, busy, act }) {
    if (!items.length) {
      return h(EmptyState, { icon: 'check', title: 'Queue is clear', note: 'No open reports.' });
    }
    return h(
      'div',
      null,
      items.map((r) =>
        h(
          'div',
          { key: r.id, style: card },
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#8f4a2b', background: '#faf0ea', border: '1px solid #f0ddd0', borderRadius: 8, padding: '4px 9px' } }, r.reason),
            h('div', { style: { flex: 1, fontSize: 12.5, fontWeight: 800 } }, r.subjectKind + ' · ' + r.subjectId.slice(0, 12) + '…'),
            h('span', { style: { fontSize: 11, color: MUTED, fontWeight: 600 } }, timeAgo(r.createdAt)),
          ),
          r.note
            ? h('div', { style: { fontSize: 12.5, color: '#5a5a5a', fontWeight: 500, lineHeight: 1.5, marginTop: 7 } }, r.note)
            : null,
          h(
            'div',
            { style: { display: 'flex', gap: 8, marginTop: 12 } },
            ['reviewed', 'actioned', 'dismissed'].map((s) =>
              h(
                'button',
                {
                  key: s,
                  disabled: !!busy,
                  onClick: () => act(s + ':' + r.id, () => window.CW_API.post('/api/admin/reports/' + r.id, { status: s }), 'Report ' + s + '.'),
                  style: actionButton(s === 'actioned'),
                },
                busy === s + ':' + r.id ? '…' : s.charAt(0).toUpperCase() + s.slice(1),
              ),
            ),
          ),
        ),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.AdminQueue = AdminQueueScreen;
})();
