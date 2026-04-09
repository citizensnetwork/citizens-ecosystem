import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { isValidUUID } from "@/lib/validation";
import { GoalDetailClient } from "./GoalDetailClient";

interface GoalDetailPageProps {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function GoalDetailPage({ params }: GoalDetailPageProps) {
  const { orgSlug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  if (!isValidUUID(id)) notFound();

  const { data: org } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) redirect("/");

  const { data: goal, error } = await supabase
    .from("goals")
    .select("*, vision_statements(title)")
    .eq("id", id)
    .single();

  if (error || !goal) notFound();

  // Ensure goal belongs to this org
  if (goal.org_id !== org.id) notFound();

  const { data: visions } = await supabase
    .from("vision_statements")
    .select("*")
    .eq("org_id", org.id)
    .eq("active", true)
    .order("title");

  return (
    <GoalDetailClient
      goal={goal}
      orgId={org.id}
      orgSlug={orgSlug}
      visions={visions ?? []}
    />
  );
}
