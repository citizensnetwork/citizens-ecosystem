import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("org_id");
  const dateFrom =
    request.nextUrl.searchParams.get("date_from") ??
    new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const dateTo =
    request.nextUrl.searchParams.get("date_to") ??
    new Date().toISOString().split("T")[0];

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  try {
    // Get active partnerships for this org
    const { data: partnerships, error: partErr } = await supabase
      .from("org_partnerships")
      .select(
        "id, org_a_id, org_b_id, sharing_level, org_a:organisations!org_partnerships_org_a_id_fkey(id, name, slug), org_b:organisations!org_partnerships_org_b_id_fkey(id, name, slug)"
      )
      .eq("status", "active")
      .or(`org_a_id.eq.${orgId},org_b_id.eq.${orgId}`);

    if (partErr) {
      console.error("[metrics/cross-org] Partnerships error:", partErr);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const partners = partnerships ?? [];

    // For each partner, fetch summary metrics (respecting sharing_level)
    const partnerMetrics = await Promise.all(
      partners.map(async (p) => {
        const partnerOrgId = p.org_a_id === orgId ? p.org_b_id : p.org_a_id;
        const partnerOrg = (p.org_a_id === orgId ? p.org_b : p.org_a) as unknown as { id: string; name: string; slug: string } | null;

        if (p.sharing_level === "none") {
          return {
            org_id: partnerOrgId,
            org_name: partnerOrg?.name ?? "Unknown",
            org_slug: partnerOrg?.slug ?? "",
            partnership_id: p.id,
            sharing_level: p.sharing_level,
            status: "active" as const,
            kpis: null,
          };
        }

        // Fetch activities for the partner org
        const { data: activities } = await supabase
          .from("activities")
          .select("id, participant_count, department_id")
          .eq("org_id", partnerOrgId)
          .gte("date", dateFrom)
          .lte("date", dateTo);

        const acts = activities ?? [];
        const totalActivities = acts.length;
        const totalParticipants = acts.reduce(
          (s, a) => s + (a.participant_count ?? 0),
          0
        );
        const activeDepartments = new Set(
          acts.map((a) => a.department_id).filter(Boolean)
        ).size;

        return {
          org_id: partnerOrgId,
          org_name: partnerOrg?.name ?? "Unknown",
          org_slug: partnerOrg?.slug ?? "",
          partnership_id: p.id,
          sharing_level: p.sharing_level,
          status: "active" as const,
          kpis: {
            total_activities: totalActivities,
            participants_reached: totalParticipants,
            active_departments: activeDepartments,
          },
        };
      })
    );

    const totalActivities = partnerMetrics.reduce(
      (s, p) => s + (p.kpis?.total_activities ?? 0),
      0
    );
    const totalParticipants = partnerMetrics.reduce(
      (s, p) => s + (p.kpis?.participants_reached ?? 0),
      0
    );

    return NextResponse.json({
      partner_count: partnerMetrics.length,
      total_activities: totalActivities,
      total_participants: totalParticipants,
      partners: partnerMetrics,
    });
  } catch (error) {
    console.error("[metrics/cross-org] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
