// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — the Dashboard of someone whose Contributor
//  application is waiting for an admin (founder decision D-12).
// ════════════════════════════════════════════════════════════════════
//  They land here straight after applying. Nothing of theirs is public (map,
//  Discovery, /c/<slug>, /api/v1) until an admin approves, so what they edit
//  here is NOT their profile: it is staged on their own application row
//  (GET/PATCH /api/contributor/application — readable only by them and the
//  admins) and copied onto the profile when the application is approved.
//  Profile only: events, places and news come after approval (RESUME C18).
//
//  Demo mode (no signed-in user) has no server, so saves stay in the local
//  application object, which the demo admin's Approve then promotes.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect } = React;
  const { cx, Button, Field, Input, Textarea, Toggle, MediaPicker } = window.UI;
  const Icon = window.Icon;

  const MAX_BIO = 1000;
  const REVIEW_BANNER = 'Thanks! Your listing is being reviewed. You can finish your profile meanwhile; it goes on the map once approved.';

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  // The editor's form state from an application row (server shape) or the local
  // demo application (store shape).
  function formFromRow(row) {
    const D = window.DATA;
    const socials = row.socials || D.socialsFromRow(row, D.SOCIAL_COLUMNS.contributor);
    const covers = Array.isArray(row.cover_photo_urls) ? row.cover_photo_urls : [];
    const firstCover = covers[0];
    return {
      name: row.display_name || row.name || '',
      bio: row.bio || '',
      website: row.website_url || row.website || '',
      contactEmail: row.contributor_contact_email || row.contactEmail || '',
      logo: row.logo_url || row.photo || '',
      cover: row.coverPhoto || (firstCover && (typeof firstCover === 'string' ? firstCover : firstCover.url)) || '',
      location: row.physical_address != null ? row.physical_address : (row.location || ''),
      lat: row.physical_latitude != null ? row.physical_latitude : (row.lat != null ? row.lat : null),
      lng: row.physical_longitude != null ? row.physical_longitude : (row.lng != null ? row.lng : null),
      noFixedLocation: !!(row.no_fixed_location != null ? row.no_fixed_location : row.noFixedLocation),
      socials,
    };
  }

  function payloadFromForm(f) {
    return {
      display_name: f.name.trim(),
      bio: f.bio,
      website_url: f.website,
      contributor_contact_email: f.contactEmail,
      logo_url: f.logo || null,
      cover_photo_urls: f.cover ? [f.cover] : [],
      no_fixed_location: !!f.noFixedLocation,
      physical_address: f.noFixedLocation ? null : (f.location || null),
      physical_latitude: f.noFixedLocation ? null : (typeof f.lat === 'number' ? f.lat : null),
      physical_longitude: f.noFixedLocation ? null : (typeof f.lng === 'number' ? f.lng : null),
      // A blank is sent as null so a removed handle really clears.
      ...window.DATA.socialsToRow(f.socials, 'contributor'),
    };
  }

  function ReviewBanner({ submittedAt }) {
    return h('div', { className: 'rounded-2xl bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A]/50 border border-[#D97706]/20 p-4 flex items-start gap-3', 'data-testid': 'pending-banner' },
      h('div', { className: 'w-10 h-10 rounded-2xl bg-[#D97706] flex items-center justify-center shrink-0' }, h(Icon, { name: 'Clock', size: 18, className: 'text-white' })),
      h('div', { className: 'min-w-0' },
        h('h1', { className: 'text-[#92400E] text-base leading-tight mb-1' }, 'Your application is being reviewed'),
        h('p', { className: 'text-xs text-[#92400E]/90 leading-relaxed' }, REVIEW_BANNER),
        h('p', { className: 'text-[11px] text-[#92400E]/70 mt-1.5 leading-relaxed' },
          'Nothing here is public until an admin approves it. You will get a notification and an email once it is decided.' + (submittedAt ? ' Submitted ' + fmtDate(submittedAt) + '.' : ''))));
  }

  function RejectedPanel({ reason, onApplyAgain, onLeave }) {
    return h('div', { className: 'rounded-2xl bg-[#FEE2E2]/60 border border-[#DC2626]/20 p-4 space-y-3', 'data-testid': 'rejected-panel' },
      h('div', { className: 'flex items-start gap-3' },
        h('div', { className: 'w-10 h-10 rounded-2xl bg-[#DC2626] flex items-center justify-center shrink-0' }, h(Icon, { name: 'XCircle', size: 18, className: 'text-white' })),
        h('div', { className: 'min-w-0' },
          h('h1', { className: 'text-[#991B1B] text-base leading-tight mb-1' }, "Your application wasn't approved this time"),
          reason && h('p', { className: 'text-xs text-[#991B1B]/90 leading-relaxed' }, reason),
          h('p', { className: 'text-[11px] text-[#991B1B]/70 mt-1.5 leading-relaxed' }, 'This is not a closed door. Make those changes and apply again whenever you are ready.'))),
      h('div', { className: 'flex gap-2' },
        h(Button, { variant: 'gold', className: 'flex-1', icon: 'Crown', onClick: onApplyAgain }, 'Apply again'),
        h(Button, { variant: 'outline', className: 'flex-1', onClick: onLeave }, 'Back to the map')));
  }

  function PendingApplicationPage() {
    const { go, realUser, toast, myApplication, updateMyApplication, setContributorStatus } = window.useApp();
    const SocialInputs = window.ApplyParts && window.ApplyParts.SocialInputs;
    const [loading, setLoading] = useState(!!realUser);
    const [loadError, setLoadError] = useState(false);
    const [decided, setDecided] = useState(null); // null | { status: 'rejected', reason }
    const [submittedAt, setSubmittedAt] = useState(myApplication ? myApplication.submittedAt : null);
    const [f, setF] = useState(() => formFromRow(myApplication || {}));
    const [saving, setSaving] = useState(false);

    // Real mode: load the staged application. If an admin has decided since the
    // last visit, say so (approved → reload so the new role is picked up).
    useEffect(() => {
      if (!realUser) return undefined;
      let active = true;
      (async () => {
        try {
          const res = await window.authedFetch('/api/contributor/application');
          if (!res.ok) throw new Error('application ' + res.status);
          const { data } = await res.json();
          if (!active) return;
          if (data && data.status === 'approved') { window.location.reload(); return; }
          if (data && data.status === 'rejected') {
            setDecided({ status: 'rejected', reason: data.rejection_reason || '' });
          } else if (data) {
            setF(formFromRow(data));
            setSubmittedAt(data.submitted_at);
          }
          setLoading(false);
        } catch (e) {
          if (!active) return;
          console.warn('[pending application]', e);
          setLoadError(true);
          setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [realUser && realUser.id]);

    const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
    const ups = (k, v) => setF((s) => ({ ...s, socials: { ...s.socials, [k]: v } }));
    const setLoc = (patch) => setF((s) => ({
      ...s,
      location: patch.address !== undefined ? patch.address : s.location,
      lat: patch.lat !== undefined ? patch.lat : s.lat,
      lng: patch.lng !== undefined ? patch.lng : s.lng,
    }));
    const setNoFixedLocation = (v) => setF((s) => ({ ...s, noFixedLocation: v, location: v ? '' : s.location, lat: v ? null : s.lat, lng: v ? null : s.lng }));

    const canSave = f.name.trim().length >= 2 && !saving;
    const save = async () => {
      if (!canSave) return;
      setSaving(true);
      if (!realUser) {
        // Demo mode: stays in the local application; the demo admin's Approve promotes it.
        updateMyApplication({
          name: f.name.trim(), bio: f.bio, website: f.website, contactEmail: f.contactEmail,
          photo: f.logo, coverPhoto: f.cover, socials: f.socials,
          location: f.noFixedLocation ? '' : f.location, lat: f.noFixedLocation ? null : f.lat, lng: f.noFixedLocation ? null : f.lng,
          noFixedLocation: !!f.noFixedLocation,
        });
        toast('Saved. It goes live once your application is approved.', 'green');
        setSaving(false);
        return;
      }
      try {
        const res = await window.authedFetch('/api/contributor/application', { method: 'PATCH', body: JSON.stringify(payloadFromForm(f)) });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          toast('Saved. It goes live once your application is approved.', 'green');
        } else if (res.status === 409) {
          toast('Your application has just been decided. Refreshing…', 'gold');
          setTimeout(() => window.location.reload(), 1200);
        } else {
          // A 400 is a field-level sentence written for the applicant.
          toast((res.status === 400 && typeof body.error === 'string' && body.error) || 'Could not save. Please try again.', 'red');
        }
      } catch (e) {
        console.warn('[pending application] save', e);
        toast('Could not save. Please check your connection and try again.', 'red');
      }
      setSaving(false);
    };

    const leaveRejected = (page) => { setContributorStatus('rejected'); go(page); };

    return h('div', { className: 'flex-1 flex flex-col h-full bg-background', 'data-screen': 'pending-application' },
      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto' },
        h('div', { className: 'max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-40 md:pb-10 space-y-4' },
          decided
            ? h(RejectedPanel, { reason: decided.reason, onApplyAgain: () => leaveRejected('apply'), onLeave: () => leaveRejected('home') })
            : h(ReviewBanner, { submittedAt }),

          !decided && loading && h('p', { className: 'text-xs text-muted-foreground text-center py-6' }, 'Loading your application…'),
          !decided && loadError && h('p', { className: 'text-xs text-destructive text-center py-4' }, "We couldn't load your saved profile. Refresh to try again."),

          !decided && !loading && !loadError && h('div', { className: 'bg-card rounded-2xl border border-border p-4 space-y-4 fade-in' },
            h('div', null,
              h('h2', { className: 'text-lg text-foreground' }, 'Finish your profile'),
              h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, 'This is what citizens will see once you are approved. Only you and our admins can see it until then.')),
            h(Field, { label: 'Cover photo' }, h(MediaPicker, { value: f.cover, onChange: (v) => up('cover', v), aspect: '16/6', label: 'cover', scope: 'event-cover' })),
            h('div', { className: 'flex gap-4 items-start' },
              h('div', { className: 'w-24 shrink-0' }, h(Field, { label: 'Logo' }, h(MediaPicker, { value: f.logo, onChange: (v) => up('logo', v), aspect: '1/1', label: 'logo', scope: 'event-cover' }))),
              h('div', { className: 'flex-1 min-w-0' },
                h(Field, { label: 'Organisation / ministry name', required: true }, h(Input, { value: f.name, onChange: (e) => up('name', e.target.value) })))),
            h(Field, { label: 'Bio', hint: f.bio.length + '/' + MAX_BIO }, h(Textarea, { value: f.bio, rows: 3, maxLength: MAX_BIO, onChange: (e) => up('bio', e.target.value), placeholder: 'Tell citizens who you are…' })),
            h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
              h(Field, { label: 'Website' }, h(Input, { value: f.website, onChange: (e) => up('website', e.target.value), placeholder: 'yourministry.org' })),
              h(Field, { label: 'Public contact email', hint: 'Shown to citizens. Different from your sign-in email.' }, h(Input, { type: 'email', value: f.contactEmail, onChange: (e) => up('contactEmail', e.target.value), placeholder: 'hello@yourministry.org' }))),
            h(Field, { label: 'Location', hint: f.noFixedLocation ? undefined : 'Drag the map or use the pin button. The address fills in automatically.' },
              h('div', { className: 'space-y-2' },
                !f.noFixedLocation && h(Input, { value: f.location, onChange: (e) => setLoc({ address: e.target.value }) }),
                !f.noFixedLocation && h(window.LocationPicker, { value: { address: f.location, lat: f.lat, lng: f.lng }, onChange: setLoc }),
                h(Toggle, {
                  checked: f.noFixedLocation, onChange: setNoFixedLocation,
                  label: "I don't have a fixed physical location",
                  desc: "We're online, mobile, or serve without a permanent office. No map pin needed.",
                }))),
            SocialInputs && h(Field, { label: 'Social media', hint: 'A link or just the handle. Either works.' }, h(SocialInputs, { socials: f.socials, onChange: ups })),
            h(Button, { variant: 'gold', icon: 'Check', disabled: !canSave, onClick: save, className: 'w-full' }, saving ? 'Saving…' : 'Save changes')),

          !decided && h('p', { className: 'text-[11px] text-muted-foreground text-center leading-relaxed px-4' },
            'Events, places and news open up as soon as you are approved. Meanwhile you can still browse the map and follow other Contributors.'))));
  }

  window.PendingApplicationPage = PendingApplicationPage;
})();
