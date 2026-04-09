import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "./DashboardClient";

interface DashboardPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: org } = await supabase
    .from("organisations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();

  if (!org) {
    redirect("/");
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", org.id)
    .order("name");

  return (
    <DashboardClient
      orgId={org.id}
      orgName={org.name}
      departments={departments ?? []}
    />
  );
}
