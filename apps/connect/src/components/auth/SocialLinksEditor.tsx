"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  profileId: string;
  instagramHandle: string | null;
  facebookUrl: string | null;
  tiktokHandle: string | null;
};

export default function SocialLinksEditor({
  profileId,
  instagramHandle,
  facebookUrl,
  tiktokHandle,
}: Props) {
  const [instagram, setInstagram] = useState(instagramHandle ?? "");
  const [facebook, setFacebook] = useState(facebookUrl ?? "");
  const [tiktok, setTiktok] = useState(tiktokHandle ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        instagram_handle: instagram.trim().replace(/^@/, "") || null,
        facebook_url: facebook.trim() || null,
        tiktok_handle: tiktok.trim().replace(/^@/, "") || null,
      })
      .eq("id", profileId);

    if (error) {
      setMessage("Failed to save social links");
    } else {
      setMessage("Saved!");
      setTimeout(() => setMessage(null), 2000);
    }

    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="instagram" className="block text-sm font-medium text-black/70 mb-1">
          Instagram
        </label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-black/40">@</span>
          <input
            id="instagram"
            type="text"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="username"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-black/30"
          />
        </div>
      </div>

      <div>
        <label htmlFor="facebook" className="block text-sm font-medium text-black/70 mb-1">
          Facebook
        </label>
        <input
          id="facebook"
          type="url"
          value={facebook}
          onChange={(e) => setFacebook(e.target.value)}
          placeholder="https://facebook.com/yourpage"
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-black/30"
        />
      </div>

      <div>
        <label htmlFor="tiktok" className="block text-sm font-medium text-black/70 mb-1">
          TikTok
        </label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-black/40">@</span>
          <input
            id="tiktok"
            type="text"
            value={tiktok}
            onChange={(e) => setTiktok(e.target.value)}
            placeholder="username"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-black/30"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-(--gold) px-4 py-2 text-sm font-medium text-black transition hover:brightness-95 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Social Links"}
        </button>
        {message && (
          <span className={`text-sm ${message.startsWith("Failed") ? "text-red-600" : "text-green-600"}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
