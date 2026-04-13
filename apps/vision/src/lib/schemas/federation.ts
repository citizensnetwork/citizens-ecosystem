// Citizens Vision — Federation Schemas (Phase 11)

import { z } from "zod/v4";

export const createPartnershipSchema = z.object({
  org_a_id: z.uuid(),
  org_b_id: z.uuid(),
  sharing_level: z.enum(["none", "summary", "detailed"]).default("summary"),
});

export const updatePartnershipSchema = z.object({
  status: z.enum(["active", "rejected", "revoked"]).optional(),
  sharing_level: z.enum(["none", "summary", "detailed"]).optional(),
});

export const sharedMetricSchema = z.object({
  partnership_id: z.uuid(),
  metric_slug: z.string().min(1).max(100),
  visible: z.boolean().default(true),
});

export type CreatePartnershipInput = z.infer<typeof createPartnershipSchema>;
export type UpdatePartnershipInput = z.infer<typeof updatePartnershipSchema>;
export type SharedMetricInput = z.infer<typeof sharedMetricSchema>;
