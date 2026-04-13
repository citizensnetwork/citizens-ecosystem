import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AnalyticsClient } from "./AnalyticsClient";

interface Props {
  params: Promise<{ orgSlug: string }>;
}

export const metadata: Metadata = {
  title: "Analytics & Export | Citizens Vision",
};

export default async function AnalyticsPage({ params }: Props) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/");

  const { data: membership } = await supabase
    .from("user_org_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", org.id)
    .single();

  if (!membership) redirect("/");

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .eq("org_id", org.id)
    .order("name");

  const isAdmin = ["org_admin", "platform_admin"].includes(membership.role);

  return (
    <AnalyticsClient
      orgId={org.id}
      orgSlug={orgSlug}
      departments={departments ?? []}
      isAdmin={isAdmin}
    />
  );
}
