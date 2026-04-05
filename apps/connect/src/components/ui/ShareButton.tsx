"use client";

import { useState } from "react";
import { share } from "@/lib/capacitor/share";

type Props = {
  title: string;
  url?: string;
  className?: string;
};

export default function ShareButton({ title, url, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const targetUrl = url ?? window.location.href;
    const opened = await share({ title, url: targetUrl });

    if (!opened) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={
        className ??
        "shrink-0 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border rounded-md px-3 py-1.5 transition-colors"
      }
    >
      {copied ? "Copied" : "Share"}
    </button>
  );
}
