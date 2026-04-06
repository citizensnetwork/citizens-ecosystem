"use client";

import { useState } from "react";
import OnboardingWizard from "./OnboardingWizard";

type Props = {
  show: boolean;
};

export default function OnboardingOverlay({ show }: Props) {
  const [visible, setVisible] = useState(show);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-white overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-start px-4 py-8">
        <OnboardingWizard
          onComplete={() => setVisible(false)}
        />
      </div>
    </div>
  );
}
