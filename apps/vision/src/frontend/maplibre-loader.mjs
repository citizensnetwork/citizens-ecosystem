// Loads the vendored MapLibre GL JS (v6 ships ES modules only, no UMD build) and
// publishes it as window.maplibregl. views.jsx adds this file as a module script
// the first time the Timeline Map is opened and waits for "cv-maplibre-ready".
// The vendored files in ./vendor/maplibre-gl/ are byte-identical to Connect's copy
// (a test holds them equal); see the comment above the Timeline Map in views.jsx.
import * as maplibregl from './vendor/maplibre-gl/maplibre-gl.mjs';

window.maplibregl = maplibregl;
window.dispatchEvent(new Event('cv-maplibre-ready'));
