// /admin — Admin dashboard home.
//
// Single landing page for all admin tools. Replaces the scattered admin
// link group that previously lived in the burger bar (per MASTER_DIRECTION
// Decision D15 — admin functions do NOT belong in the burger bar).
//
// Shows simple stat cards (pending applications, open reports, total users,
// total events, total places) and a navigation grid to the sub-pages. No
// charts, no graphs — this is a launch-grade utility surface, not an
// analytics dashboard.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Citizens Connect" };

type StatCard = {
  label: string;
  value: number | null;
  href: string;
  hint?: string;
  emphasis?: boolean;
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") redirect("/events");

  // Run counts in parallel — head=true gives us count without rows.
  const [
    pendingAppsRes,
    openReportsRes,
    usersRes,
    eventsRes,
    placesRes,
  ] = await Promise.all([
    supabase
      .from("contributor_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("events").select("id", { count: "exact", head: true }),
    supabase.from("places").select("id", { count: "exact", head: true }),
  ]);

  const cards: StatCard[] = [
    {
      label: "Pending applications",
      value: pendingAppsRes.count ?? 0,
      href: "/admin/applications",
      hint: "Review contributor sign-ups",
      emphasis: (pendingAppsRes.count ?? 0) > 0,
    },
    {
      label: "Open reports",
      value: openReportsRes.count ?? 0,
      href: "/admin/reported",
      hint: "Flagged content awaiting decision",
      emphasis: (openReportsRes.count ?? 0) > 0,
    },
    {
      label: "Total users",
      value: usersRes.count ?? 0,
      href: "/admin/users",
      hint: "Roles + elevation",
    },
    {
      label: "Total events",
      value: eventsRes.count ?? 0,
      href: "/events",
      hint: "Live event count",
    },
    {
      label: "Total places",
      value: placesRes.count ?? 0,
      href: "/places",
      hint: "Permanent map listings",
    },
  ];

  const tools: Array<{ href: string; label: string; description: string }> = [
    {
      href: "/admin/applications",
      label: "Contributor applications",
      description:
        "Approve or reject pending Contributor sign-ups. Applicant receives an email + in-app notification on decision.",
    },
    {
      href: "/admin/users",
      label: "Users",
      description: "Manage roles, elevate Citizens to Contributors, audit trail.",
    },
    {
      href: "/admin/reported",
      label: "Reports",
      description: "Resolve user-submitted content reports.",
    },
    {
      href: "/admin/categories",
      label: "Categories",
      description: "Event + place category catalogue.",
    },
    {
      href: "/admin/tags",
      label: "Tags",
      description: "Tag moderation + official-flag toggles.",
    },
    {
      href: "/admin/api-keys",
      label: "API keys",
      description: "Internal integration credentials.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#faf9f6]">
      <PageHeader title="Admin" subtitle="Operations & moderation" fallbackHref="/events" />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
        <section
          aria-label="Stats"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className={`rounded-xl border bg-white p-4 transition hover:shadow-sm ${
                card.emphasis
                  ? "border-(--gold) bg-(--gold-soft)/50"
                  : "border-black/10"
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-black/55">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-black">
                {card.value ?? "—"}
              </p>
              {card.hint && (
                <p className="mt-1 text-xs text-black/55">{card.hint}</p>
              )}
            </Link>
          ))}
        </section>

        <section aria-label="Admin tools" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/55">
            Tools
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {tools.map((tool) => (
              <li key={tool.href}>
                <Link
                  href={tool.href}
                  className="block rounded-xl border border-black/10 bg-white p-4 transition hover:border-(--gold) hover:shadow-sm"
                >
                  <p className="text-sm font-semibold text-black">{tool.label}</p>
                  <p className="mt-1 text-xs text-black/60">{tool.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-label="Coming soon"
          className="rounded-xl border border-dashed border-black/15 bg-white/60 p-4 text-xs text-black/55"
        >
          Reported content workflow expansion and admin audit log export are
          in the roadmap. See <code>.github/MASTER_DIRECTION.md</code>.
        </section>
      </main>
    </div>
  );
}
