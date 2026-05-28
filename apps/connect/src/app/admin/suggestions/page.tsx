// /admin/suggestions — admin inbox for user-submitted suggestions.
//
// Admin-only. Mirrors /admin/reported: tabbed status filter + manager
// component for status updates and inline responses.
//
// Submissions land via POST /api/suggestions (rate-limited 10/day per user).
// Admin actions go through PATCH /api/suggestions/[id], which fires a
// `suggestion_response` notification to the submitter when status flips to
// actioned or declined.
//
// Export available at /api/admin/suggestions/export?format=csv|xlsx&status=...

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SuggestionsManager, {
  type SuggestionRow,
} from "@/components/admin/SuggestionsManager";
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suggestions — Admin · Citizens Connect" };

const PAGE_SIZE = 100;
const VALID_STATUSES = ["open", "in_review", "actioned", "declined"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

export default async function AdminSuggestionsPage({
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

  const filterStatus: ValidStatus = VALID_STATUSES.includes(status as ValidStatus)
    ? (status as ValidStatus)
    : "open";

  // Open: oldest first (work through the backlog FIFO).
  // Resolved: most recent decision first.
  const orderColumn =
    filterStatus === "actioned" || filterStatus === "declined"
      ? "resolved_at"
      : "created_at";
  const orderAsc = filterStatus === "open";

  const { data, error } = await supabase
    .from("suggestions")
    .select(
      "id, title, body, page_url, status, admin_response, resolved_at, created_at, user_id, user:profiles!suggestions_user_id_fkey(id, full_name, email)",
    )
    .eq("status", filterStatus)
    .order(orderColumn, { ascending: orderAsc, nullsFirst: false })
    .limit(PAGE_SIZE);

  if (error) {
    console.error("[admin/suggestions]", error);
  }

  const rows: SuggestionRow[] = (data ?? []).map((s) => {
    const submitter = s.user as
      | { id?: string; full_name?: string; email?: string }
      | { id?: string; full_name?: string; email?: string }[]
      | null;
    const submitterObj = Array.isArray(submitter) ? submitter[0] : submitter;
    return {
      id: s.id as string,
      title: s.title as string,
      body: s.body as string,
      page_url: s.page_url as string,
      status: s.status as SuggestionRow["status"],
      admin_response: (s.admin_response as string) ?? null,
      resolved_at: (s.resolved_at as string) ?? null,
      created_at: s.created_at as string,
      submitter_id: submitterObj?.id ?? (s.user_id as string | null) ?? null,
      submitter_name: submitterObj?.full_name ?? null,
      submitter_email: submitterObj?.email ?? null,
    };
  });

  const exportHref = `/api/admin/suggestions/export?format=xlsx&status=${filterStatus}`;
  const exportCsvHref = `/api/admin/suggestions/export?format=csv&status=${filterStatus}`;

  return (
    <>
      <PageHeader title="Suggestions" fallbackHref="/admin" />
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <nav
          className="flex flex-wrap items-center gap-2 text-sm"
          aria-label="Filter suggestions by status"
        >
          <StatusTab
            label="Open"
            href="/admin/suggestions"
            active={filterStatus === "open"}
          />
          <StatusTab
            label="In review"
            href="/admin/suggestions?status=in_review"
            active={filterStatus === "in_review"}
          />
          <StatusTab
            label="Actioned"
            href="/admin/suggestions?status=actioned"
            active={filterStatus === "actioned"}
          />
          <StatusTab
            label="Declined"
            href="/admin/suggestions?status=declined"
            active={filterStatus === "declined"}
          />

          <div className="ml-auto flex gap-2">
            <Link
              href={exportCsvHref}
              className="rounded-full border border-black/15 px-3 py-1 text-xs text-black/70 transition hover:border-(--gold) hover:bg-(--gold-soft)/40"
            >
              Export CSV
            </Link>
            <Link
              href={exportHref}
              className="rounded-full border border-black/15 px-3 py-1 text-xs text-black/70 transition hover:border-(--gold) hover:bg-(--gold-soft)/40"
            >
              Export XLSX
            </Link>
          </div>
        </nav>

        <SuggestionsManager rows={rows} />
      </div>
    </>
  );
}

function StatusTab({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
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
