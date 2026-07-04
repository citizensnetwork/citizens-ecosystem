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

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("org_id");

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("scheduled_reports")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[reports] Query error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ reports: data ?? [] });
  } catch (error) {
    console.error("[reports] Error:", error);
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

  const orgId = body.org_id as string;
  const name = body.name as string;
  const frequency = body.frequency as string;
  const recipients = body.recipients as string[];

  if (!orgId || !isValidUUID(orgId)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  if (!name || name.length < 1) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  if (!frequency || !["daily", "weekly", "monthly"].includes(frequency)) {
    return NextResponse.json(
      { error: "frequency must be daily, weekly, or monthly" },
      { status: 400 }
    );
  }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json(
      { error: "At least one recipient email is required" },
      { status: 400 }
    );
  }

  try {
    // Compute next_run_at based on frequency
    const now = new Date();
    let nextRun: Date;
    switch (frequency) {
      case "daily":
        nextRun = new Date(now.getTime() + 86400000);
        break;
      case "weekly":
        nextRun = new Date(now.getTime() + 7 * 86400000);
        break;
      case "monthly":
        nextRun = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        break;
      default:
        nextRun = new Date(now.getTime() + 7 * 86400000);
    }

    const { data, error } = await supabase
      .from("scheduled_reports")
      .insert({
        org_id: orgId,
        name,
        frequency,
        recipients,
        report_config: (body.report_config as Record<string, unknown>) ?? {},
        next_run_at: nextRun.toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("[reports] Insert error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[reports] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
