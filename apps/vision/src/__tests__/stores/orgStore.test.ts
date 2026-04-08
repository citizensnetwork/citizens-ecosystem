import { describe, it, expect, beforeEach } from "vitest";
import { useOrgStore } from "@/stores/orgStore";
import type { Organisation } from "@/types/db";

const mockOrg: Organisation = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "Test Org",
  slug: "test-org",
  description: "A test organisation",
  logo_url: null,
  created_by: "660e8400-e29b-41d4-a716-446655440000",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("orgStore", () => {
  beforeEach(() => {
    useOrgStore.getState().reset();
  });

  it("initialises with null values and empty array", () => {
    const state = useOrgStore.getState();
    expect(state.currentOrg).toBeNull();
    expect(state.currentRole).toBeNull();
    expect(state.userOrgs).toEqual([]);
  });

  it("sets current org", () => {
    useOrgStore.getState().setCurrentOrg(mockOrg);
    expect(useOrgStore.getState().currentOrg).toEqual(mockOrg);
  });

  it("sets user orgs", () => {
    useOrgStore.getState().setUserOrgs([mockOrg]);
    expect(useOrgStore.getState().userOrgs).toHaveLength(1);
  });

  it("resets to initial state", () => {
    useOrgStore.getState().setCurrentOrg(mockOrg);
    useOrgStore.getState().setUserOrgs([mockOrg]);
    useOrgStore.getState().reset();
    const state = useOrgStore.getState();
    expect(state.currentOrg).toBeNull();
    expect(state.userOrgs).toEqual([]);
  });
});
