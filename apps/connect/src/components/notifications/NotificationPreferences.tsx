"use client";

import { useState } from "react";
import type { NotificationDigest } from "@/types/db";

interface NotificationPreferencesProps {
  currentDigest: NotificationDigest;
  notificationEmail: string | null;
}

const DIGEST_OPTIONS: { value: NotificationDigest; label: string; description: string }[] = [
  { value: "instant", label: "Instant", description: "Get notified right away" },
  { value: "daily", label: "Daily Digest", description: "One summary each morning" },
  { value: "off", label: "Off", description: "No push notifications" },
];

export default function NotificationPreferences({
  currentDigest,
  notificationEmail,
}: NotificationPreferencesProps) {
  const [digest, setDigest] = useState<NotificationDigest>(currentDigest);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(newDigest: NotificationDigest) {
    setDigest(newDigest);
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_digest: newDigest }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setDigest(currentDigest); // Revert
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Notification Frequency</h3>
      <div className="space-y-2">
        {DIGEST_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
              digest === opt.value
                ? "border-(--gold) bg-(--gold-soft)/30"
                : "border-black/8 hover:border-black/15"
            } ${saving ? "opacity-50 pointer-events-none" : ""}`}
          >
            <input
              type="radio"
              name="notification_digest"
              value={opt.value}
              checked={digest === opt.value}
              onChange={() => handleSave(opt.value)}
              className="accent-(--gold)"
            />
            <div>
              <p className="text-sm font-medium text-black">{opt.label}</p>
              <p className="text-xs text-black/50">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>

      {notificationEmail && (
        <p className="mt-3 text-xs text-black/50">
          Email notifications sent to: <span className="font-medium text-black/70">{notificationEmail}</span>
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
      {saved && (
        <p className="mt-2 text-xs text-green-600">Preference saved</p>
      )}
    </div>
  );
}
