import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { GoalForm } from "@/components/goals/GoalForm";

interface NewGoalPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function NewGoalPage({ params }: NewGoalPageProps) {
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

  const { data: visions } = await supabase
    .from("vision_statements")
    .select("*")
    .eq("org_id", org.id)
    .eq("active", true)
    .order("title");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">New Goal</h1>
      <GoalForm
        orgId={org.id}
        orgSlug={orgSlug}
        visions={visions ?? []}
      />
    </div>
  );
}
