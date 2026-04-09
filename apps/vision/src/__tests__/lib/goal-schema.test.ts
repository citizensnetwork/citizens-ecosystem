import { describe, it, expect } from "vitest";
import {
  createVisionSchema,
  updateVisionSchema,
  createGoalSchema,
  updateGoalSchema,
  createGoalLinkSchema,
  updateGoalLinkSchema,
} from "@/lib/schemas/goal";

describe("createVisionSchema", () => {
  it("validates a complete valid input", () => {
    const result = createVisionSchema.safeParse({
      title: "Serve every community in Pretoria",
      description: "Our vision is to reach all 100+ wards.",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("validates minimal required fields", () => {
    const result = createVisionSchema.safeParse({ title: "AB" });
    expect(result.success).toBe(true);
  });

  it("rejects title shorter than 2 chars", () => {
    const result = createVisionSchema.safeParse({ title: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects title longer than 300 chars", () => {
    const result = createVisionSchema.safeParse({ title: "x".repeat(301) });
    expect(result.success).toBe(false);
  });

  it("rejects description longer than 5000 chars", () => {
    const result = createVisionSchema.safeParse({
      title: "Valid",
      description: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it("defaults active to true", () => {
    const result = createVisionSchema.safeParse({ title: "Valid" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.active).toBe(true);
    }
  });
});

describe("updateVisionSchema", () => {
  it("allows partial updates", () => {
    const result = updateVisionSchema.safeParse({ active: false });
    expect(result.success).toBe(true);
  });

  it("allows empty update", () => {
    const result = updateVisionSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("createGoalSchema", () => {
  const validInput = {
    title: "Increase outreach by 50%",
    description: "Grow from 10 to 15 events per month",
    target_value: 15,
    target_unit: "events",
    deadline: "2026-12-31",
    priority_weight: 2.0,
    status: "active" as const,
  };

  it("validates a complete valid input", () => {
    const result = createGoalSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("validates minimal required fields", () => {
    const result = createGoalSchema.safeParse({ title: "AB" });
    expect(result.success).toBe(true);
  });

  it("rejects title shorter than 2 chars", () => {
    const result = createGoalSchema.safeParse({ ...validInput, title: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = createGoalSchema.safeParse({
      ...validInput,
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative target_value", () => {
    const result = createGoalSchema.safeParse({
      ...validInput,
      target_value: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects priority_weight > 10", () => {
    const result = createGoalSchema.safeParse({
      ...validInput,
      priority_weight: 11,
    });
    expect(result.success).toBe(false);
  });

  it("rejects priority_weight < 0.1", () => {
    const result = createGoalSchema.safeParse({
      ...validInput,
      priority_weight: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = createGoalSchema.safeParse({
      ...validInput,
      deadline: "31-12-2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid vision_id", () => {
    const result = createGoalSchema.safeParse({
      ...validInput,
      vision_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("defaults priority_weight to 1.0", () => {
    const result = createGoalSchema.safeParse({ title: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority_weight).toBe(1.0);
    }
  });

  it("defaults status to active", () => {
    const result = createGoalSchema.safeParse({ title: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });
});

describe("updateGoalSchema", () => {
  it("allows partial updates", () => {
    const result = updateGoalSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(true);
  });

  it("allows empty update", () => {
    const result = updateGoalSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("createGoalLinkSchema", () => {
  it("validates a complete valid input", () => {
    const result = createGoalLinkSchema.safeParse({
      activity_id: "550e8400-e29b-41d4-a716-446655440000",
      link_type: "explicit",
      confidence: 1.0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid activity_id", () => {
    const result = createGoalLinkSchema.safeParse({
      activity_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid link_type", () => {
    const result = createGoalLinkSchema.safeParse({
      activity_id: "550e8400-e29b-41d4-a716-446655440000",
      link_type: "manual",
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence > 1", () => {
    const result = createGoalLinkSchema.safeParse({
      activity_id: "550e8400-e29b-41d4-a716-446655440000",
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence < 0", () => {
    const result = createGoalLinkSchema.safeParse({
      activity_id: "550e8400-e29b-41d4-a716-446655440000",
      confidence: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("defaults link_type to explicit", () => {
    const result = createGoalLinkSchema.safeParse({
      activity_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.link_type).toBe("explicit");
    }
  });

  it("defaults confidence to 1.0", () => {
    const result = createGoalLinkSchema.safeParse({
      activity_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.confidence).toBe(1.0);
    }
  });
});

describe("updateGoalLinkSchema", () => {
  it("validates approved: true", () => {
    const result = updateGoalLinkSchema.safeParse({ approved: true });
    expect(result.success).toBe(true);
  });

  it("validates approved: false", () => {
    const result = updateGoalLinkSchema.safeParse({ approved: false });
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean approved", () => {
    const result = updateGoalLinkSchema.safeParse({ approved: "yes" });
    expect(result.success).toBe(false);
  });
});
