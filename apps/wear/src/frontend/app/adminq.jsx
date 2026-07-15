// ── Admin & moderation queue (mig 145 + 157) ───────────────────────
// Two queues behind the platform-role gate (/api/me → role):
//   Verifications — pending brand-verification requests (ADMIN decides;
//                   moderators may view). Approval flips the authoritative
//                   wear.brands.verified badge via the DB trigger.
//   Reports       — the mig-145 triage lifecycle
//                   (open → reviewed → actioned | dismissed).
(function () {
  const { createElement: h, useState, useEffect, useCallback } = React;
  const { useStore } = window.CWStore;
  const { GOLD, INK, MUTED, BrandLogo, Spinner, EmptyState, ErrorNote, ScreenHeader, timeAgo } = window.CWUI;

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
    const { me, pop, openBrand } = useStore();
    const role = me && me.role;
    const isAdmin = role === 'admin';
    const [tab, setTab] = useState('verifications');
    const [state, setState] = useState({ loading: true, error: null, verifications: [], reports: [] });
    const [busy, setBusy] = useState(null);
    const [note, setNote] = useState(null);

    const load = useCallback(async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const [v, r] = await Promise.all([
          window.CW_API.get('/api/admin/verifications'),
          window.CW_API.get('/api/admin/reports?status=open'),
        ]);
        setState({ loading: false, error: null, verifications: v.verifications, reports: r.reports });
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
        { style: { display: 'flex', gap: 8, padding: '4px 18px 14px' } },
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
          : tab === 'verifications'
            ? h(VerificationQueue, { items: state.verifications, isAdmin, busy, act, openBrand })
            : h(ReportQueue, { items: state.reports, busy, act }),
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
