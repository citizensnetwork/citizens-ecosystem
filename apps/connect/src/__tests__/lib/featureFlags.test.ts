import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("featureFlags", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_BETA_AI_SEARCH;
    delete process.env.NEXT_PUBLIC_BETA_EASTER_EGGS;
    delete process.env.NEXT_PUBLIC_BETA_LIVE_LOCATION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function loadFresh() {
    const mod = await import("@/lib/featureFlags");
    return mod as typeof import("@/lib/featureFlags");
  }

  it("defaults all flags to false", async () => {
    const { FEATURE_FLAGS } = await loadFresh();
    expect(FEATURE_FLAGS.BETA_AI_SEARCH).toBe(false);
    expect(FEATURE_FLAGS.BETA_EASTER_EGGS).toBe(false);
    expect(FEATURE_FLAGS.BETA_LIVE_LOCATION).toBe(false);
  });

  it("parses truthy values", async () => {
    process.env.NEXT_PUBLIC_BETA_AI_SEARCH = "1";
    process.env.NEXT_PUBLIC_BETA_EASTER_EGGS = "true";
    process.env.NEXT_PUBLIC_BETA_LIVE_LOCATION = "ON";
    const { FEATURE_FLAGS } = await loadFresh();
    expect(FEATURE_FLAGS.BETA_AI_SEARCH).toBe(true);
    expect(FEATURE_FLAGS.BETA_EASTER_EGGS).toBe(true);
    expect(FEATURE_FLAGS.BETA_LIVE_LOCATION).toBe(true);
  });

  it("parses falsy values", async () => {
    process.env.NEXT_PUBLIC_BETA_AI_SEARCH = "0";
    process.env.NEXT_PUBLIC_BETA_EASTER_EGGS = "false";
    process.env.NEXT_PUBLIC_BETA_LIVE_LOCATION = "off";
    const { FEATURE_FLAGS } = await loadFresh();
    expect(FEATURE_FLAGS.BETA_AI_SEARCH).toBe(false);
    expect(FEATURE_FLAGS.BETA_EASTER_EGGS).toBe(false);
    expect(FEATURE_FLAGS.BETA_LIVE_LOCATION).toBe(false);
  });

  it("isFeatureEnabled reflects FEATURE_FLAGS", async () => {
    process.env.NEXT_PUBLIC_BETA_AI_SEARCH = "yes";
    const { isFeatureEnabled } = await loadFresh();
    expect(isFeatureEnabled("BETA_AI_SEARCH")).toBe(true);
    expect(isFeatureEnabled("BETA_EASTER_EGGS")).toBe(false);
  });
});
