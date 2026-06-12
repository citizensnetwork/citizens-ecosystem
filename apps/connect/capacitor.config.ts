import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the STATIC HTML frontend (src/frontend → mobile-dist via
 * `npm run build:mobile`), NOT the Next.js app — Next.js is API-only since
 * Phase 1. Assets are BUNDLED (no server.url webview wrapper): offline boot,
 * store-review friendly, updates ship via store releases (addendum §B7).
 *
 * Build chain: npm run build:mobile && npm run cap:sync
 * Full prerequisites: docs/MOBILE_LAUNCH_RUNBOOK.md
 */
const config: CapacitorConfig = {
  appId: "com.citizensconnect.app",
  appName: "Citizens Connect",
  webDir: "mobile-dist",
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#f7f4ee",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT", // Dark text on light background
      backgroundColor: "#f7f4ee",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
