import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { PartnershipManager } from "@/components/dashboard/PartnershipManager";
import { CrossOrgDashboard } from "@/components/dashboard/CrossOrgDashboard";
import { CommunityView } from "@/components/dashboard/CommunityView";

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("PartnershipManager", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ partnerships: [] }),
    });
  });

  it("renders heading", () => {
    render(<PartnershipManager orgId={VALID_ORG} isAdmin={true} />);
    expect(screen.getByText("Partner Organisations")).toBeInTheDocument();
  });

  it("shows invite button for admins", () => {
    render(<PartnershipManager orgId={VALID_ORG} isAdmin={true} />);
    expect(
      screen.getByLabelText("Invite partner organisation")
    ).toBeInTheDocument();
  });

  it("hides invite button for non-admins", () => {
    render(<PartnershipManager orgId={VALID_ORG} isAdmin={false} />);
    expect(
      screen.queryByLabelText("Invite partner organisation")
    ).not.toBeInTheDocument();
  });
});

describe("CrossOrgDashboard", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        partner_count: 0,
        total_activities: 0,
        total_participants: 0,
        partners: [],
      }),
    });
  });

  it("renders without crashing", () => {
    render(<CrossOrgDashboard orgId={VALID_ORG} />);
    expect(
      screen.getByText("Loading cross-org metrics…")
    ).toBeInTheDocument();
  });
});

describe("CommunityView", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        partner_count: 0,
        total_activities: 0,
        total_participants: 0,
        partners: [],
      }),
    });
  });

  it("renders without crashing", () => {
    render(<CommunityView orgId={VALID_ORG} />);
    expect(screen.getByText("Loading community data…")).toBeInTheDocument();
  });
});
