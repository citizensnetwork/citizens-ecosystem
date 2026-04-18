import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Phase 21: cache-tag wiring calls revalidateTag from next/cache after
// successful mutations. Outside a Next request context revalidateTag
// throws ("static generation store missing"). Stub it to a no-op in
// tests so route handlers can run without a Next runtime.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));
