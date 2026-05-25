"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  validateImageFile,
} from "@/lib/validation";
import { compressImageIfNeeded } from "@/lib/imageCompression";
import { createClient } from "@/lib/supabase/client";
import {
  type Profile,
} from "@/types/db";

type Props = {
  profile: Profile;
  email: string;
};

export default function ProfileEditor({ profile, email }: Props) {
  const supabase = useRef(createClient()).current;
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Name state ────────────────────────────
  const [fullName, setFullName] = useState(profile.full_name);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState("");

  // ── Password state ────────────────────────
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    if (!raw) return;

    const validationError = validateImageFile(raw);
    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    const file = await compressImageIfNeeded(raw);

    setUploading(true);
    setAvatarError("");
    try {
      // Upload via server-side API route which uses a fresh admin storage
      // client — avoids stale-JWT RLS failures from the browser client.
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/avatar", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Upload failed"
        );
      }
      setAvatarUrl(data.avatar_url);
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setAvatarError(
        err instanceof Error ? err.message : "Failed to upload avatar. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleNameSave() {
    if (!fullName.trim()) return;
    setNameSaving(true);
    setNameSuccess(false);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("id", profile.id);

      if (error) throw error;

      // Also update auth metadata so the navbar reflects the change
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      });

      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 2000);
    } catch (err) {
      console.error("Name update failed:", err);
      setNameError("Failed to update name.");
    } finally {
      setNameSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);

    if (newPassword.length < 6) {
      setPwMessage({
        type: "error",
        text: "Password must be at least 6 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setPwMessage({ type: "success", text: "Password updated successfully." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Password change failed:", err);
      setPwMessage({
        type: "error",
        text: "Failed to update password. Please try again.",
      });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Avatar section ──────────────────────── */}
      <section className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative shrink-0"
          disabled={uploading}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt="Profile photo"
              width={80}
              height={80}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-black/10"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-(--gold-soft) text-3xl font-bold uppercase text-black ring-2 ring-black/10">
              {profile.full_name?.[0] ?? "?"}
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
            {uploading ? "Uploading…" : "Change"}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleAvatarUpload}
          className="hidden"
        />
        <div className="min-w-0">
          <p className="text-sm text-black/50">
            Click the image to upload a new photo
          </p>
          <p className="text-xs text-black/30">JPEG, PNG, WebP, or GIF · Max 15 MB</p>
          {avatarError && (
            <p role="alert" className="mt-1 text-xs text-red-600">{avatarError}</p>
          )}
        </div>
      </section>

      {/* ── Name section ───────────────────────── */}
      <section>
        <label className="mb-1 block text-sm font-medium text-black/70">
          Display Name
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="flex-1 rounded-lg border border-black/12 px-3 py-2 text-sm outline-none focus:border-black/30"
            placeholder="Your name"
          />
          <button
            type="button"
            onClick={handleNameSave}
            disabled={nameSaving || fullName.trim() === profile.full_name}
            className="rounded-lg bg-(--gold) px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95 disabled:opacity-50"
          >
            {nameSaving ? "Saving…" : nameSuccess ? "Saved ✓" : "Save"}
          </button>
        </div>
        {nameError && (
          <p className="mt-1.5 text-xs text-red-600">{nameError}</p>
        )}
      </section>

      {/* ── Email (read-only) ──────────────────── */}
      <section>
        <label className="mb-1 block text-sm font-medium text-black/70">
          Email
        </label>
        <p className="rounded-lg border border-black/8 bg-black/3 px-3 py-2 text-sm text-black/60">
          {email}
        </p>
      </section>

      {/* ── Password change ────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-black/70">
          Change Password
        </h3>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 6 characters)"
            className="w-full rounded-lg border border-black/12 px-3 py-2 text-sm outline-none focus:border-black/30"
            autoComplete="new-password"
            minLength={6}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="w-full rounded-lg border border-black/12 px-3 py-2 text-sm outline-none focus:border-black/30"
            autoComplete="new-password"
          />
          {pwMessage && (
            <p
              className={`text-sm ${
                pwMessage.type === "error" ? "text-red-600" : "text-green-600"
              }`}
            >
              {pwMessage.text}
            </p>
          )}
          <button
            type="submit"
            disabled={pwSaving || !newPassword}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50"
          >
            {pwSaving ? "Updating…" : "Update Password"}
          </button>
        </form>
      </section>
    </div>
  );
}
