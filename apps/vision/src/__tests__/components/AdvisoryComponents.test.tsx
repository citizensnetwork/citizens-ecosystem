import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdvisoryCard } from "@/components/advisory/AdvisoryCard";
import type { AdvisoryOutput } from "@/types/db";

const baseAdvisory: AdvisoryOutput = {
  id: "adv-1",
  org_id: "org-1",
  template_id: "tmpl-1",
  rule_id: "rule-1",
  title: "Low goal alignment",
  body: "Goal 'Community Growth' has only 15% alignment.",
  severity: "warning",
  data: { goal_name: "Community Growth", score: 15 },
  dismissed: false,
  dismissed_at: null,
  dismissed_notes: null,
  created_at: "2025-03-15T10:00:00Z",
};

describe("AdvisoryCard", () => {
  it("renders title and body", () => {
    render(<AdvisoryCard advisory={baseAdvisory} />);
    expect(screen.getByText("Low goal alignment")).toBeInTheDocument();
    expect(screen.getByText("Goal 'Community Growth' has only 15% alignment.")).toBeInTheDocument();
  });

  it("shows severity badge", () => {
    render(<AdvisoryCard advisory={baseAdvisory} />);
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("shows dismiss button when handler provided", () => {
    const onDismiss = vi.fn();
    render(<AdvisoryCard advisory={baseAdvisory} onDismiss={onDismiss} />);
    const btn = screen.getByText("Dismiss");
    fireEvent.click(btn);
    expect(onDismiss).toHaveBeenCalledWith("adv-1");
  });

  it("shows Dismissed text for dismissed advisories", () => {
    const dismissed = { ...baseAdvisory, dismissed: true };
    render(<AdvisoryCard advisory={dismissed} />);
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
    expect(screen.queryByText("Dismiss")).not.toBeInTheDocument();
  });

  it("renders critical severity badge", () => {
    const critical = { ...baseAdvisory, severity: "critical" as const };
    render(<AdvisoryCard advisory={critical} />);
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("renders info severity badge", () => {
    const info = { ...baseAdvisory, severity: "info" as const };
    render(<AdvisoryCard advisory={info} />);
    expect(screen.getByText("info")).toBeInTheDocument();
  });
});

// -- AdvisoryFeed --
import { AdvisoryFeed } from "@/components/advisory/AdvisoryFeed";

describe("AdvisoryFeed", () => {
  it("renders summary cards with counts", () => {
    render(
      <AdvisoryFeed
        initialAdvisories={[baseAdvisory]}
        orgId="org-1"
        orgSlug="test-org"
        total={1}
        page={1}
        perPage={20}
        summary={{ info: 2, warning: 3, critical: 1 }}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders advisory list", () => {
    render(
      <AdvisoryFeed
        initialAdvisories={[baseAdvisory]}
        orgId="org-1"
        orgSlug="test-org"
        total={1}
        page={1}
        perPage={20}
        summary={{ info: 0, warning: 1, critical: 0 }}
      />
    );
    expect(screen.getByText("Low goal alignment")).toBeInTheDocument();
  });

  it("shows empty state with no advisories", () => {
    render(
      <AdvisoryFeed
        initialAdvisories={[]}
        orgId="org-1"
        orgSlug="test-org"
        total={0}
        page={1}
        perPage={20}
        summary={{ info: 0, warning: 0, critical: 0 }}
      />
    );
    expect(screen.getByText("No active advisories")).toBeInTheDocument();
  });

  it("shows All clear when summary is zero", () => {
    render(
      <AdvisoryFeed
        initialAdvisories={[]}
        orgId="org-1"
        orgSlug="test-org"
        total={0}
        page={1}
        perPage={20}
        summary={{ info: 0, warning: 0, critical: 0 }}
      />
    );
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
  });
});
