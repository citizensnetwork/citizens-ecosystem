// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Apply to become Contributor + Onboarding
// ════════════════════════════════════════════════════════════════════
//  V1 SCOPE NOTE (see V1_SCOPE.md at repo root): an application WAITS for an
//  admin (founder decision D-12, migration 180); the self-approving v1 path
//  of migration 164 is gone. The wizard below is the required path (3 steps:
//  about / story / review); the applicant finishes their profile (logo, cover,
//  socials) from the pending Dashboard — pending-application.jsx — while they
//  wait. SocialInputs is shared with that screen through window.ApplyParts.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState } = React;
  const { cx, Field, Input, Textarea, Button, Toggle, MediaPicker, Stepper, Avatar } = window.UI;
  const Icon = window.Icon;

  // Canonical platform list (icon + URL-builder) lives in data.jsx — reused
  // here for input icons and by profiles.jsx for the public display links.
  const SOCIALS = window.DATA.SOCIAL_PLATFORMS;

  // single-select Contributor-type grid (the 12 types, not event categories)
  function CategoryGrid({ value, onChange }) {
    return h('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1 -mr-1' },
      window.DATA.CONTRIBUTOR_TYPES.map((c) => {
        const sel = value === c.id;
        return h('button', {
          key: c.id, type: 'button', onClick: () => onChange(c.id),
          className: cx('flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left', sel ? 'border-transparent text-white shadow-md' : 'border-border bg-white/60 hover:bg-white'),
          style: sel ? { background: c.hex } : undefined,
        },
          h('span', { className: 'w-7 h-7 rounded-lg flex items-center justify-center shrink-0', style: sel ? { background: 'rgba(255,255,255,0.25)' } : { background: c.hex + '1c', color: c.hex } },
            h(Icon, { name: c.icon, size: 14 })),
          h('span', { className: cx('text-xs font-semibold truncate', sel ? 'text-white' : 'text-foreground') }, c.name));
      }));
  }

  function SocialInputs({ socials, onChange }) {
    return h('div', { className: 'space-y-2' },
      SOCIALS.map((s) => h('div', { key: s.key, className: 'flex items-center gap-2 px-3 py-2 bg-white/70 border border-border rounded-xl focus-within:border-gold/60' },
        h('span', { className: 'w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0' }, h(Icon, { name: s.icon, size: 14, className: 'text-gold-dark' })),
        h('input', { value: socials[s.key] || '', onChange: (e) => onChange(s.key, e.target.value), placeholder: s.placeholder || s.label, 'aria-label': s.label, className: 'flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/70' }))));
  }

  // ── Shared wizard shell ──
  function Wizard({ hero, steps, step, setStep, onClose, onComplete, completeLabel, busy }) {
    const cur = steps[step];
    const last = step === steps.length - 1;
    const canNext = (cur.valid ? cur.valid() : true) && !(last && busy);
    return h('div', { className: 'flex-1 flex flex-col h-full bg-background', 'data-screen': 'apply' },
      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto' },
        h('div', { className: 'max-w-xl mx-auto px-4 sm:px-6 pt-5 pb-40 md:pb-8' },
          // header
          h('div', { className: 'flex items-center justify-between mb-4' },
            h('button', { onClick: step === 0 ? onClose : () => setStep(step - 1), className: 'flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground' },
              h(Icon, { name: 'ArrowLeft', size: 16 }), step === 0 ? 'Cancel' : 'Back'),
            h('span', { className: 'text-xs font-bold text-muted-foreground' }, 'Step ' + (step + 1) + ' of ' + steps.length)),
          // hero
          hero,
          h('div', { className: 'mb-6' }, h(Stepper, { steps, current: step })),
          // step title
          h('h2', { className: 'text-2xl text-foreground mb-1' }, cur.title),
          cur.subtitle && h('p', { className: 'text-sm text-muted-foreground mb-5' }, cur.subtitle),
          h('div', { className: 'space-y-4' }, cur.node))),
      // sticky footer
      h('div', { className: 'shrink-0 border-t border-border glass-strong px-4 sm:px-6 py-3 fixed bottom-16 md:static left-0 right-0 z-10' },
        h('div', { className: 'max-w-xl mx-auto flex gap-3' },
          step > 0 && h(Button, { variant: 'outline', onClick: () => setStep(step - 1), className: 'flex-1' }, 'Back'),
          h(Button, { variant: 'gold', disabled: !canNext, className: 'flex-[2]', iconRight: last ? null : 'ArrowRight', icon: last ? 'Check' : null, onClick: () => (last ? onComplete() : setStep(step + 1)) }, last ? completeLabel : 'Continue'))));
  }

  // ── Apply page ──
  function ApplyPage() {
    const { submitApplication, go } = window.useApp();
    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [f, setF] = useState({ orgName: '', location: '', lat: null, lng: null, category: '', bio: '', website: '', socials: {}, noFixedLocation: false });
    const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
    const setNoFixedLocation = (v) => setF((s) => ({ ...s, noFixedLocation: v, location: v ? '' : s.location, lat: v ? null : s.lat, lng: v ? null : s.lng }));
    // Merges a LocationPicker patch ({address?, lat?, lng?}) into the wizard
    // form — the picker sends only whichever field(s) actually changed.
    const setLoc = (patch) => setF((s) => ({
      ...s,
      location: patch.address !== undefined ? patch.address : s.location,
      lat: patch.lat !== undefined ? patch.lat : s.lat,
      lng: patch.lng !== undefined ? patch.lng : s.lng,
    }));

    const hero = h('div', { className: 'rounded-2xl gold-gradient p-5 mb-5 relative overflow-hidden' },
      h('div', { className: 'absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/15' }),
      h('div', { className: 'absolute -right-2 bottom-2 w-16 h-16 rounded-full bg-white/10' }),
      h('div', { className: 'relative' },
        h('div', { className: 'w-11 h-11 rounded-2xl bg-white/25 flex items-center justify-center mb-3' }, h(Icon, { name: 'Crown', size: 20, className: 'text-white' })),
        h('h1', { className: 'text-white text-xl mb-1' }, 'Become a Contributor'),
        h('p', { className: 'text-white/85 text-xs leading-relaxed max-w-sm' }, 'Contributors create events & places, broadcast updates, message citizens, and lead Kingdom initiatives across the map.')));

    const cat = window.DATA.getEventCategory(f.category);
    const steps = [
      {
        title: 'About your ministry', subtitle: 'Tell us who you are and where you serve.',
        valid: () => f.orgName.trim() && f.category && (f.noFixedLocation || f.location.trim()),
        node: h(F, null,
          h(Field, { label: 'Organisation / ministry name', required: true }, h(Input, { value: f.orgName, onChange: (e) => up('orgName', e.target.value), placeholder: 'e.g. New Wine Fellowship' })),
          h(Field, { label: 'Area / location served', required: !f.noFixedLocation, hint: f.noFixedLocation ? undefined : 'Drag the map or use the pin button — the address fills in automatically.' },
            h('div', { className: 'space-y-2' },
              !f.noFixedLocation && h(Input, { value: f.location, onChange: (e) => setLoc({ address: e.target.value }), placeholder: 'e.g. Eastside, Central District' }),
              !f.noFixedLocation && h(window.LocationPicker, { value: { address: f.location, lat: f.lat, lng: f.lng }, onChange: setLoc }),
              h(Toggle, {
                checked: f.noFixedLocation, onChange: setNoFixedLocation,
                label: "I don't have a fixed physical location",
                desc: "We're online, mobile, or serve without a permanent office — no map pin needed.",
              }))),
          h(Field, { label: 'Primary category', required: true, hint: 'This sets your colour & icon across the map.' }, h(CategoryGrid, { value: f.category, onChange: (v) => up('category', v)})) ),
      },
      // Short bio only (optional), plus Website folded in from the old
      // "Links & socials" step. The multi-network socials, logo and cover are
      // added from the pending Dashboard right after submitting.
      {
        title: 'Your story', subtitle: 'A little about who you are.',
        node: h(F, null,
          h(Field, { label: 'Short bio / about', hint: f.bio.length + '/240' }, h(Textarea, { value: f.bio, maxLength: 240, rows: 3, onChange: (e) => up('bio', e.target.value), placeholder: 'A vibrant community committed to…' })),
          h(Field, { label: 'Website' }, h(Input, { value: f.website, onChange: (e) => up('website', e.target.value), placeholder: 'yourministry.org' }))),
      },
      {
        title: 'Review & submit', subtitle: 'Confirm everything looks right.',
        node: h('div', { className: 'space-y-3' },
          h('div', { className: 'p-4 rounded-2xl bg-card border border-border space-y-3' },
            h('div', { className: 'flex items-center gap-3' },
              cat && h('span', { className: 'w-10 h-10 rounded-xl flex items-center justify-center', style: { background: cat.hex } }, h(Icon, { name: cat.icon, size: 18, className: 'text-white' })),
              h('div', null,
                h('p', { className: 'font-bold text-foreground' }, f.orgName || 'Your ministry'),
                h('p', { className: 'text-xs text-muted-foreground' }, (cat ? cat.name : 'Category') + ' · ' + (f.noFixedLocation ? 'Online / no fixed location' : (f.location || 'Location'))))),
            h(ReviewRow, { label: 'About', value: f.bio }),
            f.website && h(ReviewRow, { label: 'Website', value: f.website })),
          h('div', { className: 'flex items-start gap-2 p-3 rounded-xl bg-accent/60 text-gold-dark' },
            h(Icon, { name: 'Sparkles', size: 15, className: 'shrink-0 mt-0.5' }),
            h('p', { className: 'text-xs leading-relaxed' }, "An admin reviews every application before it goes on the map. You can add your logo and contact details from your Dashboard while you wait."))),
      },
    ];

    const submit = () => {
      if (submitting) return;
      setSubmitting(true);
      submitApplication(f, (ok) => { setSubmitting(false); });
    };

    return h(Wizard, {
      hero, steps, step, setStep, onClose: () => go('home'), onComplete: submit,
      completeLabel: submitting ? 'Submitting…' : 'Submit application', busy: submitting,
    });
  }
  const ReviewRow = ({ label, value }) => value ? h('div', null,
    h('p', { className: 'text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5' }, label),
    h('p', { className: 'text-xs text-foreground leading-relaxed' }, value)) : null;

  // ── Onboarding page ──
  //  Since D-12 an applicant finishes their profile on the pending Dashboard,
  //  and approval copies it across, so nothing routes here in the normal flow.
  //  It stays as the profile-setup wizard for an already-approved Contributor.
  function OnboardingPage() {
    const { completeOnboarding, go, myApplication } = window.useApp();
    const [step, setStep] = useState(0);
    const ma = myApplication || {};
    const [f, setF] = useState({
      name: ma.name || '', category: ma.category || 'churches-ministries', bio: ma.bio || '',
      location: ma.location || '', lat: ma.lat ?? null, lng: ma.lng ?? null, website: ma.website || '', contactEmail: '',
      // No stock stand-ins: empty → MediaPicker offers upload, and the profile
      // falls back to honest initials/category tiles until real art is added.
      profilePhoto: '',
      coverPhoto: '',
      members: [], socials: ma.socials || {},
      noFixedLocation: !!ma.noFixedLocation,
    });
    const [member, setMember] = useState('');
    const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
    const ups = (k, v) => setF((s) => ({ ...s, socials: { ...s.socials, [k]: v } }));
    const setLoc = (patch) => setF((s) => ({
      ...s,
      location: patch.address !== undefined ? patch.address : s.location,
      lat: patch.lat !== undefined ? patch.lat : s.lat,
      lng: patch.lng !== undefined ? patch.lng : s.lng,
    }));
    const setNoFixedLocation = (v) => setF((s) => ({ ...s, noFixedLocation: v, location: v ? '' : s.location, lat: v ? null : s.lat, lng: v ? null : s.lng }));

    const hero = h('div', { className: 'rounded-2xl bg-gradient-to-br from-[#DCFCE7] to-[#bbf7d0]/60 p-5 mb-5 flex items-center gap-3' },
      h('div', { className: 'w-11 h-11 rounded-2xl bg-[#16A34A] flex items-center justify-center shrink-0' }, h(Icon, { name: 'PartyPopper', size: 20, className: 'text-white' })),
      h('div', null,
        h('h1', { className: 'text-[#15803d] text-lg leading-tight' }, 'Set up your profile'),
        h('p', { className: 'text-[#15803d]/80 text-xs' }, 'Add your logo, cover and contact details so citizens can find you.')));

    const steps = [
      {
        title: 'Brand your profile', subtitle: 'Your logo & cover are the first thing citizens see.',
        node: h(F, null,
          h(Field, { label: 'Cover photo' }, h(MediaPicker, { value: f.coverPhoto, onChange: (v) => up('coverPhoto', v), aspect: '16/6', label: 'cover', scope: 'event-cover' })),
          h(Field, { label: 'Logo / profile photo' }, h('div', { className: 'w-28' }, h(MediaPicker, { value: f.profilePhoto, onChange: (v) => up('profilePhoto', v), aspect: '1/1', label: 'logo', scope: 'event-cover' }))),
          h(Field, { label: 'Organisation name', required: true }, h(Input, { value: f.name, onChange: (e) => up('name', e.target.value) }))),
      },
      {
        title: 'About & contact',
        node: h(F, null,
          h(Field, { label: 'Bio' }, h(Textarea, { value: f.bio, rows: 3, onChange: (e) => up('bio', e.target.value) })),
          h(Field, { label: 'Location', hint: f.noFixedLocation ? undefined : 'Drag the map or use the pin button — the address fills in automatically.' },
            h('div', { className: 'space-y-2' },
              !f.noFixedLocation && h(Input, { value: f.location, onChange: (e) => setLoc({ address: e.target.value }) }),
              !f.noFixedLocation && h(window.LocationPicker, { value: { address: f.location, lat: f.lat, lng: f.lng }, onChange: setLoc }),
              h(Toggle, {
                checked: f.noFixedLocation, onChange: setNoFixedLocation,
                label: "I don't have a fixed physical location",
                desc: "We're online, mobile, or serve without a permanent office — no map pin needed.",
              }))),
          h('div', { className: 'grid grid-cols-2 gap-3' },
            h(Field, { label: 'Contact email' }, h(Input, { value: f.contactEmail, onChange: (e) => up('contactEmail', e.target.value), placeholder: 'hello@…' })),
            h(Field, { label: 'Website' }, h(Input, { value: f.website, onChange: (e) => up('website', e.target.value) })))),
      },
      // DEFER TO V2: team roster + socials are enrichment, not required for a
      // v1 listing to exist and be findable.
      {
        title: 'Team & socials', subtitle: 'Add the people and channels behind your ministry.',
        node: h(F, null,
          h(Field, { label: 'Team members' },
            h('div', { className: 'flex gap-2 mb-2' },
              h('input', { value: member, onChange: (e) => setMember(e.target.value), placeholder: 'Add a team member…', className: window.UI.inputCls, onKeyDown: (e) => { if (e.key === 'Enter' && member.trim()) { up('members', [...f.members, member.trim()]); setMember(''); } } }),
              h(Button, { variant: 'soft', icon: 'Plus', onClick: () => { if (member.trim()) { up('members', [...f.members, member.trim()]); setMember(''); } } }, 'Add')),
            h('div', { className: 'flex flex-wrap gap-1.5' },
              f.members.map((m, i) => h('span', { key: i, className: 'flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-accent text-gold-dark text-xs font-semibold' },
                m, h('button', { onClick: () => up('members', f.members.filter((_, j) => j !== i)) }, h(Icon, { name: 'X', size: 11 })))))),
          h(Field, { label: 'Social media' }, h(SocialInputs, { socials: f.socials, onChange: ups }))),
      },
    ];

    return h(Wizard, { hero, steps, step, setStep, onClose: () => go('home'), onComplete: () => completeOnboarding(f), completeLabel: 'Save profile' });
  }

  // Shared with pending-application.jsx (the pending Dashboard's profile editor).
  window.ApplyParts = { SocialInputs };
  window.ApplyPage = ApplyPage;
  window.OnboardingPage = OnboardingPage;
})();
