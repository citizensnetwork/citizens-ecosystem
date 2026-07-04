import { z } from "zod";
import { GOAL_STATUSES } from "@/lib/constants";

export const GOAL_LINK_TYPES = ["explicit", "inferred"] as const;

export const createVisionSchema = z.object({
  title: z.string().min(2).max(300),
  description: z.string().max(5000).optional(),
  active: z.boolean().default(true),
});

export const updateVisionSchema = createVisionSchema.partial();

export const createGoalSchema = z.object({
  title: z.string().min(2).max(300),
  description: z.string().max(5000).optional(),
  vision_id: z.string().uuid().optional(),
  target_value: z.number().min(0).optional(),
  target_unit: z.string().max(50).optional(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
  priority_weight: z.number().min(0.1).max(10).default(1.0),
  status: z.enum(GOAL_STATUSES).default("active"),
});

export const updateGoalSchema = createGoalSchema.partial();

export const createGoalLinkSchema = z.object({
  activity_id: z.string().uuid(),
  link_type: z.enum(GOAL_LINK_TYPES).default("explicit"),
  confidence: z.number().min(0).max(1).default(1.0),
});

export const updateGoalLinkSchema = z.object({
  approved: z.boolean(),
});

export type CreateVisionInput = z.infer<typeof createVisionSchema>;
export type UpdateVisionInput = z.infer<typeof updateVisionSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type CreateGoalLinkInput = z.infer<typeof createGoalLinkSchema>;
