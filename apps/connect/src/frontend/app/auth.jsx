// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Landing + Sign-in screen
//  · Crown (line-art, gold) → italic scripture (Eph. 2:19) → "Citizens"
//    → "Connecting [carousel]" slogan → circular Google sign-in →
//    Browse as Guest. No manual role picker — every Google sign-in
//    resolves its role from profiles.role (defaults to citizen; only an
//    account already marked contributor/admin in the database gets that
//    access — see auth-client.js loadSession()).
//  · Deliberately spare: one gold (--gold-crown, the brand's crown-logo
//    gold), one voice (Manrope, "font-brand"), generous vertical rhythm.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect } = React;
  const { cx } = window.UI;

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

  // ── Main screen ──
  function AuthScreen() {
    const { signIn, browseAsGuest } = window.useApp();
    const [loading, setLoading] = useState(false);

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

          // circular Google sign-in + guest link
          h('div', { className: 'flex flex-col items-center gap-4 mt-12' },
            h('button', {
              onClick: onGoogle, disabled: loading, type: 'button', 'aria-label': 'Continue with Google',
              className: 'w-14 h-14 rounded-full bg-white border border-border shadow-lg flex items-center justify-center hover:shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-60 disabled:hover:scale-100',
            },
              loading
                ? h('span', { className: 'w-5 h-5 rounded-full border-2 border-gold border-t-transparent spin' })
                : h(GoogleMark)),

            h('button', {
              type: 'button', onClick: browseAsGuest,
              className: 'font-brand text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors',
            }, 'Browse as Guest'))

        )));
  }

  window.AuthScreen = AuthScreen;
})();
