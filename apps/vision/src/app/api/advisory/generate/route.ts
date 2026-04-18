import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { requireOrgRole } from "@/lib/supabase/rbac";
import {
  evaluateRule,
  isInCooldown,
  buildAdvisoryOutput,
} from "@/lib/advisory/engine";
import type { AdvisoryRuleWithTemplate } from "@/types/db";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { org_id?: string; metrics?: Record<string, number> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { org_id, metrics } = body;

  if (!org_id || !isValidUUID(org_id)) {
    return NextResponse.json(
      { error: "Valid org_id is required" },
      { status: 400 }
    );
  }

  // Verify admin role
  const auth = await requireOrgRole(supabase, user.id, org_id, [
    "org_admin",
    "org_manager",
  ]);
  if (!auth.ok) return auth.response;

  // Fetch active rules with their templates
  const { data: rules, error: rulesError } = await supabase
    .from("advisory_rules")
    .select("*, advisory_templates(type, title_template, body_template, severity)")
    .eq("active", true);

  if (rulesError || !rules) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // Get last outputs for cooldown check
  const { data: recentOutputs } = await supabase
    .from("advisory_outputs")
    .select("rule_id, created_at")
    .eq("org_id", org_id)
    .order("created_at", { ascending: false });

  const lastOutputByRule = new Map<string, string>();
  for (const output of recentOutputs ?? []) {
    if (!lastOutputByRule.has(output.rule_id)) {
      lastOutputByRule.set(output.rule_id, output.created_at);
    }
  }

  // Use provided metrics or default empty
  const metricValues: Record<string, number> = metrics ?? {};

  const generated: unknown[] = [];

  for (const rule of rules as AdvisoryRuleWithTemplate[]) {
    // Skip rules without matching metrics
    const metricValue = metricValues[rule.metric_slug];
    if (metricValue === undefined) continue;

    // Check cooldown
    const lastOutputAt = lastOutputByRule.get(rule.id) ?? null;
    if (isInCooldown(rule.cooldown_hours, lastOutputAt)) continue;

    // Evaluate rule
    if (!evaluateRule(metricValue, rule.operator, rule.threshold)) continue;

    // Build and insert output
    const outputData = buildAdvisoryOutput(rule, org_id, {
      ...metricValues,
      metric_value: metricValue,
    });

    const { data: inserted, error: insertError } = await supabase
      .from("advisory_outputs")
      .insert(outputData)
      .select()
      .single();

    if (!insertError && inserted) {
      generated.push(inserted);
    }
  }

  return NextResponse.json({
    generated: generated.length,
    advisories: generated,
  });
}
