// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — stylized prototype map
// ════════════════════════════════════════════════════════════════════
(function () {
  const { useMemo } = React;
  const { cx } = window.UI;
  const Icon = window.Icon;

  // ── Decorative street network (deterministic) ──
  function MapBackdrop() {
    // pseudo-random but fixed road set
    const roads = [];
    const seed = (n) => ((Math.sin(n * 999.13) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 9; i++) {
      const y = 6 + i * 10.5 + (seed(i) - 0.5) * 4;
      roads.push({ d: `M -4 ${y} Q 30 ${y + (seed(i + 1) - 0.5) * 8}, 55 ${y} T 104 ${y + (seed(i + 2) - 0.5) * 6}`, w: i % 3 === 0 ? 2.4 : 1.2 });
    }
    for (let i = 0; i < 9; i++) {
      const x = 6 + i * 10.5 + (seed(i + 20) - 0.5) * 4;
      roads.push({ d: `M ${x} -4 Q ${x + (seed(i + 21) - 0.5) * 8} 30, ${x} 55 T ${x + (seed(i + 22) - 0.5) * 6} 104`, w: i % 4 === 0 ? 2.4 : 1.1 });
    }
    return React.createElement('svg', { className: 'absolute inset-0 w-full h-full', viewBox: '0 0 100 100', preserveAspectRatio: 'none', style: { display: 'block' } },
      React.createElement('defs', null,
        React.createElement('linearGradient', { id: 'mapwash', x1: '0', y1: '0', x2: '1', y2: '1' },
          React.createElement('stop', { offset: '0', stopColor: '#EFE7D5' }),
          React.createElement('stop', { offset: '1', stopColor: '#E7DCC4' }))),
      React.createElement('rect', { x: 0, y: 0, width: 100, height: 100, fill: 'url(#mapwash)' }),
      // water (river)
      React.createElement('path', { d: 'M -5 78 Q 25 70 45 82 T 105 74 L 105 110 L -5 110 Z', fill: '#CBDDDD', opacity: 0.8 }),
      React.createElement('path', { d: 'M -5 78 Q 25 70 45 82 T 105 74', fill: 'none', stroke: '#B7CCcc', strokeWidth: 0.5 }),
      // parks
      React.createElement('ellipse', { cx: 18, cy: 24, rx: 9, ry: 7, fill: '#D6E2C4', opacity: 0.9 }),
      React.createElement('ellipse', { cx: 82, cy: 58, rx: 8, ry: 10, fill: '#D6E2C4', opacity: 0.9 }),
      React.createElement('rect', { x: 60, y: 14, width: 14, height: 11, rx: 2, fill: '#D6E2C4', opacity: 0.75 }),
      // road casings (soft)
      roads.map((r, i) => React.createElement('path', { key: 'c' + i, d: r.d, fill: 'none', stroke: '#E4D9C0', strokeWidth: r.w + 1.4, strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke', opacity: 0.6 })),
      // roads
      roads.map((r, i) => React.createElement('path', { key: 'r' + i, d: r.d, fill: 'none', stroke: '#FBF7EE', strokeWidth: r.w, strokeLinecap: 'round', vectorEffect: 'non-scaling-stroke' })),
      // gold center-lines on majors
      roads.filter((r) => r.w > 2).map((r, i) => React.createElement('path', { key: 'g' + i, d: r.d, fill: 'none', stroke: '#C9A84C', strokeWidth: 0.35, strokeDasharray: '2 3', vectorEffect: 'non-scaling-stroke', opacity: 0.35 })));
  }

  // ── A single map marker ──
  function Marker({ m, cat, selected, dim, pinStyle, bubbleStyle, onClick }) {
    const color = cat ? cat.hex : '#C9A84C';
    const isIdea = m.type === 'idea';
    const fill = isIdea ? '#C9A84C' : color;

    const inner = pinStyle === 'dot'
      ? React.createElement('span', {
          className: 'block rounded-full border-[2.5px] border-white shadow-lg transition-transform',
          style: { width: selected ? 22 : 16, height: selected ? 22 : 16, background: fill },
        })
      : pinStyle === 'glass'
      ? React.createElement('span', {
          className: 'flex items-center justify-center rounded-2xl shadow-lg backdrop-blur-md transition-all',
          style: { width: selected ? 40 : 32, height: selected ? 40 : 32, background: fill + 'E6', border: '1.5px solid rgba(255,255,255,0.7)' },
        }, React.createElement(Icon, { name: isIdea ? 'Lightbulb' : (m.type === 'place' ? 'MapPin' : (cat ? cat.icon : 'Circle')), size: selected ? 18 : 15, className: 'text-white', strokeWidth: 2.4 }))
      : React.createElement('span', { // teardrop
          className: 'flex items-center justify-center shadow-lg transition-all',
          style: {
            width: selected ? 38 : 30, height: selected ? 38 : 30,
            background: fill, border: '2.5px solid #fff',
            borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.22)',
          },
        }, React.createElement('span', { style: { transform: 'rotate(45deg)', display: 'flex' } },
            React.createElement(Icon, { name: isIdea ? 'Lightbulb' : (m.type === 'place' ? 'MapPin' : (cat ? cat.icon : 'Circle')), size: selected ? 16 : 13, className: 'text-white', strokeWidth: 2.4 })));

    const anchorY = pinStyle === 'teardrop' ? '-100%' : '-50%';

    return React.createElement('button', {
      onClick: (e) => { e.stopPropagation(); onClick(m.id, m.type); },
      className: cx('absolute group transition-opacity', dim && 'opacity-25'),
      style: { left: m.mapX + '%', top: m.mapY + '%', transform: `translate(-50%, ${anchorY})`, zIndex: selected ? 60 : m.broadcast ? 40 : 20 },
    },
      // live pulse ring
      m.isLive && React.createElement('span', {
        className: 'absolute left-1/2 rounded-full pin-pulse',
        style: { width: 16, height: 16, background: '#ef4444', top: pinStyle === 'teardrop' ? '100%' : '50%', transform: 'translate(-50%,-50%)' },
      }),
      // busy subtle ring
      !m.isLive && m.isBusy && React.createElement('span', {
        className: 'absolute left-1/2 rounded-full pin-pulse',
        style: { width: 14, height: 14, background: fill, top: pinStyle === 'teardrop' ? '100%' : '50%', transform: 'translate(-50%,-50%)' },
      }),
      inner);
  }

  // ── Broadcast bubble + selected label (rendered in own non-transformed layer) ──
  function Floaters({ m, cat, selected, pinStyle, bubbleStyle }) {
    const fill = cat ? cat.hex : '#C9A84C';
    const headUp = pinStyle === 'teardrop' ? 32 : 22;
    const bubble = m.broadcast && (bubbleStyle === 'minimal' && !selected
      ? React.createElement('span', { className: 'flex items-center justify-center rounded-full gold-gradient shadow-lg bubble-bob', style: { width: 18, height: 18 } }, React.createElement(Icon, { name: 'Radio', size: 10, className: 'text-white' }))
      : bubbleStyle === 'tag'
      ? React.createElement('span', { className: 'bubble-bob flex items-center gap-1 px-2 py-0.5 rounded-md shadow-lg max-w-[150px]', style: { background: fill } },
          React.createElement(Icon, { name: 'Radio', size: 9, className: 'text-white shrink-0' }),
          React.createElement('span', { className: 'text-[9px] font-bold text-white truncate' }, m.broadcast.message))
      : React.createElement('span', { className: 'bubble-bob flex max-w-[160px] items-center gap-1 bg-white border border-gold/25 rounded-2xl rounded-bl-sm px-2 py-1 shadow-xl' },
          React.createElement(Icon, { name: 'Radio', size: 10, className: 'text-gold-dark shrink-0' }),
          React.createElement('span', { className: 'text-[9px] font-semibold text-foreground/90 truncate' }, m.broadcast.message)));
    return React.createElement(React.Fragment, null,
      bubble && React.createElement('div', { className: 'absolute pointer-events-none', style: { left: m.mapX + '%', top: m.mapY + '%', transform: `translate(-50%, calc(-100% - ${headUp}px))`, zIndex: 65 } }, bubble),
      selected && React.createElement('div', { className: 'absolute pointer-events-none whitespace-nowrap bg-white border border-gold/25 rounded-full px-2.5 py-1 text-[10px] font-bold text-foreground shadow-lg scale-in', style: { left: m.mapX + '%', top: m.mapY + '%', transform: 'translate(-50%, 10px)', zIndex: 66 } }, m.title));
  }

  // ── Route track (mobile events) ──
  function RouteTrack({ ev, cat }) {
    const color = cat ? cat.hex : '#C9A84C';
    const pts = ev.route;
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const start = pts[0], finish = pts[pts.length - 1];
    return React.createElement(React.Fragment, null,
      React.createElement('svg', { className: 'absolute inset-0 w-full h-full pointer-events-none', viewBox: '0 0 100 100', preserveAspectRatio: 'none', style: { zIndex: 15 } },
        React.createElement('path', { d, fill: 'none', stroke: '#fff', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke', opacity: 0.7 }),
        React.createElement('path', { d, fill: 'none', stroke: color, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke', className: 'dash-flow' })),
      React.createElement('div', { className: 'absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white shadow-md text-[8px] font-bold', style: { left: start.x + '%', top: start.y + '%', width: 18, height: 18, color, border: `2px solid ${color}`, zIndex: 18 } }, 'S'),
      React.createElement('div', { className: 'absolute -translate-x-1/2 -translate-y-full flex items-center justify-center rounded-md shadow-md', style: { left: finish.x + '%', top: finish.y + '%', width: 20, height: 20, background: color, zIndex: 18 } },
        React.createElement(Icon, { name: 'Flag', size: 11, className: 'text-white' })));
  }

  // ── Map ──
  function StylizedMap({ markers, routes, filterCategory, selectedId, onSelect, loading }) {
    const { pinStyle, bubbleStyle } = window.useApp();
    return React.createElement('div', { className: 'absolute inset-0 overflow-hidden', style: { background: 'var(--map-bg)' } },
      React.createElement(MapBackdrop),
      // routes under markers
      (routes || []).filter((r) => !filterCategory || r.category === filterCategory).map((r) =>
        React.createElement(RouteTrack, { key: 'rt' + r.id, ev: r, cat: window.DATA.getCategory(r.category) })),
      // markers
      markers.map((m) => {
        const cat = window.DATA.getCategory(m.category);
        const dim = filterCategory && m.category !== filterCategory && m.type !== 'idea';
        return React.createElement(Marker, {
          key: m.id, m, cat, selected: selectedId === m.id, dim,
          pinStyle, bubbleStyle, onClick: onSelect,
        });
      }),
      // soft vignette
      React.createElement('div', { className: 'absolute inset-0 pointer-events-none', style: { boxShadow: 'inset 0 0 120px rgba(120,100,60,0.18)' } }));
  }

  // ── Floaters overlay — rendered as a SIBLING of the map, outside its heavy
  //    composited subtree. Nesting bubbles inside StylizedMap (amid the big
  //    backdrop SVG + 10 transformed marker layers) makes this renderer drop
  //    them at composite time. A clean sibling overlay paints reliably — same
  //    pattern the legend, search bar and preview panel already use. ──
  function MapFloatersLayer({ markers, filterCategory, selectedId }) {
    const { pinStyle, bubbleStyle } = window.useApp();
    const list = markers.filter((m) => (m.broadcast || selectedId === m.id) && !(filterCategory && m.category !== filterCategory && m.type !== 'idea'));
    return React.createElement('div', { className: 'absolute inset-0 pointer-events-none z-[25]' },
      list.map((m) => React.createElement(Floaters, { key: 'fl' + m.id, m, cat: window.DATA.getCategory(m.category), selected: selectedId === m.id, pinStyle, bubbleStyle })));
  }

  window.StylizedMap = StylizedMap;
  window.MapFloatersLayer = MapFloatersLayer;
})();
