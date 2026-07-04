// ── Citizens Wear shared UI kit ────────────────────────────────────
// Design-system components ported from the Claude-design handoff:
// gold #F2BA1B on white, Manrope, 14–18px radii, soft borders.
// Exposes window.CWUI.
(function () {
  const { createElement: h } = React;
  const { Crown, Icon } = window.CWIcons;

  const GOLD = '#F2BA1B';
  const INK = '#1a1a1a';
  const MUTED = '#a09e97';

  /** Circular avatar: photo when available, else dark disc with initials. */
  function Avatar({ user, size = 40 }) {
    const name = (user && (user.displayName || user.handle)) || '?';
    if (user && user.avatarUrl) {
      return h('img', {
        src: user.avatarUrl,
        alt: name,
        referrerPolicy: 'no-referrer',
        style: {
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flex: 'none',
          display: 'block',
        },
      });
    }
    const initials = name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return h(
      'div',
      {
        style: {
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#3a3a3a,#1a1a1a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: GOLD,
          fontWeight: 700,
          fontSize: size * 0.34,
          flex: 'none',
        },
      },
      initials,
    );
  }

  /** Brand mark: logo image when set, else dark disc with the crown. */
  function BrandLogo({ brand, size = 40 }) {
    if (brand && brand.logoUrl) {
      return h('img', {
        src: brand.logoUrl,
        alt: brand.name,
        style: {
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flex: 'none',
          display: 'block',
        },
      });
    }
    return h(
      'div',
      {
        style: {
          width: size,
          height: size,
          borderRadius: '50%',
          background: '#0e0e0e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        },
      },
      h(Crown, { size: size * 0.52 }),
    );
  }

  function GoldButton({ label, onClick, disabled, icon, style }) {
    return h(
      'button',
      {
        onClick,
        disabled,
        style: {
          width: '100%',
          background: disabled ? '#f0d789' : GOLD,
          color: '#fff',
          border: 'none',
          borderRadius: 14,
          padding: '14px',
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          boxShadow: '0 6px 18px -6px rgba(242,186,27,0.7)',
          ...style,
        },
      },
      icon || null,
      label,
    );
  }

  /** Follow/Following toggle in the design's chip style. */
  function FollowButton({ following, onClick, small }) {
    return h(
      'button',
      {
        onClick,
        style: {
          border: '1px solid ' + (following ? '#e6e3dc' : GOLD),
          background: following ? '#fff' : GOLD,
          color: following ? '#9a9892' : '#fff',
          fontSize: small ? 11.5 : 12.5,
          fontWeight: 700,
          padding: small ? '6px 14px' : '7px 18px',
          borderRadius: small ? 9 : 10,
        },
      },
      following ? 'Following' : 'Follow',
    );
  }

  function Spinner({ size = 26 }) {
    return h(
      'div',
      { style: { display: 'flex', justifyContent: 'center', padding: 28 } },
      h('div', {
        className: 'spin',
        style: {
          width: size,
          height: size,
          border: '2.5px solid #f0eee9',
          borderTopColor: GOLD,
          borderRadius: '50%',
        },
      }),
    );
  }

  function EmptyState({ icon, title, note }) {
    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '44px 30px',
          textAlign: 'center',
        },
      },
      h(
        'div',
        {
          style: {
            width: 54,
            height: 54,
            borderRadius: 16,
            background: '#faf8f3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #f0eee7',
          },
        },
        Icon(icon || 'search', { size: 24, color: MUTED }),
      ),
      h('div', { style: { fontSize: 14.5, fontWeight: 800, color: INK } }, title),
      note
        ? h(
            'div',
            {
              style: {
                fontSize: 12.5,
                color: MUTED,
                fontWeight: 500,
                lineHeight: 1.5,
                maxWidth: 260,
              },
            },
            note,
          )
        : null,
    );
  }

  function ErrorNote({ message, onRetry }) {
    return h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: '36px 30px',
          textAlign: 'center',
        },
      },
      h(
        'div',
        { style: { fontSize: 13.5, color: '#8f4a2b', fontWeight: 600, lineHeight: 1.5 } },
        message || 'Something went wrong.',
      ),
      onRetry
        ? h(
            'button',
            {
              onClick: onRetry,
              style: {
                border: '1px solid #e6e3dc',
                background: '#fff',
                borderRadius: 11,
                padding: '9px 22px',
                fontSize: 12.5,
                fontWeight: 700,
              },
            },
            'Try again',
          )
        : null,
    );
  }

  /** "2h" / "5d" style relative timestamp, uppercase-suffix like the design. */
  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const s = Math.max(0, (Date.now() - then) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 604800) return Math.floor(s / 86400) + 'd';
    return Math.floor(s / 604800) + 'w';
  }

  function fmtCount(n) {
    if (typeof n !== 'number') return '0';
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
  }

  /** Sticky screen header: centered title, optional back + right slot. */
  function ScreenHeader({ title, onBack, right }) {
    return h(
      'div',
      {
        style: {
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: '#fbfaf8',
          padding: 'calc(14px + var(--safe-top)) 18px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        },
      },
      onBack
        ? h(
            'button',
            {
              onClick: onBack,
              style: {
                border: 'none',
                background: '#f2f0ea',
                borderRadius: '50%',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
            },
            Icon('back', { size: 20 }),
          )
        : h('div', { style: { width: 36 } }),
      h(
        'div',
        {
          style: {
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: '-0.2px',
            textAlign: 'center',
            flex: 1,
          },
        },
        title,
      ),
      right || h('div', { style: { width: 36 } }),
    );
  }

  window.CWUI = {
    GOLD,
    INK,
    MUTED,
    Avatar,
    BrandLogo,
    GoldButton,
    FollowButton,
    Spinner,
    EmptyState,
    ErrorNote,
    ScreenHeader,
    timeAgo,
    fmtCount,
  };
})();
