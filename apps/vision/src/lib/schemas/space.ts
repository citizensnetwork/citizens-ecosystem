import { z } from "zod";

// vision.spaces (migration 147). Shapes mirror the DB columns so the API is a
// thin RLS-gated pass-through, consistent with the activity schema.
export const createSpaceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // Hex or CSS colour token (e.g. '#4a90d9' or 'var(--gold-600)').
  colour: z.string().max(64).optional(),
  icon: z.string().max(64).optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
});

export const updateSpaceSchema = createSpaceSchema.partial();

// One category → space assignment (single-select). space_id null clears it.
// Routed to the SECDEF vision.set_category_space(org, category, space) writer
// (migration 151) so any org_admin — not only the Connect link owner — can map.
export const setMappingSchema = z.object({
  category_id: z.string().uuid(),
  space_id: z.string().uuid().nullable(),
});

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;
export type SetMappingInput = z.infer<typeof setMappingSchema>;
