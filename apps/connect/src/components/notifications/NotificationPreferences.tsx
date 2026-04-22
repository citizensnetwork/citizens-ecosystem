"use client";

import { useState } from "react";
import {
  NOTIFICATION_PREF_DEFAULTS,
  type NotificationDigest,
  type NotificationPrefKey,
  type NotificationPrefs,
} from "@/types/db";

interface NotificationPreferencesProps {
  currentDigest: NotificationDigest;
  notificationEmail: string | null;
  currentPrefs?: NotificationPrefs | null;
}

const DIGEST_OPTIONS: { value: NotificationDigest; label: string; description: string }[] = [
  { value: "instant", label: "Instant", description: "Get notified right away" },
  { value: "daily", label: "Daily Digest", description: "One summary each morning" },
  { value: "off", label: "Off", description: "No push notifications" },
];

const PREF_OPTIONS: { key: NotificationPrefKey; label: string; description: string }[] = [
  {
    key: "friends_activity",
    label: "Friends & followers",
    description: "When someone follows you or a friend RSVPs",
  },
  {
    key: "event_reminders",
    label: "Event reminders",
    description: "Day-of reminders for events you've RSVPed to",
  },
  {
    key: "contributor_updates",
    label: "Event updates",
    description: "When an organiser posts changes to an event you joined",
  },
  {
    key: "announcements",
    label: "New events for you",
    description: "New events matching your interests and area",
  },
  {
    key: "weekly_digest",
    label: "Daily summary",
    description: "Batched morning digest (only affects users on Daily digest)",
  },
];

function mergeDefaults(prefs: NotificationPrefs | null | undefined): Required<NotificationPrefs> {
  return { ...NOTIFICATION_PREF_DEFAULTS, ...(prefs ?? {}) };
}

export default function NotificationPreferences({
  currentDigest,
  notificationEmail,
  currentPrefs,
}: NotificationPreferencesProps) {
  const [digest, setDigest] = useState<NotificationDigest>(currentDigest);
  const [prefs, setPrefs] = useState<Required<NotificationPrefs>>(
    () => mergeDefaults(currentPrefs),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleDigestSave(newDigest: NotificationDigest) {
    const previous = digest;
    setDigest(newDigest);
    const ok = await patch({ notification_digest: newDigest });
    if (!ok) setDigest(previous);
  }

  async function handlePrefToggle(key: NotificationPrefKey, next: boolean) {
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    const ok = await patch({ notification_prefs: { [key]: next } });
    if (!ok) setPrefs((p) => ({ ...p, [key]: previous }));
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
              onChange={() => handleDigestSave(opt.value)}
              className="accent-(--gold)"
            />
            <div>
              <p className="text-sm font-medium text-black">{opt.label}</p>
              <p className="text-xs text-black/50">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>

      <h3 className="text-sm font-semibold mt-6 mb-3">What to notify me about</h3>
      <div className="divide-y divide-black/5 rounded-lg border border-black/8">
        {PREF_OPTIONS.map((opt) => {
          const on = prefs[opt.key];
          return (
            <label
              key={opt.key}
              className={`flex cursor-pointer items-start justify-between gap-3 px-4 py-3 transition hover:bg-black/2 ${
                saving ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-black">{opt.label}</p>
                <p className="text-xs text-black/50">{opt.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Toggle ${opt.label}`}
                onClick={() => handlePrefToggle(opt.key, !on)}
                className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                  on ? "bg-(--gold)" : "bg-black/15"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    on ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-black/40">
        Event cancellation alerts are always delivered to RSVPed users.
      </p>

      {notificationEmail && (
        <p className="mt-3 text-xs text-black/50">
          Email notifications sent to: <span className="font-medium text-black/70">{notificationEmail}</span>
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-xs text-green-600">Preference saved</p>}
    </div>
  );
}
