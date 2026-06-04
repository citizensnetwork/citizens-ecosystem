import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NotificationsPageClient from "@/components/notifications/NotificationsPageClient";

export const metadata: Metadata = {
  title: "Notifications · Citizens Connect",
  description: "Your broadcasts, messages, friends and Kingdom activity.",
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <NotificationsPageClient userId={user.id} />;
}
