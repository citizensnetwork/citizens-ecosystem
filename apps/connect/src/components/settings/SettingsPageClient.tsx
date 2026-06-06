"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, Globe, Lock, Crown, Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validateImageFile } from "@/lib/validation";
import { compressImageIfNeeded } from "@/lib/imageCompression";
import { CATEGORY_LABELS, CATEGORY_HEX } from "@/lib/categories";
import { saveQuickIds } from "@/lib/quickPanelPrefs";
import type { EventCategory, NotificationPrefKey, NotificationPrefs, Preferences, Profile } from "@/types/db";

// Lazy-loaded deep-dive personalisation sheet (the former map "?" entry point,
// relocated here). Kept out of the main Settings bundle.
const LongFormPersonalizationSheet = dynamic(
  () => import("@/components/easter/LongFormPersonalizationSheet"),
  { ssr: false }
);

const PREF_LABELS: Record<NotificationPrefKey, { label: string; desc: string }> = {
  event_reminders:     { label: "Event Updates",    desc: "Reminders and updates for events you follow" },
  contributor_updates: { label: "Broadcasts",        desc: "Organiser updates for events you follow" },
  friends_activity:    { label: "Friends",           desc: "Friend requests and community activity" },
  announcements:       { label: "Announcements",     desc: "Platform news and important updates" },
  weekly_digest:       { label: "Weekly Digest",     desc: "Weekly summary of your Kingdom activity" },
};

interface Props {
  profile: Profile;
  userId: string;
}

export default function SettingsPageClient({ profile, userId }: Props) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Profile fields
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [discoverable, setDiscoverable] = useState(profile.discoverable ?? false);

  // Notification prefs
  const defaults: Required<NotificationPrefs> = {
    event_reminders: true,
    contributor_updates: true,
    friends_activity: true,
    announcements: true,
    weekly_digest: true,
    ...(profile.notification_prefs ?? {}),
  };
  const [notifPrefs, setNotifPrefs] = useState<Required<NotificationPrefs>>(defaults);

  // Interests
  const currentInterests = (profile.preferences?.interests ?? []) as string[];
  const [interests, setInterests] = useState<string[]>(currentInterests);

  // Quick-filters (≤5)
  const currentQf = (profile.preferences?.quick_panel_ids ?? []) as string[];
  const [quickFilters, setQuickFilters] = useState<string[]>(currentQf);

  // Deep-dive personalisation sheet (relocated from the map "?" control)
  const [personalizeOpen, setPersonalizeOpen] = useState(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Discoverable: immediate save as top-level profile field
  async function handleDiscoverableToggle() {
    const next = !discoverable;
    setDiscoverable(next);
    await supabase.from("profiles").update({ discoverable: next } as Partial<Profile>).eq("id", userId);
  }

  // Notification pref immediate save
  async function handleNotifToggle(key: NotificationPrefKey) {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notification_prefs: { [key]: !notifPrefs[key] } }),
    });
  }

  // Interests toggle
  function toggleInterest(id: string) {
    setInterests((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  // Quick-filter toggle (≤5)
  function toggleQuickFilter(id: string) {
    setQuickFilters((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  // Avatar upload
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;
    const err = validateImageFile(raw);
    if (err) { setAvatarError(err); return; }
    const file = await compressImageIfNeeded(raw);
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/avatar", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Upload failed");
      setAvatarUrl(data.avatar_url);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // Main save (name, bio, interests, quick_panel_ids)
  async function handleSave() {
    if (!fullName.trim()) { setSaveError("Name cannot be empty."); return; }
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    const currentPrefs: Preferences = profile.preferences ?? {};
    const updatedPrefs: Preferences = {
      ...currentPrefs,
      interests,
      quick_panel_ids: quickFilters,
    };

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        bio: bio.trim() || null,
        preferences: updatedPrefs,
      } as Partial<Profile>)
      .eq("id", userId);

    if (error) {
      console.error("[Settings save]", error);
      setSaveError("Failed to save. Please try again.");
      setSaving(false);
      return;
    }

    // Sync quick-filters to localStorage so the map picks them up instantly
    saveQuickIds(quickFilters);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const profileUrl = typeof window !== "undefined"
    ? `${window.location.origin}/profile/${profile.handle ? `@${profile.handle}` : userId}`
    : `/profile/${userId}`;

  const [copied, setCopied] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silently fail */
    }
  }

  const isContributor = profile.contributor_status === "approved";

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "calc(100dvh - 4rem)", minHeight: 0 }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border glass flex items-center gap-3">
        <div>
          <h2
            className="text-foreground"
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            Settings
          </h2>
          <p className="text-xs text-muted-foreground">Your Citizen Profile &amp; Preferences</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32 md:pb-8">
        {/* ── Profile ────────────────────────────── */}
        <div className="px-5 py-5 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
            Profile
          </p>

          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="w-20 h-20 rounded-2xl object-cover ring-4 ring-background shadow-lg"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-[#F2E8CC] flex items-center justify-center text-2xl font-bold text-[#8B6914] ring-4 ring-background shadow-lg">
                  {fullName?.[0] || "?"}
                </div>
              )}
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#C9A84C] rounded-full flex items-center justify-center shadow hover:bg-[#8B6914] transition-colors disabled:opacity-50"
                aria-label="Change avatar"
              >
                {uploadingAvatar ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Camera size={12} className="text-white" />
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{fullName || "Your Name"}</p>
              <p className="text-xs text-muted-foreground">Tap the camera to change your photo</p>
              {avatarError && <p className="text-xs text-red-500 mt-1">{avatarError}</p>}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Display Name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={80}
                className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm outline-none focus:border-[#C9A84C]/60 transition-colors"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={300}
                className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm outline-none focus:border-[#C9A84C]/60 transition-colors resize-none"
                placeholder="Tell the Kingdom a little about yourself…"
              />
            </div>
          </div>
        </div>

        {/* ── Privacy ─────────────────────────────── */}
        <div className="px-5 py-5 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
            Privacy
          </p>
          <div className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center">
                {discoverable
                  ? <Globe size={16} className="text-[#C9A84C]" />
                  : <Lock size={16} className="text-muted-foreground" />}
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {discoverable ? "Discoverable" : "Private Profile"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {discoverable
                    ? "Others at your events can find you"
                    : "Only visible to those you connect with"}
                </p>
              </div>
            </div>
            <button
              onClick={handleDiscoverableToggle}
              role="switch"
              aria-checked={discoverable}
              className={`w-12 h-6 rounded-full transition-all duration-300 relative ${discoverable ? "bg-[#C9A84C]" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${discoverable ? "left-6" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        {/* ── Notifications ───────────────────────── */}
        <div className="px-5 py-5 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
            Notifications
          </p>
          <div className="space-y-3">
            {(Object.entries(PREF_LABELS) as [NotificationPrefKey, { label: string; desc: string }][]).map(
              ([key, { label, desc }]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3.5 bg-card rounded-xl border border-border"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <button
                    onClick={() => handleNotifToggle(key)}
                    role="switch"
                    aria-checked={notifPrefs[key]}
                    className={`w-11 h-6 rounded-full transition-all duration-300 relative ${notifPrefs[key] ? "bg-[#C9A84C]" : "bg-muted"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${notifPrefs[key] ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
              )
            )}
          </div>
        </div>

        {/* ── Interests ───────────────────────────── */}
        <div className="px-5 py-5 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
            Interests
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            We&apos;ll use these to personalise your map and feed
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(CATEGORY_LABELS) as [EventCategory, string][]).map(([id, label]) => {
              const selected = interests.includes(id);
              const hex = CATEGORY_HEX[id] ?? "#C9A84C";
              return (
                <button
                  key={id}
                  onClick={() => toggleInterest(id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all border"
                  style={
                    selected
                      ? { background: hex, color: "#fff", border: `1px solid ${hex}` }
                      : { background: `${hex}18`, color: hex, border: `1px solid ${hex}40` }
                  }
                >
                  {selected && <Check size={10} />}
                  {label}
                </button>
              );
            })}
          </div>

          {/* Deep-dive personalisation (relocated from the map "?" control) */}
          <button
            onClick={() => setPersonalizeOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-4 py-3 text-xs font-bold text-[#8B6914] transition hover:bg-[#C9A84C]/20"
          >
            <Sparkles size={14} />
            Personalise my feed — quick questions
          </button>
        </div>

        {/* ── Quick Filters ────────────────────────── */}
        <div className="px-5 py-5 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
            Quick Filters
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Choose up to 5 categories to show as quick filters on the home map
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(CATEGORY_LABELS) as [EventCategory, string][]).map(([id, label]) => {
              const selected = quickFilters.includes(id);
              const hex = CATEGORY_HEX[id] ?? "#C9A84C";
              return (
                <button
                  key={id}
                  onClick={() => toggleQuickFilter(id)}
                  disabled={!selected && quickFilters.length >= 5}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all border disabled:opacity-40"
                  style={
                    selected
                      ? { background: hex, color: "#fff", border: `1px solid ${hex}` }
                      : { background: "#fff", color: "#7A7060", border: "1px solid rgba(0,0,0,0.1)" }
                  }
                >
                  {label}
                  {selected && <Check size={10} />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {quickFilters.length}/5 selected
          </p>
        </div>

        {/* ── Weekly Contribution (citizens only) ──── */}
        {!isContributor && (
          <div className="px-5 py-5 border-b border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
              Weekly Contribution
            </p>
            <div className="bg-gradient-to-br from-[#F2E8CC] to-[#E8D48B]/30 rounded-2xl p-4 border border-[#C9A84C]/30">
              <div className="flex items-center gap-3 mb-2">
                <Crown size={18} className="text-[#C9A84C]" />
                <p className="text-sm font-bold text-[#8B6914]">Community-Organised Event</p>
              </div>
              <p className="text-xs text-[#8B6914]/80 leading-relaxed mb-3">
                As a Citizen, you can post 1 community-organised event per week. Want to post more? Apply to become a Contributor.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push("/events/new")}
                  className="flex-1 py-2.5 bg-[#C9A84C] text-white rounded-xl text-xs font-bold hover:bg-[#8B6914] transition-colors"
                >
                  Post This Week&apos;s Event
                </button>
                <button
                  onClick={() => router.push("/contributor/apply")}
                  className="flex-1 py-2.5 border border-[#C9A84C]/40 text-[#8B6914] rounded-xl text-xs font-bold hover:bg-[#F2E8CC] transition-colors"
                >
                  Apply as Contributor
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Profile Sharing ──────────────────────── */}
        <div className="px-5 py-5 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
            Profile Sharing
          </p>
          <div className="flex items-center gap-3 p-4 bg-card rounded-2xl border border-border">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-[#F2E8CC] flex items-center justify-center text-sm font-bold text-[#8B6914] shrink-0">
                {fullName?.[0] || "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{fullName || "Your Name"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {profile.handle ? `@${profile.handle}` : `${profileUrl}`}
              </p>
            </div>
            <button
              onClick={copyLink}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${copied ? "bg-green-100 text-green-700" : "bg-muted text-foreground hover:bg-muted/70"}`}
            >
              {copied ? <><Check size={12} className="inline mr-1" />Copied</> : "Share"}
            </button>
          </div>
        </div>

        {/* ── Save ─────────────────────────────────── */}
        <div className="px-5 py-5">
          {saveError && (
            <p className="text-xs text-red-500 mb-3">{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-bold transition-all ${
              saved
                ? "bg-green-500 text-white"
                : "bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            }`}
          >
            {saving ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Saving…</>
            ) : saved ? (
              <><Check size={16} /> Saved!</>
            ) : (
              "Save Changes"
            )}
          </button>

          <p className="text-center text-xs text-muted-foreground mt-3">
            Notification preferences save automatically when you toggle them.
          </p>
        </div>
      </div>

      {personalizeOpen && (
        <LongFormPersonalizationSheet
          prefs={profile.preferences ?? undefined}
          onClose={() => setPersonalizeOpen(false)}
        />
      )}
    </div>
  );
}
