import { describe, it, expect } from "vitest";
import { createActivitySchema, updateActivitySchema } from "@/lib/schemas/activity";

describe("createActivitySchema", () => {
  const validInput = {
    title: "Community Outreach",
    type: "outreach",
    date: "2025-01-15",
    participant_count: 30,
    tags: ["education", "youth"],
  };

  it("validates a complete valid input", () => {
    const result = createActivitySchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("validates minimal required fields", () => {
    const result = createActivitySchema.safeParse({
      title: "Test",
      type: "event",
      date: "2025-06-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects title shorter than 2 chars", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      title: "A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title longer than 200 chars", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      title: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid activity type", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      type: "invalid_type",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid activity types", () => {
    const types = [
      "event",
      "meeting",
      "outreach",
      "workshop",
      "service",
      "training",
      "other",
    ];
    for (const type of types) {
      const result = createActivitySchema.safeParse({
        ...validInput,
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid date format", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      date: "15-01-2025",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid date format YYYY-MM-DD", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      date: "2025-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative participant count", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      participant_count: -1,
    });
    expect(result.success).toBe(false);
  });

  it("defaults participant_count to 0", () => {
    const result = createActivitySchema.safeParse({
      title: "Test",
      type: "event",
      date: "2025-01-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.participant_count).toBe(0);
    }
  });

  it("rejects latitude out of range", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      latitude: 91,
    });
    expect(result.success).toBe(false);
  });

  it("rejects longitude out of range", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      longitude: -181,
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid coordinates", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      latitude: -33.9249,
      longitude: 18.4241,
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 20 tags", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("defaults tags to empty array", () => {
    const result = createActivitySchema.safeParse({
      title: "Test",
      type: "event",
      date: "2025-01-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  it("accepts optional department_id as UUID", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      department_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID for department_id", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      department_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects description longer than 5000 chars", () => {
    const result = createActivitySchema.safeParse({
      ...validInput,
      description: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe("updateActivitySchema", () => {
  it("allows partial updates", () => {
    const result = updateActivitySchema.safeParse({ title: "Updated" });
    expect(result.success).toBe(true);
  });

  it("allows empty object", () => {
    const result = updateActivitySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates fields that are provided", () => {
    const result = updateActivitySchema.safeParse({ type: "invalid" });
    expect(result.success).toBe(false);
  });
});
