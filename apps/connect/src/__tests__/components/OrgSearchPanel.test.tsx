/**
 * Tests for <OrgSearchPanel> — the Organisations-mode results panel that
 * wraps `/api/contributors/search`. We mock the network call so the test
 * focuses on UI behaviour: debounce-triggered fetches, kind filter
 * toggles, error and empty states, and the link target on each result
 * row.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import OrgSearchPanel from "@/components/contributor/OrgSearchPanel";

type Hit = {
  id: string;
  full_name: string | null;
  contributor_slug: string | null;
  contributor_kind: "ministry" | "organization" | "business" | null;
  logo_url: string | null;
  avatar_url: string | null;
  physical_address: string | null;
  bio: string | null;
  followers_count: number;
  similarity: number;
};

const SAMPLE: Hit = {
  id: "p-1",
  full_name: "Every Nation Mooikloof",
  contributor_slug: "every-nation",
  contributor_kind: "ministry",
  logo_url: null,
  avatar_url: null,
  physical_address: "Pretoria, GP",
  bio: null,
  followers_count: 42,
  similarity: 0.43,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: [SAMPLE] }),
  });
  // @ts-expect-error — install global fetch stub for the test
  global.fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: wait long enough for the 220ms debounce + microtask drain.
async function waitForFirstFetch() {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled(), {
    timeout: 1500,
  });
}

describe("<OrgSearchPanel>", () => {
  it("fetches after the debounce window and renders a result row linking to /c/{slug}", async () => {
    render(<OrgSearchPanel query="evry naton" />);
    await waitForFirstFetch();

    const call = fetchMock.mock.calls[0][0] as string;
    expect(call).toContain("/api/contributors/search?");
    expect(call).toContain("q=evry+naton");
    expect(call).toContain("limit=25");

    const link = await screen.findByRole(
      "listitem",
      {},
      { timeout: 1500 },
    );
    expect(link.getAttribute("href")).toBe("/c/every-nation");
    expect(screen.getByText(/Every Nation Mooikloof/)).toBeTruthy();
  });

  it("toggles a kind filter and re-fetches with kinds=ministry", async () => {
    render(<OrgSearchPanel query="" />);
    await waitForFirstFetch();
    const callsBefore = fetchMock.mock.calls.length;

    const ministryBtn = screen.getByRole("button", { name: /Ministry/ });
    await act(async () => {
      fireEvent.click(ministryBtn);
    });

    await waitFor(
      () => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore),
      { timeout: 1500 },
    );
    const lastCall = fetchMock.mock.calls.at(-1)![0] as string;
    expect(lastCall).toContain("kinds=ministry");
  });

  it("shows an empty-state message when the API returns zero rows", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    render(<OrgSearchPanel query="zzzzzz" />);

    await waitFor(
      () =>
        expect(
          screen.getByText(/No organisations match that search/i),
        ).toBeTruthy(),
      { timeout: 1500 },
    );
  });

  it("surfaces a friendly error when the API returns 429", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    render(<OrgSearchPanel query="x" />);

    await waitFor(
      () => expect(screen.getByText(/Slow down a moment/i)).toBeTruthy(),
      { timeout: 1500 },
    );
  });
});
