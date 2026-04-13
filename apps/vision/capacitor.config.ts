/// <reference types="@capacitor/cli" />

/**
 * Capacitor configuration for Citizens Vision mobile builds.
 * Install @capacitor/core and @capacitor/cli before using:
 *   npm install @capacitor/core @capacitor/cli
 */
const config = {
  appId: "com.citizensvision.app",
  appName: "Citizens Vision",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1a1a2e",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1a1a2e",
    },
  },
};

export default config;
