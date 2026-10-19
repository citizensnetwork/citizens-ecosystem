// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Report (issue #160)
//  ------------------------------------------------------------------
//  One button and one dialog for an event, a person, a place, a comment,
//  a conversation or a Moment. The dialog is the news reader pattern
//  (issue #216): portalled to <body>, one useBackGuard entry, Escape, Back
//  and a backdrop tap close it, focus is trapped, and it returns to the
//  button that opened it.
//
//  Guests are sent to sign in. A person does not see the button on their
//  own content. "Send report" stays disabled until a reason is chosen, and
//  while the request is in flight, so a double tap cannot file two reports.
//
//  Public surface: window.CCReport = { Action, Dialog, REASONS, STR, signedIn }.
//  Map v2 copy is MapV2Strings.report (kept equal to STR by a test).
//  Styles: assets/map-v2.css section 4g (tokens only).
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const useBackGuard = window.useBackGuard || function () {};

  // The same list as POST /api/reports. A reason the server would refuse is never offered.
  const REASONS = ['spam', 'harassment', 'hate_speech', 'sexual_content', 'violence', 'misinformation', 'impersonation', 'illegal', 'other'];

  const STR = {
    action: 'Report',
    menu: 'Report',
    more: 'More options',
    close: 'Close report',
    title: (noun) => 'Report this ' + noun,
    why: 'Why are you reporting it?',
    reasons: {
      spam: 'Spam',
      harassment: 'Harassment',
      hate_speech: 'Hate speech',
      sexual_content: 'Sexual content',
      violence: 'Violence',
      misinformation: 'Misinformation',
      impersonation: 'Impersonation',
      illegal: 'Something illegal',
      other: 'Something else',
    },
    nouns: {
      event: 'event',
      user: 'person',
      place: 'place',
      comment: 'comment',
      conversation: 'conversation',
      moment: 'note',
    },
    details: 'Tell us more (optional, 1000 max)',
    counter: (n) => n + '/1000',
    cancel: 'Cancel',
    send: 'Send report',
    sending: 'Sending…',
    thanks: 'Thanks. An admin will look at it.',
    rate: "You've sent a few reports already. Please try again later.",
    fail: 'Could not send. Please try again.',
  };

  const BODY_MAX = 1000;

  // A guest has not signed in. Demo mode (no Supabase, a stored session) counts as signed in,
  // which is how the e2e suite drives the app. A real session is realUser.
  function signedIn(app) {
    if (app && app.realUser) return true;
    if (typeof window !== 'undefined' && !window.CC_AUTH && app && app.authed) return true;
    return false;
  }

  function tabbables(root) {
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
  }

  function nounFor(strings, targetType) {
    const table = strings && strings.nouns;
    return (table && table[targetType]) || targetType || 'item';
  }

  function Dialog({ targetType, targetId, strings, onClose, onSent, returnFocus, submit }) {
    const S = strings || STR;
    const card = useRef(null);
    const firstRadio = useRef(null);
    const pressRef = useRef(null);
    const closeRef = useRef(onClose);
    const sentRef = useRef(onSent);
    const lock = useRef(false);
    closeRef.current = onClose;
    sentRef.current = onSent;
    const [reason, setReason] = useState('');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useBackGuard(true, onClose);

    useEffect(() => {
      const root = document.getElementById('root');
      const prevInert = !!(root && root.inert);
      if (root) root.inert = true;
      const prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (firstRadio.current) firstRadio.current.focus({ preventScroll: true });
      return () => {
        if (root) root.inert = prevInert;
        document.documentElement.style.overflow = prevOverflow;
        if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      };
    }, []);

    useEffect(() => {
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          closeRef.current();
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

    const send = async () => {
      if (lock.current || busy || !reason) return;
      lock.current = true;
      setBusy(true);
      setError('');
      const post = submit || window.authedFetch;
      try {
        const res = await post('/api/reports', {
          method: 'POST',
          body: JSON.stringify({
            target_type: targetType,
            target_id: targetId,
            reason: reason,
            body: text.trim().slice(0, BODY_MAX),
          }),
        });
        if (res && res.ok) {
          if (sentRef.current) sentRef.current();
          else closeRef.current();
          return;
        }
        setError(res && res.status === 429 ? S.rate : S.fail);
      } catch (e) {
        setError(S.fail);
      }
      lock.current = false;
      setBusy(false);
    };

    const title = S.title(nounFor(S, targetType));
    const Icon = window.Icon;
    return h('div', {
      'data-mv2': 'report',
      'data-report-open': targetType || '',
      onPointerDown: (e) => {
        e.stopPropagation();
        pressRef.current = { x: e.clientX, y: e.clientY, moved: false };
      },
      onPointerMove: (e) => {
        const p = pressRef.current;
        if (!p) return;
        if (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8) p.moved = true;
      },
      onClick: (e) => {
        if (e.target !== e.currentTarget) return;
        if (pressRef.current && pressRef.current.moved) return;
        closeRef.current();
      },
    },
      h('div', {
        ref: card, 'data-mv2': 'report-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cc-report-title',
      },
        h('div', { 'data-mv2': 'report-head' },
          h('h2', { id: 'cc-report-title', 'data-mv2': 'report-title' }, title),
          h('button', {
            type: 'button', 'data-mv2': 'icon-btn', 'aria-label': S.close, onClick: () => closeRef.current(),
          }, Icon && h(Icon, { name: 'X', size: 20, 'aria-hidden': 'true' }))),
        h('div', { 'data-mv2': 'report-scroll' },
          h('p', { id: 'cc-report-why', 'data-mv2': 'report-why' }, S.why),
          h('div', { role: 'radiogroup', 'aria-labelledby': 'cc-report-why', 'data-mv2': 'report-reasons' },
            REASONS.map((id, i) => h('label', { key: id, 'data-mv2': 'report-reason' },
              h('input', {
                ref: i === 0 ? firstRadio : undefined,
                type: 'radio', name: 'cc-report-reason', value: id, checked: reason === id,
                onChange: () => { setReason(id); setError(''); },
              }),
              h('span', null, S.reasons[id] || id)))),
          h('label', { 'data-mv2': 'report-field' },
            h('span', { 'data-mv2': 'report-field-label', id: 'cc-report-details' }, S.details),
            h('textarea', {
              'data-mv2': 'report-input', id: 'cc-report-body', rows: 3, maxLength: BODY_MAX,
              value: text, 'aria-labelledby': 'cc-report-details',
              onChange: (e) => setText(e.target.value.slice(0, BODY_MAX)),
            }),
            h('span', { 'data-mv2': 'report-count' }, S.counter(text.length))),
          error && h('p', { role: 'alert', 'data-mv2': 'report-alert' }, error),
          h('div', { 'data-mv2': 'report-actions' },
            h('button', { type: 'button', 'data-mv2': 'action', onClick: () => closeRef.current() }, S.cancel),
            h('button', {
              type: 'button', 'data-mv2': 'action', 'data-primary': '', disabled: !reason || busy, onClick: send,
            }, busy ? S.sending : S.send)))));
  }

  // A one-item menu. `tone` 'mv2' uses the sheet tokens; 'page' uses the older page look.
  function Menu({ tone, label, item, onPick, hold }) {
    const [open, setOpen] = useState(false);
    const wrap = useRef(null);
    const itemRef = useRef(null);
    useEffect(() => {
      if (!open) return undefined;
      if (itemRef.current) itemRef.current.focus();
      const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
        if (hold.current && hold.current.isConnected) hold.current.focus();
      };
      document.addEventListener('pointerdown', onDown);
      document.addEventListener('keydown', onKey, true);
      return () => {
        document.removeEventListener('pointerdown', onDown);
        document.removeEventListener('keydown', onKey, true);
      };
    }, [open]);
    const Icon = window.Icon;
    const mv2 = tone === 'mv2';
    return h('div', {
      ref: wrap,
      'data-mv2': mv2 ? 'menu-wrap' : undefined,
      className: mv2 ? undefined : 'relative shrink-0',
    },
      h('button', {
        type: 'button',
        'data-mv2': mv2 ? 'icon-btn' : undefined,
        'data-report-more': '',
        className: mv2 ? undefined : 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent/60',
        'aria-label': label,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: (e) => {
          e.stopPropagation();
          hold.current = e.currentTarget;
          setOpen((v) => !v);
        },
      }, Icon && h(Icon, { name: 'MoreHorizontal', size: 20, 'aria-hidden': 'true' })),
      open && h('div', {
        role: 'menu',
        'data-mv2': mv2 ? 'menu' : undefined,
        className: mv2 ? undefined : 'absolute right-0 bottom-full z-50 mb-1 min-w-[10rem] rounded-xl border border-border bg-card py-1 shadow-lg',
      },
        h('button', {
          ref: itemRef, type: 'button', role: 'menuitem',
          'data-mv2': mv2 ? 'menu-item' : undefined,
          'data-report-menu': '',
          className: mv2 ? undefined : 'min-h-[44px] w-full px-4 text-left text-sm font-semibold text-foreground hover:bg-accent/40',
          onClick: (e) => { e.stopPropagation(); setOpen(false); onPick(); },
        }, item)));
  }

  function Action({ targetType, targetId, ownerId, variant, strings }) {
    const app = window.useApp ? window.useApp() : {};
    const [open, setOpen] = useState(false);
    const hold = useRef(null);
    const S = strings || STR;
    const mine = !!(ownerId && app.realUser && app.realUser.id === ownerId);
    const launch = () => {
      if (!signedIn(app)) {
        if (app.showSignIn) app.showSignIn();
        return;
      }
      setOpen(true);
    };
    const onSent = () => {
      if (app.toast) app.toast(S.thanks, 'gold');
      setOpen(false);
    };
    if (mine || !targetId) return null;
    const dialog = open && ReactDOM.createPortal(h(Dialog, {
      targetType: targetType, targetId: targetId, strings: S,
      returnFocus: hold.current, onClose: () => setOpen(false), onSent: onSent,
    }), document.body);
    const Icon = window.Icon;
    let trigger;
    if (variant === 'moment' || variant === 'overflow') {
      trigger = h(Menu, { tone: variant === 'moment' ? 'mv2' : 'page', label: S.more, item: S.menu, onPick: launch, hold: hold });
    } else if (variant === 'sheet') {
      trigger = h('button', {
        type: 'button', 'data-mv2': 'action', 'data-report': targetType, 'aria-haspopup': 'dialog',
        onClick: (e) => { hold.current = e.currentTarget; launch(); },
      },
        Icon && h(Icon, { name: 'Flag', size: 16, 'aria-hidden': 'true' }),
        h('span', null, S.action));
    } else {
      trigger = h('button', {
        type: 'button', 'data-report': targetType, 'aria-haspopup': 'dialog',
        className: 'min-h-[44px] inline-flex items-center gap-2 px-3 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-accent/60',
        onClick: (e) => { hold.current = e.currentTarget; launch(); },
      },
        Icon && h(Icon, { name: 'Flag', size: 16, 'aria-hidden': 'true' }),
        S.action);
    }
    return h(React.Fragment, null, trigger, dialog);
  }

  window.CCReport = { Action: Action, Dialog: Dialog, REASONS: REASONS, STR: STR, signedIn: signedIn };
})();
