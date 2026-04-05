import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.citizensconnect.app",
  appName: "Citizens Connect",
  // Points to deployed web app — SSR/middleware/API routes all work.
  // For local dev, change to http://localhost:3000 (or your dev server port).
  // For production, replace with your deployed URL.
  webDir: "out",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "http://localhost:3000",
    cleartext: true, // Allow HTTP in dev (Android blocks cleartext by default)
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: "#f7f6f3",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT", // Dark text on light background
      backgroundColor: "#f7f6f3",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
