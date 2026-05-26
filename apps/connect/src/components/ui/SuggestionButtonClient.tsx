"use client";

import dynamic from "next/dynamic";

// Client-side wrapper so `ssr: false` is valid here (layout.tsx is a Server Component).
const SuggestionButton = dynamic(
  () => import("@/components/ui/SuggestionButton"),
  { ssr: false }
);

export default SuggestionButton;
