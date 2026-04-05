"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Props = {
  placeId: string;
};

export default function ReverifyPlaceButton({ placeId }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleVerify() {
    setSaving(true);

    await supabase
      .from("places")
      .update({
        verified: true,
        verification_flagged: false,
      })
      .eq("id", placeId);

    setSaving(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleVerify}
      disabled={saving}
      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
    >
      {saving ? "Updating..." : "Confirm Place Still Exists"}
    </button>
  );
}
