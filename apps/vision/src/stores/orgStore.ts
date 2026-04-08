import { create } from "zustand";
import type { Organisation, UserOrgRole } from "@/types/db";

interface OrgState {
  currentOrg: Organisation | null;
  currentRole: UserOrgRole | null;
  userOrgs: Organisation[];
  setCurrentOrg: (org: Organisation | null) => void;
  setCurrentRole: (role: UserOrgRole | null) => void;
  setUserOrgs: (orgs: Organisation[]) => void;
  reset: () => void;
}

export const useOrgStore = create<OrgState>((set) => ({
  currentOrg: null,
  currentRole: null,
  userOrgs: [],
  setCurrentOrg: (org) => set({ currentOrg: org }),
  setCurrentRole: (role) => set({ currentRole: role }),
  setUserOrgs: (orgs) => set({ userOrgs: orgs }),
  reset: () =>
    set({ currentOrg: null, currentRole: null, userOrgs: [] }),
}));
