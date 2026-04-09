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

// Phase 4: Alignment Metrics

export interface AlignmentScore {
  goal_id: string;
  score: number;
  linked_activities: number;
  weighted_sum: number;
  computed_at: string;
}

export interface OrgAlignment {
  org_id: string;
  alignment_score: number;
  active_goals: number;
  total_priority_weight: number;
  computed_at: string;
}

export interface GoalAlignmentBreakdown {
  goal_id: string;
  goal_title: string;
  vision_title: string | null;
  priority_weight: number;
  status: string;
  deadline: string | null;
  linked_activities: number;
  explicit_links: number;
  inferred_links: number;
  alignment_score: number;
}

export interface AlignmentMatrixEntry {
  goal_id: string;
  goal_title: string;
  department_id: string | null;
  department_name: string | null;
  activity_count: number;
}
