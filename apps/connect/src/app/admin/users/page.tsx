import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminUserManager from "@/components/admin/AdminUserManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users — Admin · Citizens Connect" };

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/events");

  let query = supabase
    .from("profiles")
    .select(
      "id, email, full_name, avatar_url, role, contributor_kind, contributor_status, contributor_slug, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (status === "pending" || status === "approved" || status === "rejected") {
    query = query.eq("contributor_status", status);
  }
  const { data, count } = await query;

  return (
    <>
      <PageHeader title="Users" fallbackHref="/events" />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <p className="mb-5 text-sm text-black/60">
          Manage roles and contributor status. All changes are logged to the
          admin audit trail.
        </p>
        <AdminUserManager
          viewerId={user.id}
          initialRows={data ?? []}
          initialMeta={{ page: 1, pageSize: PAGE_SIZE, total: count ?? 0 }}
          initialStatus={status ?? null}
        />
      </div>
    </>
  );
}
