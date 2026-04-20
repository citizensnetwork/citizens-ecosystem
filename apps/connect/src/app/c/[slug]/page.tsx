// /c/[slug] — friendly vanity URL alias for Contributor public
// profiles.  Redirects to /profile/[id] which handles the actual
// render.  Defined here so we never have to duplicate the render
// logic, and so the canonical URL for any profile stays UUID-based
// in the DB.

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ContributorSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("contributor_slug", slug)
    .eq("contributor_status", "approved")
    .maybeSingle();

  if (!data?.id) notFound();
  redirect(`/profile/${data.id}`);
}
