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

// Field rules shared by the create and update schemas, so the two cannot drift.
const LATITUDE = z.number().min(-90).max(90);
const LONGITUDE = z.number().min(-180).max(180);
const LOCATION_NAME = z.string().max(300);
const PARTICIPANT_COUNT = z.number().int().min(0);
const TAGS = z.array(z.string().min(1).max(50)).max(20);

export const createActivitySchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  type: z.enum(ACTIVITY_TYPES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  latitude: LATITUDE.optional(),
  longitude: LONGITUDE.optional(),
  location_name: LOCATION_NAME.optional(),
  participant_count: PARTICIPANT_COUNT.default(0),
  department_id: z.string().uuid().optional(),
  tags: TAGS.default([]),
});

// PATCH body. Three rules that `createActivitySchema.partial()` did not give:
//  1. An omitted field means "leave it alone". Zod 4 still applies a `.default()`
//     inside `.partial()`, so a place-only PATCH used to reset participant_count
//     to 0 and (through `tags: []`) delete every tag. The defaults live on the
//     create schema only.
//  2. The place can be cleared: `null` (not an empty string) sets the column to
//     NULL. `latitude: null, longitude: null` takes the activity off the
//     Timeline Map and keeps its name; `location_name: null` forgets the name.
//  3. The position travels as a pair, both numbers or both null. A lone latitude
//     would pair a new latitude with the old longitude, a spot nobody chose.
export const updateActivitySchema = createActivitySchema
  .omit({
    latitude: true,
    longitude: true,
    location_name: true,
    participant_count: true,
    tags: true,
  })
  .partial()
  .extend({
    latitude: LATITUDE.nullable().optional(),
    longitude: LONGITUDE.nullable().optional(),
    location_name: LOCATION_NAME.nullable().optional(),
    participant_count: PARTICIPANT_COUNT.optional(),
    tags: TAGS.optional(),
  })
  .refine(
    (v) =>
      (v.latitude === undefined) === (v.longitude === undefined) &&
      (v.latitude === null) === (v.longitude === null),
    {
      message: "latitude and longitude must be sent together: both numbers, or both null",
      path: ["latitude"],
    }
  );

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
