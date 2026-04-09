// Citizens Vision — Metrics Types

export interface OrgKPIs {
  total_activities: number;
  participants_reached: number;
  active_departments: number;
  activity_growth_pct: number;
  previous_period_count: number;
  period_days: number;
  date_from: string;
  date_to: string;
}

export interface TrendDataPoint {
  date: string;
  count: number;
  participants: number;
}

export interface DepartmentMetric {
  department_id: string;
  department_name: string;
  activity_count: number;
  participant_reach: number;
  type_diversity: number;
  rank_by_volume: number;
}

export interface TypeDistribution {
  type: string;
  count: number;
  label: string;
}

export interface MetricDefinition {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  computation_type: string;
  description: string | null;
  created_at: string;
}
