// ── Become a Brand: the §6.1 application form (mig 162) ────────────
// Reached from the Settings "Become a Brand" card once the derived
// eligibility gate opens (20 Concepts posted · 10 claimed · clean report
// history). POST /api/brand-applications — IMMUTABLE once submitted; a
// rejection permits an immediate re-apply. The server (API + RLS) is the
// wall; this screen is the doorway.
(function () {
  const { createElement: h, useState } = React;
  const { useStore } = window.CWStore;
  const { GOLD, GoldButton, ScreenHeader } = window.CWUI;

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
  const label = { fontSize: 12, fontWeight: 700, color: '#4a4a4a', margin: '16px 0 6px' };
  const card = {
    background: '#fff',
    border: '1px solid #f0eee9',
    borderRadius: 18,
    padding: '18px 20px',
    marginTop: 16,
  };
  const hint = { fontSize: 11.5, color: '#8f8d87', fontWeight: 500, lineHeight: 1.5, marginTop: 5 };

  const SOCIAL_FIELDS = [
    ['instagram', 'Instagram', '@yourbrand'],
    ['tiktok', 'TikTok', '@yourbrand'],
    ['x', 'X', '@yourbrand'],
    ['website', 'Website', 'https://…'],
  ];

  function Agreement({ checked, onToggle, children }) {
    return h(
      'button',
      {
        onClick: onToggle,
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          gap: 11,
          width: '100%',
          border: 'none',
          background: 'none',
          padding: '9px 0',
          textAlign: 'left',
        },
      },
      h(
        'span',
        {
          style: {
            width: 21,
            height: 21,
            flex: 'none',
            borderRadius: 7,
            border: '1.5px solid ' + (checked ? GOLD : '#d9d6cf'),
            background: checked ? GOLD : '#fff',
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          },
        },
        checked ? '✓' : '',
      ),
      h(
        'span',
        { style: { fontSize: 12.5, color: '#4a4a4a', fontWeight: 500, lineHeight: 1.55 } },
        children,
      ),
    );
  }

  function BrandApplyScreen() {
    const { pop } = useStore();
    const [form, setForm] = useState({
      brandName: '',
      bio: '',
      supportEmail: '',
      contactNumber: '',
      deliveryOptions: '',
      instagram: '',
      tiktok: '',
      x: '',
      website: '',
      agreeTerms: false,
      agreeConduct: false,
      agreeFees: false,
    });
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);
    const [submitted, setSubmitted] = useState(false);

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
    const toggle = (key) => () => setForm((f) => ({ ...f, [key]: !f[key] }));

    const missing = [];
    if (form.brandName.trim().length < 2) missing.push('brand name');
    if (!/^\S+@\S+\.\S+$/.test(form.supportEmail.trim())) missing.push('support email');
    if (form.contactNumber.trim().length < 7) missing.push('contact number');
    if (form.deliveryOptions.trim().length < 3) missing.push('delivery options');
    if (!(form.agreeTerms && form.agreeConduct && form.agreeFees)) missing.push('agreements');
    const ready = missing.length === 0;

    const submit = async () => {
      if (!ready || busy) return;
      setBusy(true);
      setNote(null);
      try {
        const socials = {};
        SOCIAL_FIELDS.forEach(([key]) => {
          if (form[key].trim()) socials[key] = form[key].trim();
        });
        await window.CW_API.post('/api/brand-applications', {
          brandName: form.brandName.trim(),
          bio: form.bio.trim() || null,
          socials,
          supportEmail: form.supportEmail.trim(),
          contactNumber: form.contactNumber.trim(),
          deliveryOptions: form.deliveryOptions.trim(),
          agreeTerms: form.agreeTerms,
          agreeConduct: form.agreeConduct,
          agreeFees: form.agreeFees,
        });
        setSubmitted(true);
      } catch (e) {
        setNote({ ok: false, text: e.message || 'Could not submit your application.' });
      } finally {
        setBusy(false);
      }
    };

    if (submitted) {
      return h(
        'div',
        {
          className: 'cwsc fade-in',
          style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fcfbf9' },
        },
        h(ScreenHeader, { title: 'Become a Brand', onBack: pop }),
        h(
          'div',
          { style: { padding: '4px 18px 0' } },
          h(
            'div',
            { style: { ...card, textAlign: 'center', padding: '30px 22px' } },
            h('div', { style: { fontSize: 34, marginBottom: 10 } }, '🕊️'),
            h('div', { style: { fontSize: 15.5, fontWeight: 800 } }, 'Application received'),
            h(
              'div',
              {
                style: {
                  fontSize: 12.5,
                  color: '#8f8d87',
                  fontWeight: 500,
                  lineHeight: 1.6,
                  marginTop: 8,
                },
              },
              'The Citizens Wear team is reviewing “' +
                form.brandName.trim() +
                '”. You will get a notification with the decision — nothing else to do for now.',
            ),
            h(
              'div',
              { style: { marginTop: 18 } },
              h(GoldButton, { label: 'Back to Settings', onClick: pop }),
            ),
          ),
        ),
      );
    }

    return h(
      'div',
      {
        className: 'cwsc fade-in',
        style: { height: '100%', overflowY: 'auto', paddingBottom: 110, background: '#fcfbf9' },
      },
      h(ScreenHeader, { title: 'Become a Brand', onBack: pop }),
      h(
        'div',
        { style: { padding: '4px 18px 0' } },
        h(
          'div',
          { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Your Brand'),
          h(
            'div',
            {
              style: {
                fontSize: 12.5,
                color: '#8f8d87',
                fontWeight: 500,
                lineHeight: 1.55,
                marginTop: 6,
              },
            },
            'Brands on Citizens Wear carry real trust: they propose on Concepts, produce for the community, and honour creators. Tell us who you are — once submitted, the application is locked until the team decides.',
          ),
          h('div', { style: label }, 'Brand name *'),
          h('input', {
            value: form.brandName,
            onChange: set('brandName'),
            maxLength: 80,
            placeholder: 'e.g. New Wine Threads',
            style: field,
          }),
          h('div', { style: label }, 'Bio'),
          h('textarea', {
            value: form.bio,
            onChange: set('bio'),
            rows: 3,
            maxLength: 500,
            placeholder: 'What your brand stands for, what you make, who you serve…',
            style: { ...field, resize: 'vertical', lineHeight: 1.5 },
          }),
        ),
        h(
          'div',
          { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Customer support'),
          h(
            'div',
            { style: hint },
            'Citizens who purchase against your posts need a real way to reach you.',
          ),
          h('div', { style: label }, 'Support email *'),
          h('input', {
            value: form.supportEmail,
            onChange: set('supportEmail'),
            type: 'email',
            maxLength: 254,
            placeholder: 'support@yourbrand.co.za',
            style: field,
          }),
          h('div', { style: label }, 'Contact number *'),
          h('input', {
            value: form.contactNumber,
            onChange: set('contactNumber'),
            maxLength: 32,
            placeholder: '+27 …',
            style: field,
          }),
          h('div', { style: label }, 'Delivery options *'),
          h('textarea', {
            value: form.deliveryOptions,
            onChange: set('deliveryOptions'),
            rows: 3,
            maxLength: 500,
            placeholder: 'e.g. Courier nationwide (3–5 days); pickup in Pretoria East.',
            style: { ...field, resize: 'vertical', lineHeight: 1.5 },
          }),
        ),
        h(
          'div',
          { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Socials'),
          h('div', { style: hint }, 'Optional — where the community can already find you.'),
          SOCIAL_FIELDS.map(([key, title, placeholder]) =>
            h(
              React.Fragment,
              { key },
              h('div', { style: label }, title),
              h('input', {
                value: form[key],
                onChange: set(key),
                maxLength: 200,
                placeholder,
                style: field,
              }),
            ),
          ),
        ),
        h(
          'div',
          { style: card },
          h('div', { style: { fontSize: 14, fontWeight: 800, marginBottom: 4 } }, 'Agreements *'),
          h(
            Agreement,
            { checked: form.agreeTerms, onToggle: toggle('agreeTerms') },
            'I agree to the Citizens Wear Terms & Conditions, including the creator royalty commitments Brands make when claiming Concepts.',
          ),
          h(
            Agreement,
            { checked: form.agreeConduct, onToggle: toggle('agreeConduct') },
            'I agree to uphold the Citizens Code of Conduct — honouring God, the community, and every creator in how this brand operates.',
          ),
          h(
            Agreement,
            { checked: form.agreeFees, onToggle: toggle('agreeFees') },
            'I understand verified Brands contribute a monthly platform fee once trading, as communicated by the Citizens Wear team.',
          ),
          note
            ? h(
                'div',
                {
                  style: {
                    marginTop: 10,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: note.ok ? '#3f6f34' : '#8f4a2b',
                  },
                },
                note.text,
              )
            : null,
          !ready
            ? h(
                'div',
                { style: { ...hint, marginTop: 12 } },
                'Still needed: ' + missing.join(', ') + '.',
              )
            : null,
          h(
            'div',
            { style: { marginTop: 14 } },
            h(GoldButton, {
              label: busy ? 'Submitting…' : 'Submit application',
              onClick: submit,
              disabled: busy || !ready,
            }),
          ),
        ),
      ),
    );
  }

  window.CWScreens = window.CWScreens || {};
  window.CWScreens.BrandApply = BrandApplyScreen;
})();
