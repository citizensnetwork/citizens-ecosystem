import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";

export type PushToken = { value: string };

/**
 * Request push notification permission and register for push.
 * Returns the device token on success, null if not on native or denied.
 */
export async function registerPush(): Promise<PushToken | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return null;

  return new Promise((resolve) => {
    PushNotifications.addListener("registration", (token) => {
      resolve(token);
    });

    PushNotifications.addListener("registrationError", () => {
      resolve(null);
    });

    PushNotifications.register();
  });
}

/**
 * Listen for incoming push notifications (foreground).
 * Returns a handle that can be used to remove the listener.
 */
export async function onPushReceived(
  callback: (notification: { title?: string; body?: string; data: Record<string, unknown> }) => void
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform()) return null;

  return PushNotifications.addListener("pushNotificationReceived", (notification) => {
    callback({
      title: notification.title ?? undefined,
      body: notification.body ?? undefined,
      data: (notification.data ?? {}) as Record<string, unknown>,
    });
  });
}

/**
 * Listen for push notification taps (app opened from notification).
 * Returns a handle that can be used to remove the listener.
 */
export async function onPushActionPerformed(
  callback: (data: Record<string, unknown>) => void
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform()) return null;

  return PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    callback((action.notification.data ?? {}) as Record<string, unknown>);
  });
}
