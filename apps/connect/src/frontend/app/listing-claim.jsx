// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — the owner's confirm screen for a listing made for them (C10, issue #159)
//  ------------------------------------------------------------------
//  The Google Form and an admin can put a listing live for an email address. Nothing is ever attached to
//  anybody until that person has signed in (a 6-digit emailed code, or Google, proves the inbox) and answered
//  here. Two cases, one screen:
//
//    attach  the address already had an account.  "Attach 'X' to your account?"  [Confirm] [Not me]
//    self    the person signed in AS the listing's account (the address had no account).  "Is 'X' your
//            listing?"  [Confirm] [Not me]
//
//  Only Confirm runs the claim (POST /api/contributor/claim). "Not me" (POST /api/contributor/claim/decline)
//  hides the listing at once and tells the team; nothing on the person's own account changes. "Decide later"
//  closes the screen for this browser session without deciding anything; it comes back at the next sign-in,
//  because a modal that cannot be put down would lock someone out of the app they came to look at.
//
//  The sign-in bootstrap in store.jsx only ASKS (GET /api/contributor/claim). Signing in never claims.
//
//  Public surface: window.CCListingClaim = { Host, Dialog, STR }.
//  The dialog is the report dialog's pattern (portalled to <body>, one useBackGuard entry, Escape, focus
//  trapped, focus returned). Styles: assets/listing-claim.css (tokens only).
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const useBackGuard = window.useBackGuard || function () {};
  // The app may be served under a path prefix (/citizens/connect, C39): routes.jsx owns it.
  const appUrl = (path) => (window.CC_ROUTES ? window.CC_ROUTES.appUrl(path) : path);

  const STR = {
    attachTitle: (name) => 'Attach “' + name + '” to your account?',
    selfTitle: (name) => 'Is “' + name + '” your listing?',
    attachBody: 'A listing was made for the email address you signed in with, and it is already live on Citizens Connect. '
      + 'If it is yours, confirm and it becomes the listing on your account. Nothing on your account changes unless you confirm.',
    selfBody: 'A listing was made for the email address you signed in with, and it is already live on Citizens Connect. '
      + 'If it is yours, confirm and you can manage it from your Contributor Portal.',
    cannotAttach: 'You already have a listing on this account, so this one cannot be attached to it. '
      + 'If it is not yours, tap Not me and we will hide it.',
    notMeHelp: 'Not me hides the listing straight away and lets our team know. Nothing on your account changes.',
    confirm: 'Confirm',
    confirming: 'Confirming…',
    notMe: 'Not me',
    sending: 'One moment…',
    later: 'Decide later',
    viewListing: 'View the listing',
    confirmedSelf: 'Thank you. Your listing is confirmed.',
    confirmedAttach: 'Done. The listing is on your account now.',
    declined: 'Done. We have hidden the listing and let the team know. Nothing on your account changed.',
    failVerify: 'We could not confirm your email address yet. Please sign out, sign in again and try once more.',
    fail: 'Something went wrong. Please try again.',
    gone: 'That listing is no longer waiting for you.',
    rate: 'Too many tries. Please wait a minute and try again.',
  };

  function tabbables(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
  }

  function categoryLabel(id) {
    const data = window.DATA;
    const t = data && data.getContributorType && id ? data.getContributorType(id) : null;
    return t ? t.name : '';
  }

  function Dialog({ claim, onLater, onDone, submit }) {
    const S = STR;
    const card = useRef(null);
    const firstBtn = useRef(null);
    const laterRef = useRef(onLater);
    const lock = useRef(false);
    laterRef.current = onLater;
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    useBackGuard(true, onLater);

    const attach = claim.mode !== 'self';
    const eligible = claim.eligible !== false;
    const name = claim.name || 'this listing';
    const post = submit || window.authedFetch;

    useEffect(() => {
      const root = document.getElementById('root');
      const prevInert = !!(root && root.inert);
      if (root) root.inert = true;
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (firstBtn.current) firstBtn.current.focus({ preventScroll: true });
      return () => {
        if (root) root.inert = prevInert;
        document.documentElement.style.overflow = prevOverflow;
      };
    }, []);

    useEffect(() => {
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          laterRef.current();
          return;
        }
        if (e.key !== 'Tab' || !card.current) return;
        const nodes = tabbables(card.current);
        if (!nodes.length) { e.preventDefault(); e.stopPropagation(); return; }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        const inside = card.current.contains(active);
        const idx = nodes.indexOf(active);
        if (e.shiftKey) {
          if (!inside || idx <= 0) { e.preventDefault(); e.stopPropagation(); last.focus(); }
        } else if (!inside || idx === -1 || idx === nodes.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          first.focus();
        }
      };
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, []);

    // One request at a time: a double tap on Confirm must not run the claim twice.
    const send = async (kind) => {
      if (lock.current) return;
      lock.current = true;
      setBusy(kind);
      setError('');
      try {
        const res = await post(kind === 'confirm' ? '/api/contributor/claim' : '/api/contributor/claim/decline', { method: 'POST' });
        if (res && res.ok) {
          const body = await res.json().catch(() => ({}));
          onDone(kind, body || {});
          return;
        }
        const status = res ? res.status : 0;
        setError(status === 404 ? S.gone : status === 403 ? S.failVerify : status === 429 ? S.rate : S.fail);
      } catch (e) {
        setError(S.fail);
      }
      lock.current = false;
      setBusy('');
    };

    const category = categoryLabel(claim.category);
    const Icon = window.Icon;
    return h('div', {
      'data-mv2': 'claim',
      onPointerDown: (e) => e.stopPropagation(),
    },
      h('div', {
        ref: card, 'data-mv2': 'claim-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cc-claim-title', 'aria-describedby': 'cc-claim-body',
        'data-claim-mode': attach ? 'attach' : 'self',
      },
        h('div', { 'data-mv2': 'claim-head' },
          h('h2', { id: 'cc-claim-title', 'data-mv2': 'claim-title' }, attach ? S.attachTitle(name) : S.selfTitle(name))),
        h('div', { 'data-mv2': 'claim-scroll' },
          h('div', { 'data-mv2': 'claim-preview' },
            claim.logo_url
              ? h('img', { src: claim.logo_url, alt: '', 'data-mv2': 'claim-logo', width: 48, height: 48 })
              : h('span', { 'data-mv2': 'claim-logo', 'aria-hidden': 'true' }, Icon && h(Icon, { name: 'Crown', size: 22 })),
            h('div', { 'data-mv2': 'claim-preview-text' },
              h('strong', { 'data-mv2': 'claim-name' }, name),
              category && h('span', { 'data-mv2': 'claim-category' }, category),
              claim.slug && h('a', { href: appUrl('/c/' + encodeURIComponent(claim.slug)), target: '_blank', rel: 'noopener noreferrer', 'data-mv2': 'claim-link' }, S.viewListing))),
          h('p', { id: 'cc-claim-body', 'data-mv2': 'claim-body' }, !eligible ? S.cannotAttach : attach ? S.attachBody : S.selfBody),
          h('p', { 'data-mv2': 'claim-help' }, S.notMeHelp),
          error && h('p', { role: 'alert', 'data-mv2': 'claim-alert' }, error),
          h('div', { 'data-mv2': 'claim-actions' },
            eligible && h('button', {
              ref: firstBtn, type: 'button', 'data-mv2': 'action', 'data-primary': '', 'data-claim': 'confirm', disabled: !!busy,
              onClick: () => send('confirm'),
            }, busy === 'confirm' ? S.confirming : S.confirm),
            h('button', {
              ref: eligible ? undefined : firstBtn, type: 'button', 'data-mv2': 'action', 'data-claim': 'decline', disabled: !!busy,
              onClick: () => send('decline'),
            }, busy === 'decline' ? S.sending : S.notMe)),
          h('button', {
            type: 'button', 'data-mv2': 'claim-later', 'data-claim': 'later', disabled: !!busy, onClick: () => laterRef.current(),
          }, S.later))));
  }

  // Mounted once by the Shell. Reads the pending claim the store found at sign-in (or on "Claim a Contributor
  // listing" in the account menu) and shows the dialog until it is answered or put off.
  function Host() {
    const app = window.useApp();
    const claim = app.pendingListing;
    if (!claim) return null;
    const uid = app.realUser && app.realUser.id;
    // "Decide later" is remembered for this browser session (store.jsx snoozePendingListing).
    const later = () => app.snoozePendingListing(uid);
    const done = (kind, body) => {
      app.clearPendingListing();
      if (kind === 'decline') { app.toast(STR.declined, 'gold'); return; }
      if (claim.mode === 'self') {
        app.toast(STR.confirmedSelf, 'green');
        app.resetNav('dashboard');
        return;
      }
      app.toast(STR.confirmedAttach, 'green');
      // A full load, on purpose: the claim just changed this account's role in the database, and the whole
      // app (role, listing, menus) re-reads it on a fresh load.
      window.location.href = appUrl('/dashboard');
    };
    return ReactDOM.createPortal(h(Dialog, { claim: claim, onLater: later, onDone: done }), document.body);
  }

  window.CCListingClaim = { Host, Dialog, STR };
})();
