// Citizens Vision — Database Types

export type OrgRole =
  | "platform_admin"
  | "org_admin"
  | "org_manager"
  | "org_member"
  | "org_viewer";

export type ActivityType =
  | "event"
  | "meeting"
  | "outreach"
  | "workshop"
  | "service"
  | "training"
  | "other";

export type ActivitySourceType =
  | "manual"
  | "citizens_connect"
  | "bulk_import"
  | "api";

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  org_id: string;
  parent_department_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
}

export interface UserOrgRole {
  id: string;
  user_id: string;
  org_id: string;
  role: OrgRole;
  department_id: string | null;
  created_at: string;
}

export interface UserOrgRoleWithOrg extends UserOrgRole {
  organisations: Organisation;
}

export interface Activity {
  id: string;
  org_id: string;
  department_id: string | null;
  title: string;
  description: string | null;
  type: ActivityType;
  date: string;
  start_time: string | null;
  end_time: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  participant_count: number;
  source_type: ActivitySourceType;
  source_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityTag {
  activity_id: string;
  tag: string;
}

export interface ActivityWithTags extends Activity {
  activity_tags: ActivityTag[];
}

// Phase 4: Goals & Alignment

export type GoalStatus = "draft" | "active" | "completed" | "archived";
export type GoalLinkType = "explicit" | "inferred";

export interface VisionStatement {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  org_id: string;
  vision_id: string | null;
  title: string;
  description: string | null;
  target_value: number | null;
  target_unit: string | null;
  deadline: string | null;
  priority_weight: number;
  status: GoalStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GoalWithVision extends Goal {
  vision_statements: Pick<VisionStatement, "title"> | null;
}

export interface GoalActivityLink {
  id: string;
  goal_id: string;
  activity_id: string;
  link_type: GoalLinkType;
  confidence: number;
  approved: boolean | null;
  created_at: string;
}

export interface GoalActivityLinkWithActivity extends GoalActivityLink {
  activities: Pick<Activity, "id" | "title" | "type" | "date">;
}

// Phase 5: Projects & Milestones

export type ProjectStatus = "planning" | "active" | "completed" | "archived";

export interface Project {
  id: string;
  org_id: string;
  department_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithDepartment extends Project {
  departments: Pick<Department, "name"> | null;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  target_date: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProjectGoalLink {
  project_id: string;
  goal_id: string;
  created_at: string;
}

export interface ProjectActivity {
  project_id: string;
  activity_id: string;
  created_at: string;
}

export interface ProjectGoalLinkWithGoal extends ProjectGoalLink {
  goals: Pick<Goal, "id" | "title" | "status">;
}

export interface ProjectActivityWithActivity extends ProjectActivity {
  activities: Pick<Activity, "id" | "title" | "type" | "date">;
}
