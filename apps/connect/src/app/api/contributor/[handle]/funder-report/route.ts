/**
 * GET /api/contributor/[handle]/funder-report?period=90
 *
 * Funder-facing PDF (spec §B3) — distinct from the CSV/XLSX analytics export.
 * Contains: org name, period, event count, RSVP totals, volunteer totals,
 * city reach (province snapshots), top events by engagement, and the Kingdom
 * Projects this contributor leads. Generated server-side with pdf-lib (no
 * headless browser), returned as a download.
 *
 * Access: dashboard owner or admin-with-active-session (checkDashboardAccess).
 */

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getRouteAuth } from "@/lib/supabase/route";
import { checkDashboardAccess } from "@/lib/dashboard/access";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PERIODS = [30, 90, 180, 365];
const GOLD = rgb(0.788, 0.659, 0.298); // #C9A84C
const INK = rgb(0.04, 0.035, 0.03); // #0A0908
const MUTED = rgb(0.48, 0.44, 0.38); // #7A7060

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const access = await checkDashboardAccess(handle, request);
  if (!access.hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const { contributorId } = access;

  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // PDF generation is heavier than a JSON read — cap it tightly.
  const rl = await checkRateLimit(`funder-report:${user.id}`, RATE_LIMITS.mutation);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const periodRaw = parseInt(new URL(request.url).searchParams.get("period") ?? "90", 10);
  const period = VALID_PERIODS.includes(periodRaw) ? periodRaw : 90;
  const since = new Date(Date.now() - period * 86400000).toISOString();

  // ── Gather everything in parallel ─────────────────────────────────────
  type EventRow = { id: string; title: string; date: string };
  const [profileRes, eventsRes, volunteersRes, projectsRes] = await Promise.all([
    supabase.from("profiles").select("full_name, contributor_kind, contributor_slug").eq("id", contributorId).maybeSingle(),
    supabase.from("events").select("id, title, date").eq("created_by", contributorId).gte("date", since).order("date", { ascending: true }),
    supabase.from("volunteer_applications").select("id, status", { count: "exact", head: false }).eq("contributor_id", contributorId).gte("created_at", since),
    supabase.from("suggestions").select("title, idea_status").eq("project_lead_id", contributorId),
  ]);

  const orgName = profileRes.data?.full_name ?? handle;
  const events = (eventsRes.data ?? []) as EventRow[];
  const eventIds = events.map((e) => e.id);

  let rsvpRows: { event_id: string; status: string; location_snapshot: string | null }[] = [];
  if (eventIds.length > 0) {
    const { data } = await supabase
      .from("rsvps")
      .select("event_id, status, location_snapshot")
      .in("event_id", eventIds);
    rsvpRows = data ?? [];
  }

  const attending = rsvpRows.filter((r) => r.status === "attending");
  const considering = rsvpRows.filter((r) => r.status === "considering");
  const volunteers = volunteersRes.data ?? [];
  const volunteersApproved = volunteers.filter((v) => v.status === "approved").length;

  const reach = new Map<string, number>();
  for (const r of attending) {
    if (r.location_snapshot) reach.set(r.location_snapshot, (reach.get(r.location_snapshot) ?? 0) + 1);
  }
  const reachRows = [...reach.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const byEvent = new Map<string, number>();
  for (const r of attending) byEvent.set(r.event_id, (byEvent.get(r.event_id) ?? 0) + 1);
  const topEvents = events
    .map((e) => ({ ...e, rsvps: byEvent.get(e.id) ?? 0 }))
    .sort((a, b) => b.rsvps - a.rsvps)
    .slice(0, 6);

  const projects = (projectsRes.data ?? []).filter((p) => p.idea_status !== "voting");

  // ── Build the PDF ──────────────────────────────────────────────────────
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 portrait
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const margin = 56;
  let y = 841.89 - margin;

  const text = (
    s: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {},
  ) => {
    page.drawText(s.slice(0, 110), {
      x: opts.x ?? margin,
      y,
      size: opts.size ?? 10,
      font: opts.bold ? helvBold : helv,
      color: opts.color ?? INK,
    });
  };
  const line = (gap = 16) => { y -= gap; };

  // Header
  text("CITIZENS CONNECT", { size: 9, bold: true, color: GOLD });
  line(20);
  text("Funder Impact Report", { size: 22, bold: true });
  line(18);
  text(orgName, { size: 13, bold: true, color: MUTED });
  line(14);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  text(`Period: ${fmt(new Date(since))} – ${fmt(new Date())}  ·  Generated ${fmt(new Date())}`, { size: 9, color: MUTED });
  line(10);
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.2, color: GOLD });
  line(26);

  // Stat block
  const stats: [string, string][] = [
    ["Events held / scheduled", String(events.length)],
    ["Citizens connected (RSVPs)", String(attending.length)],
    ["Citizens considering", String(considering.length)],
    ["Volunteer applications", `${volunteers.length} received · ${volunteersApproved} approved`],
    ["Kingdom Projects led", String(projects.length)],
  ];
  text("AT A GLANCE", { size: 9, bold: true, color: GOLD });
  line(18);
  for (const [label, value] of stats) {
    text(label, { size: 11, color: MUTED });
    text(value, { size: 11, bold: true, x: 320 });
    line(17);
  }
  line(12);

  // City reach
  text("CITY REACH — where connected citizens come from", { size: 9, bold: true, color: GOLD });
  line(18);
  if (reachRows.length === 0) {
    text("Reach data builds as citizens connect to events.", { size: 10, color: MUTED });
    line(17);
  } else {
    for (const [area, count] of reachRows) {
      text(area, { size: 10.5, color: INK });
      text(String(count), { size: 10.5, bold: true, x: 320 });
      line(16);
    }
  }
  line(12);

  // Top events
  text("TOP EVENTS — by citizens connected", { size: 9, bold: true, color: GOLD });
  line(18);
  if (topEvents.length === 0) {
    text("No events in this period.", { size: 10, color: MUTED });
    line(17);
  } else {
    for (const e of topEvents) {
      text(`${e.title}`, { size: 10.5 });
      text(`${e.rsvps} connected · ${fmt(new Date(e.date))}`, { size: 9.5, color: MUTED, x: 320 });
      line(16);
    }
  }
  line(12);

  // Kingdom projects
  if (projects.length > 0) {
    text("KINGDOM PROJECTS LED", { size: 9, bold: true, color: GOLD });
    line(18);
    for (const p of projects.slice(0, 6)) {
      text(`${p.title ?? "Untitled project"}`, { size: 10.5 });
      text(p.idea_status === "confirmed" ? "Confirmed" : "In process", { size: 9.5, color: MUTED, x: 320 });
      line(16);
    }
    line(8);
  }

  // Footer
  page.drawLine({ start: { x: margin, y: margin + 26 }, end: { x: width - margin, y: margin + 26 }, thickness: 0.8, color: GOLD });
  page.drawText("Connecting the Kingdom  ·  citizenscentral.co.za", {
    x: margin, y: margin + 12, size: 8.5, font: helv, color: MUTED,
  });

  const bytes = await doc.save();

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${handle}-funder-report-${period}d.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
