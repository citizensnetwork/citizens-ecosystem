// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Landing + Sign-in screen
//  · Crown (line-art, gold) → italic scripture (Eph. 2:19) → "Citizens"
//    → "Connecting [carousel]" slogan → circular Google sign-in →
//    "Continue with email" (a 6-digit code, for anyone without Google) →
//    Browse as Guest. No manual role picker — every sign-in, Google or
//    email, resolves its role from profiles.role (defaults to citizen; only
//    an account already marked contributor/admin in the database gets that
//    access — see auth-client.js loadSession()).
//  · Deliberately spare: one gold (--gold-crown, the brand's crown-logo
//    gold), one voice (Manrope, "font-brand"), generous vertical rhythm.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect } = React;
  const { cx, Button, inputCls } = window.UI;

  // ── "Connecting ___" rotating slogan (2s) ──
  const PHRASES = [
    'Non-Profits to People',
    'Events to Interests',
    'Volunteers to Vacancies',
    'Leaders to Projects',
    'Ideas to Communities',
    'Churches to Numbers',
    'Limbs to Members',
    'Pretoria to Purpose',
    'the Kingdom', // anchor — gold, title case (not all-caps)
  ];

  function SloganCarousel() {
    const [i, setI] = useState(0);
    useEffect(() => {
      const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 2000);
      return () => clearInterval(t);
    }, []);
    const anchor = i === PHRASES.length - 1;
    return h('div', { className: 'flex flex-col items-center text-center font-brand' },
      h('span', { className: 'text-foreground font-semibold text-base sm:text-lg tracking-tight leading-tight' }, 'Connecting'),
      h('span', { className: 'flex items-center justify-center mt-1', style: { minHeight: '1.5em' } },
        h('span', {
          key: i,
          className: cx('cc-roll crown-gold-text font-bold whitespace-nowrap leading-tight text-lg sm:text-xl tracking-tight',
            anchor && 'font-extrabold'),
        }, PHRASES[i])));
  }

  // ── Google "G" mark ──
  function GoogleMark() {
    return h('svg', { viewBox: '0 0 48 48', width: 22, height: 22, 'aria-hidden': true },
      h('path', { fill: '#FFC107', d: 'M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z' }),
      h('path', { fill: '#FF3D00', d: 'M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z' }),
      h('path', { fill: '#4CAF50', d: 'M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z' }),
      h('path', { fill: '#1976D2', d: 'M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C40.972 34.86 44 30.082 44 24c0-1.341-.138-2.65-.389-3.917z' }));
  }

  // ── Crown mark — the brand's line-art crown-with-cross. Single-weight
  //    stroke, never filled (design spec §01). Gold is set on the group so
  //    every path inherits --gold-crown without repeating it per-path.
  function CrownMark({ size = 46 }) {
    return h('svg', {
      width: size, height: size * 0.72, viewBox: '0 -10 100 76', fill: 'none',
      stroke: 'var(--gold-crown)', strokeWidth: 3.4, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': true,
    },
      h('path', { d: 'M14,48 L30,20 L40,38 L50,8 L60,38 L70,20 L86,48' }),
      h('path', { d: 'M10,54 Q50,64 90,54' }),
      h('path', { d: 'M50,8 L50,-6' }),
      h('path', { d: 'M43,-1 L57,-1' }));
  }

  // ── Email-code sign-in ──
  //  "Continue with email" opens this inline (same screen, no new route):
  //  email → 6-digit code → in. The store does the rest on SIGNED_IN (profile,
  //  role, an owner's listing landing), so success needs no navigation here.
  //  The pure bits (validation, code cleaning, error wording) live in
  //  window.CC_AUTH_HELPERS (auth-client.js) so they are unit-tested.
  const RESEND_SECONDS = 60; // GoTrue refuses a second code to one address inside 60 s anyway

  // Counts down to a wall-clock deadline rather than chaining one timeout per
  // second: someone who switches to their mail app to fetch the code leaves this
  // tab throttled in the background, and a chained countdown would then lag far
  // behind the real 60 s. Returns [secondsLeft, restart].
  function useCountdown() {
    const [until, setUntil] = useState(0); // epoch ms at which "Resend" re-enables
    const [now, setNow] = useState(() => Date.now());
    const left = Math.max(0, Math.ceil((until - now) / 1000));
    const running = left > 0;
    useEffect(() => {
      if (!running) return undefined;
      const t = setInterval(() => setNow(Date.now()), 500);
      return () => clearInterval(t);
    }, [running]);
    return [left, () => { const n = Date.now(); setNow(n); setUntil(n + RESEND_SECONDS * 1000); }];
  }

  const linkBtn = 'font-brand text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:hover:text-muted-foreground';
  const spinner = (tone) => h('span', { className: cx('w-4 h-4 rounded-full border-2 border-t-transparent spin', tone) });

  function EmailSignIn({ onClose }) {
    const { sendEmailCode, verifyEmailCode } = window.useApp();
    const A = window.CC_AUTH_HELPERS;
    const [step, setStep] = useState('email'); // 'email' | 'code'
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false); // code accepted — the store is loading the account
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [left, startCooldown] = useCountdown();

    const send = async (e) => {
      if (e) e.preventDefault();
      if (busy) return;
      setError(''); setNotice('');
      if (!A.isValidEmail(email)) { setError('Please enter a valid email address.'); return; }
      const resending = step === 'code';
      setBusy(true);
      try {
        await sendEmailCode(A.normaliseEmail(email));
        setEmail(A.normaliseEmail(email));
        setCode('');
        setStep('code');
        startCooldown();
        if (resending) setNotice('A new code is on its way.');
      } catch (err) {
        setError(A.mapAuthError(err, 'send'));
      } finally {
        setBusy(false);
      }
    };

    const verify = async (e) => {
      if (e) e.preventDefault();
      if (busy) return;
      setError(''); setNotice('');
      const digits = A.cleanCode(code);
      if (digits.length !== 6) { setError('Enter the 6-digit code from your email.'); return; }
      setBusy(true);
      try {
        await verifyEmailCode(email, digits);
        setDone(true); // stay busy: SIGNED_IN unmounts this screen once the account loads
      } catch (err) {
        setError(A.mapAuthError(err, 'verify'));
        setBusy(false);
      }
    };

    const panel = 'w-full rounded-2xl border border-border bg-white/70 backdrop-blur-sm shadow-sm p-4 font-brand text-left fade-in';
    const labelCls = 'block text-xs font-semibold text-foreground/80 mb-1.5';
    const errorEl = error && h('p', { role: 'alert', className: 'text-xs font-semibold text-destructive leading-relaxed' }, error);
    const noticeEl = notice && h('p', { role: 'status', className: 'text-xs font-semibold text-gold-dark leading-relaxed' }, notice);

    if (done) {
      return h('div', { role: 'status', className: cx(panel, 'flex items-center justify-center gap-3 py-6') },
        spinner('border-gold'),
        h('span', { className: 'text-sm font-semibold text-foreground' }, 'Signing you in…'));
    }

    if (step === 'code') {
      return h('form', { onSubmit: verify, noValidate: true, className: cx(panel, 'space-y-3') },
        h('p', { className: 'text-sm text-foreground leading-relaxed' },
          'We sent a 6-digit code to ', h('strong', { className: 'break-words' }, email), '.'),
        h('p', { className: 'text-[11px] text-muted-foreground -mt-1' }, 'It can take a minute. Check your junk folder too.'),
        h('div', null,
          h('label', { htmlFor: 'cc-email-code', className: labelCls }, '6-digit code'),
          h('input', {
            id: 'cc-email-code', type: 'text', inputMode: 'numeric', pattern: '[0-9]*', autoComplete: 'one-time-code',
            maxLength: 6, autoFocus: true, placeholder: '123456', value: code,
            onChange: (e) => setCode(A.cleanCode(e.target.value)),
            // maxLength would cut a pasted "123 456" to "123 45" before onChange
            // sees it, so take the paste ourselves and strip the spaces first.
            onPaste: (e) => {
              const text = e.clipboardData && e.clipboardData.getData('text');
              if (text) { e.preventDefault(); setCode(A.cleanCode(text)); }
            },
            className: cx(inputCls, '!text-2xl text-center font-semibold tracking-[0.4em]'),
          })),
        errorEl,
        noticeEl,
        h(Button, { type: 'submit', variant: 'gold', size: 'lg', disabled: busy, className: 'w-full' },
          busy ? h(F, null, spinner('border-white'), 'Signing in…') : 'Sign in'),
        h('div', { className: 'flex items-center justify-between gap-3 pt-1' },
          h('button', { type: 'button', onClick: send, disabled: busy || left > 0, className: linkBtn },
            left > 0 ? 'Resend code in ' + left + 's' : 'Resend code'),
          h('button', {
            type: 'button', disabled: busy, className: linkBtn,
            onClick: () => { setStep('email'); setCode(''); setError(''); setNotice(''); },
          }, 'Use a different email')));
    }

    return h('form', { onSubmit: send, noValidate: true, className: cx(panel, 'space-y-3') },
      h('div', null,
        h('label', { htmlFor: 'cc-email', className: labelCls }, 'Your email address'),
        h('input', {
          id: 'cc-email', type: 'email', inputMode: 'email', autoComplete: 'email', autoCapitalize: 'none',
          autoCorrect: 'off', spellCheck: false, autoFocus: true, placeholder: 'you@example.com', value: email,
          onChange: (e) => setEmail(e.target.value),
          className: cx(inputCls, '!text-base'),
        }),
        h('p', { className: 'text-[11px] text-muted-foreground mt-1.5' }, 'We’ll email you a 6-digit code. No password needed.')),
      errorEl,
      h(Button, { type: 'submit', variant: 'gold', size: 'lg', disabled: busy, className: 'w-full' },
        busy ? h(F, null, spinner('border-white'), 'Sending…') : 'Send code'),
      h('button', { type: 'button', onClick: onClose, className: cx(linkBtn, 'block mx-auto') }, 'Back'));
  }

  // ── Main screen ──
  function AuthScreen() {
    const { signIn, browseAsGuest } = window.useApp();
    const [loading, setLoading] = useState(false);
    const [emailOpen, setEmailOpen] = useState(false);
    // Email sign-in needs a configured Supabase; demo mode can't sign anyone in.
    const canEmail = !!window.CC_AUTH;

    const onGoogle = () => {
      if (loading) return;
      setLoading(true);
      Promise.resolve(signIn()).finally(() => setLoading(false));
    };

    return h('div', { className: 'relative h-full w-full overflow-y-auto', 'data-screen-label': 'Sign in' },
      // simple warm-paper wash — no busy map illustration; the crown does the work
      h('div', {
        className: 'absolute inset-0',
        style: { background: 'radial-gradient(120% 70% at 50% 0%, #FBF8F1 0%, #F3ECDB 55%, #ECE1C4 100%)' },
      }),
      h('div', {
        className: 'relative min-h-full flex flex-col items-center px-6',
        style: { paddingTop: '14dvh', paddingBottom: '8dvh' },
      },
        h('div', { className: 'w-full max-w-xs flex flex-col items-center fade-in' },

          // crown — floats near the top of the screen
          h(CrownMark, { size: 46 }),

          // scripture eyebrow — small gap below the crown
          h('p', { className: 'font-brand italic text-[12px] sm:text-[13px] text-foreground/60 text-center leading-relaxed mt-7 px-2' },
            h('sup', { className: 'crown-gold-text font-bold not-italic text-[9px] mr-0.5' }, '19'),
            '"Now, therefore, you are no longer strangers and foreigners, but fellow —"'),

          // "Citizens" title — completes the verse. Smaller gap above than the
          // crown→scripture gap; mid-sized, larger than surrounding text but
          // not overwhelming (per design: no full-caps wordmark treatment here).
          h('h1', {
            className: 'font-brand crown-gold-text font-extrabold text-center mt-3 leading-none',
            style: { fontSize: 'clamp(34px, 9vw, 46px)', letterSpacing: '0.005em' },
          }, 'Citizens'),

          // slogan carousel — same gap as crown→scripture (equal rhythm either side of the title)
          h('div', { className: 'mt-7' }, h(SloganCarousel)),

          // circular Google sign-in, then the email-code option, then the guest link
          h('div', { className: 'flex flex-col items-center gap-4 mt-12 w-full' },
            h('button', {
              onClick: onGoogle, disabled: loading, type: 'button', 'aria-label': 'Continue with Google',
              className: 'w-14 h-14 rounded-full bg-white border border-border shadow-lg flex items-center justify-center hover:shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-60 disabled:hover:scale-100',
            },
              loading
                ? h('span', { className: 'w-5 h-5 rounded-full border-2 border-gold border-t-transparent spin' })
                : h(GoogleMark)),

            canEmail && (emailOpen
              ? h(EmailSignIn, { onClose: () => setEmailOpen(false) })
              : h('button', {
                  type: 'button', onClick: () => setEmailOpen(true),
                  className: 'font-brand text-sm font-semibold text-gold-dark hover:text-foreground transition-colors',
                }, 'Continue with email')),

            h('button', {
              type: 'button', onClick: browseAsGuest,
              className: 'font-brand text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors',
            }, 'Browse as Guest'))

        )));
  }

  window.AuthScreen = AuthScreen;
})();
