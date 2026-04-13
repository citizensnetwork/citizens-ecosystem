import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { ExportPanel } from "@/components/dashboard/ExportPanel";

const VALID_ORG = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("ExportPanel", () => {
  it("renders export buttons", () => {
    render(<ExportPanel orgId={VALID_ORG} />);
    expect(screen.getByLabelText("Export activities as CSV")).toBeInTheDocument();
    expect(screen.getByLabelText("Export metrics as CSV")).toBeInTheDocument();
  });

  it("renders date inputs", () => {
    render(<ExportPanel orgId={VALID_ORG} />);
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("renders heading", () => {
    render(<ExportPanel orgId={VALID_ORG} />);
    expect(screen.getByText("Export Data")).toBeInTheDocument();
  });
});

import { ScheduledReports } from "@/components/dashboard/ScheduledReports";

describe("ScheduledReports", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reports: [] }),
    });
  });

  it("renders heading", () => {
    render(<ScheduledReports orgId={VALID_ORG} isAdmin={true} />);
    expect(screen.getByText("Scheduled Reports")).toBeInTheDocument();
  });

  it("shows create button for admins", () => {
    render(<ScheduledReports orgId={VALID_ORG} isAdmin={true} />);
    expect(screen.getByLabelText("Create scheduled report")).toBeInTheDocument();
  });

  it("hides create button for non-admins", () => {
    render(<ScheduledReports orgId={VALID_ORG} isAdmin={false} />);
    expect(screen.queryByLabelText("Create scheduled report")).not.toBeInTheDocument();
  });
});
