import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProjectForm } from "@/components/projects/ProjectForm";

interface NewProjectPageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function NewProjectPage({ params }: NewProjectPageProps) {
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

  const [deptResult, goalResult] = await Promise.all([
    supabase
      .from("departments")
      .select("*")
      .eq("org_id", org.id)
      .order("name"),
    supabase
      .from("goals")
      .select("id, title")
      .eq("org_id", org.id)
      .in("status", ["active", "draft"])
      .order("title"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text-primary">New Project</h1>
      <ProjectForm
        orgId={org.id}
        orgSlug={orgSlug}
        departments={deptResult.data ?? []}
        goals={goalResult.data ?? []}
      />
    </div>
  );
}
