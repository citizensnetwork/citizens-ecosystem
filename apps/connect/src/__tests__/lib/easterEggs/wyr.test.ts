import { describe, it, expect } from "vitest";
import { sampleWyrBatch, WYR_POOL } from "@/lib/easterEggs/wyr";

describe("sampleWyrBatch", () => {
  it("returns the requested number of questions", () => {
    const batch = sampleWyrBatch({
      userId: "user-abc",
      answered: {},
      size: 3,
    });
    expect(batch).toHaveLength(3);
  });

  it("skips questions the user has already answered", () => {
    const answered = { crowd_size: "left" as const };
    const batch = sampleWyrBatch({
      userId: "user-abc",
      answered,
      size: 5,
    });
    expect(batch.find((q) => q.id === "crowd_size")).toBeUndefined();
  });

  it("is deterministic for the same user + seed", () => {
    const a = sampleWyrBatch({ userId: "u1", answered: {}, size: 4 });
    const b = sampleWyrBatch({ userId: "u1", answered: {}, size: 4 });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it("produces different samples for different users", () => {
    const a = sampleWyrBatch({ userId: "u1", answered: {}, size: 4 });
    const b = sampleWyrBatch({ userId: "u2", answered: {}, size: 4 });
    // Extremely unlikely to be identical given the hash scheme; if it ever
    // is, bump the user ids to something less colliding.
    expect(a.map((q) => q.id)).not.toEqual(b.map((q) => q.id));
  });

  it("clamps to the pool size when `size` exceeds available questions", () => {
    const allAnswered = Object.fromEntries(
      WYR_POOL.map((q) => [q.id, "left" as const])
    );
    const batch = sampleWyrBatch({
      userId: "u1",
      answered: allAnswered,
      size: 5,
    });
    expect(batch).toHaveLength(0);
  });
});
