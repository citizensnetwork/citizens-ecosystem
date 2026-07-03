import { Capacitor } from "@capacitor/core";
import { Geolocation as CapGeo } from "@capacitor/geolocation";

export type Position = { latitude: number; longitude: number };

/**
 * Get the user's current position using native Capacitor geolocation (mobile)
 * or the browser Geolocation API (web).
 */
export async function getCurrentPosition(): Promise<Position> {
  if (Capacitor.isNativePlatform()) {
    const pos = await CapGeo.getCurrentPosition({ enableHighAccuracy: true });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true }
    );
  });
}
