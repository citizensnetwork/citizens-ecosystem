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
  function IdeaCard({ idea }) {
    const { toast } = window.useApp();
    const cat = window.DATA.getCategory(idea.category);
    const [voted, setVoted] = useState(false);
    const votes = idea.votes + (voted ? 1 : 0);
    const pct = Math.min(100, Math.round((votes / idea.threshold) * 100));
    const confirmed = idea.status === 'confirmed';
    return h('div', { className: 'bg-card rounded-2xl border border-border overflow-hidden' },
      h('div', { className: 'p-4' },
        h('div', { className: 'flex items-center justify-between mb-2' },
          h('div', { className: 'flex items-center gap-2' },
            h(Avatar, { src: idea.authorPhoto, size: 24, rounded: 'full' }),
            h('span', { className: 'text-xs text-muted-foreground' }, idea.authorName)),
          cat && h('span', { className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold', style: { background: cat.hex + '1c', color: cat.hex } }, h(Icon, { name: cat.icon, size: 9 }), cat.short)),
        h('h3', { className: 'text-base text-foreground leading-tight mb-1' }, idea.title),
        h('p', { className: 'text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-3' }, idea.description),
        confirmed
          ? h('div', { className: 'flex items-center gap-2 p-2.5 rounded-xl bg-[#DCFCE7] text-[#15803d]' }, h(Icon, { name: 'CheckCircle2', size: 15 }), h('span', { className: 'text-xs font-bold' }, 'Confirmed Kingdom Project · ' + idea.collaborators + ' collaborators'))
          : h(F, null,
              h('div', { className: 'flex items-center justify-between mb-1' },
                h('span', { className: 'text-xs font-bold text-foreground' }, votes.toLocaleString() + ' votes'),
                h('span', { className: 'text-[10px] text-muted-foreground' }, pct + '% to goal')),
              h('div', { className: 'h-2 rounded-full bg-muted overflow-hidden mb-3' }, h('div', { className: 'h-full gold-gradient rounded-full transition-all', style: { width: pct + '%' } })),
              h('div', { className: 'flex gap-2' },
                h(Button, { variant: voted ? 'success' : 'gold', size: 'sm', className: 'flex-1', icon: voted ? 'Check' : 'ThumbsUp', onClick: () => setVoted((v) => !v) }, voted ? 'Voted to collaborate' : 'Collaborate'),
                h(Button, { variant: 'outline', size: 'sm', icon: 'X', onClick: () => toast('Idea dismissed') }, 'Dismiss')))));
  }

  function CommunityPage() {
    const { toast } = window.useApp();
    const [tab, setTab] = useState('voting');
    const ideas = window.DATA.impactIdeas;
    const map = { voting: 'voting', process: 'inProcess', confirmed: 'confirmed' };
    const list = ideas.filter((i) => i.status === map[tab]);
    return h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'community' },
      h(Header, { icon: 'Lightbulb', title: 'Kingdom Projects', sub: 'Community ideas, voting & collaboration',
        right: h(Button, { variant: 'gold', size: 'sm', icon: 'Plus', onClick: () => toast('Impact Idea composer — coming soon', 'gold') }, 'Post Idea') }),
      h('div', { className: 'px-4 sm:px-5 py-3 border-b border-border' }, h(Segmented, { options: [{ value: 'voting', label: 'Voting Now' }, { value: 'process', label: 'In Process' }, { value: 'confirmed', label: 'Confirmed' }], value: tab, onChange: setTab })),
      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-8 px-4 sm:px-5 py-4' },
        h('div', { className: 'max-w-2xl mx-auto space-y-4 fade-in' },
          tab === 'voting' && h('div', { className: 'flex items-start gap-2 p-3 rounded-xl bg-accent/60 text-gold-dark mb-1' },
            h(Icon, { name: 'Info', size: 15, className: 'shrink-0 mt-0.5' }),
            h('p', { className: 'text-xs leading-relaxed' }, 'Ideas that reach their vote goal become collaborative Kingdom Projects. Voting polls also appear on the Discover map.')),
          list.length === 0 ? h(Empty, { icon: 'Lightbulb', title: 'Nothing here yet' }) : list.map((i) => h(IdeaCard, { key: i.id, idea: i })))));
  }

  // ── Notifications ──
  const NOTIF_ICON = { broadcast: ['Radio', '#C9A84C'], friend: ['UserPlus', '#3498DB'], convince: ['Sparkles', '#9B59B6'], message: ['MessageCircle', '#2563EB'], idea: ['Lightbulb', '#16A34A'] };
  function NotificationsPage() {
    const { notifications, markNotifsRead, go } = window.useApp();
    return h('div', { className: 'flex-1 flex flex-col overflow-hidden bg-background', 'data-screen': 'notifications' },
      h(Header, { icon: 'Bell', title: 'Notifications', right: h(Button, { variant: 'ghost', size: 'sm', onClick: markNotifsRead }, 'Mark all read') }),
      h('div', { id: 'main-scroll', className: 'flex-1 overflow-y-auto pb-28 md:pb-8' },
        h('div', { className: 'max-w-2xl mx-auto' },
          notifications.map((n) => {
            const [ic, c] = NOTIF_ICON[n.type] || ['Bell', '#C9A84C'];
            return h('div', { key: n.id, className: cx('flex items-start gap-3 px-4 sm:px-5 py-3.5 border-b border-border/50 transition-colors', !n.read && 'bg-accent/30') },
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
  function SettingsPage() {
    const app = window.useApp();
    const { user, role, go, toast, isCitizen, signOut, updateAvatar } = app;
    const [name, setName] = useState(user.name);
    const [bio, setBio] = useState(user.bio);
    const [profilePhoto, setProfilePhoto] = useState(user.profilePhoto);
    const [coverPhoto, setCoverPhoto] = useState(user.coverPhoto);
    const [isPublic, setIsPublic] = useState(true);
    const [notif, setNotif] = useState({ events: true, messages: true, broadcasts: true, friends: true });
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
            // the app (header, profile) immediately via updateAvatar.
            h(Button, { variant: 'gold', size: 'sm', icon: 'Check', onClick: () => { if (profilePhoto) updateAvatar(profilePhoto); toast('Profile saved', 'green'); } }, 'Save Profile')),

          h(Section, { title: 'Privacy', sub: 'Control your discoverability' },
            h('div', { className: 'p-3 rounded-xl bg-white/60 border border-border' },
              h(Toggle, { checked: isPublic, onChange: setIsPublic, label: 'Public profile', desc: 'Allow other citizens to discover, befriend & message you.' }))),

          h(Section, { title: 'Notifications', sub: 'Choose what you hear about' },
            h('div', { className: 'space-y-3' },
              [['events', 'Event reminders', 'Upcoming events you connected to'], ['messages', 'Messages', 'Direct messages from citizens & contributors'], ['broadcasts', 'Broadcasts', 'Updates from places & events you follow'], ['friends', 'Friends', 'Friend requests & friend activity']]
                .map(([k, l, d]) => h('div', { key: k, className: 'p-3 rounded-xl bg-white/60 border border-border' }, h(Toggle, { checked: notif[k], onChange: (v) => setNotif((s) => ({ ...s, [k]: v })), label: l, desc: d }))))),

          isCitizen && h('div', { className: 'p-4 rounded-2xl bg-gradient-to-br from-[#F2E8CC] to-[#E8D48B]/40 border border-gold/30' },
            h('div', { className: 'flex items-center gap-2 mb-1' }, h(Icon, { name: 'Award', size: 16, className: 'text-gold-dark' }), h('p', { className: 'text-sm font-bold text-gold-dark' }, 'Weekly contribution')),
            h('p', { className: 'text-xs text-gold-dark/80 mb-3' }, 'Citizens can post one community-organised event each week. Want to do more? Apply to become a Contributor.'),
            h(Button, { variant: 'gold', size: 'sm', icon: 'Crown', onClick: () => go('apply') }, 'Apply to become a Contributor')),

          h(Section, { title: 'Account' },
            h('div', { className: 'flex items-center justify-between' },
              h('div', null, h('p', { className: 'text-sm text-foreground capitalize' }, role + ' account'), h('p', { className: 'text-xs text-muted-foreground' }, 'lydia.mensah@email.com')),
              h(Button, { variant: 'danger', size: 'sm', icon: 'LogOut', onClick: signOut }, 'Sign Out'))))));
  }

  window.CommunityPage = CommunityPage;
  window.NotificationsPage = NotificationsPage;
  window.SettingsPage = SettingsPage;
})();
