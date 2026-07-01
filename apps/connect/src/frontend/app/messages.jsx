// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Messages
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useEffect, useRef } = React;
  const { cx, Avatar, Empty } = window.UI;
  const Icon = window.Icon;

  function Thread({ conv, onBack }) {
    const { sendMessage, acceptRequest, rejectRequest, muteConversation, unmuteConversation, blockUser } = window.useApp();
    const [text, setText] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const endRef = useRef(null);
    useEffect(() => { if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight; }, [conv.messages.length, conv.id]);

    // Close dropdown on outside click
    useEffect(() => {
      if (!menuOpen) return;
      function onDown(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [menuOpen]);

    const isPending = conv.status === 'pending';
    const iAmRecipient = isPending && conv.messagesLoaded && !conv.messages.some((m) => m.from === 'me');

    const send = () => { if (text.trim() && !iAmRecipient) { sendMessage(conv.id, text.trim()); setText(''); } };

    const handleMuteToggle = () => {
      setMenuOpen(false);
      conv.muted ? unmuteConversation(conv.id) : muteConversation(conv.id);
    };
    const handleBlock = () => {
      setMenuOpen(false);
      if (!conv.participantId) return;
      if (!window.confirm('Block ' + conv.participantName + '? They will no longer be able to message you.')) return;
      blockUser(conv.participantId, conv.id);
    };

    return h('div', { className: 'flex-1 flex flex-col min-h-0 bg-background' },
      h('div', { className: 'px-3 sm:px-4 py-3 border-b border-border glass-strong flex items-center gap-3 shrink-0' },
        h('button', { onClick: onBack, className: 'md:hidden w-8 h-8 rounded-lg hover:bg-accent/60 flex items-center justify-center' }, h(Icon, { name: 'ArrowLeft', size: 17 })),
        h(Avatar, { src: conv.participantPhoto, name: conv.participantName, size: 38, rounded: 'xl' }),
        h('div', { className: 'flex-1 min-w-0' },
          h('div', { className: 'flex items-center gap-1.5' }, h('p', { className: 'text-sm font-bold text-foreground truncate' }, conv.participantName), conv.isOrg && h(Icon, { name: 'BadgeCheck', size: 13, className: 'text-gold' })),
          h('p', { className: 'text-[11px] text-muted-foreground' }, isPending ? 'Message request' : (conv.isOrg ? 'Contributor' : 'Citizen'))),
        // ── More menu ────────────────────────────────────────────────
        h('div', { ref: menuRef, className: 'relative' },
          h('button', { onClick: () => setMenuOpen((o) => !o), className: 'w-8 h-8 rounded-lg hover:bg-accent/60 flex items-center justify-center text-muted-foreground' }, h(Icon, { name: 'MoreVertical', size: 16 })),
          menuOpen && h('div', { className: 'absolute right-0 top-9 z-50 w-48 bg-white border border-border rounded-xl shadow-lg overflow-hidden py-1' },
            h('button', { onClick: handleMuteToggle, className: 'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-accent/40 text-left' },
              h(Icon, { name: conv.muted ? 'BellRing' : 'BellOff', size: 15, className: 'text-muted-foreground shrink-0' }),
              conv.muted ? 'Unmute conversation' : 'Mute conversation'),
            h('div', { className: 'my-1 border-t border-border' }),
            h('button', { onClick: handleBlock, className: 'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left' },
              h(Icon, { name: 'Ban', size: 15, className: 'shrink-0' }),
              'Block ' + conv.participantName)))),
      isPending && h('div', { className: 'mx-3 sm:mx-4 mt-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 shrink-0' },
        iAmRecipient
          ? h('div', null,
              h('p', { className: 'font-semibold mb-2' }, conv.participantName + ' sent you a message request.'),
              h('div', { className: 'flex gap-2' },
                h('button', { onClick: () => acceptRequest(conv.id), className: 'flex-1 py-1.5 rounded-lg bg-gold text-black text-xs font-semibold' }, 'Accept'),
                h('button', { onClick: () => rejectRequest(conv.id), className: 'flex-1 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 text-xs font-semibold' }, 'Decline')))
          : h('p', null, 'Awaiting ' + conv.participantName + '\u2019s response to your message request.')),
      h('div', { ref: endRef, className: 'flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-2' },
        conv.messages.length === 0 && h('p', { className: 'text-center text-xs text-muted-foreground py-8' },
          conv.messagesLoaded === false ? 'Loading conversation…' : 'Say hello 👋'),
        conv.messages.map((m, i) => {
          const mine = m.from === 'me';
          const showDate = i === 0 || conv.messages[i - 1].date !== m.date;
          return h(F, { key: m.id },
            showDate && h('div', { className: 'flex justify-center my-2' }, h('span', { className: 'text-[10px] font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full' }, m.date)),
            h('div', { className: cx('flex', mine ? 'justify-end' : 'justify-start') },
              h('div', { className: cx('max-w-[78%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed', mine ? 'gold-gradient text-black rounded-br-sm' : 'bg-card border border-border text-foreground rounded-bl-sm') },
                m.text,
                h('span', { className: cx('block text-[9px] mt-0.5', mine ? 'text-white/70' : 'text-muted-foreground') }, m.time))));
        })),
      h('div', { className: 'px-3 sm:px-4 py-3 border-t border-border glass-strong shrink-0 flex items-center gap-2' },
        h('button', { className: 'w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0' }, h(Icon, { name: 'Plus', size: 18 })),
        h('input', { value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => e.key === 'Enter' && send(), disabled: iAmRecipient, placeholder: iAmRecipient ? 'Accept the request to reply…' : 'Write a message…', className: cx('flex-1 px-4 py-2.5 bg-white/70 border border-border rounded-full text-sm outline-none focus:border-gold/60', iAmRecipient && 'opacity-50 cursor-not-allowed') }),
        h('button', { onClick: send, disabled: !text.trim() || iAmRecipient, className: 'w-10 h-10 rounded-full gold-gradient text-black flex items-center justify-center shrink-0 disabled:opacity-40' }, h(Icon, { name: 'Send', size: 16 }))));
  }

  function MessagesPage() {
    const { conversations, nav, go, openConversation } = window.useApp();
    const [searchQuery, setSearchQuery] = useState('');
    const active = conversations.find((c) => c.id === nav.params.convId);
    useEffect(() => { if (active) openConversation(active.id); }, [nav.params.convId]);

    const filtered = searchQuery.trim()
      ? conversations.filter((c) => c.participantName.toLowerCase().includes(searchQuery.toLowerCase()) || (c.lastMessage && c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())))
      : conversations;

    const List = h('div', { className: cx('flex flex-col min-h-0 border-r border-border bg-background', active ? 'hidden md:flex md:w-80 lg:w-96 shrink-0' : 'flex flex-1 md:w-80 lg:w-96 md:flex-none') },
      h('div', { className: 'px-4 pt-5 pb-3 border-b border-border glass-strong shrink-0' },
        h('h2', { className: 'text-xl text-foreground mb-3' }, 'Messages'),
        h('div', { className: 'flex items-center gap-2 px-3 py-2 bg-white/70 border border-border rounded-xl' },
          h(Icon, { name: 'Search', size: 14, className: 'text-muted-foreground' }),
          h('input', { value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: 'Search conversations…', className: 'flex-1 text-sm bg-transparent outline-none' }))),
      h('div', { className: 'flex-1 overflow-y-auto pb-24 md:pb-0' },
        filtered.length === 0 && h('p', { className: 'text-center text-xs text-muted-foreground py-8 px-4' }, searchQuery ? 'No conversations match "' + searchQuery + '"' : 'No conversations yet.'),
        filtered.map((c) => h('button', { key: c.id, onClick: () => go('messages', { convId: c.id }),
          className: cx('w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 text-left transition-colors', active && active.id === c.id ? 'bg-accent/60' : 'hover:bg-accent/30') },
          h('div', { className: 'relative shrink-0' }, h(Avatar, { src: c.participantPhoto, name: c.participantName, size: 46, rounded: 'xl' }),
            c.isOrg && h('span', { className: 'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-gold border-2 border-background flex items-center justify-center' }, h(Icon, { name: 'Crown', size: 7, className: 'text-white' }))),
          h('div', { className: 'flex-1 min-w-0' },
            h('div', { className: 'flex items-center justify-between gap-2' },
              h('p', { className: 'text-sm font-bold text-foreground truncate' }, c.participantName),
              h('div', { className: 'flex items-center gap-1 shrink-0' },
                c.muted && h(Icon, { name: 'BellOff', size: 10, className: 'text-muted-foreground' }),
                h('span', { className: 'text-[10px] text-muted-foreground' }, c.lastTime))),
            h('div', { className: 'flex items-center justify-between gap-2 mt-0.5' }, h('p', { className: cx('text-xs truncate', c.unread ? 'text-foreground font-medium' : 'text-muted-foreground') }, c.lastMessage),
              c.unread > 0 && h('span', { className: 'w-4 h-4 bg-gold text-black text-[8px] font-bold rounded-full flex items-center justify-center shrink-0' }, c.unread),
              c.status === 'pending' && h('span', { className: 'text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0' }, 'Request')))))));

    return h('div', { className: 'flex-1 flex min-h-0', 'data-screen': 'messages' },
      List,
      active
        ? h(Thread, { conv: active, onBack: () => go('messages') })
        : h('div', { className: 'hidden md:flex flex-1 items-center justify-center bg-background' }, h(Empty, { icon: 'MessageCircle', title: 'Select a conversation', sub: 'Message organisers and fellow citizens.' })));
  }

  window.MessagesPage = MessagesPage;
})();
