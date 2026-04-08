// Citizens Vision — Database Types

export type OrgRole =
  | "platform_admin"
  | "org_admin"
  | "org_manager"
  | "org_member"
  | "org_viewer";

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
