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
