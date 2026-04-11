// supabase/functions/generate-advisory/index.ts
// Scheduled via pg_cron daily @ 6 AM + triggered on metric refresh.
// Evaluates all active advisory rules against current metric snapshots.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Rule {
  id: string;
  template_id: string;
  metric_slug: string;
  operator: string;
  threshold: number;
  lookback_days: number;
  cooldown_hours: number;
  advisory_templates: {
    id: string;
    type: string;
    title_template: string;
    body_template: string;
    severity: string;
  };
}

function renderTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(
    /\{(\w+)\}/g,
    (_, key: string) => String(data[key] ?? `{${key}}`)
  );
}

function evaluateRule(
  operator: string,
  value: number,
  threshold: number
): boolean {
  switch (operator) {
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "==":
      return value === threshold;
    default:
      return false;
  }
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Parse optional org_id from request body
  let targetOrgId: string | null = null;
  try {
    const body = await req.json();
    targetOrgId = body?.org_id ?? null;
  } catch {
    // No body — run for all orgs
  }

  // Fetch active rules with templates
  const { data: rules, error: rulesErr } = await supabase
    .from("advisory_rules")
    .select("*, advisory_templates(*)")
    .eq("active", true);

  if (rulesErr || !rules) {
    return new Response(
      JSON.stringify({ error: "Failed to load rules" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Fetch all orgs (or single org)
  let orgQuery = supabase.from("organisations").select("id");
  if (targetOrgId) {
    orgQuery = orgQuery.eq("id", targetOrgId);
  }
  const { data: orgs } = await orgQuery;

  if (!orgs || orgs.length === 0) {
    return new Response(
      JSON.stringify({ generated: 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  let totalGenerated = 0;

  for (const org of orgs) {
    // Fetch latest metric snapshot for this org
    const { data: snapshot } = await supabase
      .rpc("get_org_metrics_snapshot", { p_org_id: org.id })
      .single();

    const metrics: Record<string, number> = snapshot ?? {};

    for (const rule of rules as Rule[]) {
      const template = rule.advisory_templates;
      if (!template) continue;

      const metricValue = metrics[rule.metric_slug];
      if (metricValue === undefined) continue;

      // Evaluate rule
      if (!evaluateRule(rule.operator, metricValue, rule.threshold)) continue;

      // Check cooldown
      const cooldownCutoff = new Date(
        Date.now() - rule.cooldown_hours * 60 * 60 * 1000
      ).toISOString();

      const { count: recentCount } = await supabase
        .from("advisory_outputs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org.id)
        .eq("rule_id", rule.id)
        .gte("created_at", cooldownCutoff);

      if ((recentCount ?? 0) > 0) continue;

      // Build output
      const data: Record<string, unknown> = {
        metric_slug: rule.metric_slug,
        value: metricValue,
        threshold: rule.threshold,
        org_id: org.id,
      };

      const title = renderTemplate(template.title_template, data);
      const body = renderTemplate(template.body_template, data);

      const { error: insertErr } = await supabase
        .from("advisory_outputs")
        .insert({
          org_id: org.id,
          template_id: rule.template_id,
          rule_id: rule.id,
          title,
          body,
          severity: template.severity,
          data,
          dismissed: false,
        });

      if (!insertErr) totalGenerated++;
    }
  }

  return new Response(
    JSON.stringify({ generated: totalGenerated }),
    { headers: { "Content-Type": "application/json" } }
  );
});
