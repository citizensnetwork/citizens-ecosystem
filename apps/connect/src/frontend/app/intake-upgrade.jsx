// ════════════════════════════════════════════════════════════════════
//  Confirm an intake upgrade (issue #248)
//
//  The email link lands here. Nothing changes until the signed-in account
//  presses Confirm or Not mine. The token travels in the path so a Google
//  sign-in can return to it (routes.jsx keeps the path, not a query).
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useEffect, useState } = React;
  const { Button } = window.UI;
  const Icon = window.Icon;

  async function postUpgrade(token, action) {
    const base = (window.__CC_ENV && window.__CC_ENV.API_BASE_URL) || '';
    const access = window.CC_AUTH ? await window.CC_AUTH.getAccessToken() : null;
    const headers = { 'Content-Type': 'application/json' };
    if (access) headers.Authorization = 'Bearer ' + access;
    const res = await fetch(base + '/api/account/intake-upgrade', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ token: token, action: action }),
    });
    let json = {};
    try { json = await res.json(); } catch (e) { json = {}; }
    return { status: res.status, json: json || {} };
  }

  function formatWhen(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    } catch (e) {
      return '';
    }
  }

  function IntakeUpgradePage() {
    const app = window.useApp();
    const nav = app.nav || {};
    const params = nav.params || {};
    const token = typeof params.token === 'string' ? params.token : '';
    const declineFirst = params.intent === 'decline';
    const [state, setState] = useState('loading');
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState('');

    useEffect(() => {
      let gone = false;
      setState('loading');
      postUpgrade(token, 'preview').then((res) => {
        if (gone) return;
        if (res.status === 200 && res.json.status === 'pending') {
          setPreview(res.json);
          setState('ready');
        } else if (res.status === 200 && res.json.status === 'confirmed') {
          setPreview(res.json);
          setState('already');
        } else if (res.status === 403) setState('wrong');
        else if (res.status === 410) setState('expired');
        else if (res.status === 409 && res.json.error === 'declined') setState('declined');
        else if (res.status === 401) setState('signedout');
        else setState('error');
      }).catch(() => { if (!gone) setState('error'); });
      return () => { gone = true; };
    }, [token]);

    const act = (action) => {
      setBusy(action);
      postUpgrade(token, action).then((res) => {
        setBusy('');
        if (action === 'confirm' && res.status === 200 && res.json.status === 'confirmed') {
          window.location.assign(window.CC_ROUTES ? window.CC_ROUTES.appUrl('/dashboard') : '/dashboard');
          return;
        }
        if (action === 'decline' && res.status === 200) {
          setState('done-decline');
          return;
        }
        if (res.status === 410) setState('expired');
        else if (res.status === 403) setState('wrong');
        else if (res.status === 409 && res.json.error === 'declined') setState('declined');
        else setState('error');
      }).catch(() => { setBusy(''); setState('error'); });
    };

    const type = preview && window.DATA && window.DATA.getContributorType
      ? window.DATA.getContributorType(preview.contributor_category)
      : null;
    const category = type ? type.name : (preview && preview.contributor_kind ? preview.contributor_kind : '');
    const area = preview && preview.no_fixed_location
      ? 'Online / no fixed location'
      : (preview && preview.physical_address) || '';
    const when = preview ? formatWhen(preview.expires_at) : '';

    const shell = (body) => h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'intake-upgrade' },
      h('div', { className: 'px-4 sm:px-5 pt-5 pb-4 border-b border-border shrink-0' },
        h('h1', { tabIndex: -1, autoFocus: !declineFirst, className: 'text-xl text-foreground leading-none outline-none' }, 'Confirm your listing')),
      h('div', { className: 'flex-1 overflow-y-auto px-4 sm:px-5 py-4' },
        h('div', { className: 'max-w-lg mx-auto' }, body)));

    if (state === 'loading') {
      return shell(h('div', { className: 'bg-card rounded-2xl border border-border p-4 space-y-3', role: 'status', 'aria-label': 'Loading' },
        h('div', { className: 'h-4 w-2/3 rounded-full bg-accent animate-pulse' }),
        h('div', { className: 'h-3 w-1/2 rounded-full bg-accent animate-pulse' }),
        h('div', { className: 'h-16 rounded-xl bg-accent animate-pulse' })));
    }

    if (state === 'ready' && preview) {
      const confirmBtn = h(Button, {
        variant: 'gold',
        className: 'w-full min-h-[44px]',
        disabled: !!busy,
        onClick: () => act('confirm'),
      }, busy === 'confirm' ? 'Confirming…' : 'Confirm upgrade');
      const declineBtn = h(Button, {
        variant: 'outline',
        className: 'w-full min-h-[44px]',
        disabled: !!busy,
        autoFocus: declineFirst,
        onClick: () => act('decline'),
      }, busy === 'decline' ? 'Sending…' : 'Not mine');
      return shell(h('div', { className: 'bg-card rounded-2xl border border-border p-4 space-y-4' },
        h('p', { className: 'text-xs text-muted-foreground' }, 'Nothing is public until you confirm.'),
        category && h('p', { className: 'text-xs text-muted-foreground flex items-center gap-2' },
          h('span', { 'aria-hidden': 'true', className: 'inline-block w-2 h-2 rounded-full', style: type && type.hex ? { background: type.hex } : undefined }),
          category),
        h('h2', { className: 'text-lg font-semibold text-foreground' }, preview.display_name),
        area && h('p', { className: 'text-sm text-muted-foreground' }, area),
        preview.bio && h('p', { className: 'text-sm text-foreground line-clamp-3' }, preview.bio),
        when && h('p', { className: 'text-xs text-muted-foreground' }, 'This link expires on ' + when + '.'),
        h('div', { className: 'flex flex-col gap-2' },
          declineFirst ? declineBtn : confirmBtn,
          declineFirst ? confirmBtn : declineBtn)));
    }

    const note = {
      wrong: 'This link was sent to a different Citizens account. Sign out, then sign in with the address that received the email.',
      expired: 'This link has expired. Your account was not changed.',
      declined: 'You already said this is not yours. Your account was not changed.',
      'done-decline': 'Nothing on your account was changed. The team has been told.',
      already: 'This upgrade is already done.',
      signedout: 'Sign in to confirm this listing.',
      error: 'Something went wrong loading this confirmation.',
    }[state] || 'Something went wrong loading this confirmation.';

    return shell(h('div', { className: 'bg-card rounded-2xl border border-border p-4 space-y-4', role: state === 'error' ? 'alert' : 'status' },
      h('p', { className: 'text-sm text-foreground' }, note),
      state === 'already' && preview && preview.url && h('a', { href: preview.url, className: 'text-sm font-semibold text-gold-dark underline' }, 'View your listing'),
      state === 'error' && h(Button, { variant: 'outline', icon: 'RefreshCw', className: 'min-h-[44px]', onClick: () => window.location.reload() }, 'Try again')));
  }

  window.IntakeUpgradePage = IntakeUpgradePage;
})();
