// ════════════════════════════════════════════════════════════════════
//  Citizens Wear — Capacitor plugin bridge (port of Connect's, §3G)
//  ------------------------------------------------------------------
//  The app has no JS module system for its own screens (auth-client.js /
//  app/*.jsx talk to each other purely via `window.*`). Capacitor
//  plugins ARE real npm ES modules, so this file is the one place that
//  gets a `bundle:true` esbuild pass (scripts/build-frontend.js) — its
//  only job is exposing the plugins as `window.Cap*` globals.
//
//  Safe in a plain browser too: each plugin ships a web implementation
//  and `Capacitor.isNativePlatform()` is false there — every caller in
//  auth-client.js checks that flag first. (No geolocation plugin: Wear
//  has no map surface.)
// ════════════════════════════════════════════════════════════════════
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

window.CapCore = Capacitor;
window.CapApp = App;
window.CapBrowser = Browser;
