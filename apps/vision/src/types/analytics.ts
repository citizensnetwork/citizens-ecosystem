// Analytics & Export types (Phase 10)

export interface ComparisonPeriod {
  label: string;
  date_from: string;
  date_to: string;
}

export interface ComparisonResult {
  period_a: ComparisonPeriod;
  period_b: ComparisonPeriod;
  metrics: ComparisonMetrics;
}

export interface ComparisonMetrics {
  total_activities: { a: number; b: number; change_pct: number };
  participants_reached: { a: number; b: number; change_pct: number };
  active_departments: { a: number; b: number; change_pct: number };
  department_breakdown: ComparisonDepartment[];
  type_breakdown: ComparisonType[];
}

export interface ComparisonDepartment {
  department_id: string;
  department_name: string;
  count_a: number;
  count_b: number;
  change_pct: number;
}

export interface ComparisonType {
  type: string;
  label: string;
  count_a: number;
  count_b: number;
  change_pct: number;
}

export interface TrendRegression {
  slope: number;
  intercept: number;
  r_squared: number;
  data_points: number;
  trend_line: { date: string; value: number }[];
  moving_average: { date: string; value: number }[];
}

export interface ExportLog {
  id: string;
  org_id: string;
  export_type: "csv" | "pdf" | "png";
  resource: string;
  filters: Record<string, unknown>;
  row_count: number;
  created_by: string;
  created_at: string;
}

export type ReportFrequency = "daily" | "weekly" | "monthly";

export interface ScheduledReport {
  id: string;
  org_id: string;
  name: string;
  frequency: ReportFrequency;
  recipients: string[];
  report_config: Record<string, unknown>;
  active: boolean;
  last_sent_at: string | null;
  next_run_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
