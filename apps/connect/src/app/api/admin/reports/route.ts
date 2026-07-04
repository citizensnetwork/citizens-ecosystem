/**
 * GET /api/admin/reports — the moderation queue for the admin panel.
 *
 * Admin-only. Returns reports (newest first, max 200) with the reporter's
 * display identity and a best-effort resolved name for the reported target
 * (event title / place name / profile name) so the client never has to fan
 * out per-row lookups.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route";
import { requireAdmin } from "@/lib/adminGuard";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileLite = { full_name: string | null; avatar_url: string | null } | null;

export async function GET(request: NextRequest) {
  const { supabase } = await getRouteAuth(request);
  const guard = await requireAdmin(supabase);
  if (!guard.ok) return guard.deny;

  const rl = await checkRateLimit(`admin-reports-get:${guard.user.id}`, RATE_LIMITS.read);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, reporter_id, target_type, target_id, reason, body, status, resolved_at, resolution_notes, created_at, reporter:profiles!reports_reporter_id_fkey(full_name, avatar_url)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/reports GET]", error);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }

  const rows = data ?? [];

  // Resolve target display names in three batched lookups (events / places /
  // profiles). Conversations and unknown types keep a generic label.
  const idsBy = (t: string) =>
    [...new Set(rows.filter((r) => r.target_type === t).map((r) => r.target_id))];
  const [eventIds, placeIds, userIds] = [idsBy("event"), idsBy("place"), idsBy("user")];

  const [eventsRes, placesRes, usersRes] = await Promise.all([
    eventIds.length
      ? supabase.from("events").select("id, title").in("id", eventIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    placeIds.length
      ? supabase.from("places").select("id, name").in("id", placeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const nameMap = new Map<string, string>();
  for (const e of eventsRes.data ?? []) nameMap.set(`event:${e.id}`, e.title);
  for (const p of placesRes.data ?? []) nameMap.set(`place:${p.id}`, p.name);
  for (const u of usersRes.data ?? []) nameMap.set(`user:${u.id}`, u.full_name ?? "A citizen");

  const reports = rows.map((r) => {
    const rep = (Array.isArray(r.reporter) ? r.reporter[0] : r.reporter) as ProfileLite;
    return {
      id: r.id,
      target_type: r.target_type,
      target_id: r.target_id,
      target_name:
        nameMap.get(`${r.target_type}:${r.target_id}`) ??
        (r.target_type === "conversation" ? "A conversation" : `A ${r.target_type}`),
      reason: r.reason,
      body: r.body ?? "",
      status: r.status,
      resolution_notes: r.resolution_notes ?? null,
      resolved_at: r.resolved_at,
      created_at: r.created_at,
      reporter_name: rep?.full_name ?? "A citizen",
      reporter_avatar: rep?.avatar_url ?? null,
    };
  });

  return NextResponse.json({ reports });
}
