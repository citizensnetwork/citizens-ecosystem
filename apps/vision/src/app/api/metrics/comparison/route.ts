import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { computeChangePct } from "@/lib/metrics/analytics";
import { ACTIVITY_TYPE_LABELS } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("org_id");
  const periodAFrom = searchParams.get("period_a_from");
  const periodATo = searchParams.get("period_a_to");
  const periodBFrom = searchParams.get("period_b_from");
  const periodBTo = searchParams.get("period_b_to");
  const departmentId = searchParams.get("department_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  if (!periodAFrom || !periodATo || !periodBFrom || !periodBTo) {
    return NextResponse.json(
      { error: "All four period dates are required" },
      { status: 400 }
    );
  }

  if (departmentId && !isValidUUID(departmentId)) {
    return NextResponse.json(
      { error: "Valid department_id is required" },
      { status: 400 }
    );
  }

  try {
    const buildQuery = (from: string, to: string) => {
      let query = supabase
        .from("activities")
        .select("id, department_id, type, participant_count, departments(name)")
        .eq("org_id", orgId)
        .gte("date", from)
        .lte("date", to);

      if (departmentId) {
        query = query.eq("department_id", departmentId);
      }
      return query;
    };

    const [resultA, resultB] = await Promise.all([
      buildQuery(periodAFrom, periodATo),
      buildQuery(periodBFrom, periodBTo),
    ]);

    const dataA = resultA.data ?? [];
    const dataB = resultB.data ?? [];

    const totalA = dataA.length;
    const totalB = dataB.length;
    const participantsA = dataA.reduce((s, a) => s + (a.participant_count ?? 0), 0);
    const participantsB = dataB.reduce((s, a) => s + (a.participant_count ?? 0), 0);
    const deptSetA = new Set(dataA.map((a) => a.department_id).filter(Boolean));
    const deptSetB = new Set(dataB.map((a) => a.department_id).filter(Boolean));

    // Department breakdown
    const deptMapA = new Map<string, { name: string; count: number }>();
    const deptMapB = new Map<string, { name: string; count: number }>();
    for (const a of dataA) {
      if (a.department_id) {
        const existing = deptMapA.get(a.department_id);
        const deptName = (a.departments as unknown as { name: string } | null)?.name ?? "Unknown";
        if (existing) {
          existing.count++;
        } else {
          deptMapA.set(a.department_id, { name: deptName, count: 1 });
        }
      }
    }
    for (const a of dataB) {
      if (a.department_id) {
        const existing = deptMapB.get(a.department_id);
        const deptName = (a.departments as unknown as { name: string } | null)?.name ?? "Unknown";
        if (existing) {
          existing.count++;
        } else {
          deptMapB.set(a.department_id, { name: deptName, count: 1 });
        }
      }
    }

    const allDeptIds = new Set([...deptMapA.keys(), ...deptMapB.keys()]);
    const department_breakdown = Array.from(allDeptIds).map((id) => {
      const a = deptMapA.get(id);
      const b = deptMapB.get(id);
      return {
        department_id: id,
        department_name: a?.name ?? b?.name ?? "Unknown",
        count_a: a?.count ?? 0,
        count_b: b?.count ?? 0,
        change_pct: computeChangePct(a?.count ?? 0, b?.count ?? 0),
      };
    });

    // Type breakdown
    const typeMapA = new Map<string, number>();
    const typeMapB = new Map<string, number>();
    for (const a of dataA) typeMapA.set(a.type, (typeMapA.get(a.type) ?? 0) + 1);
    for (const a of dataB) typeMapB.set(a.type, (typeMapB.get(a.type) ?? 0) + 1);

    const allTypes = new Set([...typeMapA.keys(), ...typeMapB.keys()]);
    const type_breakdown = Array.from(allTypes).map((type) => ({
      type,
      label: ACTIVITY_TYPE_LABELS[type] ?? type,
      count_a: typeMapA.get(type) ?? 0,
      count_b: typeMapB.get(type) ?? 0,
      change_pct: computeChangePct(
        typeMapA.get(type) ?? 0,
        typeMapB.get(type) ?? 0
      ),
    }));

    return NextResponse.json({
      period_a: { label: "Period A", date_from: periodAFrom, date_to: periodATo },
      period_b: { label: "Period B", date_from: periodBFrom, date_to: periodBTo },
      metrics: {
        total_activities: {
          a: totalA,
          b: totalB,
          change_pct: computeChangePct(totalA, totalB),
        },
        participants_reached: {
          a: participantsA,
          b: participantsB,
          change_pct: computeChangePct(participantsA, participantsB),
        },
        active_departments: {
          a: deptSetA.size,
          b: deptSetB.size,
          change_pct: computeChangePct(deptSetA.size, deptSetB.size),
        },
        department_breakdown,
        type_breakdown,
      },
    });
  } catch (error) {
    console.error("[metrics/comparison] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
