import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import ProfileDetailServer from "@/components/profile/ProfileDetailServer";
import { isValidUUID } from "@/lib/validation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isValidUUID(id)) return { title: "Profile Not Found" };
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", id)
    .maybeSingle();

  if (!profile) return { title: "Profile Not Found" };

  return {
    title: `${profile.full_name} - Citizens Connect`,
    description: `${profile.full_name}'s profile on Citizens Connect.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let { id } = await params;
  const supabase = await createClient();

  // Support @handle routing: /profile/@janedoe → look up by handle
  if (id.startsWith("@")) {
    const handle = id.slice(1).toLowerCase();
    const { data: byHandle } = await supabase
      .from("profiles")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (!byHandle) notFound();
    id = byHandle.id as string;
  }

  // Skip the Postgres round-trip on malformed IDs
  if (!isValidUUID(id)) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Self-view redirects to the owner's editable /profile page.
  if (user?.id === id) redirect("/profile");

  // Full-page detail (Figma model). The contributor branch renders its own
  // hero with an in-hero back arrow; the citizen branch renders its own back
  // affordance — so no separate page-header chrome is needed.
  return <ProfileDetailServer id={id} />;
}
