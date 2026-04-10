import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { isValidUUID } from "@/lib/validation";
import { ProjectDetailClient } from "./ProjectDetailClient";

interface ProjectDetailPageProps {
  params: Promise<{ orgSlug: string; id: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
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

  const { data: project, error } = await supabase
    .from("projects")
    .select("*, departments(name)")
    .eq("id", id)
    .single();

  if (error || !project) notFound();
  if (project.org_id !== org.id) notFound();

  // Fetch milestones + user role in parallel
  const [milestonesResult, roleResult, deptResult] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", id)
      .order("sort_order"),
    supabase
      .from("user_org_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", org.id)
      .single(),
    supabase
      .from("departments")
      .select("*")
      .eq("org_id", org.id)
      .order("name"),
  ]);

  const role = roleResult.data?.role ?? "org_viewer";
  const canEdit =
    role === "org_admin" ||
    role === "platform_admin" ||
    project.created_by === user.id;

  return (
    <ProjectDetailClient
      project={project}
      milestones={milestonesResult.data ?? []}
      orgId={org.id}
      orgSlug={orgSlug}
      canEdit={canEdit}
      departments={deptResult.data ?? []}
    />
  );
}
