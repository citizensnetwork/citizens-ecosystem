import type { AdvisoryRuleWithTemplate } from "@/types/db";

/**
 * Render template string by replacing {placeholder} tokens with data values.
 */
export function renderTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = data[key];
    if (value === undefined || value === null) return `{${key}}`;
    return String(value);
  });
}

/**
 * Evaluate whether a metric value triggers a rule based on operator and threshold.
 */
export function evaluateRule(
  metricValue: number,
  operator: string,
  threshold: number
): boolean {
  switch (operator) {
    case "<":
      return metricValue < threshold;
    case "<=":
      return metricValue <= threshold;
    case ">":
      return metricValue > threshold;
    case ">=":
      return metricValue >= threshold;
    case "=":
      return metricValue === threshold;
    case "!=":
      return metricValue !== threshold;
    default:
      return false;
  }
}

/**
 * Check whether a rule is within its cooldown period based on the last output created_at.
 */
export function isInCooldown(
  cooldownHours: number,
  lastOutputCreatedAt: string | null
): boolean {
  if (!lastOutputCreatedAt) return false;
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const lastTime = new Date(lastOutputCreatedAt).getTime();
  return Date.now() - lastTime < cooldownMs;
}

/**
 * Build an advisory output from a triggered rule and its data context.
 */
export function buildAdvisoryOutput(
  rule: AdvisoryRuleWithTemplate,
  orgId: string,
  data: Record<string, unknown>
) {
  const { advisory_templates: template } = rule;
  return {
    org_id: orgId,
    template_id: rule.template_id,
    rule_id: rule.id,
    title: renderTemplate(template.title_template, data),
    body: renderTemplate(template.body_template, data),
    severity: template.severity,
    data,
  };
}
