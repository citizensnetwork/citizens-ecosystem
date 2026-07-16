// ── Create: post / story / concept ─────────────────────────────────
// Ratified content-permission model (2026-07-15, mig 160):
//   • POSTS are Brand-tier — only a user who owns a *verified* brand may post,
//     and every post is published AS that brand (Home = brand apparel feed).
//   • Base Citizens create STORIES + CONCEPTS (the community surface). The
//     Concept tile routes to the Concepts-page create flow.
//   • The self-serve "New Brand" tile is gone — a Brand is an assigned identity
//     (Become-a-Brand application → admin approval).
(function () {
  const { createElement: h, useState } = React;
  const { Icon } = window.CWIcons;
  const { useStore } = window.CWStore;
  const { GOLD, GoldButton, ImagePicker } = window.CWUI;

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
    const { me, push } = useStore();
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

    const myBrands = (me && me.brands) || [];
    const verifiedBrands = myBrands.filter((b) => b.verified);
    const canPost = verifiedBrands.length > 0;
    // Owns brand(s) but none verified yet → transparent pending state.
    const pendingBrandOnly = !canPost && myBrands.length > 0;
    // The active brand identity a post publishes as (always a verified brand).
    const activeBrand = asBrand || (verifiedBrands[0] && verifiedBrands[0].slug) || '';
    // 'post' collapses to 'story' for anyone who can't post (e.g. before `me`
    // loads, or a base Citizen) so the screen always renders a valid form.
    const effectiveMode = canPost ? mode : mode === 'post' ? 'story' : mode;

    const TYPES = [];
    if (canPost) TYPES.push({ k: 'post', label: 'Apparel Post', icon: 'tee' });
    TYPES.push({ k: 'story', label: 'Story', icon: 'clock' });
    TYPES.push({ k: 'concept', label: 'Concept', icon: 'star', nav: true });

    const submit = async () => {
      setBusy(true);
      setNote(null);
      try {
        if (effectiveMode === 'post') {
          await window.CW_API.post('/api/posts', {
            body,
            ...(mediaUrl.trim() ? { mediaUrls: [mediaUrl.trim()] } : {}),
            brandSlug: activeBrand,
          });
          setBody('');
          setMediaUrl('');
          setNote({
            ok: true,
            text: 'Posted. It is live on your brand and your followers’ feeds.',
          });
        } else {
          await window.CW_API.post('/api/stories', {
            mediaKind: storyMediaUrl.trim() ? 'image' : 'text',
            ...(storyMediaUrl.trim() ? { mediaUrl: storyMediaUrl.trim() } : {}),
            caption,
            audience,
          });
          setCaption('');
          setStoryMediaUrl('');
          setNote({ ok: true, text: 'Story shared — it lives for 24 hours.' });
        }
      } catch (e) {
        setNote({ ok: false, text: e.message || 'Could not create.' });
      } finally {
        setBusy(false);
      }
    };

    const canSubmit =
      effectiveMode === 'post'
        ? body.trim().length > 0 && !!activeBrand
        : caption.trim().length > 0 || storyMediaUrl.trim().length > 0;

    const onTile = (t) => {
      if (t.nav) {
        push('createConcept', {});
        return;
      }
      setMode(t.k);
      setNote(null);
    };

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
          canPost ? 'What would you like to create?' : 'Share a design Concept or a 24-hour Story.',
        ),
      ),
      // type grid (design's create tiles)
      h(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(' + TYPES.length + ', 1fr)',
            gap: 14,
            padding: '20px 20px 0',
          },
        },
        TYPES.map((t) =>
          h(
            'button',
            {
              key: t.k,
              onClick: () => onTile(t),
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                border:
                  effectiveMode === t.k && !t.nav ? '1.5px solid ' + GOLD : '1px solid #efedea',
                borderRadius: 18,
                padding: '20px 8px',
                background: effectiveMode === t.k && !t.nav ? '#fdf8ec' : '#fff',
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
              Icon(t.icon, {
                size: 26,
                color: effectiveMode === t.k && !t.nav ? GOLD : '#2a2a2a',
                sw: 1.8,
              }),
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
        // Pending-verification hint for owners whose brand isn't approved yet.
        pendingBrandOnly
          ? h(
              'div',
              {
                style: {
                  fontSize: 12.5,
                  fontWeight: 600,
                  lineHeight: 1.5,
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: 4,
                  background: '#fdf8ec',
                  color: '#7a6212',
                  border: '1px solid #f0e2b0',
                },
              },
              'Your brand is pending verification — you’ll be able to post apparel once it’s approved. Meanwhile, share Concepts and Stories.',
            )
          : null,
        effectiveMode === 'post'
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
              // Publish AS: a verified brand you own. One brand → a label;
              // several → chips. (Base "Myself" posting is retired — mig 160.)
              verifiedBrands.length > 1
                ? h(
                    'div',
                    null,
                    h('div', { style: label }, 'Post as'),
                    h(
                      'div',
                      { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                      verifiedBrands.map((b) =>
                        h(
                          'button',
                          {
                            key: b.slug,
                            onClick: () => setAsBrand(b.slug),
                            style: {
                              border:
                                '1px solid ' + (activeBrand === b.slug ? '#1a1a1a' : '#e6e3dc'),
                              background: activeBrand === b.slug ? '#1a1a1a' : '#fff',
                              color: activeBrand === b.slug ? '#fff' : '#4a4a4a',
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
                : verifiedBrands.length === 1
                  ? h(
                      'div',
                      { style: { ...label, color: '#a09e97', fontWeight: 600 } },
                      'Posting as ' + verifiedBrands[0].name,
                    )
                  : null,
            )
          : h(
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
            label: busy ? 'Working…' : effectiveMode === 'post' ? 'Create New Post' : 'Share Story',
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
