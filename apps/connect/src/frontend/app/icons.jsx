// ── Icon: renders any Lucide icon by name from the lucide UMD global ──
(function () {
  function toCamel(k) {
    return k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }
  const _cache = {};
  function Icon({ name, size = 18, strokeWidth = 2, className = '', style, ...rest }) {
    const lib = window.lucide && window.lucide.icons;
    const node = lib && lib[name];
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
