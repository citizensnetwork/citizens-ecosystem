// MapLibre GL, loaded on demand (QA plan PR F1, founder yes 2026-11-25). The 294 KB module used to load with the page
// and competed with the sign-in landing on a slow phone connection. Now it is imported when the map first asks
// (window.ccLoadMaplibre, called by whenMaplibreReady in app/map.jsx) or once the page has loaded, whichever comes
// first. It still ends as window.maplibregl, which every map call site already waits for.
//
// An external module, not an inline one, so the page needs no inline script for it (the CSP, PR F3). The import is
// relative to this file, so it resolves under the base path (/citizens/connect/) like everything else.
let loading = null;

function loadMaplibre() {
  if (!loading) {
    loading = import('./vendor/maplibre-gl/maplibre-gl.mjs').then(
      (maplibregl) => {
        window.maplibregl = maplibregl;
        return maplibregl;
      },
      (error) => {
        loading = null; // a failed fetch (a dropped connection) may be retried on the next ask
        throw error;
      },
    );
  }
  return loading;
}

window.ccLoadMaplibre = loadMaplibre;
if (document.readyState === 'complete') loadMaplibre().catch(() => {});
else window.addEventListener('load', () => loadMaplibre().catch(() => {}), { once: true });
