import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AlignmentDashboardClient } from "./AlignmentDashboardClient";

interface AlignmentDashboardPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function AlignmentDashboardPage({
  params,
}: AlignmentDashboardPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: org } = await supabase
    .from("organisations")
    .select("id, name")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/");

  return (
    <AlignmentDashboardClient
      orgId={org.id}
      orgName={org.name}
      orgSlug={orgSlug}
    />
  );
}
