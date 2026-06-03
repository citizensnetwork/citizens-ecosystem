import type { Metadata } from "next";
import { Bell } from "lucide-react";
import ComingSoon from "@/components/ui/ComingSoon";

export const metadata: Metadata = {
  title: "Notifications · Citizens Connect",
  description: "Your broadcasts, messages, friends and Kingdom activity.",
};

export default function NotificationsPage() {
  return (
    <ComingSoon
      title="Notifications"
      subtitle="A dedicated home for your broadcasts, messages, friend activity and Impact-Idea milestones is on its way."
      icon={<Bell size={26} strokeWidth={2.2} />}
      phase="Arriving soon"
    />
  );
}
