"use client";

import { useEffect, useRef, useState } from "react";
import OnboardingWizard from "./OnboardingWizard";
import { useFocusTrap } from "@/components/ui/useFocusTrap";

type Props = {
  show: boolean;
};

export default function OnboardingOverlay({ show }: Props) {
  const [visible, setVisible] = useState(show);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  // Close on Escape key
  useEffect(() => {
    if (!visible) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding"
      className="fixed inset-0 z-9999 bg-white overflow-y-auto"
    >
      <div className="min-h-full flex flex-col items-center justify-start px-4 py-8">
        <OnboardingWizard
          onComplete={() => setVisible(false)}
        />
      </div>
    </div>
  );
}
