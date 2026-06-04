import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/types/db";
import SettingsPageClient from "@/components/settings/SettingsPageClient";

export const metadata: Metadata = {
  title: "Settings · Citizens Connect",
  description: "Your Citizen profile, privacy, notifications and map preferences.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/login");
  }

  return <SettingsPageClient profile={profile as Profile} userId={user.id} />;
}
