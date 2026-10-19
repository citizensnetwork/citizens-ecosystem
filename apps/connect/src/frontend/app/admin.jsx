// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Admin panel (applications, overview, contributors, citizens, reports)
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect, useRef } = React;
  const { cx, Avatar, Button, Segmented, Empty, Input, Field, Textarea, Toggle, Overlay, MediaPicker } = window.UI;
  const Icon = window.Icon;

  const STATUS = {
    pending: { label: 'Pending Review', color: '#D97706', bg: '#FEF3C7', icon: 'Clock' },
    approved: { label: 'Approved', color: '#16A34A', bg: '#DCFCE7', icon: 'CheckCircle2' },
    rejected: { label: 'Rejected', color: '#DC2626', bg: '#FEE2E2', icon: 'XCircle' },
  };

  function PageHeader({ children }) {
    return h('div', { className: 'px-4 sm:px-5 pt-5 pb-4 border-b border-border glass-strong shrink-0' }, children);
  }

  // One application. Everything on it is the applicant's own, UNTRUSTED text:
  // it is rendered as text, and a link only when it is http(s).
  // `onReview(id, 'approved' | 'rejected', note)` returns a promise of
  // { ok, error }: the buttons wait for the server and a failure is shown here
  // instead of the card pretending the decision was made.
  function AppCard({ app, onReview }) {
    const [mode, setMode] = useState(null); // 'approve' | 'reject' | null
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const st = STATUS[app.status] || STATUS.pending;
    // The map category: one of the 12 Contributor types (an older row may hold an event/place slug).
    const cat = window.DATA.getItemCategory({ type: 'contributor', category: app.category });
    const website = window.UI.safeUrl(app.website);
    const covers = (app.covers || []).filter((u) => window.UI.safeUrl(u));
    const needsReason = mode === 'reject' && !note.trim();
    const confirm = async () => {
      if (busy || needsReason) return;
      setBusy(true);
      setError('');
      const result = await onReview(app.id, mode === 'approve' ? 'approved' : 'rejected', note.trim());
      setBusy(false);
      if (result && result.ok === false) { setError(result.error || 'Something went wrong. Please try again.'); return; }
      setMode(null);
    };
    return h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden', 'data-application': app.id },
      h('div', { className: 'p-4' },
        h('div', { className: 'flex items-start gap-3' },
          h(Avatar, { src: app.photo, name: app.name, size: 48, rounded: 'xl' }),
          h('div', { className: 'flex-1 min-w-0' },
            h('div', { className: 'flex items-center gap-2 flex-wrap' },
              h('p', { className: 'text-sm font-bold text-foreground' }, app.name),
              app.isMine && h('span', { className: 'px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gold/15 text-gold-dark' }, 'YOUR APP'),
              h('span', { className: 'px-2 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1', style: { background: st.bg, color: st.color } },
                h(Icon, { name: st.icon, size: 9 }), st.label)),
            h('div', { className: 'flex items-center gap-2 mt-1 flex-wrap' },
              cat && h('span', { className: 'text-[10px] font-semibold px-2 py-0.5 rounded-full', style: { background: cat.hex + '1c', color: cat.hex } }, cat.name),
              h('span', { className: 'text-[10px] text-muted-foreground flex items-center gap-1' }, h(Icon, { name: 'MapPin', size: 9 }), app.location),
              h('span', { className: 'text-[10px] text-muted-foreground' }, 'Applied ' + fmt(app.submittedAt))))),
        // A removal is moderation: whoever decides on a re-application should know before approving.
        app.status === 'pending' && app.previouslyRemovedAt && h('div', { className: 'mt-3 flex items-start gap-2 p-3 rounded-xl bg-[#FEF3C7] text-[#92400E]', 'data-testid': 'previously-removed' },
          h(Icon, { name: 'Flag', size: 14, className: 'shrink-0 mt-0.5' }),
          h('p', { className: 'text-xs leading-relaxed' }, 'Previously removed by an admin on ' + fmt(app.previouslyRemovedAt) + '. Check why before you approve this one.')),
        h('p', { className: 'text-xs text-muted-foreground mt-3 leading-relaxed' }, app.bio),
        h('div', { className: 'mt-3 p-3 bg-muted/60 rounded-xl' },
          h('p', { className: 'text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1' }, 'Why they want to contribute'),
          h('p', { className: 'text-xs text-foreground leading-relaxed' }, app.reason)),
        covers.length > 0 && h('div', { className: 'flex gap-2 mt-3 overflow-x-auto scrollbar-none' },
          covers.map((u) => h('img', { key: u, src: u, alt: '', loading: 'lazy', className: 'h-16 w-28 rounded-lg object-cover border border-border shrink-0' }))),
        h('div', { className: 'flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap' },
          website
            ? h('a', { href: website, target: '_blank', rel: 'noopener noreferrer', className: 'flex items-center gap-1 hover:text-foreground underline-offset-2 hover:underline' }, h(Icon, { name: 'Globe', size: 11, className: 'text-gold' }), app.website)
            : (app.website && h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Globe', size: 11, className: 'text-gold' }), app.website)),
          app.contactEmail && h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Mail', size: 11, className: 'text-gold' }), app.contactEmail)),
        // Every platform they gave, each with its own brand mark; a value whose
        // link can't be made safe (not http/https) is dropped by SocialLinks.
        app.socials && Object.keys(app.socials).length > 0 && h(window.UI.SocialLinks, { socials: app.socials, className: 'mt-3' }),
        app.reviewNote && h('div', { className: 'mt-3 p-3 bg-card border border-border rounded-xl' },
          h('p', { className: 'text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1' }, 'Admin note'),
          h('p', { className: 'text-xs text-foreground' }, app.reviewNote))),
      // actions
      app.status === 'pending' && h('div', { className: 'border-t border-border p-4' },
        !mode
          ? h('div', { className: 'flex gap-2' },
              h(Button, { variant: 'success', className: 'flex-1', icon: 'CheckCircle2', onClick: () => setMode('approve') }, 'Approve'),
              h(Button, { variant: 'danger', className: 'flex-1', icon: 'XCircle', onClick: () => setMode('reject') }, 'Reject'))
          : h('div', { className: 'space-y-3 fade-in' },
              h('p', { className: 'text-xs font-bold text-foreground' }, (mode === 'approve' ? '✅ Approving' : '❌ Rejecting') + ' — ' + app.name),
              // C21: "on the map" only when the application has a pin (both coordinates); an online-only applicant is in Kingdom Discovery alone
              mode === 'approve' && h('p', { className: 'text-xs text-muted-foreground leading-relaxed', 'data-testid': 'approve-where' },
                app.hasPin
                  ? 'This puts them on the map and in Kingdom Discovery, and emails them.'
                  : 'This puts them in Kingdom Discovery, and emails them. They have no map pin, so they will not be on the map.'),
              // Only a rejection carries words: the applicant is shown this reason (notification + email).
              mode === 'reject' && h('textarea', { value: note, onChange: (e) => setNote(e.target.value), rows: 3, maxLength: 1000, placeholder: 'Why not yet? The applicant will read this, so keep it kind and clear.', 'aria-label': 'Reason for the applicant', className: window.UI.inputCls + ' resize-none' }),
              error && h('p', { className: 'text-xs font-semibold text-[#DC2626]', role: 'alert' }, error),
              h('div', { className: 'flex gap-2' },
                h('button', { onClick: confirm, disabled: busy || needsReason, className: cx('flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50', mode === 'approve' ? 'bg-[#16A34A] hover:bg-green-700' : 'bg-[#DC2626] hover:bg-red-700') }, busy ? 'Saving…' : 'Confirm'),
                h(Button, { variant: 'outline', disabled: busy, onClick: () => { setMode(null); setNote(''); setError(''); } }, 'Cancel')))),
      app.status === 'approved' && h('div', { className: 'border-t border-green-100 px-4 py-3 bg-[#DCFCE7]/40 flex items-center gap-2' },
        h(Icon, { name: 'CheckCircle2', size: 14, className: 'text-[#16A34A]' }),
        h('p', { className: 'text-xs font-semibold text-[#16A34A]' }, 'Approved — contributor access granted' + (app.reviewedAt ? ' · ' + fmt(app.reviewedAt) : ''))),
      app.status === 'rejected' && h('div', { className: 'border-t border-red-100 px-4 py-3 bg-[#FEE2E2]/40 flex items-center gap-2' },
        h(Icon, { name: 'XCircle', size: 14, className: 'text-[#DC2626]' }),
        h('p', { className: 'text-xs font-semibold text-[#DC2626]' }, 'Rejected' + (app.reviewedAt ? ' · ' + fmt(app.reviewedAt) : ''))));
  }
  const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const CONTRIBUTOR_KINDS = [
    { value: 'ministry', label: 'Ministry' },
    { value: 'organization', label: 'Organization' },
    { value: 'business', label: 'Business' },
    { value: 'individual', label: 'Individual' },
  ];

  // ── Admin: manually create a Contributor listing ──
  // Goes live immediately (map + Kingdom Discovery), tied to an email the
  // real owner later claims — POST /api/admin/contributors/create
  // (migration 169/170). Single-page form, not a wizard: this is an admin
  // quick-entry tool, not the citizen-facing apply flow. "Email the owner a
  // welcome" (D-13, on by default) has the SERVER mail them the sign-in steps;
  // the result says whether it was sent, failed, or skipped.
  const EMPTY_CREATE = {
    orgName: '', claimEmail: '', kind: 'ministry', category: '', bio: '', website: '',
    contactEmail: '', socials: {}, cover: '',
    location: '', lat: null, lng: null, noFixedLocation: false, emailOwner: true,
  };

  // The server answers with a stable code. The box under the form says it in
  // plain words and stays until the next try (a toast alone disappears).
  function createErrorMessage(code) {
    if (code === 'email_already_registered') return 'That email already has an account on Citizens.';
    if (code === 'invalid_contact_email') return 'The public contact email is not a valid email address.';
    if (code === 'invalid_cover_url') return 'The cover photo must be an https or http image link.';
    if (code === 'invalid_whatsapp_number') return 'WhatsApp needs a phone number (for example 071 234 5678) or a wa.me link.';
    if (code === 'invalid_website_url') return 'The website needs to be a real web address.';
    if (typeof code === 'string' && code.indexOf('invalid_') === 0) return 'Check the highlighted social link and try again.';
    return 'Could not create the listing — please try again.';
  }

  // Same rule the public chips use: a value is usable only when the platform
  // can turn it into an http(s) link. Empty is fine (the field is optional).
  function socialHref(platform, value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return window.UI.safeUrl(platform.urlFor(raw));
  }

  function welcomeEmailLine(emailRequested, email, claimEmail) {
    if (!emailRequested) return 'No welcome email was sent (you chose not to). Let them know yourself.';
    if (email === 'sent') return 'Welcome email sent to ' + claimEmail + '. They may need to check their junk folder.';
    if (email === 'failed') return "The welcome email couldn't be sent. Let them know yourself.";
    return "Email isn't set up on the server yet, so no welcome was sent. Let them know yourself.";
  }

  function AdminCreateContributor({ onCreated }) {
    const { toast } = window.useApp();
    const [f, setF] = useState({ ...EMPTY_CREATE, socials: {} });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null); // { slug, claimEmail, emailRequested, email } once created
    const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
    const ups = (k, v) => setF((s) => ({ ...s, socials: { ...s.socials, [k]: v } }));
    const setLoc = (patch) => setF((s) => ({
      ...s,
      location: patch.address !== undefined ? patch.address : s.location,
      lat: patch.lat !== undefined ? patch.lat : s.lat,
      lng: patch.lng !== undefined ? patch.lng : s.lng,
    }));
    const setNoFixedLocation = (v) => setF((s) => ({ ...s, noFixedLocation: v, location: v ? '' : s.location, lat: v ? null : s.lat, lng: v ? null : s.lng }));
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const platforms = window.DATA.SOCIAL_PLATFORMS;
    const badSocial = platforms.some((p) => String(f.socials[p.key] || '').trim() && !socialHref(p, f.socials[p.key]));
    const canSubmit = f.orgName.trim() && EMAIL_RE.test(f.claimEmail.trim()) && f.category && (f.noFixedLocation || f.location.trim()) && !badSocial && !submitting;

    const submit = async (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError('');
      try {
        const res = await window.authedFetch('/api/admin/contributors/create', {
          method: 'POST',
          body: JSON.stringify({
            display_name: f.orgName.trim(),
            claim_email: f.claimEmail.trim(),
            contributor_kind: f.kind,
            contributor_category: f.category,
            bio: f.bio || null,
            website_url: f.website || null,
            contact_email: f.contactEmail.trim() || null,
            ...window.DATA.socialsToRow(f.socials, 'contributor'),
            cover_photo_urls: f.cover ? [f.cover] : [],
            no_fixed_location: f.noFixedLocation,
            physical_address: f.noFixedLocation ? null : f.location,
            physical_latitude: f.noFixedLocation ? null : f.lat,
            physical_longitude: f.noFixedLocation ? null : f.lng,
            email_owner: f.emailOwner,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message = createErrorMessage(body.error);
          setError(message);
          toast(message, 'red');
          return;
        }
        const claimEmail = f.claimEmail.trim();
        const emailRequested = f.emailOwner;
        // C21: the server says whether the new listing has a pin; if it did not say, claim nothing about the map
        toast('Contributor listing created — ' + (body.onMap === true ? 'live on the map now.' : body.onMap === false ? 'live in Kingdom Discovery now. It has no map pin.' : 'live now.'), 'green');
        toast(welcomeEmailLine(emailRequested, body.email, claimEmail), emailRequested && body.email === 'sent' ? 'green' : 'gold');
        setF({ ...EMPTY_CREATE, socials: {} });
        setError('');
        if (onCreated) onCreated({ slug: body.slug });
        else setResult({ slug: body.slug, claimEmail, emailRequested, email: body.email });
      } catch (err) {
        const message = 'Could not create the listing — please check your connection.';
        setError(message);
        toast(message, 'red');
      } finally {
        setSubmitting(false);
      }
    };

    return h('form', { className: 'px-4 sm:px-5 py-4 space-y-4 fade-in max-w-xl', 'data-testid': 'admin-create-form', onSubmit: submit },
      h('p', { className: 'text-xs text-muted-foreground leading-relaxed' },
        "Create a Contributor listing on their behalf — it goes live in Kingdom Discovery immediately, and on the map when you give it a location. The real person or org signs in with the email below (a 6-digit code we email them, or Google) to see the listing and manage it themselves from their own Contributor Portal."),

      result && h('div', { className: 'p-3 rounded-xl bg-[#DCFCE7] border border-green-200 flex items-start gap-2', 'data-testid': 'create-result' },
        h(Icon, { name: 'CheckCircle2', size: 15, className: 'text-[#16A34A] shrink-0 mt-0.5' }),
        h('div', { className: 'text-xs text-[#15803d] leading-relaxed space-y-1' },
          h('p', null, h('strong', null, 'Live: '), '/' + result.slug + ' — claimable by ', h('strong', null, result.claimEmail)),
          h('p', { 'data-testid': 'create-email-status', className: result.emailRequested && result.email !== 'sent' ? 'font-semibold text-[#B45309]' : undefined },
            !result.emailRequested
              ? 'No welcome email was sent (you chose not to). Let them know yourself.'
              : result.email === 'sent'
                ? 'Welcome email sent to ' + result.claimEmail + '. They may need to check their junk folder.'
                : result.email === 'failed'
                  ? "The welcome email couldn't be sent. Let them know yourself."
                  : "Email isn't set up on the server yet, so no welcome was sent. Let them know yourself."))),

      h(Field, { label: 'Organisation / ministry name', required: true }, h(Input, { value: f.orgName, onChange: (e) => up('orgName', e.target.value), placeholder: 'e.g. New Wine Fellowship' })),
      h(Field, { label: "Owner's email", required: true, hint: 'The email they sign in with (a 6-digit code we email them, or Google) to see this listing.' }, h(Input, { type: 'email', value: f.claimEmail, onChange: (e) => up('claimEmail', e.target.value), placeholder: 'contact@ministry.org' })),

      h('div', { className: 'grid grid-cols-2 gap-3' },
        h(Field, { label: 'Type', htmlFor: 'admin-create-kind' }, h('select', { id: 'admin-create-kind', value: f.kind, onChange: (e) => up('kind', e.target.value), className: window.UI.inputCls },
          CONTRIBUTOR_KINDS.map((k) => h('option', { key: k.value, value: k.value }, k.label)))),
        h(Field, { label: 'Website', htmlFor: 'admin-create-website' }, h(Input, { id: 'admin-create-website', value: f.website, onChange: (e) => up('website', e.target.value), placeholder: 'yourministry.org' }))),

      // Same fields, same order, same pieces as the Contributor portal's
      // listing editor (dashboard ProfileTab): contact email, then every
      // social the public chips know about, then one cover.
      h(Field, {
        label: 'Public contact email', htmlFor: 'admin-create-contact-email',
        hint: 'Shown to citizens — different from your sign-in email.',
      }, h(Input, { id: 'admin-create-contact-email', type: 'email', value: f.contactEmail, onChange: (e) => up('contactEmail', e.target.value), placeholder: 'hello@yourministry.org' })),

      h(Field, {
        label: 'Social media',
        hint: 'A link or just the handle — either works. Shown publicly on your listing.',
        invalid: badSocial,
        hintId: 'social-hint',
      }, h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-2', 'data-testid': 'admin-create-socials' },
        platforms.map((p) => {
          const raw = f.socials[p.key] || '';
          const invalid = !!String(raw).trim() && !socialHref(p, raw);
          return h('div', {
            key: p.key, 'data-social': p.key, 'data-invalid': invalid ? 'true' : undefined,
            className: cx('flex items-center gap-2 px-3 py-2 bg-white/70 border rounded-xl focus-within:border-gold/60', invalid ? 'border-destructive' : 'border-border'),
          },
            h('span', { className: 'w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0' },
              h(Icon, { name: p.icon, size: 14, className: 'text-gold-dark' })),
            h('input', {
              value: raw, onChange: (e) => ups(p.key, e.target.value),
              placeholder: p.placeholder || p.label, 'aria-label': p.label, 'aria-invalid': invalid || undefined,
              className: 'flex-1 min-w-0 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/70',
            }));
        }))),

      h(Field, { label: 'Cover photo', hint: 'The first photo is the public cover image.' },
        h(MediaPicker, { value: f.cover, onChange: (v) => up('cover', v), aspect: '3/1', label: 'cover photo', scope: 'event-cover' })),

      h(Field, { label: 'Area / location served', required: !f.noFixedLocation },
        h('div', { className: 'space-y-2' },
          !f.noFixedLocation && h(Input, { value: f.location, onChange: (e) => setLoc({ address: e.target.value }), placeholder: 'e.g. Eastside, Central District' }),
          !f.noFixedLocation && h(window.LocationPicker, { value: { address: f.location, lat: f.lat, lng: f.lng }, onChange: setLoc }),
          h(Toggle, {
            checked: f.noFixedLocation, onChange: setNoFixedLocation,
            label: "No fixed physical location",
            desc: "Online, mobile, or no permanent office — no map pin.",
          }))),

      h(Field, { label: 'Primary category', required: true, hint: 'Sets the colour & icon across the map.' },
        h('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1 -mr-1' },
          window.DATA.CONTRIBUTOR_TYPES.map((c) => {
            const sel = f.category === c.id;
            return h('button', {
              key: c.id, type: 'button', onClick: () => up('category', c.id),
              className: cx('flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all text-left', sel ? 'border-transparent text-white' : 'border-border bg-white/60 hover:bg-white'),
              style: sel ? { background: c.hex } : undefined,
            }, h('span', { className: cx('text-xs font-semibold truncate', sel ? 'text-white' : 'text-foreground') }, c.name));
          }))),

      h(Field, { label: 'Short bio / about' }, h(Textarea, { value: f.bio, rows: 3, onChange: (e) => up('bio', e.target.value), placeholder: 'A vibrant community committed to…' })),

      h('label', { className: 'flex items-start gap-2.5 p-3 rounded-xl bg-white/60 border border-border cursor-pointer' },
        h('input', { type: 'checkbox', checked: f.emailOwner, onChange: (e) => up('emailOwner', e.target.checked), className: 'mt-0.5 w-4 h-4 accent-[#A67C00]' }),
        h('span', null,
          h('span', { className: 'block text-sm font-semibold text-foreground' }, 'Email the owner a welcome'),
          h('span', { className: 'block text-xs text-muted-foreground leading-relaxed' }, 'Sends the sign-in steps (a 6-digit code) from no-reply@citizenscentral.co.za. Untick it if you would rather tell them yourself.'))),

      error && h('div', { role: 'alert', 'data-testid': 'create-error', className: 'p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-xs font-semibold text-destructive' }, error),

      h(Button, { type: 'submit', variant: 'gold', icon: 'Plus', disabled: !canSubmit, className: 'w-full' }, submitting ? 'Creating…' : 'Create Contributor Listing'));
  }

  // ── Admin: every Contributor listing — hide / unhide ──
  // The moderation safety net for listings that go live without a review
  // step (Google Form intake, admin Create; self-serve applications are reviewed first since D-12): Hide takes a
  // listing off the map and Kingdom Discovery for everyone, reversibly —
  // POST /api/admin/contributors/hide (set_contributor_hidden, mig 164). Also
  // shows whether a form/admin-created listing's owner has signed in yet.
  function ListingRow({ row, confirming, busy, onAsk, onCancel, onConfirm, onDelete }) {
    const hidden = !!row.contributor_hidden;
    const name = row.full_name || 'this listing';
    const kind = CONTRIBUTOR_KINDS.find((k) => k.value === row.contributor_kind);
    const awaitingOwner = row.contributor_claim_email && !row.contributor_claimed_at;
    // A listing claimed from a DIFFERENT account (claim_admin_created_contributor)
    // was copied onto the owner and this placeholder hidden with its slug
    // cleared — the live listing is the owner's row. Unhiding it would publish
    // a slug-less duplicate, so it gets no toggle.
    const movedToOwner = hidden && !row.contributor_slug && !!row.contributor_claimed_at;
    return h('div', { className: 'bg-card rounded-2xl border border-border p-3', 'data-listing': row.contributor_slug || row.id },
      // On a phone the two buttons wrap onto their own line (the info block keeps
      // at least 10rem) so the name stays readable; from `sm` up they sit inline.
      h('div', { className: 'flex items-center gap-3 flex-wrap sm:flex-nowrap' },
        h(Avatar, { src: row.avatar_url, name: row.full_name, size: 40, rounded: 'xl' }),
        h('div', { className: 'flex-1 min-w-[10rem] sm:min-w-0' },
          h('div', { className: 'flex items-center gap-2 flex-wrap' },
            h('p', { className: 'text-sm font-bold text-foreground truncate' }, row.full_name || 'Unnamed listing'),
            h('span', {
              className: 'px-2 py-0.5 rounded-full text-[9px] font-bold',
              style: hidden ? { background: '#FEE2E2', color: '#DC2626' } : { background: '#DCFCE7', color: '#16A34A' },
            }, hidden ? 'HIDDEN' : 'LIVE')),
          h('div', { className: 'flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap text-[10px] text-muted-foreground' },
            kind && h('span', null, kind.label),
            row.contributor_slug && h('a', { href: '/c/' + row.contributor_slug, target: '_blank', rel: 'noopener noreferrer', className: 'text-gold-dark hover:underline' }, '/c/' + row.contributor_slug),
            row.auto_update_level && h('span', { className: 'flex items-center gap-1', 'data-automation': row.auto_update_level },
              h(Icon, { name: 'Sparkles', size: 9 }),
              'Automatic updates: ' + ({ off: 'Off', suggest: 'Suggest', events_auto: 'Auto events' }[row.auto_update_level] || row.auto_update_level) +
                (row.pending_suggestions ? ' · ' + row.pending_suggestions + ' pending' : '')),
            awaitingOwner && h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'Clock', size: 9 }), 'Awaiting owner sign-in · ' + row.contributor_claim_email),
            movedToOwner
              ? h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'CheckCircle2', size: 9 }), 'Moved to its owner\'s account ' + fmt(row.contributor_claimed_at))
              : row.contributor_claimed_at && h('span', { className: 'flex items-center gap-1' }, h(Icon, { name: 'CheckCircle2', size: 9 }), 'Owner signed in ' + fmt(row.contributor_claimed_at)))),
        !confirming && h('div', { className: 'flex items-center gap-1 shrink-0 ml-auto' },
          !movedToOwner && h(Button, { size: 'sm', variant: hidden ? 'success' : 'danger', icon: hidden ? 'Eye' : 'EyeOff', disabled: busy, onClick: onAsk }, hidden ? 'Unhide' : 'Hide'),
          // Delete is allowed on every row, including a placeholder that moved to
          // its owner (the way to clear the empty shell) — the server decides what it does.
          h('button', {
            type: 'button', onClick: onDelete, disabled: busy, 'aria-label': 'Delete ' + name,
            className: 'inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold text-[#DC2626] hover:bg-[#FEE2E2] transition-colors disabled:opacity-40',
          }, h(Icon, { name: 'Trash2', size: 13 }), 'Delete'))),
      confirming && h('div', { className: 'mt-3 pt-3 border-t border-border space-y-2 fade-in' },
        h('p', { className: 'text-xs text-foreground leading-relaxed' }, hidden
          // true for every listing: the map shows it only when it has a pin, Kingdom Discovery always (C21)
          ? 'Put ' + name + ' back in Kingdom Discovery, and on the map if it has a pin?'
          : 'Hide ' + name + ' from Kingdom Discovery, and from the map if it has a pin? Nothing is deleted — you can unhide it any time.'),
        h('div', { className: 'flex gap-2' },
          h(Button, { size: 'sm', variant: hidden ? 'success' : 'danger', className: 'flex-1', disabled: busy, onClick: onConfirm },
            busy ? 'Saving…' : hidden ? 'Confirm unhide' : 'Confirm hide'),
          h(Button, { size: 'sm', variant: 'outline', disabled: busy, onClick: onCancel }, 'Cancel'))));
  }

  // ── Admin: delete a listing ──
  // What "delete" does is decided by the SERVER from one fact — has the owner
  // ever signed in? — so the modal first asks it (GET = a read-only preflight)
  // and says, in plain words, which of the two will happen:
  //   placeholder  never signed in  → removed for good, with everything attached
  //   account      has signed in    → only the LISTING goes; the person stays
  // The admin must type the listing's name to enable the button. Nothing leaves
  // the list until the server answers 2xx. POST /api/admin/contributors/delete-listing
  // (migration 178); it is NOT /contributors/delete, which discards applications.
  const normName = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  function DeleteListingModal({ row, onClose, onDone }) {
    const [preview, setPreview] = useState(null); // the server's preflight; null until it answers
    const [problem, setProblem] = useState(''); // why it can't be done, or couldn't be checked
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
      let active = true;
      (async () => {
        try {
          const res = await window.authedFetch('/api/admin/contributors/delete-listing?id=' + encodeURIComponent(row.id));
          const json = await res.json().catch(() => ({}));
          if (!active) return;
          if (!res.ok) { setProblem(json.message || 'Could not check this listing — please try again.'); return; }
          // Wear brand owners and Vision users are refused: the server says why.
          if (Array.isArray(json.blockers) && json.blockers.length > 0) { setProblem(json.message); return; }
          setPreview(json);
        } catch (e) {
          if (active) setProblem('Could not check this listing — please try again.');
        }
      })();
      return () => { active = false; };
    }, [row.id]);

    const name = (preview && preview.name) || row.full_name || 'this listing';
    // A listing with no name is confirmed by typing "delete" (mirrors the database).
    const expected = (preview && preview.name) || 'delete';
    const matches = !!preview && normName(typed) === normName(expected);
    const placeholder = !!preview && preview.case === 'placeholder';
    const touched = preview ? [
      preview.eventsAffected > 0 && plural(preview.eventsAffected, 'live event'),
      preview.placesAffected > 0 && plural(preview.placesAffected, 'place'),
      preview.newsPosts > 0 && plural(preview.newsPosts, 'news post'),
      preview.teamMembers > 0 && plural(preview.teamMembers, 'team member'),
    ].filter(Boolean) : [];

    const confirmDelete = async () => {
      if (!matches || busy) return;
      setBusy(true);
      setError('');
      try {
        const res = await window.authedFetch('/api/admin/contributors/delete-listing', {
          method: 'POST',
          body: JSON.stringify({ id: row.id, confirmName: typed }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setError(json.message || 'Could not delete that listing — please try again.'); setBusy(false); return; }
        onDone(json);
      } catch (e) {
        setError('Could not delete that listing — please try again.');
        setBusy(false);
      }
    };

    return h(Overlay, { onClose, title: 'Delete listing', maxWidth: 480 },
      h('div', { className: 'p-5 space-y-4 overflow-y-auto', 'data-delete-listing': row.contributor_slug || row.id },
        !preview && !problem && h('p', { className: 'text-sm text-muted-foreground' }, 'Checking what this will do…'),

        problem && h('div', { className: 'space-y-3' },
          h('p', { role: 'alert', className: 'text-sm text-[#B91C1C] bg-[#FEE2E2] rounded-xl p-3 leading-relaxed' }, problem),
          h(Button, { variant: 'outline', className: 'w-full', onClick: onClose }, 'Close')),

        preview && h(F, null,
          h('p', { className: 'text-sm text-foreground leading-relaxed' }, placeholder
            ? h(F, null, h('strong', null, name), ' has never been signed into. Deleting removes it and everything attached to it ', h('strong', null, 'permanently'), '.')
            : h(F, null, h('strong', null, name), ' has an account. Deleting removes their Contributor listing, events and places, but ', h('strong', null, 'keeps their citizen account'), '.')),
          touched.length > 0 && h('p', { className: 'text-xs text-muted-foreground leading-relaxed' },
            (placeholder ? 'Removes: ' : 'Takes down: ') + touched.join(', ') + '.'),
          !placeholder && h('p', { className: 'text-xs text-muted-foreground leading-relaxed' },
            'They can still sign in and apply again. A new listing would start hidden until you unhide it here.'),
          preview.movedPlaceholder && h('p', { className: 'text-xs text-muted-foreground leading-relaxed' },
            'Its owner’s live listing now sits on their own account and is not touched.'),

          h(Field, { label: 'Type “' + expected + '” to confirm' },
            h(Input, {
              value: typed, onChange: (e) => setTyped(e.target.value), autoFocus: true,
              autoComplete: 'off', spellCheck: false, 'aria-label': 'Type the listing name to confirm',
              onKeyDown: (e) => { if (e.key === 'Enter') confirmDelete(); },
            })),
          error && h('p', { role: 'alert', className: 'text-xs font-semibold text-[#B91C1C] leading-relaxed' }, error),

          h('div', { className: 'flex gap-2' },
            h('button', {
              type: 'button', disabled: !matches || busy, onClick: confirmDelete,
              className: 'flex-1 inline-flex items-center justify-center gap-2 font-bold rounded-xl text-sm px-4 py-2.5 bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            }, h(Icon, { name: 'Trash2', size: 14 }), busy ? 'Deleting…' : 'Delete listing'),
            h(Button, { variant: 'outline', disabled: busy, onClick: onClose }, 'Cancel')))));
  }

  function AdminListings({ createOpen, onCreateOpenChange }) {
    const { toast, realUser, syncListingVisibility } = window.useApp();
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [confirmId, setConfirmId] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [deleting, setDeleting] = useState(null); // the row whose Delete modal is open
    const [reload, setReload] = useState(0);

    // GET /api/admin/users?role=contributor (admin-gated, service-role read —
    // it carries the claim columns). Page 1 replaces, later pages append;
    // typing is debounced and a stale response is dropped.
    useEffect(() => {
      if (!realUser) return undefined;
      let active = true;
      const term = q.trim();
      const timer = setTimeout(async () => {
        setLoading(true);
        setFailed(false);
        try {
          const res = await window.authedFetch('/api/admin/users?role=contributor&page=' + page + (term ? '&q=' + encodeURIComponent(term) : ''));
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const json = await res.json();
          if (!active) return;
          const data = Array.isArray(json.data) ? json.data : [];
          setRows((prev) => (page === 1 ? data : [...prev, ...data]));
          setTotal((json.meta && json.meta.total) || 0);
        } catch (e) {
          if (active) setFailed(true);
        }
        if (active) setLoading(false);
      }, term ? 300 : 0);
      return () => { active = false; clearTimeout(timer); };
    }, [realUser, q, page, reload]);

    const setHidden = async (row, hidden) => {
      setBusyId(row.id);
      try {
        const res = await window.authedFetch('/api/admin/contributors/hide', {
          method: 'POST',
          body: JSON.stringify({ user_id: row.id, hidden }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, contributor_hidden: hidden } : r)));
        syncListingVisibility({ id: row.id, slug: row.contributor_slug, hidden });
        toast(hidden
          ? (row.full_name || 'Listing') + ' is hidden — off the map and Kingdom Discovery.'
          : (row.full_name || 'Listing') + ' is live again.', 'green');
      } catch (e) {
        toast('Could not update that listing — please try again.', 'red');
      }
      setBusyId(null);
      setConfirmId(null);
    };

    // Only after the server answers 2xx does the row leave the list (the modal
    // keeps itself open and shows the error otherwise). Either outcome takes the
    // listing off the map and out of this tab: a deleted placeholder is gone,
    // and a person whose listing was removed is a citizen again.
    const handleDeleted = (row, result) => {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((n) => Math.max(0, n - 1));
      syncListingVisibility({ id: row.id, slug: row.contributor_slug, hidden: true });
      const label = row.full_name || 'Listing';
      toast(result.outcome === 'deleted'
        ? label + ' was deleted.'
        : label + '’s listing was removed. They keep their citizen account.', 'green');
      if (Array.isArray(result.warnings) && result.warnings.length > 0) toast(result.warnings[0], 'gold');
      setDeleting(null);
    };

    if (!realUser) {
      return h(Empty, { icon: 'Store', title: 'Sign in as an admin to manage live listings' });
    }

    const wideCreate = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 768px)').matches;
    return h('div', { className: 'px-4 sm:px-5 py-4 space-y-3 fade-in', 'data-admin-listings': '', 'data-admin-contributors': '' },
      h('p', { className: 'text-xs text-muted-foreground leading-relaxed' },
        'Every Contributor listing. Hide takes one off the map and Kingdom Discovery for everyone — nothing is deleted, and Unhide puts it straight back. Delete removes a listing for good; if its owner has an account, only the listing goes and they stay as a citizen.'),
      h('div', { className: 'flex flex-col gap-2 sm:flex-row sm:items-center' },
        h('div', { className: 'flex flex-1 items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-xl min-h-[44px]' },
          h(Icon, { name: 'Search', size: 14, className: 'text-muted-foreground shrink-0' }),
          h('input', {
            value: q, onChange: (e) => { setQ(e.target.value); setPage(1); },
            placeholder: 'Search listings…', 'aria-label': 'Search listings',
            className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground',
          })),
        h(Button, {
          variant: 'gold', icon: 'Plus', className: 'w-full sm:w-auto min-h-[44px]',
          onClick: () => onCreateOpenChange(true),
        }, 'Create Contributor')),
      failed
        ? h(Empty, { icon: 'WifiOff', title: 'Could not load listings', sub: 'Check your connection, then reopen this tab.' })
        : rows.length === 0 && !loading
          ? h(Empty, { icon: 'Store', title: q.trim() ? 'No listings match your search' : 'No Contributor listings yet' })
          : rows.map((r) => h(ListingRow, {
              key: r.id, row: r,
              confirming: confirmId === r.id, busy: busyId === r.id,
              onAsk: () => setConfirmId(r.id),
              onCancel: () => setConfirmId(null),
              onConfirm: () => setHidden(r, !r.contributor_hidden),
              onDelete: () => { setConfirmId(null); setDeleting(r); },
            })),
      loading && h('p', { className: 'text-xs text-muted-foreground text-center py-2' }, 'Loading…'),
      !loading && !failed && rows.length < total && h(Button, { variant: 'outline', className: 'w-full', onClick: () => setPage((n) => n + 1) }, 'Load more'),
      deleting && h(DeleteListingModal, { row: deleting, onClose: () => setDeleting(null), onDone: (result) => handleDeleted(deleting, result) }),
      createOpen && h(Overlay, {
        variant: wideCreate ? 'side' : 'sheet',
        title: 'Create Contributor',
        onClose: () => onCreateOpenChange(false),
      },
        h('div', { className: 'overflow-y-auto', 'data-testid': 'admin-create-overlay', 'data-overlay': wideCreate ? 'side' : 'sheet' },
          h(AdminCreateContributor, {
            onCreated: () => {
              onCreateOpenChange(false);
              setPage(1);
              setReload((n) => n + 1);
            },
          }))));
  }

  // ── Admin: Citizen accounts ──
  // GET /api/admin/users?role=citizen (admin session, migration 194). The
  // response has display names and dates, never an email. Delete is a
  // separate confirm modal (GET/POST /api/admin/citizens/delete).
  function joinedLabel(iso) {
    if (!iso) return 'joined';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'joined';
    return 'joined ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  function lastActiveLabel(iso) {
    if (!iso) return 'Never signed in';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Never signed in';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'last active today';
    if (days === 1) return 'last active yesterday';
    return 'last active ' + days + ' days ago';
  }

  function CitizenSkeleton() {
    return h('div', { className: 'bg-card rounded-2xl border border-border p-3 flex items-center gap-3', 'data-skeleton': '' },
      h('div', { className: 'w-10 h-10 rounded-xl bg-muted animate-pulse shrink-0' }),
      h('div', { className: 'flex-1 space-y-2' },
        h('div', { className: 'h-3 w-32 rounded bg-muted animate-pulse' }),
        h('div', { className: 'h-2 w-48 max-w-full rounded bg-muted animate-pulse' })));
  }

  function citizenCountLine(preview) {
    const parts = [
      preview.follows > 0 && plural(preview.follows, 'follow'),
      preview.placeFollows > 0 && plural(preview.placeFollows, 'place follow'),
      preview.saves > 0 && plural(preview.saves, 'save'),
      preview.rsvps > 0 && plural(preview.rsvps, 'RSVP'),
      preview.comments > 0 && plural(preview.comments, 'comment'),
      preview.moments > 0 && plural(preview.moments, 'Moment'),
      preview.messages > 0 && plural(preview.messages, 'message'),
      preview.notifications > 0 && plural(preview.notifications, 'notification'),
    ].filter(Boolean);
    return parts.length ? 'Removes: ' + parts.join(', ') + '.' : '';
  }

  function DeleteCitizenModal({ row, onClose, onDone }) {
    const [preview, setPreview] = useState(null);
    const [problem, setProblem] = useState('');
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
      let active = true;
      (async () => {
        try {
          const res = await window.authedFetch('/api/admin/citizens/delete?id=' + encodeURIComponent(row.id));
          const json = await res.json().catch(() => ({}));
          if (!active) return;
          if (!res.ok) { setProblem(json.message || 'Could not check this account — please try again.'); return; }
          if (Array.isArray(json.blockers) && json.blockers.length > 0) { setProblem(json.message); return; }
          setPreview(json);
        } catch (e) {
          if (active) setProblem('Could not check this account — please try again.');
        }
      })();
      return () => { active = false; };
    }, [row.id]);

    const display = (preview && preview.name) || row.full_name || '';
    const expected = display || 'delete';
    const matches = !!preview && normName(typed) === normName(expected);
    const counts = preview ? citizenCountLine(preview) : '';

    const confirmDelete = async () => {
      if (!matches || busy) return;
      setBusy(true);
      setError('');
      try {
        const res = await window.authedFetch('/api/admin/citizens/delete', {
          method: 'POST',
          body: JSON.stringify({ id: row.id, confirmName: typed }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setError(json.message || 'Could not delete that account — please try again.'); setBusy(false); return; }
        onDone(json);
      } catch (e) {
        setError('Could not delete that account — please try again.');
        setBusy(false);
      }
    };

    return h(Overlay, { onClose, title: 'Delete account', maxWidth: 480 },
      h('div', { className: 'p-5 space-y-4 overflow-y-auto', 'data-delete-citizen': row.id },
        !preview && !problem && h('p', { className: 'text-sm text-muted-foreground' }, 'Checking what this will remove…'),

        problem && h('div', { className: 'space-y-3' },
          h('p', { role: 'alert', className: 'text-sm text-[#B91C1C] bg-[#FEE2E2] rounded-xl p-3 leading-relaxed' }, problem),
          h(Button, { variant: 'outline', className: 'w-full', onClick: onClose }, 'Close')),

        preview && h(F, null,
          h('p', { className: 'text-sm text-foreground leading-relaxed' },
            display
              ? h(F, null, 'This permanently removes ', h('strong', null, display), '\'s sign-in, follows, saves and RSVPs.')
              : 'This permanently removes this account\'s sign-in, follows, saves and RSVPs.'),
          counts && h('p', { className: 'text-xs text-muted-foreground leading-relaxed' }, counts),
          h(Field, { label: 'Type the display name to confirm' },
            h(Input, {
              value: typed, onChange: (e) => setTyped(e.target.value), autoFocus: true,
              autoComplete: 'off', spellCheck: false, 'aria-label': 'Type the display name to confirm',
              onKeyDown: (e) => { if (e.key === 'Enter') confirmDelete(); },
            })),
          error && h('p', { role: 'alert', className: 'text-xs font-semibold text-[#B91C1C] leading-relaxed' }, error),
          h('div', { className: 'flex gap-2' },
            h('button', {
              type: 'button', disabled: !matches || busy, onClick: confirmDelete,
              className: 'flex-1 inline-flex items-center justify-center gap-2 font-bold rounded-xl text-sm px-4 py-2.5 min-h-[44px] bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            }, h(Icon, { name: 'Trash2', size: 14 }), busy ? 'Deleting…' : 'Delete account'),
            h(Button, { variant: 'outline', disabled: busy, onClick: onClose }, 'Cancel')))));
  }

  function AdminCitizens() {
    const { toast, realUser } = window.useApp();
    const [q, setQ] = useState('');
    const [signedIn, setSignedIn] = useState('any');
    const [joined, setJoined] = useState('any');
    const [application, setApplication] = useState('any');
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [reload, setReload] = useState(0);
    const [deleting, setDeleting] = useState(null);
    const searchRef = useRef(null);

    useEffect(() => {
      if (!realUser) return undefined;
      let active = true;
      const term = q.trim();
      const timer = setTimeout(async () => {
        setLoading(true);
        setFailed(false);
        try {
          const params = new URLSearchParams({ role: 'citizen', page: String(page), signedIn, joined, application });
          if (term) params.set('q', term);
          const res = await window.authedFetch('/api/admin/users?' + params.toString());
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const json = await res.json();
          if (!active) return;
          const data = Array.isArray(json.data) ? json.data : [];
          setRows((prev) => (page === 1 ? data : [...prev, ...data]));
          setTotal((json.meta && json.meta.total) || 0);
        } catch (e) {
          if (active) setFailed(true);
        }
        if (active) setLoading(false);
      }, term ? 300 : 0);
      return () => { active = false; clearTimeout(timer); };
    }, [realUser, q, page, signedIn, joined, application, reload]);

    const focusAfter = (id, current) => {
      const idx = current.findIndex((r) => r.id === id);
      const next = current[idx + 1] || current[idx - 1];
      setTimeout(() => {
        const btn = next && document.querySelector('[data-citizen="' + next.id + '"] [data-citizen-delete]');
        if (btn && btn.focus) btn.focus();
        else if (searchRef.current) searchRef.current.focus();
      }, 0);
    };

    const handleDeleted = (row) => {
      const current = rows;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((n) => Math.max(0, n - 1));
      toast('Account deleted', 'green');
      setDeleting(null);
      focusAfter(row.id, current);
    };

    const setFilter = (setter) => (e) => { setter(e.target.value); setPage(1); };
    const selectCls = window.UI.inputCls + ' h-11 min-h-[44px] w-full sm:w-auto';

    if (!realUser) {
      return h(Empty, { icon: 'Users', title: 'Sign in as an admin to manage citizens' });
    }

    return h('div', { className: 'px-4 sm:px-5 py-4 space-y-3 fade-in', 'data-admin-citizens': '' },
      h('p', { className: 'text-xs text-muted-foreground leading-relaxed' },
        'Citizen accounts. Delete removes a person\'s sign-in for good. Contributor listings stay on the Contributors tab.'),
      h('div', { className: 'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center' },
        h('div', { className: 'flex flex-1 items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-xl min-h-[44px] min-w-[12rem]' },
          h(Icon, { name: 'Search', size: 14, className: 'text-muted-foreground shrink-0' }),
          h('input', {
            ref: (node) => { searchRef.current = node; },
            id: 'admin-citizen-search', value: q, onChange: (e) => { setQ(e.target.value); setPage(1); },
            placeholder: 'Search name…', 'aria-label': 'Search citizens',
            className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground',
          })),
        h('select', { 'aria-label': 'Signed in', value: signedIn, onChange: setFilter(setSignedIn), className: selectCls },
          h('option', { value: 'any' }, 'Any'),
          h('option', { value: 'once' }, 'At least once'),
          h('option', { value: 'never' }, 'Never')),
        h('select', { 'aria-label': 'Joined', value: joined, onChange: setFilter(setJoined), className: selectCls },
          h('option', { value: 'any' }, 'Any'),
          h('option', { value: '7d' }, 'Last 7 days'),
          h('option', { value: '30d' }, 'Last 30 days'),
          h('option', { value: 'older' }, 'Older')),
        h('select', { 'aria-label': 'Application', value: application, onChange: setFilter(setApplication), className: selectCls },
          h('option', { value: 'any' }, 'Any'),
          h('option', { value: 'pending' }, 'Pending'),
          h('option', { value: 'rejected' }, 'Rejected'),
          h('option', { value: 'none' }, 'None'))),
      failed
        ? h('div', { role: 'alert', className: 'p-4 rounded-xl border border-destructive/30 bg-destructive/10 space-y-3' },
            h('p', { className: 'text-sm font-semibold text-destructive' }, 'Could not load citizens.'),
            h(Button, { variant: 'outline', onClick: () => setReload((n) => n + 1) }, 'Try again'))
        : loading && rows.length === 0
          ? h('div', { className: 'space-y-3', 'aria-busy': 'true' }, h(CitizenSkeleton), h(CitizenSkeleton), h(CitizenSkeleton))
          : rows.length === 0
            ? h(Empty, { icon: 'Users', title: 'No citizens match these filters' })
            : rows.map((r) => {
                const name = r.full_name || 'Unnamed citizen';
                const appLabel = r.contributor_status === 'pending' ? 'Pending application' : r.contributor_status === 'rejected' ? 'Application rejected' : '';
                return h('div', { key: r.id, className: 'bg-card rounded-2xl border border-border p-3', 'data-citizen': r.id },
                  h('div', { className: 'flex items-center gap-3 flex-wrap sm:flex-nowrap' },
                    h(Avatar, { src: r.avatar_url, name: r.full_name, size: 40, rounded: 'xl' }),
                    h('div', { className: 'flex-1 min-w-[10rem]' },
                      h('p', { className: 'text-sm font-bold text-foreground truncate' }, name),
                      h('p', { className: 'text-[11px] text-muted-foreground mt-0.5' },
                        joinedLabel(r.created_at) + ' · ' + lastActiveLabel(r.last_sign_in_at) + (appLabel ? ' · ' + appLabel : ''))),
                    h('button', {
                      type: 'button', 'data-citizen-delete': '', onClick: () => setDeleting(r),
                      'aria-label': 'Delete ' + name,
                      className: 'inline-flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded-xl text-xs font-bold text-[#DC2626] hover:bg-[#FEE2E2] transition-colors ml-auto',
                    }, h(Icon, { name: 'Trash2', size: 13 }), 'Delete')));
              }),
      loading && rows.length > 0 && h('p', { className: 'text-xs text-muted-foreground text-center py-2' }, 'Loading…'),
      !loading && !failed && rows.length < total && h(Button, { variant: 'outline', className: 'w-full', onClick: () => setPage((n) => n + 1) }, 'Load more'),
      deleting && h(DeleteCitizenModal, { row: deleting, onClose: () => setDeleting(null), onDone: () => handleDeleted(deleting) }));
  }

  function AdminPage() {
    const { isAdmin, applications, reviewApplication, go, realUser, nav, toast } = window.useApp();
    // The tab is part of the address (/admin/contributors); replaced rather than pushed (see DashboardPage).
    const tab = window.CC_ROUTES.ADMIN_TABS.indexOf(nav.params.tab) !== -1 ? nav.params.tab : 'applications';
    const [createOpen, setCreateOpen] = useState(false);
    const openedFromUrl = useRef(false);
    useEffect(() => {
      if (nav.params && nav.params.openCreate && !openedFromUrl.current) {
        openedFromUrl.current = true;
        setCreateOpen(true);
      }
    }, [nav]);
    const setTab = (t) => {
      if (t !== 'contributors') setCreateOpen(false);
      go('admin', t === 'applications' ? {} : { tab: t }, { replace: true, keepScroll: true });
    };
    const [status, setStatus] = useState('all');
    const [search, setSearch] = useState('');

    // Applications are fetched into the store for real admins (replacing the
    // demo seeds), so the same list powers this tab AND the overview counts.
    //
    // A real decision WAITS for the server: the card only turns Approved/Rejected
    // once the database function has run (it used to flip optimistically and fire
    // the request into the void, so a failure looked like success). Resolves to
    // { ok, error } for the card. Demo mode (no server) just records it locally.
    const handleReview = async (id, reviewStatus, note) => {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(id) || !realUser) {
        reviewApplication(id, reviewStatus, note);
        return { ok: true };
      }
      try {
        const res = await window.authedFetch('/api/admin/contributors/review', {
          method: 'POST',
          body: JSON.stringify({ application_id: id, action: reviewStatus === 'approved' ? 'approve' : 'reject', reason: note || '' }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { ok: false, error: (typeof body.message === 'string' && body.message) || 'Could not save the decision. Please try again.' };
        }
        reviewApplication(id, reviewStatus, note, { silent: true });
        const approved = reviewStatus === 'approved';
        const mailed = body.email === 'sent';
        toast(
          // C21: the server says whether the approved listing has a pin; if it did not say, claim nothing about the map
          (approved ? 'Approved. They are live' + (body.onMap === true ? ' on the map.' : body.onMap === false ? ' in Kingdom Discovery (no map pin).' : '.') : 'Rejected. They can apply again.')
            + (mailed ? ' We emailed them.' : " We couldn't email them, so let them know yourself."),
          approved && mailed ? 'green' : 'gold',
        );
        return { ok: true };
      } catch (e) {
        console.warn('[admin review] network error', e);
        return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
      }
    };

    const displayApps = applications;

    if (!isAdmin) {
      return h('div', { className: 'flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center' },
        h('div', { className: 'w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center' }, h(Icon, { name: 'Shield', size: 28, className: 'text-destructive' })),
        h('h3', { className: 'text-foreground text-lg' }, 'Admin Access Required'),
        h('p', { className: 'text-sm text-muted-foreground max-w-xs' }, 'Switch to the Admin role from the profile panel to access this area.'),
        h(Button, { variant: 'primary', onClick: () => go('home') }, 'Back to Map'));
    }

    const pending = displayApps.filter((a) => a.status === 'pending').length;
    const filtered = displayApps.filter((a) => status === 'all' || a.status === status).filter((a) => !search || a.name.toLowerCase().includes(search.toLowerCase()));

    return h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'admin' },
      h(PageHeader, null,
        h('div', { className: 'flex items-center gap-3 mb-4' },
          h('div', { className: 'w-10 h-10 rounded-2xl flex items-center justify-center', style: { background: '#8E44AD22' } }, h(Icon, { name: 'Shield', size: 18, style: { color: '#8E44AD' } })),
          h('div', null,
            h('h2', { className: 'text-foreground leading-none text-xl' }, 'Admin Panel'),
            h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, 'Platform management & oversight')),
          pending > 0 && h('span', { className: 'ml-auto px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#D97706]' }, pending + ' pending')),
        h('div', { className: 'grid grid-cols-4 gap-2 mb-4' },
          [['Total Apps', displayApps.length, '#5D6D7E'], ['Pending', pending, '#D97706'], ['Approved', displayApps.filter((a) => a.status === 'approved').length, '#16A34A'], ['Rejected', displayApps.filter((a) => a.status === 'rejected').length, '#DC2626']]
            .map(([l, v, c]) => h('div', { key: l, className: 'bg-card rounded-xl p-2.5 border border-border text-center' },
              h('p', { className: 'text-base font-bold', style: { color: c } }, v),
              h('p', { className: 'text-[9px] text-muted-foreground' }, l)))),
        h(Segmented, { options: [{ value: 'applications', label: 'Applications' + (pending ? ' (' + pending + ')' : '') }, { value: 'overview', label: 'Overview' }, { value: 'contributors', label: 'Contributors' }, { value: 'citizens', label: 'Citizens' }, { value: 'reports', label: 'Reports' }], value: tab, onChange: setTab })),

      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-8' },
        tab === 'applications' && h('div', { className: 'px-4 sm:px-5 py-4 space-y-4 fade-in' },
          h('div', { className: 'flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-xl' },
            h(Icon, { name: 'Search', size: 14, className: 'text-muted-foreground shrink-0' }),
            h('input', { value: search, onChange: (e) => setSearch(e.target.value), placeholder: 'Search applicants…', className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground' })),
          h('div', { className: 'flex gap-1.5 overflow-x-auto scrollbar-none' },
            ['all', 'pending', 'approved', 'rejected'].map((s) => h('button', { key: s, onClick: () => setStatus(s), className: cx('px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap capitalize transition-all', status === s ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground') }, s))),
          filtered.length === 0
            ? h(Empty, { icon: 'FileText', title: 'No applications match your filter' })
            : filtered.map((a) => h(AppCard, { key: a.id, app: a, onReview: handleReview }))),

        tab === 'overview' && h(window.AdminOverview, { setTab }),

        tab === 'contributors' && h(AdminListings, { createOpen: createOpen, onCreateOpenChange: setCreateOpen }),

        tab === 'citizens' && h(AdminCitizens),

        tab === 'reports' && h(window.AdminReports, null)));
  }

  window.AdminPage = AdminPage;
})();
