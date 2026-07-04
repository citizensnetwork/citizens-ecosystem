// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — Capacitor plugin bridge
//  ------------------------------------------------------------------
//  The app has no JS module system for its own screens (auth-client.js /
//  app/*.jsx talk to each other purely via `window.*`, per the no-build
//  design — see docs/MOBILE_LAUNCH_RUNBOOK.md Step 0). Capacitor plugins,
//  however, ARE real npm ES modules, so this file is the one place that
//  gets a real `bundle:true` esbuild pass (see scripts/build-frontend.js
//  buildCapacitorBridge()) — its only job is exposing the plugins the
//  rest of the app needs as `window.Cap*` globals.
//
//  Safe in a plain browser too (not just inside the native shell): each
//  Capacitor plugin ships a web implementation, and `Capacitor.isNativePlatform()`
//  is false there — every caller in auth-client.js / map.jsx checks that
//  flag before using a plugin, so this file is loaded unconditionally in
//  both the web (public/) and mobile (mobile-dist/) builds for one code path.
// ════════════════════════════════════════════════════════════════════
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Geolocation } from '@capacitor/geolocation';

window.CapCore = Capacitor;
window.CapApp = App;
window.CapBrowser = Browser;
window.CapGeolocation = Geolocation;
