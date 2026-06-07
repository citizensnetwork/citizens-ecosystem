// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Create Event / Create Place
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const F = React.Fragment;
  const { useState, useRef } = React;
  const { cx, Field, Input, Textarea, Button, Toggle, MediaPicker, Stepper, Overlay } = window.UI;
  const Icon = window.Icon;

  const SOCIALS = [
    { key: 'instagram', icon: 'Instagram', prefix: '@' },
    { key: 'youtube', icon: 'Youtube', prefix: '/' },
    { key: 'facebook', icon: 'Facebook', prefix: '/' },
  ];

  function CatGrid({ list, value, onChange }) {
    return h('div', { className: 'grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1 -mr-1' },
      list.map((c) => {
        const sel = value === c.id;
        return h('button', { key: c.id, type: 'button', onClick: () => onChange(c.id),
          className: cx('flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 transition-all text-left', sel ? 'border-transparent text-white shadow' : 'border-border bg-white/60 hover:bg-white'),
          style: sel ? { background: c.hex } : undefined },
          h('span', { className: 'w-6 h-6 rounded-md flex items-center justify-center shrink-0', style: sel ? { background: 'rgba(255,255,255,0.25)' } : { background: c.hex + '1c', color: c.hex } }, h(Icon, { name: c.icon, size: 12 })),
          h('span', { className: cx('text-[11px] font-semibold truncate', sel ? 'text-white' : 'text-foreground') }, c.name));
      }));
  }

  function SocialRow({ socials, onChange }) {
    return h('div', { className: 'space-y-2' },
      SOCIALS.map((s) => h('div', { key: s.key, className: 'flex items-center gap-2 px-3 py-2 bg-white/70 border border-border rounded-xl' },
        h('span', { className: 'w-6 h-6 rounded-md bg-accent flex items-center justify-center shrink-0' }, h(Icon, { name: s.icon, size: 12, className: 'text-gold-dark' })),
        h('span', { className: 'text-sm text-muted-foreground' }, s.prefix),
        h('input', { value: socials[s.key] || '', onChange: (e) => onChange(s.key, e.target.value), placeholder: s.key, className: 'flex-1 text-sm bg-transparent outline-none' }))));
  }

  // ── mini map for placement / route ──
  function MiniMap({ mode, point, route, hex, onPoint, onRoute }) {
    const ref = useRef(null);
    const pos = (e) => {
      const r = ref.current.getBoundingClientRect();
      return { x: Math.max(2, Math.min(98, Math.round((e.clientX - r.left) / r.width * 100))), y: Math.max(2, Math.min(98, Math.round((e.clientY - r.top) / r.height * 100))) };
    };
    const click = (e) => { const p = pos(e); mode === 'route' ? onRoute([...(route || []), p]) : onPoint(p); };
    const d = (route || []).map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
    return h('div', { ref, onClick: click, className: 'relative w-full rounded-2xl overflow-hidden border border-border cursor-crosshair', style: { aspectRatio: '16/9', background: 'var(--map-bg)' } },
      h(window.MapBackdrop),
      mode === 'route' && route && route.length > 1 && h('svg', { className: 'absolute inset-0 w-full h-full pointer-events-none', viewBox: '0 0 100 100', preserveAspectRatio: 'none' },
        h('path', { d, fill: 'none', stroke: '#fff', strokeWidth: 5, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round', opacity: 0.7 }),
        h('path', { d, fill: 'none', stroke: hex, strokeWidth: 3, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round', className: 'dash-flow' })),
      mode === 'route'
        ? (route || []).map((p, i) => h('div', { key: i, className: 'absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow', style: { left: p.x + '%', top: p.y + '%', width: 16, height: 16, background: i === 0 ? '#16A34A' : i === route.length - 1 ? hex : '#fff', color: i === 0 || i === route.length - 1 ? '#fff' : hex, border: `2px solid ${hex}` } }, i === 0 ? 'S' : i === route.length - 1 ? h(Icon, { name: 'Flag', size: 9 }) : i))
        : point && h('div', { className: 'absolute -translate-x-1/2 -translate-y-full', style: { left: point.x + '%', top: point.y + '%' } },
            h('span', { className: 'flex items-center justify-center shadow-lg', style: { width: 26, height: 26, background: hex, border: '2px solid #fff', borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' } }, h('span', { style: { transform: 'rotate(45deg)', display: 'flex' } }, h(Icon, { name: 'MapPin', size: 12, className: 'text-white' })))),
      h('div', { className: 'absolute top-2 left-2 glass-strong rounded-lg px-2 py-1 text-[10px] font-semibold text-foreground/70 pointer-events-none' }, mode === 'route' ? 'Tap to drop start → waypoints → finish' : 'Tap to place your pin'));
  }

  function CreateFlow({ kind }) {
    const app = window.useApp();
    const { closeCreate, createEvent, createPlace, creationStyle, activeContributor } = app;
    const isEvent = kind === 'event';
    const [step, setStep] = useState(0);
    const [f, setF] = useState(isEvent
      ? { title: '', category: '', description: '', date: '', time: '', endTime: '', location: '', address: '', coverPhoto: '', gallery: [], socials: {}, volunteeringEnabled: false, isMobile: false, route: [], mapX: 48, mapY: 50, upcomingDates: [], launchBroadcast: '' }
      : { name: '', category: '', description: '', address: '', openHours: '', coverPhoto: '', gallery: [], socials: {}, volunteeringEnabled: false, mapX: 52, mapY: 46 });
    const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
    const ups = (k, v) => setF((s) => ({ ...s, socials: { ...s.socials, [k]: v } }));
    const [recur, setRecur] = useState('');
    const cat = window.DATA.getCategory(f.category);
    const hex = cat ? cat.hex : '#C9A84C';

    const submit = () => {
      if (isEvent) {
        const pos = f.isMobile && f.route.length ? f.route[0] : { x: f.mapX, y: f.mapY };
        createEvent({ ...f, mapX: pos.x, mapY: pos.y, route: f.isMobile ? f.route : null });
      } else createPlace(f);
      closeCreate();
      app.go('home');
    };

    // ── field sections ──
    const galleryAdd = (v) => up('gallery', [...f.gallery, v]);
    const Basics = h(F, null,
      h(Field, { label: isEvent ? 'Event title' : 'Place name', required: true }, h(Input, { value: isEvent ? f.title : f.name, onChange: (e) => up(isEvent ? 'title' : 'name', e.target.value), placeholder: isEvent ? 'e.g. Sunday Glory Service' : 'e.g. Grace City Café' })),
      h(Field, { label: 'Category', required: true, hint: 'Sets your colour & icon on the map.' }, h(CatGrid, { list: isEvent ? window.DATA.EVENT_CATEGORIES : window.DATA.PLACE_CATEGORIES, value: f.category, onChange: (v) => up('category', v) })),
      h(Field, { label: 'Description' }, h(Textarea, { value: f.description, rows: 3, onChange: (e) => up('description', e.target.value), placeholder: 'Tell citizens what to expect…' })));

    const When = h(F, null,
      isEvent && h('div', { className: 'grid grid-cols-3 gap-2' },
        h(Field, { label: 'Date', required: true }, h('input', { type: 'date', value: f.date, onChange: (e) => up('date', e.target.value), className: window.UI.inputCls })),
        h(Field, { label: 'Start' }, h('input', { type: 'time', value: f.time, onChange: (e) => up('time', e.target.value), className: window.UI.inputCls })),
        h(Field, { label: 'End' }, h('input', { type: 'time', value: f.endTime, onChange: (e) => up('endTime', e.target.value), className: window.UI.inputCls }))),
      h(Field, { label: isEvent ? 'Venue name' : 'Address', required: true }, h(Input, { value: isEvent ? f.location : f.address, onChange: (e) => up(isEvent ? 'location' : 'address', e.target.value), placeholder: isEvent ? 'Where is it held?' : 'Street, area' })),
      isEvent && h(Field, { label: 'Address' }, h(Input, { value: f.address, onChange: (e) => up('address', e.target.value), placeholder: 'Street, area' })),
      isEvent && h(Field, { label: 'Mobile event' },
        h('div', { className: 'p-3 rounded-xl bg-white/60 border border-border' },
          h(Toggle, { checked: f.isMobile, onChange: (v) => up('isMobile', v), label: 'Start → finish route', desc: 'For walks, runs & processions — track shows on the map in your category colour.' }))),
      f.isMobile
        ? h(Field, { label: 'Draw the route' },
            h(MiniMap, { mode: 'route', route: f.route, hex, onRoute: (r) => up('route', r) }),
            h('div', { className: 'flex items-center gap-2 mt-2' },
              h('span', { className: 'text-[11px] text-muted-foreground flex-1' }, f.route.length + ' point' + (f.route.length === 1 ? '' : 's') + (f.route.length >= 2 ? ' · ' + f.route.length + ' stops' : '')),
              h(Button, { variant: 'ghost', size: 'sm', icon: 'Undo2', onClick: () => up('route', f.route.slice(0, -1)) }, 'Undo'),
              h(Button, { variant: 'ghost', size: 'sm', icon: 'Trash2', onClick: () => up('route', []) }, 'Clear')))
        : h(Field, { label: 'Place on map', required: true }, h(MiniMap, { mode: 'point', point: { x: f.mapX, y: f.mapY }, hex, onPoint: (p) => { up('mapX', p.x); up('mapY', p.y); } })),
      isEvent && h(Field, { label: 'Recurring / upcoming dates', hint: 'Optional — add future dates this repeats.' },
        h('div', { className: 'flex gap-2 mb-2' },
          h('input', { type: 'date', value: recur, onChange: (e) => setRecur(e.target.value), className: window.UI.inputCls }),
          h(Button, { variant: 'soft', icon: 'Plus', onClick: () => { if (recur) { up('upcomingDates', [...f.upcomingDates, recur]); setRecur(''); } } }, 'Add')),
        h('div', { className: 'flex flex-wrap gap-1.5' },
          f.upcomingDates.map((d, i) => h('span', { key: i, className: 'flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-accent text-gold-dark text-xs font-semibold' },
            new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            h('button', { onClick: () => up('upcomingDates', f.upcomingDates.filter((_, j) => j !== i)) }, h(Icon, { name: 'X', size: 11 })))))),
      !isEvent && h(Field, { label: 'Opening hours' }, h(Input, { value: f.openHours, onChange: (e) => up('openHours', e.target.value), placeholder: 'Mon–Fri 9AM–9PM' })));

    const Media = h(F, null,
      h(Field, { label: 'Cover photo', required: true }, h(MediaPicker, { value: f.coverPhoto, onChange: (v) => up('coverPhoto', v) })),
      h(Field, { label: 'Gallery', hint: 'Add photos & videos citizens will see on your profile.' },
        h('div', { className: 'grid grid-cols-4 gap-1.5 mb-2' },
          f.gallery.map((g, i) => h('div', { key: i, className: 'relative aspect-square rounded-lg overflow-hidden group' },
            h('img', { src: g, className: 'w-full h-full object-cover' }),
            h('button', { onClick: () => up('gallery', f.gallery.filter((_, j) => j !== i)), className: 'absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100' }, h(Icon, { name: 'X', size: 10 })))),
          f.gallery.length < 8 && h(GalleryAdd, { onAdd: galleryAdd }))),
      h(Field, { label: 'Social links' }, h(SocialRow, { socials: f.socials, onChange: ups })));

    const Options = h(F, null,
      h('div', { className: 'p-3.5 rounded-xl bg-white/60 border border-border' },
        h(Toggle, { checked: f.volunteeringEnabled, onChange: (v) => up('volunteeringEnabled', v), label: 'Enable volunteer applications', desc: 'Let citizens apply to serve at this ' + (isEvent ? 'event' : 'place') + '.' })),
      isEvent && h(Field, { label: 'Schedule a launch broadcast', hint: 'Optional — sends a speech bubble to the map & notifies followers the moment you publish.' },
        h(Textarea, { value: f.launchBroadcast, rows: 2, onChange: (e) => up('launchBroadcast', e.target.value), placeholder: '🎉 We just launched — come join us!' })),
      h('div', { className: 'flex items-start gap-2 p-3 rounded-xl bg-accent/60 text-gold-dark' },
        h(Icon, { name: 'Sparkles', size: 15, className: 'shrink-0 mt-0.5' }),
        h('p', { className: 'text-xs leading-relaxed' }, 'Publishing as ' + activeContributor.name + '. Your ' + (isEvent ? 'event' : 'place') + ' will appear instantly on the Discover map.')));

    const sections = isEvent
      ? [{ title: 'The basics', node: Basics }, { title: 'When & where', node: When }, { title: 'Media & links', node: Media }, { title: 'Options & launch', node: Options }]
      : [{ title: 'The basics', node: Basics }, { title: 'Location', node: When }, { title: 'Media & links', node: Media }, { title: 'Options', node: Options }];

    const canSubmit = isEvent ? (f.title && f.category) : (f.name && f.category);
    const title = (isEvent ? 'Create Event' : 'Add Place');
    const variant = creationStyle === 'side' ? 'side' : creationStyle === 'modal' ? 'modal' : 'sheet';

    // WIZARD layout
    if (creationStyle === 'wizard') {
      const last = step === sections.length - 1;
      const cur = sections[step];
      return h(Overlay, { variant: 'sheet', onClose: closeCreate },
        h('div', { className: 'flex flex-col max-h-[88vh]' },
          h('div', { className: 'px-5 pt-4 pb-3 border-b border-border shrink-0' },
            h('div', { className: 'flex items-center justify-between mb-3' },
              h('div', { className: 'flex items-center gap-2' }, h('span', { className: 'w-8 h-8 rounded-xl gold-gradient flex items-center justify-center' }, h(Icon, { name: isEvent ? 'CalendarPlus' : 'MapPinPlus', size: 15, className: 'text-white' })), h('h3', { className: 'text-foreground text-lg' }, title)),
              h('button', { onClick: closeCreate, className: 'w-8 h-8 rounded-lg hover:bg-accent/60 flex items-center justify-center text-muted-foreground' }, h(Icon, { name: 'X', size: 16 }))),
            h(Stepper, { steps: sections, current: step })),
          h('div', { className: 'flex-1 overflow-y-auto px-5 py-4' },
            h('h4', { className: 'text-base text-foreground mb-4' }, cur.title),
            h('div', { className: 'space-y-4' }, cur.node)),
          h('div', { className: 'shrink-0 border-t border-border px-5 py-3 flex gap-3' },
            step > 0 && h(Button, { variant: 'outline', className: 'flex-1', onClick: () => setStep(step - 1) }, 'Back'),
            h(Button, { variant: 'gold', className: 'flex-[2]', disabled: last && !canSubmit, icon: last ? 'Rocket' : null, iconRight: last ? null : 'ArrowRight', onClick: () => (last ? submit() : setStep(step + 1)) }, last ? 'Publish' : 'Continue'))));
    }

    // MODAL / SIDE layout (single scroll, sectioned)
    return h(Overlay, { variant, onClose: closeCreate, maxWidth: 600 },
      h('div', { className: cx('flex flex-col', variant === 'side' ? 'h-full' : 'max-h-[88vh]') },
        h('div', { className: 'px-5 pt-4 pb-3 border-b border-border shrink-0 flex items-center justify-between' },
          h('div', { className: 'flex items-center gap-2' }, h('span', { className: 'w-8 h-8 rounded-xl gold-gradient flex items-center justify-center' }, h(Icon, { name: isEvent ? 'CalendarPlus' : 'MapPinPlus', size: 15, className: 'text-white' })), h('h3', { className: 'text-foreground text-lg' }, title)),
          h('button', { onClick: closeCreate, className: 'w-8 h-8 rounded-lg hover:bg-accent/60 flex items-center justify-center text-muted-foreground' }, h(Icon, { name: 'X', size: 16 }))),
        h('div', { className: 'flex-1 overflow-y-auto px-5 py-4 space-y-6' },
          sections.map((s, i) => h('div', { key: i },
            h('p', { className: 'text-[10px] font-bold uppercase tracking-widest text-gold-dark/70 mb-3 flex items-center gap-2' }, h('span', { className: 'w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px]' }, i + 1), s.title),
            h('div', { className: 'space-y-4' }, s.node)))),
        h('div', { className: 'shrink-0 border-t border-border px-5 py-3 flex gap-3' },
          h(Button, { variant: 'outline', onClick: closeCreate }, 'Cancel'),
          h(Button, { variant: 'gold', className: 'flex-1', disabled: !canSubmit, icon: 'Rocket', onClick: submit }, 'Publish to map'))));
  }

  function GalleryAdd({ onAdd }) {
    const [open, setOpen] = useState(false);
    return h(F, null,
      h('button', { type: 'button', onClick: () => setOpen((o) => !o), className: 'aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-gold/50 hover:text-gold-dark' }, h(Icon, { name: 'Plus', size: 18 })),
      open && h('div', { className: 'col-span-4 grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-white/70 border border-border' },
        window.UI.STOCK.map((s) => h('button', { key: s, type: 'button', onClick: () => { onAdd(s); setOpen(false); }, className: 'aspect-square rounded-md overflow-hidden border border-transparent hover:border-gold/50' }, h('img', { src: s, className: 'w-full h-full object-cover' })))));
  }

  window.CreateFlow = CreateFlow;
})();
