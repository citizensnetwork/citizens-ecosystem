// Citizens Vision — Federation Types (Phase 11)

import type { OrgKPIs } from "./metrics";

export interface PartnerOrgSummary {
  org_id: string;
  org_name: string;
  org_slug: string;
  partnership_id: string;
  sharing_level: "none" | "summary" | "detailed";
  status: "pending" | "active" | "rejected" | "revoked";
  kpis: Partial<OrgKPIs> | null;
}

export interface CrossOrgMetrics {
  partner_count: number;
  total_activities: number;
  total_participants: number;
  partners: PartnerOrgSummary[];
}

export interface CommunityAggregate {
  region: string;
  org_count: number;
  total_activities: number;
  total_participants: number;
  avg_alignment_score: number;
  period: { from: string; to: string };
}
