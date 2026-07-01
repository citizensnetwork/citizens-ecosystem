// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Landing + Sign-in screen
//  · Founding scripture (Eph. 2:19–22) → CITIZENS wordmark
//  · "Connecting [carousel]" slogan
//  · Continue with Google + Citizen / Contributor choice
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect } = React;
  const { cx } = window.UI;
  const Icon = window.Icon;

  // ── "Connecting ___" rotating slogan (2s) ──
  const PHRASES = [
    'Non-Profits to People',
    'Events to Interests',
    'Volunteers to Vacancies',
    'Leaders to Projects',
    'Ideas to Communities',
    'Churches to Neighbours',
    'Limbs to Members',
    'Pretoria to Purpose',
    'the KINGDOM', // anchor — gold uppercase
  ];

  function SloganCarousel() {
    const [i, setI] = useState(0);
    useEffect(() => {
      const t = setInterval(() => setI((n) => (n + 1) % PHRASES.length), 2000);
      return () => clearInterval(t);
    }, []);
    const anchor = i === PHRASES.length - 1;
    return h('div', { className: 'flex flex-col items-center text-center' },
      h('span', { className: 'text-foreground font-semibold text-base sm:text-lg leading-tight' }, 'Connecting'),
      h('span', { className: 'flex items-center justify-center mt-1', style: { minHeight: '1.6em' } },
        h('span', {
          key: i,
          className: cx('cc-roll gold-text font-extrabold whitespace-nowrap leading-tight',
            anchor ? 'text-xl sm:text-2xl uppercase tracking-[0.18em]' : 'text-xl sm:text-2xl'),
        }, anchor ? 'THE KINGDOM' : PHRASES[i])));
  }

  // ── Google "G" mark ──
  function GoogleMark() {
    return h('svg', { viewBox: '0 0 48 48', width: 19, height: 19, 'aria-hidden': true },
      h('path', { fill: '#FFC107', d: 'M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z' }),
      h('path', { fill: '#FF3D00', d: 'M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z' }),
      h('path', { fill: '#4CAF50', d: 'M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z' }),
      h('path', { fill: '#1976D2', d: 'M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C40.972 34.86 44 30.082 44 24c0-1.341-.138-2.65-.389-3.917z' }));
  }

  // ── Map backdrop (echoes the Discover map) ──
  function AuthBackdrop() {
    const roads = [];
    const seed = (n) => ((Math.sin(n * 999.13) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 9; i++) {
      const y = 6 + i * 10.5 + (seed(i) - 0.5) * 4;
      roads.push({ d: `M -4 ${y} Q 30 ${y + (seed(i + 1) - 0.5) * 8}, 55 ${y} T 104 ${y + (seed(i + 2) - 0.5) * 6}`, w: i % 3 === 0 ? 2.4 : 1.2 });
    }
    for (let i = 0; i < 9; i++) {
      const x = 6 + i * 10.5 + (seed(i + 20) - 0.5) * 4;
      roads.push({ d: `M ${x} -4 Q ${x + (seed(i + 21) - 0.5) * 8} 30, ${x} 55 T ${x + (seed(i + 22) - 0.5) * 6} 104`, w: i % 4 === 0 ? 2.4 : 1.1 });
    }
    return h(F, null,
      h('svg', { className: 'absolute inset-0 w-full h-full', viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid slice', style: { display: 'block' } },
        h('defs', null,
          h('linearGradient', { id: 'authwash', x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0', stopColor: '#F2F0EB' }),
            h('stop', { offset: '1', stopColor: '#E9E7E1' }))),
        h('rect', { x: 0, y: 0, width: 100, height: 100, fill: 'url(#authwash)' }),
        h('path', { d: 'M -5 78 Q 25 70 45 82 T 105 74 L 105 110 L -5 110 Z', fill: '#DCD9D2', opacity: 0.55 }),
        h('ellipse', { cx: 18, cy: 24, rx: 9, ry: 7, fill: '#FEF5F5', opacity: 0.9 }),
        h('ellipse', { cx: 82, cy: 58, rx: 8, ry: 10, fill: '#FEF5F5', opacity: 0.9 }),
        roads.map((r, i) => h('path', { key: 'c' + i, d: r.d, fill: 'none', stroke: '#DCD9D2', strokeWidth: r.w + 1.4, strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke', opacity: 0.65 })),
        roads.map((r, i) => h('path', { key: 'r' + i, d: r.d, fill: 'none', stroke: '#FFFFFF', strokeWidth: r.w, strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' })),
        roads.filter((r) => r.w > 2).map((r, i) => h('path', { key: 'g' + i, d: r.d, fill: 'none', stroke: '#F0C024', strokeWidth: 0.35, strokeDasharray: '2 3', vectorEffect: 'non-scaling-stroke', opacity: 0.45 }))),
      // soft vignette + cream wash so text/cards read clearly
      h('div', { className: 'absolute inset-0', style: { background: 'radial-gradient(120% 90% at 50% 30%, rgba(255,255,255,0.24) 0%, rgba(233,231,225,0.74) 56%, rgba(233,231,225,0.96) 100%)' } }));
  }

  // ── Role choice card ──
  function RoleOption({ active, onClick, icon, title, desc }) {
    return h('button', {
      type: 'button', onClick,
      className: cx('flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-white',
        active ? 'border-gold bg-accent shadow-[0_8px_22px_rgba(240,192,36,0.16)]' : 'border-border bg-white hover:bg-accent/40'),
    },
      h('span', {
        className: 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
        style: active ? { background: '#F0C024', color: '#000000' } : { background: 'rgba(240,192,36,0.14)', color: '#B07F08' },
      }, h(Icon, { name: icon, size: 17, strokeWidth: 2.2 })),
      h('span', { className: 'flex-1 min-w-0' },
        h('span', { className: 'flex items-center gap-1.5' },
          h('span', { className: 'block text-sm font-bold text-foreground' }, title),
          active && h(Icon, { name: 'Check', size: 13, className: 'text-gold-dark' })),
        h('span', { className: 'block text-[11px] text-muted-foreground leading-snug mt-0.5' }, desc)));
  }

  // ── Main screen ──
  function AuthScreen() {
    const { signIn } = window.useApp();
    const [intent, setIntent] = useState('citizen');
    const [loading, setLoading] = useState(false);

    const onGoogle = () => {
      if (loading) return;
      setLoading(true);
      signIn(intent);
    };

    return h('div', { className: 'relative h-full w-full overflow-y-auto', 'data-screen-label': 'Sign in' },
      h(AuthBackdrop),
      h('div', { className: 'relative min-h-full flex flex-col items-center justify-center px-5 py-10' },
        h('div', { className: 'w-full max-w-md flex flex-col items-center fade-in' },

          // brand chip
          h('div', { className: 'flex items-center gap-2.5 mb-8' },
            h('div', { className: 'w-9 h-9 rounded-xl gold-gradient flex items-center justify-center shadow-lg' },
              h(Icon, { name: 'Crown', size: 16, className: 'text-black', strokeWidth: 2.5 })),
            h('div', { className: 'leading-none' },
              h('p', { className: 'text-sm font-extrabold text-foreground tracking-[0.18em] uppercase' }, 'Citizens'),
              h('p', { className: 'text-[10px] text-gold font-bold tracking-[0.22em] uppercase mt-0.5' }, 'Connect'))),

          // scripture eyebrow
          h('p', { className: 'text-[13px] sm:text-sm font-medium text-foreground/65 text-center leading-relaxed max-w-sm px-2' },
            h('sup', { className: 'gold-text font-extrabold text-[10px] mr-0.5' }, '19'),
            'No longer strangers. Fellow citizens.'),

          // CITIZENS wordmark (completes the verse)
          h('h1', { className: 'gold-text font-extrabold leading-none text-center my-3', style: { fontSize: 'clamp(46px, 12vw, 84px)', letterSpacing: '0.16em' } }, 'CITIZENS'),

          h('p', { className: 'text-[11px] font-bold tracking-[0.3em] uppercase text-gold-dark/70 mb-7' }, 'EPH. 2:19-22'),

          // slogan carousel
          h('div', { className: 'mb-9' }, h(SloganCarousel)),

          // ── sign-in card ──
          h('div', { className: 'w-full bg-white border border-border rounded-[22px] shadow-2xl p-5 sm:p-6' },
            h('p', { className: 'text-center text-base font-extrabold text-foreground mb-0.5' }, 'Join the city'),
            h('p', { className: 'text-center text-xs text-muted-foreground mb-4' }, 'Sign in or create your account with Google.'),

            // role choice
            h('p', { className: 'text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-0.5' }, "I'm joining as"),
            h('div', { className: 'grid grid-cols-1 gap-2 mb-4' },
              h(RoleOption, {
                active: intent === 'citizen', onClick: () => setIntent('citizen'),
                icon: 'User', title: 'A Citizen',
                desc: 'Discover events & places, connect, message and vote on Kingdom Projects.',
              }),
              h(RoleOption, {
                active: intent === 'contributor', onClick: () => setIntent('contributor'),
                icon: 'Crown', title: 'A Contributor',
                desc: 'Lead a ministry or organisation. We’ll guide you through a quick application after sign-in.',
              })),

            // Google button
            h('button', {
              onClick: onGoogle, disabled: loading,
              className: 'w-full flex items-center justify-center gap-3 py-3 rounded-2xl bg-white border border-border shadow-sm font-bold text-sm text-foreground hover:shadow-md hover:border-gold/40 transition-all disabled:opacity-60',
            },
              loading
                ? h('span', { className: 'w-[18px] h-[18px] rounded-full border-2 border-gold border-t-transparent spin' })
                : h(GoogleMark),
              h('span', null, loading ? 'Connecting…' : 'Continue with Google')),

            intent === 'contributor' && h('div', { className: 'flex items-start gap-2 mt-3 p-2.5 rounded-xl bg-accent/60 text-gold-dark fade-in border border-gold/20' },
              h(Icon, { name: 'Info', size: 13, className: 'shrink-0 mt-0.5' }),
              h('p', { className: 'text-[11px] leading-relaxed' }, "You'll sign in first, then set up your contributor application for an admin to review.")))

        )));
  }

  window.AuthScreen = AuthScreen;
})();
