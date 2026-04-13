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

  const partnershipId = request.nextUrl.searchParams.get("partnership_id");

  if (!partnershipId || !isValidUUID(partnershipId)) {
    return NextResponse.json(
      { error: "Valid partnership_id is required" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("shared_metrics")
      .select("*")
      .eq("partnership_id", partnershipId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[shared-metrics] Query error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ shared_metrics: data ?? [] });
  } catch (error) {
    console.error("[shared-metrics] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const partnershipId = body.partnership_id as string;
  const metricSlug = body.metric_slug as string;
  const visible = body.visible !== false;

  if (!partnershipId || !isValidUUID(partnershipId)) {
    return NextResponse.json(
      { error: "Valid partnership_id is required" },
      { status: 400 }
    );
  }

  if (!metricSlug || metricSlug.length === 0) {
    return NextResponse.json(
      { error: "metric_slug is required" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("shared_metrics")
      .insert({ partnership_id: partnershipId, metric_slug: metricSlug, visible })
      .select()
      .single();

    if (error) {
      console.error("[shared-metrics] Insert error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[shared-metrics] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
