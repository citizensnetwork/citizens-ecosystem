import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Initialize native Capacitor plugins.
 * Call once from a top-level client component (e.g. layout effect).
 * No-ops gracefully on web.
 */
export async function initCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#f7f6f3" });
  } catch {
    // StatusBar plugin may not be available
  }

  try {
    await SplashScreen.hide();
  } catch {
    // SplashScreen plugin may not be available
  }
}
