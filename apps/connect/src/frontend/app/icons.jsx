// ── Icon: renders any Lucide icon by name from the lucide UMD global ──
(function () {
  function toCamel(k) {
    return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  // lucide's UMD has shipped its icon nodes in two shapes: a flat child list
  // ([[tag, attrs], …], the current 1.x form) and a full element triple
  // (['svg', attrs, children], seen in the 0.44x line). Destructuring the
  // wrong one throws inside render, which unmounts the entire React root —
  // one upstream release could white-screen the whole app. Normalise instead,
  // and degrade to an empty (but valid) <svg> if the name is unknown.
  function childrenOf(name) {
    const lib = window.lucide && window.lucide.icons;
    let node = lib && lib[name];
    if (!Array.isArray(node)) return null;
    if (typeof node[0] === 'string') node = Array.isArray(node[2]) ? node[2] : [];
    return node.filter((c) => Array.isArray(c) && typeof c[0] === 'string');
  }

  function Icon({ name, size = 18, strokeWidth = 2, className = '', style, ...rest }) {
    const node = childrenOf(name);
    const children = node
      ? node.map(([tag, attrs], i) => {
          const a = {};
          for (const k in attrs) a[toCamel(k)] = attrs[k];
          a.key = i;
          return React.createElement(tag, a);
        })
      : null;
    return React.createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        style,
        ...rest,
      },
      children
    );
  }
  window.Icon = Icon;
})();
