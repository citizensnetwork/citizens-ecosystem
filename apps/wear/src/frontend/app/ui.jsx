// ── Citizens Wear shared UI kit ────────────────────────────────────
// Map v2 tokens: one gold fill (--accent) with a near-black label
// (--accent-contrast). Gold text, icons and rings use --accent-ink.
// Radii are the canon scale. Plus Jakarta Sans for the UI, Playfair
// for the name. Exposes window.CWUI.
(function () {
  const { createElement: h, useEffect, useRef, useState } = React;
  const { Crown, Icon } = window.CWIcons;

  const GOLD = 'var(--accent)';
  const ON_GOLD = 'var(--accent-contrast)';
  const GOLD_INK = 'var(--accent-ink)';
  const INK = 'var(--text-1)';
  const MUTED = 'var(--text-2)';

  /**
   * An <img> that shows `fallback` (an element, or nothing) instead of the
   * browser's broken-picture icon when there is no `src` or it fails to load:
   * a dead link, or one the Content-Security-Policy blocks. A new `src` gets a
   * fresh try.
   */
  function SafeImg({ src, fallback, ...imgProps }) {
    const [failedSrc, setFailedSrc] = useState(null);
    if (!src || failedSrc === src) return fallback || null;
    return h('img', { ...imgProps, src, onError: () => setFailedSrc(src) });
  }

  /** Circular avatar: photo when available, else dark disc with initials. */
  function Avatar({ user, size = 40 }) {
    const name = (user && (user.displayName || user.handle)) || '?';
    const initials = name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return h(SafeImg, {
      src: user && user.avatarUrl,
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
      fallback: h(
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
      ),
    });
  }

  /** Brand mark: logo image when set, else dark disc with the crown. */
  function BrandLogo({ brand, size = 40 }) {
    return h(SafeImg, {
      src: brand && brand.logoUrl,
      alt: brand && brand.name,
      style: {
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        flex: 'none',
        display: 'block',
      },
      fallback: h(
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
      ),
    });
  }

  function GoldButton({ label, onClick, disabled, icon, style }) {
    return h(
      'button',
      {
        onClick,
        disabled,
        style: {
          width: '100%',
          background: GOLD,
          color: ON_GOLD,
          border: 'none',
          borderRadius: 'var(--radius-md)',
          minHeight: 'var(--hit)',
          padding: '14px',
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          boxShadow: 'var(--elev-1)',
          opacity: disabled ? 0.55 : 1,
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
          border: '1px solid ' + (following ? 'var(--divider)' : GOLD),
          background: following ? 'var(--surface-1)' : GOLD,
          color: following ? 'var(--text-2)' : ON_GOLD,
          fontSize: small ? 11.5 : 12.5,
          fontWeight: 700,
          minHeight: 'var(--hit)',
          padding: small ? '6px 14px' : '7px 18px',
          borderRadius: 'var(--radius-full)',
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
          border: '2.5px solid var(--divider)',
          borderTopColor: GOLD_INK,
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
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--divider)',
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
                border: '1px solid var(--divider)',
                background: 'var(--surface-1)',
                borderRadius: 'var(--radius-md)',
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
          background: 'var(--surface-0)',
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
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-full)',
                width: 'var(--hit)',
                height: 'var(--hit)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
            },
            Icon('back', { size: 20 }),
          )
        : h('div', { style: { width: 'var(--hit)' } }),
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
      right || h('div', { style: { width: 'var(--hit)' } }),
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
    // The value whose preview failed to load (a link to another website is
    // blocked by the Content-Security-Policy), so we can say so instead of
    // showing a broken-picture icon.
    const [badPreview, setBadPreview] = useState(null);
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
    const shownErr =
      err ||
      (value && badPreview === value
        ? "This picture can't be shown here. Upload the image instead of pasting a link from another website."
        : null);
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
      value && badPreview !== value
        ? h('img', {
            src: value,
            alt: 'preview',
            referrerPolicy: 'no-referrer',
            onError: () => setBadPreview(value),
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
              background: busy ? 'var(--surface-2)' : '#fff',
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
          Icon('plus', { size: 15, color: GOLD_INK, sw: 2 }),
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
      shownErr
        ? h(
            'div',
            { style: { fontSize: 11.5, color: '#8f4a2b', fontWeight: 600, marginTop: 7 } },
            shownErr,
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

  // ── Full-screen story viewer (Home stories + concept-statuses) ─────
  // Instagram-style overlay: progress bars, tap left/right to navigate,
  // 5s auto-advance, swallow-nothing close. `items` are already loaded:
  //   { id, mediaUrl?, caption?, title?, subtitle?, cta?: {label, onClick} }
  // `onView(item)` fires once per item as it becomes active (view recording
  // is the caller's concern — viewer stays presentational).
  function StoryViewer({ author, items, initialIndex, onClose, onView }) {
    const [idx, setIdx] = useState(initialIndex || 0);
    const item = items[idx];
    const seenRef = useRef({});

    useEffect(() => {
      if (!item || !onView) return;
      if (seenRef.current[item.id]) return;
      seenRef.current[item.id] = true;
      onView(item);
    }, [item, onView]);

    // Auto-advance; the key on idx restarts the timer per item.
    useEffect(() => {
      if (!item) return undefined;
      const t = setTimeout(() => {
        setIdx((i) => {
          if (i + 1 < items.length) return i + 1;
          onClose();
          return i;
        });
      }, 5000);
      return () => clearTimeout(t);
    }, [idx, item, items.length, onClose]);

    if (!item) return null;
    const go = (delta) => {
      const next = idx + delta;
      if (next < 0) return;
      if (next >= items.length) {
        onClose();
        return;
      }
      setIdx(next);
    };

    return h(
      'div',
      {
        className: 'fade-in',
        style: {
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: 'rgba(10,9,7,0.96)',
          display: 'flex',
          flexDirection: 'column',
        },
      },
      // progress bars
      h(
        'div',
        { style: { display: 'flex', gap: 5, padding: '14px 14px 0' } },
        items.map((s, i) =>
          h('div', {
            key: s.id || i,
            style: {
              flex: 1,
              height: 3,
              borderRadius: 2,
              background:
                i < idx
                  ? GOLD
                  : i === idx
                    ? 'color-mix(in srgb, var(--accent) 55%, transparent)'
                    : 'rgba(255,255,255,0.22)',
            },
          }),
        ),
      ),
      // header
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' } },
        author ? h(Avatar, { user: author, size: 34 }) : null,
        h(
          'div',
          { style: { flex: 1, minWidth: 0, lineHeight: 1.25 } },
          h(
            'div',
            { style: { fontSize: 13, fontWeight: 800, color: '#fff' } },
            (author && (author.displayName || author.handle)) || item.title || 'Story',
          ),
          item.subtitle
            ? h(
                'div',
                { style: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 600 } },
                item.subtitle,
              )
            : null,
        ),
        h(
          'button',
          {
            onClick: onClose,
            'aria-label': 'Close',
            style: {
              border: 'none',
              background: 'none',
              color: '#fff',
              fontSize: 26,
              lineHeight: 1,
              padding: '2px 6px',
              fontWeight: 300,
            },
          },
          '×',
        ),
      ),
      // media / caption stage; halves navigate back/forward
      h(
        'div',
        {
          style: {
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
          },
        },
        item.mediaUrl
          ? h('img', {
              src: item.mediaUrl,
              alt: item.caption || item.title || '',
              style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
            })
          : h(
              'div',
              {
                style: {
                  padding: '0 34px',
                  textAlign: 'center',
                  fontSize: 21,
                  fontWeight: 700,
                  lineHeight: 1.5,
                  color: '#fff',
                },
              },
              item.caption || item.title || '',
            ),
        h('button', {
          onClick: () => go(-1),
          'aria-label': 'Previous',
          style: { position: 'absolute', inset: '0 66% 0 0', border: 'none', background: 'none' },
        }),
        h('button', {
          onClick: () => go(1),
          'aria-label': 'Next',
          style: { position: 'absolute', inset: '0 0 0 34%', border: 'none', background: 'none' },
        }),
      ),
      // caption + CTA footer
      h(
        'div',
        { style: { padding: '14px 20px 30px' } },
        item.mediaUrl && item.caption
          ? h(
              'div',
              {
                style: {
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  lineHeight: 1.5,
                  marginBottom: item.cta ? 12 : 0,
                },
              },
              item.caption,
            )
          : null,
        item.cta
          ? h(GoldButton, {
              label: item.cta.label,
              onClick: item.cta.onClick,
              style: { padding: '12px', fontSize: 13.5 },
            })
          : null,
      ),
    );
  }

  /**
   * Share `{ url, title, text }` via the system share sheet when available,
   * falling back to the clipboard. Resolves 'native' | 'link' | null (failed/
   * dismissed) so callers can record the channel used.
   */
  async function shareLink({ url, title, text }) {
    if (navigator.share) {
      try {
        await navigator.share({ url, title, text });
        return 'native';
      } catch (e) {
        if (e && e.name === 'AbortError') return null; // user dismissed the sheet
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return 'link';
    } catch (e) {
      return null;
    }
  }

  window.CWUI = {
    GOLD,
    ON_GOLD,
    GOLD_INK,
    INK,
    MUTED,
    Avatar,
    BrandLogo,
    SafeImg,
    GoldButton,
    FollowButton,
    Spinner,
    EmptyState,
    ErrorNote,
    ScreenHeader,
    ImagePicker,
    StoryViewer,
    shareLink,
    timeAgo,
    fmtCount,
  };
})();
