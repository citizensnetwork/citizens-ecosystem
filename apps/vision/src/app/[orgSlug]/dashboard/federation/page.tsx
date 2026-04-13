import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FederationClient from "./FederationClient";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function FederationPage({ params }: PageProps) {
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

  const isAdmin =
    membership.role === "org_admin" || membership.role === "platform_admin";

  return (
    <FederationClient orgId={org.id} isAdmin={isAdmin} />
  );
}
