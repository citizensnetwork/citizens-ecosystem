// ── Citizens Wear icons ────────────────────────────────────────────
// Inline-SVG icon factory + crown logo, ported from the Claude-design
// handoff (Citizens Wear.dc.html). Exposes window.CWIcons.
(function () {
  const { createElement: h } = React;

  /** The Citizens crown mark (gold PNG asset from the design handoff). */
  function Crown({ size = 24 }) {
    return h('img', {
      src: 'assets/citizens-crown.png',
      alt: 'Citizens Wear',
      width: size,
      height: Math.round((size * 347) / 642),
      style: { display: 'block', flex: 'none', objectFit: 'contain' },
    });
  }

  /**
   * Icon factory. `Icon('heart', { size, color, sw, fill })` — same stroke
   * grammar as the design file so every glyph matches it exactly.
   */
  function Icon(name, o) {
    o = o || {};
    const c = o.color || '#1a1a1a';
    const sw = o.sw || 1.9;
    const size = o.size || 22;
    const fc = o.fill || null;
    let k = 0;
    const P = (d) =>
      h('path', {
        key: 'p' + k++,
        d,
        fill: fc || 'none',
        stroke: c,
        strokeWidth: sw,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      });
    const C = (cx, cy, r, fl) =>
      h('circle', {
        key: 'c' + k++,
        cx,
        cy,
        r,
        fill: fl ? c : fc || 'none',
        stroke: c,
        strokeWidth: sw,
      });
    const R = (x, y, w, ht, rx) =>
      h('rect', {
        key: 'r' + k++,
        x,
        y,
        width: w,
        height: ht,
        rx: rx || 0,
        fill: fc || 'none',
        stroke: c,
        strokeWidth: sw,
      });
    let ch;
    switch (name) {
      case 'home':
        ch = [
          P('M3.5 11 L12 3.5 L20.5 11'),
          P('M5.5 9.8 V20.5 H18.5 V9.8'),
          P('M9.8 20.5 V14 H14.2 V20.5'),
        ];
        break;
      case 'search':
        ch = [C(10.5, 10.5, 6.7), P('M15.6 15.6 L21 21')];
        break;
      case 'plus':
        ch = [P('M12 5 V19'), P('M5 12 H19')];
        break;
      case 'chat':
        ch = [P('M4.5 5.5 H19.5 V15.5 H11 L7 19.5 V15.5 H4.5 Z')];
        break;
      case 'comment':
        ch = [
          P(
            'M20.5 11.5 C20.5 15.4 16.7 18.5 12 18.5 C10.8 18.5 9.6 18.3 8.6 18 L3.5 19.5 L5 14.8 C4.1 13.8 3.5 12.7 3.5 11.5 C3.5 7.6 7.3 4.5 12 4.5 S20.5 7.6 20.5 11.5 Z',
          ),
        ];
        break;
      case 'user':
        ch = [C(12, 8, 3.8), P('M4.8 20.5 C5.2 16.2 8.2 14.2 12 14.2 S18.8 16.2 19.2 20.5')];
        break;
      case 'heart':
        ch = [
          P(
            'M12 20.5 C12 20.5 3.5 15 3.5 8.9 C3.5 6.1 5.7 4 8.3 4 C10.1 4 11.4 5 12 6.2 C12.6 5 13.9 4 15.7 4 C18.3 4 20.5 6.1 20.5 8.9 C20.5 15 12 20.5 12 20.5 Z',
          ),
        ];
        break;
      case 'share':
        ch = [P('M21.5 2.5 L10.8 13.2'), P('M21.5 2.5 L14.7 21.5 L10.8 13.2 L2.5 9.4 Z')];
        break;
      case 'bookmark':
        ch = [P('M6 3.5 H18 V21 L12 16.4 L6 21 Z')];
        break;
      case 'back':
        ch = [P('M15 4.5 L8 12 L15 19.5')];
        break;
      case 'chevR':
        ch = [P('M9 4.8 L16.2 12 L9 19.2')];
        break;
      case 'ellipsis':
        ch = [C(5, 12, 1.5, 1), C(12, 12, 1.5, 1), C(19, 12, 1.5, 1)];
        break;
      case 'close':
        ch = [P('M6 6 L18 18'), P('M18 6 L6 18')];
        break;
      case 'adjust':
        ch = [P('M3 7 H21'), P('M3 17 H21'), C(15, 7, 2.6), C(9, 17, 2.6)];
        break;
      case 'sliders':
        ch = [P('M6 4 V20'), P('M12 4 V20'), P('M18 4 V20'), C(6, 9, 2), C(12, 15, 2), C(18, 8, 2)];
        break;
      case 'star':
        ch = [
          P(
            'M12 3.4 L14.5 8.6 L20.2 9.4 L16.1 13.4 L17.1 19 L12 16.3 L6.9 19 L7.9 13.4 L3.8 9.4 L9.5 8.6 Z',
          ),
        ];
        break;
      case 'location':
        ch = [
          P(
            'M12 21.5 C12 21.5 18.5 14.8 18.5 9.4 A6.5 6.5 0 0 0 5.5 9.4 C5.5 14.8 12 21.5 12 21.5 Z',
          ),
          C(12, 9.4, 2.4),
        ];
        break;
      case 'link':
        ch = [
          P('M8.6 15.4 L15.4 8.6'),
          P('M7.2 12.8 L5.6 14.4 A3 3 0 0 0 9.6 18.4 L11.2 16.8'),
          P('M16.8 11.2 L18.4 9.6 A3 3 0 0 0 14.4 5.6 L12.8 7.2'),
        ];
        break;
      case 'send':
        ch = [P('M22 2.5 L11 13.5'), P('M22 2.5 L15 21 L11 13.5 L3.5 9.5 Z')];
        break;
      case 'edit':
        ch = [P('M16.5 4.2 L19.8 7.5 L8 19.3 L4 20.3 L5 16.3 Z')];
        break;
      case 'image':
        ch = [R(4, 5, 16, 14, 2.5), C(9, 10, 1.6), P('M5 18 L10 13 L13.5 16.5 L16 14 L19 17')];
        break;
      case 'doc':
        ch = [R(5, 3, 14, 18, 2.5), P('M8.5 8 H15.5'), P('M8.5 12 H15.5'), P('M8.5 16 H13')];
        break;
      case 'clock':
        ch = [C(12, 12, 8.7), P('M12 7 V12 L15.5 14')];
        break;
      case 'calendar':
        ch = [R(4, 5, 16, 16, 2.5), P('M4 9.5 H20'), P('M8 2.5 V6'), P('M16 2.5 V6')];
        break;
      case 'bell':
        ch = [
          P('M6 10.5 A6 6 0 0 1 18 10.5 C18 16.5 20 17.5 20 17.5 H4 C4 17.5 6 16.5 6 10.5 Z'),
          P('M10 20.5 A2 2 0 0 0 14 20.5'),
        ];
        break;
      case 'grid':
        ch = [R(4, 4, 7, 7, 1.5), R(13, 4, 7, 7, 1.5), R(4, 13, 7, 7, 1.5), R(13, 13, 7, 7, 1.5)];
        break;
      case 'check':
        ch = [P('M5 12.5 L10 17.5 L19.5 6.5')];
        break;
      case 'tee':
        ch = [
          P(
            'M8 4 L4.5 6.5 L6.8 9.5 L8.5 8.3 V20 H15.5 V8.3 L17.2 9.5 L19.5 6.5 L16 4 C16 5.6 14.2 6.3 12 6.3 S8 5.6 8 4 Z',
          ),
        ];
        break;
      case 'globe':
        ch = [
          C(12, 12, 8.6),
          P('M3.4 12 H20.6'),
          P('M12 3.4 C14.5 6 14.5 18 12 20.6 C9.5 18 9.5 6 12 3.4 Z'),
        ];
        break;
      case 'follow':
        ch = [
          C(9, 8, 3.6),
          P('M3.2 20 C3.7 16 5.9 14.3 9 14.3 C10.1 14.3 11.1 14.5 12 15'),
          P('M17.5 9 V15'),
          P('M14.5 12 H20.5'),
        ];
        break;
      case 'people':
        ch = [
          C(8.5, 9, 3),
          C(16, 9.5, 2.4),
          P('M3 19 C3.4 15.5 5.5 14 8.5 14 C10 14 11.3 14.4 12.2 15.3'),
          P('M13.5 18.5 C14 16 15.6 14.8 17.5 14.8 C19 14.8 20.3 15.4 21 17'),
        ];
        break;
      case 'logout':
        ch = [P('M9 4.5 H5.5 V19.5 H9'), P('M15 8 L19.5 12 L15 16'), P('M19.5 12 H9.5')];
        break;
      case 'mic':
        ch = [
          R(9, 2.5, 6, 11, 3),
          P('M6 11 A6 6 0 0 0 18 11'),
          P('M12 17 V21.5'),
          P('M8.5 21.5 H15.5'),
        ];
        break;
      default:
        ch = [C(12, 12, 8)];
    }
    return h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        style: { display: 'block', flex: 'none' },
      },
      ch,
    );
  }

  window.CWIcons = { Crown, Icon };
})();
