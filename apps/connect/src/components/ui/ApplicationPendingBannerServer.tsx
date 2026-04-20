// Server-rendered wrapper that reads the viewer's contributor status
// and conditionally renders the global ApplicationPendingBanner.
// Mounted once in the root layout so the banner is visible across the
// entire app for users whose application is pending or rejected.

import { createClient } from "@/lib/supabase/server";
import { ApplicationPendingBanner } from "./ApplicationPendingBanner";

export default async function ApplicationPendingBannerServer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("contributor_status")
    .eq("id", user.id)
    .maybeSingle();

  const status = profile?.contributor_status ?? null;

  // Only render for pending/rejected — everything else (null / not_applied /
  // approved) returns null from the banner itself.
  if (status !== "pending" && status !== "rejected") return null;

  return <ApplicationPendingBanner status={status} />;
}
