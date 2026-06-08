"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { registerPush, onPushReceived, onPushActionPerformed } from "@/lib/capacitor/push";
import type { PluginListenerHandle } from "@capacitor/core";

/**
 * Registers the device for push notifications on native platforms.
 * Sends the token to the server, listens for foreground notifications.
 * Call once in a top-level authenticated component.
 */
export function usePushNotifications(
  userId: string | null,
  onNotification?: (notification: { title?: string; body?: string; data: Record<string, unknown> }) => void
) {
  const registered = useRef(false);
  // Keep a stable ref to avoid stale closure when onNotification changes
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  useEffect(() => {
    if (!userId || !Capacitor.isNativePlatform() || registered.current) return;
    registered.current = true;

    let receivedHandle: PluginListenerHandle | null = null;
    let actionHandle: PluginListenerHandle | null = null;

    (async () => {
      const token = await registerPush();
      if (!token) return;

      // Send token to server
      try {
        await fetch("/api/push-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: token.value,
            platform: Capacitor.getPlatform() as "ios" | "android",
          }),
        });
      } catch {
        // Silent fail — will retry on next app launch
      }

      // Listen for foreground push
      receivedHandle = await onPushReceived((n) => {
        onNotificationRef.current?.(n);
      });

      // Listen for notification taps
      actionHandle = await onPushActionPerformed((data) => {
        const eventId = data?.event_id;
        if (typeof eventId === "string") {
          window.location.href = `/events/${eventId}`;
        }
      });
    })();

    return () => {
      receivedHandle?.remove();
      actionHandle?.remove();
    };
  }, [userId]);
}
