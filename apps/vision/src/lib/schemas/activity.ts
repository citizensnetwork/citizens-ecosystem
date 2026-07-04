import { z } from "zod";

export const ACTIVITY_TYPES = [
  "event",
  "meeting",
  "outreach",
  "workshop",
  "service",
  "training",
  "other",
] as const;

export const createActivitySchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  type: z.enum(ACTIVITY_TYPES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location_name: z.string().max(300).optional(),
  participant_count: z.number().int().min(0).default(0),
  department_id: z.string().uuid().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
});

export const updateActivitySchema = createActivitySchema.partial();

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
