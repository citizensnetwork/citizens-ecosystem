// /admin/reported — list open and recently-resolved reports for admin review.
//
// Admin-only. Pulls reports with reporter's profile joined.  Resolution
// happens via PATCH /api/admin/reports/[id], which logs to admin_actions.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ReportsManager, {
  type ReportRow,
} from "@/components/admin/ReportsManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports — Admin · Citizens Connect" };

const PAGE_SIZE = 40;

export default async function AdminReportsPage({
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
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/events");

  const filterStatus =
    status === "actioned" || status === "dismissed" ? status : "open";

  // Open: oldest first (surface the most-waited reports up top).
  // Resolved: most recent decision first.
  const orderColumn = filterStatus === "open" ? "created_at" : "resolved_at";
  const orderAsc = filterStatus === "open";

  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, target_type, target_id, reason, body, status, resolved_at, resolution_notes, created_at, reporter:profiles!reports_reporter_id_fkey(id, full_name, email)",
    )
    .eq("status", filterStatus)
    .order(orderColumn, { ascending: orderAsc })
    .limit(PAGE_SIZE);

  if (error) {
    console.error("[admin/reports]", error);
  }

  const rows: ReportRow[] = (data ?? []).map((r) => {
    const rep = r.reporter as
      | { id?: string; full_name?: string; email?: string }
      | { id?: string; full_name?: string; email?: string }[]
      | null;
    const repObj = Array.isArray(rep) ? rep[0] : rep;
    return {
      id: r.id as string,
      target_type: r.target_type as ReportRow["target_type"],
      target_id: r.target_id as string,
      reason: r.reason as string,
      body: (r.body as string) ?? null,
      status: r.status as ReportRow["status"],
      resolved_at: (r.resolved_at as string) ?? null,
      resolution_notes: (r.resolution_notes as string) ?? null,
      created_at: r.created_at as string,
      reporter_id: repObj?.id ?? null,
      reporter_name: repObj?.full_name ?? null,
      reporter_email: repObj?.email ?? null,
    };
  });

  return (
    <>
      <PageHeader title="Reports" fallbackHref="/events" />
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filter reports by status">
          <StatusTab label="Open" href="/admin/reported" active={filterStatus === "open"} />
          <StatusTab label="Actioned" href="/admin/reported?status=actioned" active={filterStatus === "actioned"} />
          <StatusTab label="Dismissed" href="/admin/reported?status=dismissed" active={filterStatus === "dismissed"} />
        </nav>
        <ReportsManager rows={rows} />
      </div>
    </>
  );
}

function StatusTab({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-full border px-3 py-1 transition ${
        active
          ? "border-black bg-black text-white"
          : "border-black/15 text-black/70 hover:bg-black/5"
      }`}
    >
      {label}
    </a>
  );
}
