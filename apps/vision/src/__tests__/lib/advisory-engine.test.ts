import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  evaluateRule,
  isInCooldown,
  buildAdvisoryOutput,
} from "@/lib/advisory/engine";
import type { AdvisoryRuleWithTemplate } from "@/types/db";

describe("renderTemplate", () => {
  it("replaces placeholders with data values", () => {
    const result = renderTemplate("Hello {name}, score: {score}%", {
      name: "Test Org",
      score: 85,
    });
    expect(result).toBe("Hello Test Org, score: 85%");
  });

  it("leaves unknown placeholders intact", () => {
    const result = renderTemplate("Missing: {unknown}", {});
    expect(result).toBe("Missing: {unknown}");
  });

  it("handles null and undefined values", () => {
    const result = renderTemplate("{a} and {b}", { a: null, b: undefined });
    expect(result).toBe("{a} and {b}");
  });
});

describe("evaluateRule", () => {
  it("evaluates < operator", () => {
    expect(evaluateRule(10, "<", 20)).toBe(true);
    expect(evaluateRule(20, "<", 10)).toBe(false);
  });

  it("evaluates <= operator", () => {
    expect(evaluateRule(10, "<=", 10)).toBe(true);
    expect(evaluateRule(11, "<=", 10)).toBe(false);
  });

  it("evaluates > operator", () => {
    expect(evaluateRule(20, ">", 10)).toBe(true);
    expect(evaluateRule(10, ">", 20)).toBe(false);
  });

  it("evaluates >= operator", () => {
    expect(evaluateRule(10, ">=", 10)).toBe(true);
    expect(evaluateRule(9, ">=", 10)).toBe(false);
  });

  it("evaluates = operator", () => {
    expect(evaluateRule(10, "=", 10)).toBe(true);
    expect(evaluateRule(10, "=", 11)).toBe(false);
  });

  it("evaluates != operator", () => {
    expect(evaluateRule(10, "!=", 11)).toBe(true);
    expect(evaluateRule(10, "!=", 10)).toBe(false);
  });

  it("returns false for unknown operator", () => {
    expect(evaluateRule(10, "??", 10)).toBe(false);
  });
});

describe("isInCooldown", () => {
  it("returns false when no previous output", () => {
    expect(isInCooldown(24, null)).toBe(false);
  });

  it("returns true when within cooldown period", () => {
    const recentTime = new Date(Date.now() - 1000 * 60 * 30).toISOString(); // 30 min ago
    expect(isInCooldown(24, recentTime)).toBe(true);
  });

  it("returns false when past cooldown period", () => {
    const oldTime = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(); // 48 hours ago
    expect(isInCooldown(24, oldTime)).toBe(false);
  });
});

describe("buildAdvisoryOutput", () => {
  it("builds output from rule and data", () => {
    const rule: AdvisoryRuleWithTemplate = {
      id: "rule-1",
      template_id: "tmpl-1",
      metric_slug: "goal_alignment_pct",
      operator: "<",
      threshold: 30,
      lookback_days: 30,
      cooldown_hours: 168,
      active: true,
      created_at: "2025-01-01",
      advisory_templates: {
        type: "alignment_gap",
        title_template: "Low alignment: {goal_name}",
        body_template: "Goal '{goal_name}' has {score}% alignment",
        severity: "warning",
      },
    };

    const output = buildAdvisoryOutput(rule, "org-1", {
      goal_name: "Community Growth",
      score: 15,
    });

    expect(output.org_id).toBe("org-1");
    expect(output.template_id).toBe("tmpl-1");
    expect(output.rule_id).toBe("rule-1");
    expect(output.title).toBe("Low alignment: Community Growth");
    expect(output.body).toBe("Goal 'Community Growth' has 15% alignment");
    expect(output.severity).toBe("warning");
  });
});
