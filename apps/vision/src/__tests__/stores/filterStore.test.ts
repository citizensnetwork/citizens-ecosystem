import { describe, it, expect, beforeEach } from "vitest";
import { useFilterStore } from "@/stores/filterStore";

describe("filterStore", () => {
  beforeEach(() => {
    useFilterStore.getState().resetFilters();
  });

  it("initialises with default values", () => {
    const state = useFilterStore.getState();
    expect(state.dateRange).toEqual({ from: null, to: null });
    expect(state.departmentId).toBeNull();
    expect(state.searchQuery).toBe("");
  });

  it("sets date range", () => {
    useFilterStore.getState().setDateRange("2024-01-01", "2024-12-31");
    const { dateRange } = useFilterStore.getState();
    expect(dateRange.from).toBe("2024-01-01");
    expect(dateRange.to).toBe("2024-12-31");
  });

  it("sets department ID", () => {
    useFilterStore.getState().setDepartmentId("dept-123");
    expect(useFilterStore.getState().departmentId).toBe("dept-123");
  });

  it("sets search query", () => {
    useFilterStore.getState().setSearchQuery("planning");
    expect(useFilterStore.getState().searchQuery).toBe("planning");
  });

  it("resets all filters", () => {
    useFilterStore.getState().setDateRange("2024-01-01", "2024-12-31");
    useFilterStore.getState().setDepartmentId("dept-123");
    useFilterStore.getState().setSearchQuery("test");
    useFilterStore.getState().resetFilters();
    const state = useFilterStore.getState();
    expect(state.dateRange).toEqual({ from: null, to: null });
    expect(state.departmentId).toBeNull();
    expect(state.searchQuery).toBe("");
  });
});
