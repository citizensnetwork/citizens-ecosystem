import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import ComingSoon from "@/components/ui/ComingSoon";

export const metadata: Metadata = {
  title: "Kingdom Projects · Citizens Connect",
  description: "Impact Ideas and community collaboration across the Kingdom.",
};

export default function CommunityPage() {
  return (
    <ComingSoon
      title="Kingdom Projects"
      subtitle="Impact Ideas and community-led projects are coming here — propose change, rally votes, and build together."
      icon={<Sparkles size={28} strokeWidth={2.2} />}
      phase="Arriving soon"
    />
  );
}
