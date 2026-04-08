import { create } from "zustand";

interface FilterState {
  dateRange: {
    from: string | null;
    to: string | null;
  };
  departmentId: string | null;
  searchQuery: string;
  setDateRange: (from: string | null, to: string | null) => void;
  setDepartmentId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  dateRange: { from: null, to: null },
  departmentId: null,
  searchQuery: "",
  setDateRange: (from, to) => set({ dateRange: { from, to } }),
  setDepartmentId: (id) => set({ departmentId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  resetFilters: () =>
    set({
      dateRange: { from: null, to: null },
      departmentId: null,
      searchQuery: "",
    }),
}));
