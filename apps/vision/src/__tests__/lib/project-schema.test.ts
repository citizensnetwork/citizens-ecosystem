import { describe, it, expect } from "vitest";
import {
  createProjectSchema,
  updateProjectSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  linkProjectActivitySchema,
  linkProjectGoalSchema,
} from "@/lib/schemas/project";

describe("createProjectSchema", () => {
  it("validates a complete valid input", () => {
    const result = createProjectSchema.safeParse({
      name: "Community Wellness Initiative",
      description: "Improve community health outcomes.",
      department_id: "550e8400-e29b-41d4-a716-446655440000",
      status: "planning",
      start_date: "2026-05-01",
      end_date: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("validates minimal required fields", () => {
    const result = createProjectSchema.safeParse({ name: "AB" });
    expect(result.success).toBe(true);
  });

  it("rejects name shorter than 2 chars", () => {
    const result = createProjectSchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 300 chars", () => {
    const result = createProjectSchema.safeParse({ name: "x".repeat(301) });
    expect(result.success).toBe(false);
  });

  it("rejects description longer than 5000 chars", () => {
    const result = createProjectSchema.safeParse({
      name: "Valid",
      description: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it("defaults status to planning", () => {
    const result = createProjectSchema.safeParse({ name: "Valid Project" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("planning");
    }
  });

  it("accepts all valid statuses", () => {
    for (const status of ["planning", "active", "completed", "archived"]) {
      const result = createProjectSchema.safeParse({ name: "Test", status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = createProjectSchema.safeParse({
      name: "Test",
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = createProjectSchema.safeParse({
      name: "Test",
      start_date: "2026/05/01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for department_id", () => {
    const result = createProjectSchema.safeParse({
      name: "Test",
      department_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("allows partial updates", () => {
    const result = updateProjectSchema.safeParse({ status: "active" });
    expect(result.success).toBe(true);
  });

  it("allows empty update", () => {
    const result = updateProjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("validates name constraints on partial update", () => {
    const result = updateProjectSchema.safeParse({ name: "A" });
    expect(result.success).toBe(false);
  });
});

describe("createMilestoneSchema", () => {
  it("validates a complete valid input", () => {
    const result = createMilestoneSchema.safeParse({
      title: "Phase 1 Complete",
      target_date: "2026-06-15",
      sort_order: 1,
    });
    expect(result.success).toBe(true);
  });

  it("validates minimal required fields", () => {
    const result = createMilestoneSchema.safeParse({ title: "AB" });
    expect(result.success).toBe(true);
  });

  it("defaults sort_order to 0", () => {
    const result = createMilestoneSchema.safeParse({ title: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_order).toBe(0);
    }
  });

  it("rejects title shorter than 2 chars", () => {
    const result = createMilestoneSchema.safeParse({ title: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects negative sort_order", () => {
    const result = createMilestoneSchema.safeParse({
      title: "Test",
      sort_order: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateMilestoneSchema", () => {
  it("allows setting completed_at timestamp", () => {
    const result = updateMilestoneSchema.safeParse({
      completed_at: "2026-06-15T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("allows clearing completed_at", () => {
    const result = updateMilestoneSchema.safeParse({
      completed_at: null,
    });
    expect(result.success).toBe(true);
  });

  it("allows partial title update", () => {
    const result = updateMilestoneSchema.safeParse({
      title: "Updated Title",
    });
    expect(result.success).toBe(true);
  });
});

describe("linkProjectActivitySchema", () => {
  it("validates valid UUID", () => {
    const result = linkProjectActivitySchema.safeParse({
      activity_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = linkProjectActivitySchema.safeParse({
      activity_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing activity_id", () => {
    const result = linkProjectActivitySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("linkProjectGoalSchema", () => {
  it("validates valid UUID", () => {
    const result = linkProjectGoalSchema.safeParse({
      goal_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = linkProjectGoalSchema.safeParse({
      goal_id: "not-valid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing goal_id", () => {
    const result = linkProjectGoalSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
