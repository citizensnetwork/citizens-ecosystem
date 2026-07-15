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

  /**
   * Image picker with a URL fallback. Uploads a chosen file straight to Supabase
   * Storage (via CW_API.uploadImage) and calls `onChange(url)` with the resulting
   * public URL; typing/pasting a URL into the fallback field also drives
   * `onChange`. The URL path keeps working everywhere uploads can't (dev/preview,
   * an upload error) — the value is always just a URL string. `round` renders the
   * preview as a circle (brand logos); `accept` defaults to the bucket's images.
   */
  function ImagePicker({ scope, value, onChange, placeholder, round }) {
    const { useState, useRef } = React;
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    // `uploaded` = the current value came from an upload this session, so we show
    // a clean "uploaded ✓" state and DON'T surface the raw storage URL (§3U-1a).
    // The manual URL input hides behind an "or paste a URL" toggle.
    const [uploaded, setUploaded] = useState(false);
    const [showPaste, setShowPaste] = useState(false);
    const inputRef = useRef(null);

    const onFile = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (e.target) e.target.value = ''; // let the same file be re-picked
      if (!file) return;
      setErr(null);
      setBusy(true);
      try {
        const url = await window.CW_API.uploadImage(file, scope);
        onChange(url);
        setUploaded(true);
        setShowPaste(false);
      } catch (ex) {
        setErr((ex && ex.message) || 'Upload failed — paste an image URL instead.');
        setShowPaste(true); // fall back to the manual path
      } finally {
        setBusy(false);
      }
    };

    const clear = () => {
      onChange('');
      setUploaded(false);
      setShowPaste(false);
      setErr(null);
    };

    const previewSize = round ? 72 : 96;
    // Show the raw URL field only when it's actually needed: a pasted/preloaded
    // value (so it stays editable) or an explicit paste toggle. Never for a
    // fresh upload — that's the leak §3U-1a closes.
    const showUrlField = !uploaded && (showPaste || !!value);

    return h(
      'div',
      null,
      h('input', {
        ref: inputRef,
        type: 'file',
        accept: 'image/png,image/jpeg,image/gif,image/webp',
        onChange: onFile,
        style: { display: 'none' },
      }),
      value
        ? h('img', {
            src: value,
            alt: 'preview',
            referrerPolicy: 'no-referrer',
            style: {
              width: previewSize,
              height: previewSize,
              objectFit: 'cover',
              borderRadius: round ? '50%' : 12,
              border: '1px solid #efedea',
              display: 'block',
              marginBottom: 10,
            },
          })
        : null,
      h(
        'div',
        { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
        h(
          'button',
          {
            type: 'button',
            onClick: () => inputRef.current && inputRef.current.click(),
            disabled: busy,
            style: {
              border: '1px solid #e6e3dc',
              background: busy ? '#faf8f3' : '#fff',
              color: '#2a2a2a',
              borderRadius: 11,
              padding: '9px 16px',
              fontSize: 12.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            },
          },
          Icon('plus', { size: 15, color: GOLD, sw: 2 }),
          busy ? 'Uploading…' : value ? 'Replace image' : 'Upload image',
        ),
        value && uploaded
          ? h(
              'span',
              {
                style: {
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#3f6f34',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                },
              },
              Icon('check', { size: 14, color: '#3f6f34', sw: 3 }),
              'Image uploaded',
            )
          : null,
        value
          ? h(
              'button',
              {
                type: 'button',
                onClick: clear,
                style: {
                  border: 'none',
                  background: 'transparent',
                  color: MUTED,
                  fontSize: 12.5,
                  fontWeight: 600,
                },
              },
              'Remove',
            )
          : null,
      ),
      err
        ? h(
            'div',
            { style: { fontSize: 11.5, color: '#8f4a2b', fontWeight: 600, marginTop: 7 } },
            err,
          )
        : null,
      showUrlField
        ? h('input', {
            value: value || '',
            onChange: (e) => {
              onChange(e.target.value);
              setUploaded(false);
            },
            placeholder: placeholder || 'or paste an image URL (https://…)',
            style: {
              width: '100%',
              border: '1px solid #efedea',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 12.5,
              fontWeight: 500,
              outline: 'none',
              background: '#fff',
              color: '#1a1a1a',
              marginTop: 9,
            },
          })
        : !uploaded && !value
          ? h(
              'button',
              {
                type: 'button',
                onClick: () => setShowPaste(true),
                style: {
                  border: 'none',
                  background: 'transparent',
                  color: MUTED,
                  fontSize: 12,
                  fontWeight: 600,
                  marginTop: 9,
                  padding: 0,
                },
              },
              'or paste a URL',
            )
          : null,
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
    ImagePicker,
    timeAgo,
    fmtCount,
  };
})();
