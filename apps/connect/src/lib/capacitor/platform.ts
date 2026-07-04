import { Capacitor } from "@capacitor/core";

/** Returns true when the app is running inside a native Capacitor shell */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Returns "android", "ios", or "web" */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}
