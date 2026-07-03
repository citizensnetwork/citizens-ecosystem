import { z } from "zod";
import { PROJECT_STATUSES } from "@/lib/constants";

export const createProjectSchema = z.object({
  name: z.string().min(2).max(300),
  description: z.string().max(5000).optional(),
  department_id: z.string().uuid().optional(),
  status: z.enum(PROJECT_STATUSES).default("planning"),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export const createMilestoneSchema = z.object({
  title: z.string().min(2).max(300),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
  sort_order: z.number().int().min(0).default(0),
});

export const updateMilestoneSchema = z.object({
  title: z.string().min(2).max(300).optional(),
  target_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .nullable()
    .optional(),
  completed_at: z.string().datetime().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const linkProjectActivitySchema = z.object({
  activity_id: z.string().uuid(),
});

export const linkProjectGoalSchema = z.object({
  goal_id: z.string().uuid(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
