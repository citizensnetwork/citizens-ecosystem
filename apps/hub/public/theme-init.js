(function () {
  // Keep in step with themeApplies / themeIsDark / THEME_STORAGE_KEY in src/lib/theme.ts.
  var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  var themed = path === '/citizens' || path === '/citizens/settings';
  var pref = null;
  try {
    pref = localStorage.getItem('citizens-theme');
  } catch (e) {
    pref = null;
  }
  var systemDark = false;
  try {
    systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (e) {
    systemDark = false;
  }
  var dark = themed && (pref === 'Dark' || (pref !== 'Light' && systemDark));
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
