"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteAccountButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleDelete() {
    setError("");
    setDeleting(true);

    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete account.");
        setDeleting(false);
        return;
      }

      // Sign out to clear session cookie before redirecting
      const supabase = createClient();
      await supabase.auth.signOut();

      // Redirect to login after successful deletion
      router.push("/login");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setDeleting(false);
    }
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
      >
        Delete My Account
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-red-200 bg-red-50/50 p-4">
      <div>
        <h4 className="text-sm font-semibold text-red-700">
          Permanently delete your account?
        </h4>
        <p className="mt-1 text-xs text-black/60">
          This will permanently remove your profile, events, RSVPs, messages,
          and all associated data. This action cannot be undone.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="delete-confirm"
          className="block text-xs font-semibold text-red-700"
        >
          Type DELETE to confirm
        </label>
        <input
          id="delete-confirm"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          placeholder="DELETE"
          autoComplete="off"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting || confirmText.toUpperCase() !== "DELETE"}
          className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? "Deleting..." : "Permanently Delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowConfirm(false);
            setConfirmText("");
            setError("");
          }}
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-black/60 transition hover:text-black"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
