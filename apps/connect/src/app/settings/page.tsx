import type { Metadata } from "next";
import { Settings as SettingsIcon } from "lucide-react";
import ComingSoon from "@/components/ui/ComingSoon";

export const metadata: Metadata = {
  title: "Settings · Citizens Connect",
  description: "Your Citizen profile, privacy, notifications and map preferences.",
};

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      subtitle="Your Citizen profile, privacy, notification preferences, interests and map quick-filters will live here."
      icon={<SettingsIcon size={26} strokeWidth={2.2} />}
      phase="Arriving soon"
    />
  );
}
