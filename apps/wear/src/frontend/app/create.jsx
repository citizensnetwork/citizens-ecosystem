// ── Create: post / story / brand ───────────────────────────────────
// The design's create grid, reduced to the three creation types the
// backend actually supports: POST /api/posts, /api/stories, /api/brands.
(function () {
  const { createElement: h, useState } = React;
  const { Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, GoldButton, ScreenHeader, ImagePicker } = window.CWUI;

  const TYPES = [
    { k: 'post', label: 'Apparel Post', icon: 'tee' },
    { k: 'story', label: 'Story', icon: 'clock' },
    { k: 'brand', label: 'New Brand', icon: 'plus' },
  ];

  const field = {
    width: '100%',
    border: '1px solid #efedea',
    borderRadius: 14,
    padding: '12px 14px',
    fontSize: 13.5,
    fontWeight: 500,
    outline: 'none',
    background: '#fff',
    color: '#1a1a1a',
  };
  const label = { fontSize: 12, fontWeight: 700, color: '#4a4a4a', margin: '14px 0 6px' };

  function CreateScreen() {
    const { me, setTab, refreshMe } = useStore();
    const [mode, setMode] = useState('post');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null); // {ok, text}

    // post fields
    const [body, setBody] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [asBrand, setAsBrand] = useState('');
    // story fields
    const [caption, setCaption] = useState('');
    const [storyMediaUrl, setStoryMediaUrl] = useState('');
    const [audience, setAudience] = useState('public');
    // brand fields
    const [brandName, setBrandName] = useState('');
    const [brandSlug, setBrandSlug] = useState('');
    const [brandTagline, setBrandTagline] = useState('');
    const [brandWebsite, setBrandWebsite] = useState('');
    const [brandLogo, setBrandLogo] = useState('');

    const myBrands = (me && me.brands) || [];

    const submit = async () => {
      setBusy(true);
      setNote(null);
      try {
        if (mode === 'post') {
          await window.CW_API.post('/api/posts', {
            body,
            ...(mediaUrl.trim() ? { mediaUrls: [mediaUrl.trim()] } : {}),
            ...(asBrand ? { brandSlug: asBrand } : {}),
          });
          setBody('');
          setMediaUrl('');
          setNote({
            ok: true,
            text: 'Posted. It is live on your profile and your followers’ feeds.',
          });
        } else if (mode === 'story') {
          await window.CW_API.post('/api/stories', {
            mediaKind: storyMediaUrl.trim() ? 'image' : 'text',
            ...(storyMediaUrl.trim() ? { mediaUrl: storyMediaUrl.trim() } : {}),
            caption,
            audience,
          });
          setCaption('');
          setStoryMediaUrl('');
          setNote({ ok: true, text: 'Story shared — it lives for 24 hours.' });
        } else {
          await window.CW_API.post('/api/brands', {
            name: brandName,
            slug: brandSlug.trim().toLowerCase(),
            ...(brandTagline.trim() ? { tagline: brandTagline.trim() } : {}),
            ...(brandWebsite.trim() ? { websiteUrl: brandWebsite.trim() } : {}),
            ...(brandLogo.trim() ? { logoUrl: brandLogo.trim() } : {}),
          });
          await refreshMe();
          setBrandName('');
          setBrandSlug('');
          setBrandTagline('');
          setBrandWebsite('');
          setBrandLogo('');
          setNote({ ok: true, text: 'Brand created. Post as it from the composer.' });
        }
      } catch (e) {
        setNote({ ok: false, text: e.message || 'Could not create.' });
      } finally {
        setBusy(false);
      }
    };

    const canSubmit =
      mode === 'post'
        ? body.trim().length > 0
        : mode === 'story'
          ? caption.trim().length > 0 || storyMediaUrl.trim().length > 0
          : brandName.trim().length > 0 && brandSlug.trim().length > 0;

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fff' },
      },
      h(
        'div',
        { style: { padding: 'calc(24px + var(--safe-top)) 22px 8px', textAlign: 'center' } },
        h('div', { style: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px' } }, 'Create'),
        h(
          'div',
          { style: { fontSize: 13.5, color: '#a09e97', fontWeight: 500, marginTop: 6 } },
          'What would you like to create?',
        ),
      ),
      // type grid (design's create tiles)
      h(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 14,
            padding: '20px 20px 0',
          },
        },
        TYPES.map((t) =>
          h(
            'button',
            {
              key: t.k,
              onClick: () => {
                setMode(t.k);
                setNote(null);
              },
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                border: mode === t.k ? '1.5px solid ' + GOLD : '1px solid #efedea',
                borderRadius: 18,
                padding: '20px 8px',
                background: mode === t.k ? '#fdf8ec' : '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              },
            },
            h(
              'div',
              {
                style: {
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: '#faf8f3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #f0eee7',
                },
              },
              Icon(t.icon, { size: 26, color: mode === t.k ? GOLD : '#2a2a2a', sw: 1.8 }),
            ),
            h(
              'span',
              {
                style: {
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#2a2a2a',
                  textAlign: 'center',
                  lineHeight: 1.25,
                },
              },
              t.label,
            ),
          ),
        ),
      ),
      // form
      h(
        'div',
        { style: { padding: '22px 20px 0' } },
        mode === 'post'
          ? h(
              'div',
              null,
              h('div', { style: label }, 'What are you sharing?'),
              h('textarea', {
                value: body,
                onChange: (e) => setBody(e.target.value),
                rows: 5,
                maxLength: 2000,
                placeholder: 'A drop, a testimony, a word…  #hashtags become discoverable',
                style: { ...field, resize: 'vertical', lineHeight: 1.5 },
              }),
              h('div', { style: label }, 'Image (optional)'),
              h(ImagePicker, {
                scope: 'post',
                value: mediaUrl,
                onChange: setMediaUrl,
              }),
              myBrands.length
                ? h(
                    'div',
                    null,
                    h('div', { style: label }, 'Post as'),
                    h(
                      'div',
                      { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                      [{ slug: '', name: 'Myself' }].concat(myBrands).map((b) =>
                        h(
                          'button',
                          {
                            key: b.slug || 'self',
                            onClick: () => setAsBrand(b.slug),
                            style: {
                              border: '1px solid ' + (asBrand === b.slug ? '#1a1a1a' : '#e6e3dc'),
                              background: asBrand === b.slug ? '#1a1a1a' : '#fff',
                              color: asBrand === b.slug ? '#fff' : '#4a4a4a',
                              borderRadius: 999,
                              padding: '8px 16px',
                              fontSize: 12.5,
                              fontWeight: 600,
                            },
                          },
                          b.name,
                        ),
                      ),
                    ),
                  )
                : null,
            )
          : mode === 'story'
            ? h(
                'div',
                null,
                h('div', { style: label }, 'Caption'),
                h('textarea', {
                  value: caption,
                  onChange: (e) => setCaption(e.target.value),
                  rows: 3,
                  maxLength: 280,
                  placeholder: 'A 24-hour word of encouragement…',
                  style: { ...field, resize: 'vertical', lineHeight: 1.5 },
                }),
                h('div', { style: label }, 'Image (optional — text story without it)'),
                h(ImagePicker, {
                  scope: 'story',
                  value: storyMediaUrl,
                  onChange: setStoryMediaUrl,
                }),
                h('div', { style: label }, 'Audience'),
                h(
                  'div',
                  { style: { display: 'flex', gap: 8 } },
                  ['public', 'followers'].map((a) =>
                    h(
                      'button',
                      {
                        key: a,
                        onClick: () => setAudience(a),
                        style: {
                          flex: 1,
                          border: '1px solid ' + (audience === a ? '#1a1a1a' : '#e6e3dc'),
                          background: audience === a ? '#1a1a1a' : '#fff',
                          color: audience === a ? '#fff' : '#4a4a4a',
                          borderRadius: 12,
                          padding: '11px',
                          fontSize: 13,
                          fontWeight: 700,
                          textTransform: 'capitalize',
                        },
                      },
                      a,
                    ),
                  ),
                ),
              )
            : h(
                'div',
                null,
                h('div', { style: label }, 'Brand name'),
                h('input', {
                  value: brandName,
                  onChange: (e) => setBrandName(e.target.value),
                  placeholder: 'Kingdom Co.',
                  style: field,
                }),
                h('div', { style: label }, 'Slug (your brand’s @handle)'),
                h('input', {
                  value: brandSlug,
                  onChange: (e) => setBrandSlug(e.target.value),
                  placeholder: 'kingdom-co',
                  style: field,
                }),
                h('div', { style: label }, 'Tagline (optional)'),
                h('input', {
                  value: brandTagline,
                  onChange: (e) => setBrandTagline(e.target.value),
                  placeholder: 'Wear the Kingdom.',
                  style: field,
                }),
                h('div', { style: label }, 'Website (optional)'),
                h('input', {
                  value: brandWebsite,
                  onChange: (e) => setBrandWebsite(e.target.value),
                  placeholder: 'https://…',
                  style: field,
                }),
                h('div', { style: label }, 'Logo (optional)'),
                h(ImagePicker, {
                  scope: 'brand-logo',
                  value: brandLogo,
                  onChange: setBrandLogo,
                  round: true,
                }),
              ),
        note
          ? h(
              'div',
              {
                style: {
                  marginTop: 16,
                  fontSize: 12.5,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  borderRadius: 12,
                  padding: '12px 14px',
                  background: note.ok ? '#f4f9ef' : '#fdf3ec',
                  color: note.ok ? '#3f6f34' : '#8f4a2b',
                  border: '1px solid ' + (note.ok ? '#e0eed7' : '#f2ddc8'),
                },
              },
              note.text,
            )
          : null,
        h(
          'div',
          { style: { marginTop: 20 } },
          h(GoldButton, {
            label: busy
              ? 'Working…'
              : mode === 'post'
                ? 'Create New Post'
                : mode === 'story'
                  ? 'Share Story'
                  : 'Create Brand',
            onClick: submit,
            disabled: busy || !canSubmit,
            icon: Icon('plus', { size: 17, color: '#fff' }),
          }),
        ),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.Create = CreateScreen;
})();
