// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Kingdom Projects · Settings · Notifications
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState } = React;
  const { cx, Avatar, Button, Field, Input, Textarea, Toggle, Segmented, MediaPicker, Empty } = window.UI;
  const Icon = window.Icon;

  function Header({ icon, title, sub, right }) {
    return h('div', { className: 'px-4 sm:px-5 pt-5 pb-4 border-b border-border glass-strong shrink-0 flex items-center gap-3' },
      icon && h('div', { className: 'w-10 h-10 rounded-2xl bg-accent flex items-center justify-center' }, h(Icon, { name: icon, size: 18, className: 'text-gold-dark' })),
      h('div', { className: 'flex-1' }, h('h2', { className: 'text-xl text-foreground leading-none' }, title), sub && h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, sub)),
      right);
  }

  // ── Kingdom Projects ──
  // Lead-only kickoff scheduler (founder decision: the event exists only once
  // the lead picks a real date — voters are then auto-connected).
  function ScheduleKickoff({ idea }) {
    const { scheduleKingdomProject } = window.useApp();
    const [date, setDate] = useState('');
    const [time, setTime] = useState('10:00');
    const [location, setLocation] = useState('');
    const [busy, setBusy] = useState(false);
    const valid = date && time;
    const submit = () => {
      if (!valid || busy) return;
      const start = new Date(date + 'T' + time);
      if (isNaN(start.getTime()) || start < new Date()) return;
      setBusy(true);
      scheduleKingdomProject(idea.id, start.toISOString(), null, location.trim() || null, () => setBusy(false));
    };
    return h('div', { className: 'mt-2 p-3 rounded-xl bg-white/70 border border-gold/30 space-y-2' },
      h('p', { className: 'text-xs font-bold text-gold-dark flex items-center gap-1.5' }, h(Icon, { name: 'CalendarPlus', size: 13 }), 'You lead this project — schedule the kickoff'),
      h('div', { className: 'grid grid-cols-2 gap-2' },
        h('input', { type: 'date', value: date, onChange: (e) => setDate(e.target.value), className: window.UI.inputCls }),
        h('input', { type: 'time', value: time, onChange: (e) => setTime(e.target.value), className: window.UI.inputCls })),
      h(Input, { value: location, onChange: (e) => setLocation(e.target.value), placeholder: 'Kickoff location (optional)' }),
      h(Button, { variant: 'gold', size: 'sm', className: 'w-full', icon: 'Rocket', disabled: !valid || busy, onClick: submit }, busy ? 'Scheduling…' : 'Schedule & connect voters'));
  }

  function IdeaCard({ idea }) {
    const { toggleIdeaVote, confirmIdea, realUser, isAdmin, go } = window.useApp();
    const cat = window.DATA.getCategory(idea.category);
    const voted = !!idea.votedByMe;
    const pct = Math.min(100, Math.round((idea.votes / idea.threshold) * 100));
    const confirmed = idea.status === 'confirmed';
    const inProcess = idea.status === 'inProcess';
    const isLead = !!(realUser && idea.projectLeadId === realUser.id);
    return h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden' },
      h('div', { className: 'p-4' },
        h('div', { className: 'flex items-center justify-between mb-2' },
          h('div', { className: 'flex items-center gap-2' },
            h(Avatar, { src: idea.authorPhoto, name: idea.authorName, size: 24, rounded: 'full' }),
            h('span', { className: 'text-xs text-muted-foreground' }, idea.authorName)),
          h('div', { className: 'flex items-center gap-1.5' },
            idea.tierLabel && h('span', { className: 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground' }, idea.tierLabel),
            cat && h('span', { className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold', style: { background: cat.hex + '1c', color: cat.hex } }, h(Icon, { name: cat.icon, size: 9 }), cat.short))),
        h('h3', { className: 'text-base text-foreground leading-tight mb-1' }, idea.title),
        h('p', { className: 'text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-3' }, idea.description),
        confirmed
          ? h('div', { className: 'flex items-center gap-2 p-2.5 rounded-xl bg-[#DCFCE7] text-[#15803d]' }, h(Icon, { name: 'CheckCircle2', size: 15 }),
              h('span', { className: 'text-xs font-bold' }, 'Confirmed Kingdom Project' + (typeof idea.collaborators === 'number' ? ' · ' + idea.collaborators + ' collaborators' : '')))
          : inProcess
            ? h(F, null,
                h('div', { className: 'flex items-center gap-2 p-2.5 rounded-xl bg-[#FEF3C7] text-[#92400E]' }, h(Icon, { name: 'Hammer', size: 15 }),
                  h('span', { className: 'text-xs font-bold' }, 'In Process — goal reached with ' + idea.votes.toLocaleString() + ' votes')),
                idea.associatedEventId
                  ? h(Button, { variant: 'soft', size: 'sm', className: 'w-full mt-2', icon: 'Calendar', onClick: () => go('event', { id: idea.associatedEventId }) }, 'View the kickoff event')
                  : (isLead && h(ScheduleKickoff, { idea })),
                isAdmin && h(Button, { variant: 'success', size: 'sm', className: 'w-full mt-2', icon: 'CheckCircle2', onClick: () => confirmIdea(idea.id) }, 'Mark as Confirmed Kingdom Project'))
            : h(F, null,
                h('div', { className: 'flex items-center justify-between mb-1' },
                  h('span', { className: 'text-xs font-bold text-foreground' }, idea.votes.toLocaleString() + ' of ' + idea.threshold.toLocaleString() + ' votes'),
                  h('span', { className: 'text-[10px] text-muted-foreground' }, pct + '% to goal')),
                h('div', { className: 'h-2 rounded-full bg-muted overflow-hidden mb-3' }, h('div', { className: 'h-full gold-gradient rounded-full transition-all', style: { width: pct + '%' } })),
                h(Button, { variant: voted ? 'success' : 'gold', size: 'sm', className: 'w-full', icon: voted ? 'Check' : 'ThumbsUp', onClick: () => toggleIdeaVote(idea.id) }, voted ? 'Voted to collaborate — tap to undo' : 'Collaborate'))));
  }

  // Tier ranges mirror the server's validation (spec §4.2): the submitter picks
  // an exact goal within the tier's range; the top two tiers are fixed.
  const IDEA_TIERS = [
    { id: 'small_volunteer', label: 'Small Volunteer', min: 1, max: 20 },
    { id: 'community', label: 'Community', min: 20, max: 100 },
    { id: 'town', label: 'Town', min: 100, max: 1000 },
    { id: 'funders_challenge', label: 'Funders Challenge', min: 5000, max: 5000, fixed: true },
    { id: 'provincial_vision', label: 'Provincial Vision', min: 10000, max: 10000, fixed: true },
  ];
  function IdeaComposer({ onClose }) {
    const { submitIdea } = window.useApp();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [tierId, setTierId] = useState('community');
    const [threshold, setThreshold] = useState(50);
    const [busy, setBusy] = useState(false);
    const tier = IDEA_TIERS.find((t) => t.id === tierId);
    const goal = tier.fixed ? tier.min : Math.min(tier.max, Math.max(tier.min, threshold));
    const valid = title.trim().length >= 3 && description.trim().length >= 10;
    const pickTier = (t) => { setTierId(t.id); setThreshold(t.fixed ? t.min : Math.min(t.max, Math.max(t.min, threshold))); };
    const submit = () => {
      if (!valid || busy) return;
      setBusy(true);
      submitIdea({ title: title.trim(), description: description.trim(), category, tier: tierId, tierLabel: tier.label, voteThreshold: goal },
        (ok) => { setBusy(false); if (ok) onClose(); });
    };
    return h('div', { className: 'bg-card rounded-2xl border border-gold/40 p-4 space-y-4' },
      h('div', { className: 'flex items-center justify-between' },
        h('p', { className: 'text-sm font-bold text-foreground flex items-center gap-2' }, h(Icon, { name: 'Lightbulb', size: 15, className: 'text-gold-dark' }), 'Post an Impact Idea'),
        h('button', { onClick: onClose, className: 'w-7 h-7 rounded-lg hover:bg-accent/60 flex items-center justify-center text-muted-foreground' }, h(Icon, { name: 'X', size: 15 }))),
      h(Field, { label: 'Title' }, h(Input, { value: title, onChange: (e) => setTitle(e.target.value), placeholder: 'What should we build together?' })),
      h(Field, { label: 'Description' }, h(Textarea, { value: description, rows: 3, onChange: (e) => setDescription(e.target.value), placeholder: 'Describe the need, the vision, and what collaboration looks like…' })),
      h(Field, { label: 'Category' },
        h('div', { className: 'flex flex-wrap gap-1.5' }, window.DATA.EVENT_CATEGORIES.map((c) =>
          h('button', { key: c.id, onClick: () => setCategory(category === c.id ? '' : c.id), className: 'px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors', style: category === c.id ? { background: c.hex, color: '#fff', borderColor: c.hex } : { borderColor: 'rgba(240,192,36,0.25)', color: '#7A7060' } }, c.short)))),
      h(Field, { label: 'Project tier' },
        h('div', { className: 'flex flex-wrap gap-1.5' }, IDEA_TIERS.map((t) =>
          h('button', { key: t.id, onClick: () => pickTier(t), className: cx('px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors', tierId === t.id ? 'gold-gradient text-black border-transparent' : 'border-border text-muted-foreground hover:border-gold/40') }, t.label)))),
      h(Field, { label: 'Vote goal — ' + goal.toLocaleString() + ' votes' + (tier.fixed ? ' (fixed for this tier)' : '') },
        tier.fixed
          ? h('p', { className: 'text-xs text-muted-foreground' }, tier.label + ' projects always require ' + tier.min.toLocaleString() + ' votes and are reviewed by an admin once reached.')
          : h('input', { type: 'range', min: tier.min, max: tier.max, value: goal, onChange: (e) => setThreshold(Number(e.target.value)), className: 'w-full accent-[#F0C024]' })),
      h(Button, { variant: 'gold', className: 'w-full', icon: 'Send', disabled: !valid || busy, onClick: submit }, busy ? 'Posting…' : 'Post Idea'));
  }

  function CommunityPage() {
    const { ideas } = window.useApp();
    const [tab, setTab] = useState('voting');
    const [composing, setComposing] = useState(false);
    const map = { voting: 'voting', process: 'inProcess', confirmed: 'confirmed' };
    const list = ideas.filter((i) => i.status === map[tab]);
    return h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'community' },
      h(Header, { icon: 'Lightbulb', title: 'Kingdom Projects', sub: 'Community ideas, voting & collaboration',
        right: h(Button, { variant: 'gold', size: 'sm', icon: 'Plus', onClick: () => setComposing((c) => !c) }, 'Post Idea') }),
      h('div', { className: 'px-4 sm:px-5 py-3 border-b border-border' }, h(Segmented, { options: [{ value: 'voting', label: 'Voting Now' }, { value: 'process', label: 'In Process' }, { value: 'confirmed', label: 'Confirmed' }], value: tab, onChange: setTab })),
      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-8 px-4 sm:px-5 py-4' },
        h('div', { className: 'max-w-2xl mx-auto space-y-4 fade-in' },
          composing && h(IdeaComposer, { onClose: () => setComposing(false) }),
          tab === 'voting' && h('div', { className: 'flex items-start gap-2 p-3 rounded-xl bg-accent/60 text-gold-dark mb-1' },
            h(Icon, { name: 'Info', size: 15, className: 'shrink-0 mt-0.5' }),
            h('p', { className: 'text-xs leading-relaxed' }, 'Ideas that reach their vote goal become collaborative Kingdom Projects. Voting polls also appear on the Discover map.')),
          list.length === 0 ? h(Empty, { icon: 'Lightbulb', title: 'Nothing here yet', sub: tab === 'voting' ? 'Be the first — post an Impact Idea for your community.' : undefined }) : list.map((i) => h(IdeaCard, { key: i.id, idea: i })))));
  }

  // ── Notifications ──
  const NOTIF_ICON = {
    broadcast: ['Radio', '#F0C024'], friend: ['UserPlus', '#3498DB'], convince: ['Sparkles', '#9B59B6'],
    message: ['MessageCircle', '#2563EB'], idea: ['Lightbulb', '#16A34A'], event: ['Calendar', '#E67E22'],
    volunteer: ['HeartHandshake', '#16A34A'], team: ['Users', '#3498DB'], admin: ['ShieldCheck', '#F0C024'],
  };
  function NotificationsPage() {
    const { notifications, markNotifsRead, readNotification, go } = window.useApp();
    const open = (n) => {
      readNotification(n.id);
      if (n.eventId) go('event', { id: n.eventId });
      else if (n.convId) go('messages', { convId: n.convId });
    };
    return h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'notifications' },
      h(Header, { icon: 'Bell', title: 'Notifications', right: h(Button, { variant: 'ghost', size: 'sm', onClick: markNotifsRead }, 'Mark all read') }),
      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-8' },
        h('div', { className: 'max-w-2xl mx-auto' },
          notifications.length === 0 && h(Empty, { icon: 'Bell', title: 'No notifications yet', sub: 'Broadcasts, messages and event updates land here.' }),
          notifications.map((n) => {
            const [ic, c] = NOTIF_ICON[n.type] || ['Bell', '#F0C024'];
            const linked = !!(n.eventId || n.convId);
            return h('div', { key: n.id, onClick: () => open(n), role: linked ? 'button' : undefined,
              className: cx('flex items-start gap-3 px-4 sm:px-5 py-3.5 border-b border-border/50 transition-colors', !n.read && 'bg-accent/30', linked && 'cursor-pointer hover:bg-accent/40') },
              n.photo ? h('div', { className: 'relative shrink-0' }, h(Avatar, { src: n.photo, size: 42, rounded: 'xl' }), h('span', { className: 'absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background flex items-center justify-center', style: { background: c } }, h(Icon, { name: ic, size: 9, className: 'text-white' })))
                : h('div', { className: 'w-10 h-10 rounded-xl flex items-center justify-center shrink-0', style: { background: c + '20', color: c } }, h(Icon, { name: ic, size: 17 })),
              h('div', { className: 'flex-1 min-w-0' },
                h('p', { className: 'text-sm font-semibold text-foreground leading-snug' }, n.title),
                h('p', { className: 'text-xs text-muted-foreground leading-relaxed mt-0.5' }, n.body),
                h('p', { className: 'text-[10px] text-muted-foreground mt-1' }, n.time)),
              !n.read && h('span', { className: 'w-2 h-2 rounded-full bg-gold shrink-0 mt-1.5' }));
          }))));
  }

  // ── Settings ──
  // Real notification preference keys (profiles.notification_prefs — the API
  // allowlist); demo mode toggles the same keys locally.
  const NOTIF_PREFS = [
    ['event_reminders', 'Event reminders', 'Upcoming events you connected to'],
    ['contributor_updates', 'Broadcasts & updates', 'Updates from places, events & orgs you follow'],
    ['friends_activity', 'Friends', 'Friend requests & friend activity'],
    ['announcements', 'Announcements', 'Important platform announcements'],
    ['weekly_digest', 'Weekly digest', 'A weekly summary of Kingdom activity'],
  ];
  function SettingsPage() {
    const app = window.useApp();
    const { user, role, go, toast, isCitizen, signOut, updateAvatar, realUser, myProfileMeta, saveProfile, setDiscoverable, saveNotificationPref } = app;
    const { useEffect } = React;
    const [name, setName] = useState(user.name);
    const [bio, setBio] = useState(user.bio);
    const [profilePhoto, setProfilePhoto] = useState(user.profilePhoto);
    const [coverPhoto, setCoverPhoto] = useState(user.coverPhoto);
    const [saving, setSaving] = useState(false);
    const [localNotif, setLocalNotif] = useState({});
    // Re-seed once the real profile meta arrives (bio lives there).
    useEffect(() => { setName(user.name); setBio(user.bio || ''); }, [user.name, user.bio]);
    const isPublic = myProfileMeta ? myProfileMeta.discoverable !== false : true;
    const notifOn = (k) => (myProfileMeta && myProfileMeta.notificationPrefs
      ? myProfileMeta.notificationPrefs[k] !== false
      : localNotif[k] !== false);
    const toggleNotif = (k, v) => {
      if (realUser) saveNotificationPref(k, v);
      else setLocalNotif((s) => ({ ...s, [k]: v }));
    };
    const Section = ({ title, sub, children }) => h('div', { className: 'bg-card rounded-2xl border border-border p-4 sm:p-5 space-y-4' },
      h('div', null, h('p', { className: 'text-sm font-bold text-foreground' }, title), sub && h('p', { className: 'text-xs text-muted-foreground mt-0.5' }, sub)), children);

    return h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'settings' },
      h(Header, { icon: 'Settings', title: 'Settings', sub: 'Manage your profile & preferences' }),
      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-8 px-4 sm:px-5 py-4' },
        h('div', { className: 'max-w-2xl mx-auto space-y-4' },
          h(Section, { title: 'Profile', sub: 'How you appear across Citizens Connect' },
            h(Field, { label: 'Cover photo' }, h(MediaPicker, { value: coverPhoto, onChange: setCoverPhoto, aspect: '16/6', label: 'cover', scope: 'event-cover' })),
            h('div', { className: 'flex gap-4 items-end' },
              // 'avatar' scope uploads the file AND persists profiles.avatar_url.
              h('div', { className: 'w-24' }, h(Field, { label: 'Photo' }, h(MediaPicker, { value: profilePhoto, onChange: setProfilePhoto, aspect: '1/1', label: 'photo', scope: 'avatar' }))),
              h('div', { className: 'flex-1 space-y-3' },
                h(Field, { label: 'Display name' }, h(Input, { value: name, onChange: (e) => setName(e.target.value) })))),
            h(Field, { label: 'Bio' }, h(Textarea, { value: bio, rows: 3, onChange: (e) => setBio(e.target.value) })),
            // An uploaded photo is already persisted by /api/avatar; reflect it across
            // the app (header, profile) immediately via updateAvatar. Name + bio
            // persist to the profiles row for real users.
            h(Button, { variant: 'gold', size: 'sm', icon: 'Check', disabled: saving, onClick: () => {
              if (profilePhoto) updateAvatar(profilePhoto);
              setSaving(true);
              saveProfile({ name: name.trim() || user.name, bio: bio || '' }, () => setSaving(false));
            } }, saving ? 'Saving…' : 'Save Profile')),

          h(Section, { title: 'Privacy', sub: 'Control your discoverability' },
            h('div', { className: 'p-3 rounded-xl bg-white/60 border border-border' },
              h(Toggle, { checked: isPublic, onChange: setDiscoverable, label: 'Public profile', desc: 'Allow other citizens to discover, befriend & message you.' }))),

          h(Section, { title: 'Notifications', sub: 'Choose what you hear about' },
            h('div', { className: 'space-y-3' },
              NOTIF_PREFS.map(([k, l, d]) => h('div', { key: k, className: 'p-3 rounded-xl bg-white/60 border border-border' },
                h(Toggle, { checked: notifOn(k), onChange: (v) => toggleNotif(k, v), label: l, desc: d }))))),

          isCitizen && h('div', { className: 'p-4 rounded-2xl bg-gradient-to-br from-[#FEF8E2] to-[#F9E08A]/40 border border-gold/30' },
            h('div', { className: 'flex items-center gap-2 mb-1' }, h(Icon, { name: 'Award', size: 16, className: 'text-gold-dark' }), h('p', { className: 'text-sm font-bold text-gold-dark' }, 'Weekly contribution')),
            h('p', { className: 'text-xs text-gold-dark/80 mb-3' }, 'Citizens can post one community-organised event each week. Want to do more? Apply to become a Contributor.'),
            h(Button, { variant: 'gold', size: 'sm', icon: 'Crown', onClick: () => go('apply') }, 'Apply to become a Contributor')),

          h(Section, { title: 'Account' },
            h('div', { className: 'flex items-center justify-between' },
              h('div', null, h('p', { className: 'text-sm text-foreground capitalize' }, role + ' account'), h('p', { className: 'text-xs text-muted-foreground' }, realUser ? (realUser.email || '') : 'demo session')),
              h(Button, { variant: 'danger', size: 'sm', icon: 'LogOut', onClick: signOut }, 'Sign Out'))))));
  }

  window.CommunityPage = CommunityPage;
  window.NotificationsPage = NotificationsPage;
  window.SettingsPage = SettingsPage;
})();
