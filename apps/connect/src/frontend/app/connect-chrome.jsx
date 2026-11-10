// Connect map shell: phone glow-nav, desktop crown rail, search, category strip, Do drawer.
// Layout and copy are the approved preview. Data, auth and APIs stay as they are.
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const NS = 'http://www.w3.org/2000/svg';
  const WIDE_MQ = '(min-width: 768px)';

const GLYPHS={
  "church":"<path d=\"M12 2.5V6.5M10 4.5H14M7 21V11L12 7.5L17 11V21M4.5 21H19.5M7 14H4.5V21M17 14H19.5V21M10.5 21V17.5C10.5 16.7 11.2 16 12 16C12.8 16 13.5 16.7 13.5 17.5V21\"/>",
  "praying-hands":"<path d=\"M9 21V11a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6c0 2 1 4 3 4zM15 21V11a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v6c0 2-1 4-3 4zM9 9V5a1.5 1.5 0 0 1 3 0v4M15 9V5a1.5 1.5 0 0 0-3 0v4\"/>",
  "coffee":"<path d=\"M4 20H18M10.94 20C7.1 19.97 4 16.85 4 13V8.92C4 8.41 4.41 8 4.92 8H17.08C17.59 8 18 8.41 18 8.92V9M11.06 20C14.9 19.97 18 16.85 18 13M18 9H19.5C20.88 9 22 10.12 22 11.5C22 12.88 20.88 14 19.5 14H18V13M18 9V13M15 3L14 5M12 3L11 5M9 3L8 5\"/>",
  "radio":"<path d=\"M5.6 18.4C2.1 14.9 2.1 9.1 5.6 5.6M8.4 15.6C6.5 13.7 6.5 10.3 8.4 8.4M15.6 8.4C17.5 10.3 17.5 13.7 15.6 15.6M18.4 5.6C21.9 9.1 21.9 14.9 18.4 18.4\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\"/>",
  "soccer-ball":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7.5 8.8 9.8 10 13.5H14L15.2 9.8ZM12 7.5V3.5M8.8 9.8 5.2 8.6M15.2 9.8 18.8 8.6M10 13.5 8 16.5M14 13.5 16 16.5\"/>",
  "globe":"<path d=\"M3 12H8M3 12C3 16.97 7.03 21 12 21M3 12C3 7.03 7.03 3 12 3M8 12H16M8 12C8 16.97 9.79 21 12 21M8 12C8 7.03 9.79 3 12 3M16 12H21M16 12C16 7.03 14.21 3 12 3M16 12C16 16.97 14.21 21 12 21M21 12C21 7.03 16.97 3 12 3M21 12C21 16.97 16.97 21 12 21\"/>",
  "graduation-cap":"<path d=\"M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.7 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.7 0zM21.5 10V15M6 12.5V16C6 17.7 8.7 19 12 19S18 17.7 18 16V12.5\"/>",
  "hand-heart":"<path d=\"M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16m4 4 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9M2 15l6 6M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z\"/>",
  "heart":"<path d=\"M12 6C10.2 3.9 7.19 3.26 4.94 5.18C2.68 7.1 2.37 10.31 4.14 12.58C5.61 14.47 10.06 18.45 11.52 19.74C11.69 19.88 11.77 19.95 11.87 19.98C11.95 20.01 12.04 20.01 12.12 19.98C12.22 19.95 12.3 19.88 12.46 19.74C13.92 18.45 18.38 14.47 19.85 12.58C21.62 10.31 21.34 7.08 19.05 5.18C16.76 3.28 13.8 3.9 12 6Z\"/>",
  "heart-handshake":"<path d=\"M12 6C10.2 3.9 7.19 3.26 4.94 5.18C2.68 7.1 2.37 10.31 4.14 12.58C5.61 14.47 10.06 18.45 11.52 19.74C11.69 19.88 11.77 19.95 11.87 19.98C11.95 20.01 12.04 20.01 12.12 19.98C12.22 19.95 12.3 19.88 12.46 19.74C13.92 18.45 18.38 14.47 19.85 12.58C21.62 10.31 21.34 7.08 19.05 5.18C16.76 3.28 13.8 3.9 12 6Z\"/><path d=\"M12 6 9.6 8.4C8.9 9.1 8.9 10.2 9.6 10.9S11.4 11.6 12.1 10.9L13.6 9.5C14.4 8.8 15.6 8.8 16.4 9.5L19.6 12.3M16.6 14.6 15 13M14.2 16.9 12.8 15.5\"/>",
  "martini":"<path d=\"M8 21H16M12 11V21M19 3 12 11 5 3Z\"/>",
  "stethoscope":"<path d=\"M16 7V6.2C16 5.08 16 4.52 15.78 4.09C15.59 3.72 15.28 3.41 14.91 3.22C14.48 3 13.92 3 12.8 3H11.2C10.08 3 9.52 3 9.09 3.22C8.72 3.41 8.41 3.72 8.22 4.09C8 4.52 8 5.08 8 6.2V7M7 7V21M17 7V21M10 14H14M12 12V16M7.8 21H16.2C17.88 21 18.72 21 19.36 20.67C19.93 20.39 20.39 19.93 20.67 19.36C21 18.72 21 17.88 21 16.2V11.8C21 10.12 21 9.28 20.67 8.64C20.39 8.07 19.93 7.61 19.36 7.33C18.72 7 17.88 7 16.2 7H7.8C6.12 7 5.28 7 4.64 7.33C4.07 7.61 3.61 8.07 3.33 8.64C3 9.28 3 10.12 3 11.8V16.2C3 17.88 3 18.72 3.33 19.36C3.61 19.93 4.07 20.39 4.64 20.67C5.28 21 6.12 21 7.8 21Z\"/>",
  "book-open":"<path d=\"M12 10.4V20M12 10.4C12 8.16 12 7.04 11.56 6.18C11.18 5.43 10.57 4.82 9.82 4.44C8.96 4 7.84 4 5.6 4H4.6C4.04 4 3.76 4 3.55 4.11C3.36 4.2 3.2 4.36 3.11 4.55C3 4.76 3 5.04 3 5.6V16.4C3 16.96 3 17.24 3.11 17.45C3.2 17.64 3.36 17.8 3.55 17.89C3.76 18 4.04 18 4.6 18H7.55C8.09 18 8.36 18 8.62 18.05C8.85 18.09 9.08 18.16 9.29 18.25C9.54 18.36 9.76 18.51 10.21 18.81L12 20M12 10.4C12 8.16 12 7.04 12.44 6.18C12.82 5.43 13.43 4.82 14.18 4.44C15.04 4 16.16 4 18.4 4H19.4C19.96 4 20.24 4 20.45 4.11C20.64 4.2 20.8 4.36 20.89 4.55C21 4.76 21 5.04 21 5.6V16.4C21 16.96 21 17.24 20.89 17.45C20.8 17.64 20.64 17.8 20.45 17.89C20.24 18 19.96 18 19.4 18H16.45C15.91 18 15.64 18 15.38 18.05C15.15 18.09 14.92 18.16 14.71 18.25C14.46 18.36 14.24 18.51 13.79 18.81L12 20\"/>",
  "shopping-bag":"<path d=\"M8 8H7.71C6.75 8 6.27 8 5.88 8.18C5.53 8.33 5.24 8.58 5.03 8.89C4.79 9.25 4.71 9.72 4.55 10.67L3.62 16.27C3.41 17.56 3.3 18.2 3.49 18.7C3.65 19.13 3.96 19.5 4.37 19.73C4.83 20 5.48 20 6.78 20H17.22C18.52 20 19.17 20 19.63 19.73C20.04 19.5 20.35 19.13 20.51 18.7C20.7 18.2 20.59 17.56 20.38 16.28L19.45 10.67C19.29 9.72 19.21 9.25 18.97 8.89C18.76 8.58 18.47 8.33 18.12 8.18C17.73 8 17.25 8 16.29 8H16M8 8H16M8 8C8 5.79 9.79 4 12 4C14.21 4 16 5.79 16 8\"/>",
  "store":"<path d=\"M3.5 9 5.2 4.6C5.4 4 5.9 3.7 6.5 3.7H17.5C18.1 3.7 18.6 4 18.8 4.6L20.5 9M3.5 9H20.5M3.5 9C3.5 10.4 4.6 11.5 6 11.5S8.5 10.4 8.5 9C8.5 10.4 9.6 11.5 11 11.5H13C14.4 11.5 15.5 10.4 15.5 9C15.5 10.4 16.6 11.5 18 11.5S20.5 10.4 20.5 9M5 11.3V20.3H19V11.3M10 20.3V16.3C10 15.7 10.4 15.3 11 15.3H13C13.6 15.3 14 15.7 14 16.3V20.3\"/>",
  "palette":"<path d=\"M12 3C7 3 3 7 3 12S7 21 12 21C12.9 21 13.5 20.3 13.5 19.5C13.5 19.1 13.3 18.8 13.1 18.5C12.8 18.2 12.7 17.9 12.7 17.5C12.7 16.7 13.4 16 14.2 16H16C18.8 16 21 13.8 21 11C21 6.6 17 3 12 3Z\"/><path d=\"M7.5 12H7.51M9 8H9.01M13.5 6.8H13.51M17 9.5H17.01\"/>",
  "dumbbell":"<path d=\"M6.5 6.5 17.5 17.5M3.5 9.5 9.5 3.5M5.5 11.5 11.5 5.5M14.5 20.5 20.5 14.5M12.5 18.5 18.5 12.5M3 5.5 5.5 3M18.5 21 21 18.5\"/>",
  "mic":"<path d=\"m11 7.6-6 8.2a1 1 0 0 0 .1 1.3l.8.8a1 1 0 0 0 1.3.1L15.1 12M16.5 21.2C15.5 20.5 14.4 20 13 20c-2 0-3.9 2.4-6 2-2.1-.4-2.8-3.4-1.5-4.5\"/><circle cx=\"16\" cy=\"7\" r=\"5\"/>",
  "flame":"<path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z\"/>",
  "lollipop":"<circle cx=\"10\" cy=\"9\" r=\"6\"/><path d=\"M10 5.5A3.5 3.5 0 0 1 13.5 9M14.3 13.3 20 20.5\"/>",
  "key-round":"<path d=\"M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4z\"/><path d=\"M16.5 7.5H16.51\"/>",
  "leaf":"<path d=\"M20 4C21 13 17 20 10 19A7 7 0 0 1 5 7C9 4 14 7 20 4Z\"/><path d=\"M4 21 16 9\"/>",
  "user-round":"<circle cx=\"12\" cy=\"8\" r=\"4.5\"/><path d=\"M19.5 21A7.5 7.5 0 0 0 4.5 21\"/>",
  "user":"<path d=\"M5 21C5 17.13 8.13 14 12 14C15.87 14 19 17.13 19 21M16 7C16 9.21 14.21 11 12 11C9.79 11 8 9.21 8 7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7Z\"/>",
  "users":"<path d=\"M17 20C17 18.34 14.76 17 12 17C9.24 17 7 18.34 7 20M21 17C21 15.77 19.77 14.71 18 14.25M3 17C3 15.77 4.23 14.71 6 14.25M18 10.24C18.61 9.69 19 8.89 19 8C19 6.34 17.66 5 16 5C15.23 5 14.53 5.29 14 5.76M6 10.24C5.39 9.69 5 8.89 5 8C5 6.34 6.34 5 8 5C8.77 5 9.47 5.29 10 5.76M12 14C10.34 14 9 12.66 9 11C9 9.34 10.34 8 12 8C13.66 8 15 9.34 15 11C15 12.66 13.66 14 12 14Z\"/>",
};
const FRAMES={"church": "translate(0 0.55)", "coffee": "translate(-1 0.7)", "graduation-cap": "translate(12 12) scale(0.903) translate(-12 -12.01)", "hand-heart": "translate(12 12) scale(0.899) translate(-12.01 -11.88)", "mic": "translate(12 12) scale(0.898) translate(-12.9 -12.02)", "flame": "translate(12 12) scale(0.947) translate(-12 -12.7)", "lollipop": "translate(0 0.25)", "key-round": "translate(12 12) scale(0.898) translate(-12.02 -11.98)", "leaf": "translate(0.47 -0.5)", "user-round": "translate(0 -0.25)", "users": "translate(0 -0.5)"};
const SLUGS={"worship-prayer": "praying-hands", "church-services": "church", "conferences-summits": "mic", "churches-ministries": "church", "outreach-missions": "globe", "community-upliftment": "heart-handshake", "care-recovery": "hand-heart", "health-wellness": "stethoscope", "safe-spaces": "heart", "retreat-healing": "leaf", "clinic": "stethoscope", "rehab-development": "hand-heart", "markets-expos": "store", "sport-recreation": "soccer-ball", "arts-culture": "palette", "social-gatherings": "martini", "recreation-sport": "dumbbell", "arts-creative": "palette", "media-broadcasting": "radio", "education-equipping": "graduation-cap", "marriage-family": "users", "education-training": "book-open", "mens-community": "user", "womens-community": "user-round", "youth-students": "flame", "kids": "lollipop", "members-only": "key-round", "hospitality-cafes": "coffee", "retail-shopping": "shopping-bag", "christian-businesses": "store"};

  const GROUPS = [
    { id: 'worship', name: 'Churches & worship', hex: '#7040b5' },
    { id: 'serve', name: 'Serve & care', hex: '#087d69' },
    { id: 'culture', name: 'Culture & fun', hex: '#c14f2a' },
    { id: 'learn', name: 'Learn & grow', hex: '#245fba' },
    { id: 'audiences', name: 'Audiences', hex: '#b33272' },
    { id: 'business', name: 'Business', hex: '#687d20' },
  ];
  const HEX = {};
  GROUPS.forEach((g) => { HEX[g.id] = g.hex; });
  const DO_PAGES = ['community', 'lets', 'apply'];
  // Public city centres already used by the app's city labels. The select shows where the map is; it does not switch a second location model.
  const CITIES = [
    { name: 'Pretoria', lat: -25.7479, lng: 28.2293 },
    { name: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
    { name: 'Cape Town', lat: -33.9249, lng: 18.4241 },
    { name: 'Durban', lat: -29.8587, lng: 31.0218 },
    { name: 'Gqeberha', lat: -33.9608, lng: 25.6022 },
    { name: 'Bloemfontein', lat: -29.0852, lng: 26.1596 },
  ];

  const shell = { search: false, filter: false, central: false, panels: false, subs: new Set() };
  function patchShell(p) {
    let changed = false;
    Object.keys(p).forEach((k) => { if (shell[k] !== p[k]) { shell[k] = p[k]; changed = true; } });
    if (changed) shell.subs.forEach((f) => f());
  }
  function useShell() {
    const [, setN] = useState(0);
    useEffect(() => {
      const f = () => setN((n) => n + 1);
      shell.subs.add(f);
      return () => { shell.subs.delete(f); };
    }, []);
    return shell;
  }
  function useWide() {
    const get = () => !!(window.matchMedia && window.matchMedia(WIDE_MQ).matches);
    const [wide, setWide] = useState(get);
    useEffect(() => {
      if (!window.matchMedia) return undefined;
      const mq = window.matchMedia(WIDE_MQ);
      const on = () => setWide(mq.matches);
      if (mq.addEventListener) mq.addEventListener('change', on);
      return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); };
    }, []);
    return wide;
  }
  function cityNear(lat, lng) {
    let best = '', bestD = 0.45 * 0.45;
    CITIES.forEach((c) => {
      const d = (c.lat - lat) * (c.lat - lat) + (c.lng - lng) * (c.lng - lng);
      if (d < bestD) { bestD = d; best = c.name; }
    });
    return best;
  }
  function useArea() {
    const [area, setArea] = useState('');
    useEffect(() => {
      const read = () => {
        const map = window.__ccMap;
        if (!map || !map.getCenter) return;
        const c = map.getCenter();
        const next = cityNear(c.lat, c.lng);
        setArea((prev) => (prev === next ? prev : next));
      };
      read();
      const t = setInterval(read, 800);
      window.addEventListener('cc-map-ready', read);
      return () => { clearInterval(t); window.removeEventListener('cc-map-ready', read); };
    }, []);
    return area;
  }

  function svg(children) {
    return h('svg', {
      viewBox: '0 0 24 24', width: '100%', fill: 'none', stroke: 'currentColor',
      strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', className: 'dazzle',
    }, children);
  }
  function Icon({ kind }) {
    if (kind === 'Central') return h('span', { className: 'type-c', 'aria-hidden': 'true' }, 'C');
    if (kind === 'Me') return svg(h('path', { d: 'M5 21C5 17.13 8.13 14 12 14C15.87 14 19 17.13 19 21M16 7C16 9.21 14.21 11 12 11C9.79 11 8 9.21 8 7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7Z' }));
    if (kind === 'Map') return svg(h('path', { d: 'M15 6V21M15 6L21 3V18L15 21M15 6L9 3M15 21L9 18M9 18L3 21V6L9 3M9 18V3' }));
    if (kind === 'Explore') return svg([h('circle', { key: 'c', cx: '12', cy: '12', r: '9' }), h('path', { key: 'p', d: 'M15.5 8.5 13.4 13.4 8.5 15.5 10.6 10.6Z' })]);
    if (kind === 'Do') return svg([
      h('rect', { key: 'a', x: '4', y: '4', width: '6.5', height: '6.5', rx: '2' }),
      h('rect', { key: 'b', x: '13.5', y: '4', width: '6.5', height: '6.5', rx: '2' }),
      h('rect', { key: 'c', x: '4', y: '13.5', width: '6.5', height: '6.5', rx: '2' }),
      h('rect', { key: 'd', x: '13.5', y: '13.5', width: '6.5', height: '6.5', rx: '2' }),
    ]);
    if (kind === 'search') return svg(h('path', { d: 'M15.8 15.81L21 21M18 10.5C18 14.64 14.64 18 10.5 18C6.36 18 3 14.64 3 10.5C3 6.36 6.36 3 10.5 3C14.64 3 18 6.36 18 10.5Z' }));
    if (kind === 'layers') return svg(h('path', { d: 'M21 12L12 18L3 12M21 16L12 22L3 16M21 8L12 14L3 8L12 2L21 8Z' }));
    if (kind === 'chevron-left') return svg(h('path', { d: 'M15 6 9 12 15 18' }));
    if (kind === 'chevron-right') return svg(h('path', { d: 'M9 6 15 12 9 18' }));
    return svg(h('path', { d: 'M12 3.5 14.6 8.8 20.4 9.6 16.2 13.7 17.2 19.5 12 16.8 6.8 19.5 7.8 13.7 3.6 9.6 9.4 8.8Z' }));
  }
  function Crown() {
    return h('svg', {
      width: '100%', viewBox: '0 0 240 130', fill: 'none', stroke: '#d4af37', strokeWidth: '7', strokeLinecap: 'round', 'aria-hidden': 'true',
    },
      h('path', { d: 'M13 43 Q72 88 120 96 Q168 88 227 43 L208 105 Q140 87 120 12 Q100 87 32 105 Z', strokeLinejoin: 'miter' }),
      h('path', { d: 'M32 119 Q120 106 208 119' }));
  }
  function GlobeMark() {
    return h('svg', { viewBox: '0 0 24 24', width: '100%', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', 'aria-hidden': 'true' },
      h('circle', { cx: '12', cy: '12', r: '9' }),
      h('ellipse', { cx: '12', cy: '12', rx: '4', ry: '9' }),
      h('path', { d: 'M3 12h18M5 6q7 5 14 0M5 18q7-5 14 0' }));
  }

  function glyphNode(slug) {
    const icon = SLUGS[slug] || 'user';
    const svgEl = document.createElementNS(NS, 'svg');
    svgEl.setAttribute('viewBox', '0 0 24 24');
    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.setAttribute('fill', 'none');
    svgEl.setAttribute('stroke', 'currentColor');
    svgEl.setAttribute('stroke-width', '2');
    svgEl.setAttribute('stroke-linecap', 'round');
    svgEl.setAttribute('stroke-linejoin', 'round');
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.setAttribute('class', 'glyph-svg');
    const g = document.createElementNS(NS, 'g');
    if (FRAMES[icon]) g.setAttribute('transform', FRAMES[icon]);
    g.innerHTML = GLYPHS[icon] || GLYPHS.user;
    svgEl.appendChild(g);
    return svgEl;
  }
  function groupIdOf(slug) {
    const X = window.MapV2Explore;
    if (X && X.groupOf) return X.groupOf({ category: slug }) || '';
    return '';
  }
  function groupHex(slug) {
    return HEX[groupIdOf(slug)] || '';
  }

  const ITEMS = [
    { id: 'me', label: 'Me', kind: 'Me' },
    { id: 'map', label: 'Map', kind: 'Map' },
    { id: 'central', label: 'Central', kind: 'Central' },
    { id: 'do', label: 'Do', kind: 'Do' },
    { id: 'explore', label: 'Explore', kind: 'Explore' },
  ];
  const DO_ROWS = [
    { page: 'community', title: 'Kingdom Projects', line: 'A shared need. A shared response.' },
    { page: 'lets', title: 'Let\u2019s\u2026', line: 'Make a little room for together.' },
    { page: 'apply', title: 'List an organisation', line: 'Be easier to discover.' },
  ];

  function Nav() {
    const app = window.useApp();
    const wide = useWide();
    const state = useShell();
    const [open, setOpen] = useState(true);
    const [drawer, setDrawer] = useState(false);
    const page = app.nav && app.nav.page;
    const params = (app.nav && app.nav.params) || {};

    useEffect(() => {
      const hide = () => { if (!wide) setOpen(false); };
      window.addEventListener('cc-map-gesture', hide);
      window.addEventListener('cc-map-select', hide);
      return () => {
        window.removeEventListener('cc-map-gesture', hide);
        window.removeEventListener('cc-map-select', hide);
      };
    }, [wide]);
    useEffect(() => {
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        if (document.querySelector("[role='dialog']")) return;
        if (drawer) { setDrawer(false); return; }
        if (!wide && open) setOpen(false);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [drawer, open, wide]);

    const active = (id) => {
      if (id === 'do') return drawer || DO_PAGES.indexOf(page) !== -1;
      if (id === 'central') return !!state.central;
      if (id === 'map') return page === 'home' && !state.central;
      if (id === 'me') return page === 'profile' && !params.id;
      if (id === 'explore') return page === 'explore';
      return false;
    };
    const goItem = (id) => {
      if (id === 'do') { setDrawer((d) => !d); return; }
      setDrawer(false);
      setOpen(true);
      if (id === 'me') { patchShell({ central: false }); app.go('profile', {}); return; }
      if (id === 'explore') { patchShell({ central: false }); app.go('explore'); return; }
      if (id === 'central') { patchShell({ central: true }); if (page !== 'home') app.go('home', {}); return; }
      patchShell({ central: false });
      app.go('home', {});
    };
    const small = open || state.panels;
    const sourceLabel = state.panels ? 'Hide panels and show navigation' : (open ? 'Hide navigation' : 'Show navigation');
    const toggle = () => {
      if (state.panels) {
        patchShell({ panels: false });
        window.dispatchEvent(new Event('cc-map-clear'));
        setOpen(true);
        setDrawer(false);
        return;
      }
      setOpen((v) => !v);
      setDrawer(false);
    };
    const item = (it) => h('button', {
      key: it.id, type: 'button', className: active(it.id) ? 'active' : '',
      'data-nav': it.id,
      'aria-current': active(it.id) ? 'page' : undefined,
      onClick: () => goItem(it.id),
    }, h('span', { className: 'inline-icon' }, h(Icon, { kind: it.kind })), h('small', null, it.label));

    const drawerEl = drawer && h('div', { className: 'cn-do-drawer cn-glass', role: 'menu', 'aria-label': 'Do options' },
      DO_ROWS.map((row, n) => h('button', {
        key: row.page, type: 'button', role: 'menuitem',
        onClick: () => { setDrawer(false); patchShell({ central: false }); app.go(row.page); },
      }, h('span', null, '0' + (n + 1)), h('div', null, h('b', null, row.title), h('small', null, row.line)), h('span', null, '\u2192'))));

    if (wide) {
      return h(React.Fragment, null,
        h('div', { className: 'desktop-navigation' },
          h('button', {
            type: 'button', className: 'desktop-crown cn-glass',
            onClick: toggle, 'aria-label': 'Citizens navigation', 'aria-expanded': open ? 'true' : 'false',
          }, h(Crown)),
          open && h('nav', { className: 'cn-vertical cn-glass', 'aria-label': 'Connect navigation' }, ITEMS.map(item))),
        drawerEl);
    }
    return h(React.Fragment, null,
      h('div', { className: 'mobile-navigation' },
        open && h('nav', { className: 'cn-dock cn-glass', 'aria-label': 'Connect navigation' }, ITEMS.map(item)),
        h('button', {
          type: 'button',
          className: 'cn-source ' + (small ? 'reduced cn-glass' : 'glowing'),
          'aria-label': sourceLabel, 'aria-expanded': open ? 'true' : 'false',
          onClick: toggle,
        }, small ? h(Crown) : null)),
      drawerEl);
  }

  function CategoryStrip({ value, onPick }) {
    const strip = useRef(null);
    const [edges, setEdges] = useState({ l: false, r: false });
    const measure = () => {
      const el = strip.current;
      if (!el) return;
      const l = el.scrollLeft > 4;
      const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setEdges((p) => (p.l === l && p.r === r ? p : { l, r }));
    };
    useEffect(() => {
      const el = strip.current;
      if (!el) return undefined;
      const chip = el.querySelector("[data-on='true']");
      if (chip && (chip.offsetLeft < el.scrollLeft || chip.offsetLeft + chip.offsetWidth > el.scrollLeft + el.clientWidth)) {
        el.scrollTo({ left: Math.max(0, chip.offsetLeft - el.clientWidth / 2 + chip.offsetWidth / 2), behavior: 'smooth' });
      }
      measure();
      const t = window.setTimeout(measure, 400);
      window.addEventListener('resize', measure);
      return () => { window.clearTimeout(t); window.removeEventListener('resize', measure); };
    }, [value]);
    const nudge = (d) => {
      const el = strip.current;
      if (el) el.scrollBy({ left: d * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' });
    };
    const chips = [{ id: 'all', name: 'All', hex: '' }].concat(GROUPS);
    return h('div', { className: 'cn-category-strip cn-glass', role: 'group', 'aria-label': 'Filter the map by category' },
      h('div', { className: 'strip-scroller', ref: strip, onScroll: measure },
        chips.map((g) => {
          const on = value === g.id;
          return h('button', {
            key: g.id, type: 'button', 'data-on': on ? 'true' : 'false',
            className: 'strip-chip' + (on ? ' on' : ''), 'aria-pressed': on,
            style: { '--chip': g.hex || '#272a25' },
            onClick: () => onPick(on && g.id !== 'all' ? 'all' : g.id),
          }, g.hex ? h('i') : h('span', { className: 'all-mark', 'aria-hidden': 'true' }, h(Icon, { kind: 'layers' })), g.name);
        })),
      edges.l && h('div', { className: 'strip-edge left' },
        h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Scroll categories left', onClick: () => nudge(-1) },
          h('span', { className: 'inline-icon' }, h(Icon, { kind: 'chevron-left' })))),
      edges.r && h('div', { className: 'strip-edge right' },
        h('button', { type: 'button', className: 'cn-round', 'aria-label': 'Scroll categories right', onClick: () => nudge(1) },
          h('span', { className: 'inline-icon' }, h(Icon, { kind: 'chevron-right' })))));
  }

  function MapChrome({ query, onQuery, group, onGroup }) {
    const [open, setOpen] = useState(false);
    const area = useArea();
    useEffect(() => { patchShell({ search: open, filter: !open && group !== 'all' }); }, [open, group]);
    const groupMeta = GROUPS.find((g) => g.id === group);
    return h(React.Fragment, null,
      h('div', { className: 'connect-utility' },
        h('div', { className: 'cn-brand' },
          h('span', null, 'CONNECT'),
          area ? h('small', null, area) : null)),
      h('div', { className: 'cn-search cn-glass' + (open ? ' expanded' : '') + (query ? ' highlighted' : '') },
        h('button', {
          type: 'button', className: 'cn-search-icon', 'aria-label': open ? 'Close search' : 'Expand search',
          onClick: () => { setOpen((v) => !v); if (open) onQuery(''); },
        }, h('span', { className: 'inline-icon' }, h(Icon, { kind: 'search' }))),
        open && h(React.Fragment, null,
          h('input', {
            autoFocus: true, 'aria-label': 'Search Connect', placeholder: 'People, places, events\u2026',
            value: query, onChange: (e) => onQuery(e.target.value),
          }),
          h('select', { 'aria-label': 'Search location', value: area || '', onChange: () => {} },
            h('option', { value: area || '' }, area || '')),
          h('button', { type: 'button', className: 'cn-text', 'aria-label': 'Clear search', onClick: () => onQuery('') }, '\u00d7'))),
      open && h(CategoryStrip, { value: group, onPick: onGroup }),
      !open && group !== 'all' && groupMeta && h('div', { className: 'cn-filter-pill cn-glass', style: { '--chip': groupMeta.hex } },
        h('button', { type: 'button', onClick: () => setOpen(true), 'aria-label': 'Showing ' + groupMeta.name + '; open categories' },
          h('i'), groupMeta.name),
        h('button', { type: 'button', 'aria-label': 'Show all categories', onClick: () => onGroup('all') }, '\u00d7')));
  }

  function CentralView() {
    return h('div', { className: 'connect-central-view ambient', 'data-screen': 'central' });
  }

  window.ConnectChrome = {
    Nav, MapChrome, CentralView, GlobeMark, glyphNode, groupHex, GROUPS, patchShell, shell, useShell, useWide,
  };
})();
