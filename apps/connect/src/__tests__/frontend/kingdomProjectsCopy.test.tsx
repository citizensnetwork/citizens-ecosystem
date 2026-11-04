/**
 * Kingdom Projects explains itself as "Suggest a need" (founder, 2026-11-04: the feature the website conversation
 * called "Suggest a Need" IS this one). What the screen says has to be what the database does, so the explainer's
 * claims are checked against migration 132 as well as rendered.
 */
import React from "react";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const load = (file: string) => new Function("window", "React", "document", read("src/frontend/app/" + file))(window, React, document);
const h = React.createElement;

type Props = Record<string, unknown> & { children?: React.ReactNode };
const submitIdea = vi.fn();
let Page: React.ComponentType;

function app(ideas: unknown[] = []) {
  (window as unknown as Record<string, unknown>).useApp = () => ({
    ideas,
    submitIdea,
    toggleIdeaVote: vi.fn(),
    confirmIdea: vi.fn(),
    scheduleKingdomProject: vi.fn(),
    realUser: null,
    isAdmin: false,
    go: vi.fn(),
  });
}

beforeAll(() => {
  const w = window as unknown as Record<string, unknown>;
  w.Icon = ({ name }: { name: string }) => h("svg", { "data-icon": name });
  w.AccountButton = () => null;
  w.DATA = { getCategory: () => null, EVENT_CATEGORIES: [{ id: "service", short: "Service", hex: "#000000", icon: "Heart" }] };
  w.UI = {
    cx: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
    Avatar: () => null,
    Button: ({ children, onClick, disabled }: Props) => h("button", { onClick, disabled }, children),
    Field: ({ label, children }: Props) => h("label", null, h("span", null, label as string), children),
    Input: (p: Props) => h("input", p),
    Textarea: (p: Props) => h("textarea", p),
    Toggle: () => null,
    Segmented: ({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) =>
      h("div", null, options.map((o) => h("button", { key: o.value, "aria-pressed": o.value === value, onClick: () => onChange(o.value) }, o.label))),
    MediaPicker: () => null,
    Empty: ({ title, sub }: { title: string; sub?: string }) => h("div", null, h("p", null, title), sub ? h("p", null, sub) : null),
    inputCls: "",
  };
  load("pages.jsx");
  Page = w.CommunityPage as React.ComponentType;
});

afterEach(() => {
  cleanup();
  submitIdea.mockClear();
});

const explainer = (container: HTMLElement) => container.querySelector("[data-kp-explainer]");

describe("the Kingdom Projects screen speaks of a need", () => {
  it("keeps its proper name and offers to suggest a need (not to 'post an idea')", () => {
    app();
    render(h(Page));
    expect(screen.getByRole("heading", { name: "Kingdom Projects" })).toBeTruthy();
    expect(screen.getByText("Suggest a need. Rally people. Launch it together.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Suggest a need" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /post idea/i })).toBeNull();
  });

  it("explains how a need becomes a Kingdom Project, on the voting tab only", () => {
    app();
    const { container } = render(h(Page));
    const text = explainer(container)?.textContent ?? "";
    expect(text).toContain("See a need in your community? Suggest it and let others rally around it.");
    expect(text).toContain("People vote to collaborate until the goal is reached. Larger ideas are reviewed by an admin first.");
    expect(text).toContain("It becomes a Kingdom Project and everyone who voted is told. Whoever suggested it leads it");
    expect(text).toContain("the voters are connected");
    expect(text).toContain("Voting polls also appear on the Discover map.");

    fireEvent.click(screen.getByRole("button", { name: "In Process" }));
    expect(explainer(container)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmed" }));
    expect(explainer(container)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voting Now" }));
    expect(explainer(container)).not.toBeNull();
  });

  it("invites the first need when the board is empty", () => {
    app();
    render(h(Page));
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    expect(screen.getByText("Be the first — suggest a need in your community.")).toBeTruthy();
  });

  it("opens a composer that asks for the need, and sends it only once there is a title and a description", () => {
    app();
    render(h(Page));
    fireEvent.click(screen.getByRole("button", { name: "Suggest a need" }));
    const send = screen.getByRole("button", { name: "Suggest this need" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("What should we build together?"), { target: { value: "A clean-up of the park" } });
    fireEvent.change(screen.getByPlaceholderText("Describe the need, the vision, and what collaboration looks like…"), {
      target: { value: "The park behind the clinic is full of litter and people avoid it." },
    });
    expect((screen.getByRole("button", { name: "Suggest this need" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Suggest this need" }));
    expect(submitIdea).toHaveBeenCalledTimes(1);
    expect(submitIdea.mock.calls[0]?.[0]).toMatchObject({
      title: "A clean-up of the park",
      description: "The park behind the clinic is full of litter and people avoid it.",
      tier: "community",
    });
  });
});

describe("what the explainer says is what the database does", () => {
  const migration = read("../../supabase/migrations/132_kingdom_projects_flow.sql");
  const voting = read("../../supabase/migrations/130_kingdom_projects_voting.sql");

  it("makes whoever suggested the idea its project lead, and lets only the lead schedule the kickoff", () => {
    expect(migration).toContain("project_lead_id = coalesce(project_lead_id, v_idea.user_id)");
    expect(migration).toContain("only the project lead can schedule this project");
  });

  it("tells the voters when the goal is reached and connects them when the lead picks a real date", () => {
    expect(migration).toContain("moves the idea");
    expect(migration).toContain("voters auto-RSVP'd");
    expect(migration).toContain("manual review");
  });

  it("has the tiers the hub's explanation quotes (a small volunteer group up to 20 votes, a provincial vision of 10,000)", () => {
    const source = read("src/frontend/app/pages.jsx");
    expect(source).toContain("{ id: 'small_volunteer', label: 'Small Volunteer', min: 1, max: 20 }");
    expect(source).toContain("{ id: 'provincial_vision', label: 'Provincial Vision', min: 10000, max: 10000, fixed: true }");
    expect(voting).toContain("'small_volunteer'");
    expect(voting).toContain("'provincial_vision'");
  });

  it("says 'need' in the toasts too, and nowhere says 'Post Idea' any more", () => {
    const pages = read("src/frontend/app/pages.jsx");
    const store = read("src/frontend/app/store.jsx");
    expect(pages).not.toMatch(/Post Idea|Post an Impact Idea/);
    expect(store).toContain("toast('Need suggested! 💡', 'green');");
    expect(store).toContain("toast('Need added to the board (demo) — sign in to make it real.', 'gold');");
  });
});
