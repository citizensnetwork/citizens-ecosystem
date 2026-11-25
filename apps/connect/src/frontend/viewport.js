// Pinch zoom (tracker R9, founder yes 2026-10-15): the website lets a citizen zoom; the Capacitor phone app keeps the
// old block (maximum-scale=1) until it has been tested on a phone. See the comment above the viewport tag in
// index.html. Was an inline script until QA plan PR F3 (2026-11-25): a file, so the CSP needs no 'unsafe-inline'.
(function () {
  try {
    var c = window.Capacitor;
    var native = (c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()) || location.protocol === 'capacitor:';
    if (native) document.querySelector('meta[name="viewport"]').setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
  } catch (e) { /* stay zoomable */ }
})();
