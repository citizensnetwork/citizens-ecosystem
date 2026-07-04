import { z } from "zod/v4";

// ============================================================
// Comparison
// ============================================================

export const comparisonQuerySchema = z.object({
  org_id: z.uuid(),
  period_a_from: z.string().date(),
  period_a_to: z.string().date(),
  period_b_from: z.string().date(),
  period_b_to: z.string().date(),
  department_id: z.uuid().optional(),
});

// ============================================================
// Export
// ============================================================

export const exportRequestSchema = z.object({
  org_id: z.uuid(),
  export_type: z.enum(["csv", "pdf", "png"]),
  resource: z.enum(["activities", "metrics", "map", "report"]),
  filters: z.record(z.string(), z.unknown()).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});

// ============================================================
// Scheduled Reports
// ============================================================

export const createScheduledReportSchema = z.object({
  org_id: z.uuid(),
  name: z.string().min(1).max(200),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  recipients: z.array(z.email()).min(1).max(20),
  report_config: z.record(z.string(), z.unknown()).optional(),
});

export const updateScheduledReportSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  recipients: z.array(z.email()).min(1).max(20).optional(),
  report_config: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
});
