(function () {
  const h = React.createElement;
  const GROUPS = [
    { id: 'worship', name: 'Churches & worship', hex: '#7040b5' },
    { id: 'serve', name: 'Serve & care', hex: '#087d69' },
    { id: 'culture', name: 'Culture & fun', hex: '#c14f2a' },
    { id: 'learn', name: 'Learn & grow', hex: '#245fba' },
    { id: 'audiences', name: 'Audiences', hex: '#b33272' },
    { id: 'business', name: 'Business', hex: '#687d20' },
  ];
  function Dock({ page, entity }) {
    const { go, nav } = window.useApp();
    const links = [['explore', 'Compass', 'Explore'], ['home', 'Map', 'Map'], ['profile', 'User', 'Me']];
    return h('nav', { className: 'connect-dock', 'aria-label': 'Main navigation' }, links.map(([route, icon, label]) =>
      h('button', { type: 'button', key: route, 'aria-current': page === route && !entity ? 'page' : undefined,
        onClick: () => {
          if (route === 'home' && page === 'home' && !nav.params?.view) window.dispatchEvent(new Event('cc-return-to-map'));
          else go(route);
        } }, h(window.Icon, { name: icon, size: 20 }), h('span', null, label))));
  }
  window.ConnectChrome = { Dock, GROUPS };
})();
