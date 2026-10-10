// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Map v2 "Map look" control (tracker P1-12)
//  ------------------------------------------------------------------
//  A 44 px button on the map screen that opens a three-choice menu:
//  Match my phone (auto) · Light · Dark. The choice is stored per device
//  (localStorage `cc_map_theme`, owned by map-v2-lib.jsx) and DEFAULTS TO
//  LIGHT: a first-time visitor sees light whatever their phone is set to
//  (founder, D1). map-v2-lib.jsx puts `data-theme` on <html> (the tokens),
//  and map.jsx swaps the base style when it hears the change.
//
//  The menu is an overlay, so it uses useBackGuard like every other one:
//  Back closes it before anything else; Escape and a tap outside do too.
//  Text: MapV2Strings.look.
// ════════════════════════════════════════════════════════════════════
(function () {
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const useBackGuard = window.useBackGuard || function () {};
  const CHOICES = ['auto', 'light', 'dark'];

  function Menu({ current, onPick, onClose }) {
    const ref = useRef(null);
    const Str = window.MapV2Strings.look;
    useBackGuard(true, onClose);
    useEffect(() => {
      const first = ref.current && ref.current.querySelector('[aria-checked="true"]');
      if (first) first.focus({ preventScroll: true });
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
      const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !(e.target.closest && e.target.closest('[data-mv2="look-btn"]'))) onClose(); };
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('pointerdown', onDown, true);
      return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); };
    }, []);
    const onKeyDown = (e) => {
      const items = Array.from(ref.current.querySelectorAll('[role="menuitemradio"]'));
      const i = items.indexOf(document.activeElement);
      let n = -1;
      if (e.key === 'ArrowDown') n = (i + 1) % items.length;
      else if (e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = items.length - 1;
      if (n >= 0) { e.preventDefault(); items[n].focus(); }
    };
    return h('div', { ref, role: 'menu', 'aria-label': Str.menuLabel, 'data-mv2': 'look-menu', onKeyDown },
      CHOICES.map((c) => h('button', {
        key: c, type: 'button', role: 'menuitemradio', 'aria-checked': c === current, 'data-mv2': 'look-item',
        onClick: () => onPick(c),
      }, h('span', { 'data-mv2': 'look-dot', 'aria-hidden': 'true' }), Str[c])));
  }

  function MapV2LookControl() {
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState(() => window.MapV2.themeSetting());
    const Str = window.MapV2Strings.look;
    const Icon = window.Icon;
    const btn = useRef(null);
    const pick = (c) => {
      window.MapV2.setTheme(c);
      setCurrent(c);
      setOpen(false);
      if (btn.current) btn.current.focus({ preventScroll: true });
    };
    const resolved = window.MapV2.resolvedTheme();
    return h('div', { 'data-mv2': 'look' },
      h('button', {
        ref: btn, type: 'button', 'data-mv2': 'look-btn', 'aria-label': Str.label, 'aria-haspopup': 'menu', 'aria-expanded': open,
        onClick: () => setOpen((o) => !o),
      }, h(Icon, { name: resolved === 'dark' ? 'Moon' : 'Sun', size: 20 })),
      open && h(Menu, { current, onPick: pick, onClose: () => { setOpen(false); if (btn.current) btn.current.focus({ preventScroll: true }); } }));
  }

  window.MapV2LookControl = MapV2LookControl;
})();
