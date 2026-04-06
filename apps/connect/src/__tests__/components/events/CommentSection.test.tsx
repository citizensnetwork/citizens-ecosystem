import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CommentSection from "@/components/events/CommentSection";
import { makeComment } from "../../helpers/fixtures";
import type { User } from "@supabase/supabase-js";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDeleteEq = vi.fn().mockResolvedValue({ error: null });
const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq });

const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === "comments") {
    return {
      select: mockSelect,
      insert: mockInsert,
      delete: mockDelete,
    };
  }
  return {};
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const testUser: User = {
  id: "user-123",
  email: "test@example.com",
  user_metadata: { full_name: "Test User" },
  app_metadata: {},
  aud: "authenticated",
  created_at: "2025-01-01T00:00:00Z",
} as User;

const sampleComments = [
  makeComment({
    id: "c1",
    body: "Great event!",
    user_id: "user-123",
    profiles: { full_name: "Test User" },
  }),
  makeComment({
    id: "c2",
    body: "Looking forward to it!",
    user_id: "other-user",
    profiles: { full_name: "Jane" },
  }),
];

function setupFetchComments(comments = sampleComments) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: comments }),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

describe("CommentSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    // Don't resolve the fetch
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnValue(new Promise(() => {})),
    };
    mockSelect.mockReturnValue(chain);

    render(<CommentSection eventId="event-1" user={null} />);
    expect(screen.getByText("Loading comments…")).toBeInTheDocument();
  });

  it("shows empty state when no comments", async () => {
    setupFetchComments([]);

    render(<CommentSection eventId="event-1" user={null} />);

    await waitFor(() => {
      expect(
        screen.getByText("No comments yet. Be the first to say something!")
      ).toBeInTheDocument();
    });
  });

  it("renders comments with author names and bodies", async () => {
    setupFetchComments();

    render(<CommentSection eventId="event-1" user={null} />);

    await waitFor(() => {
      expect(screen.getByText("Great event!")).toBeInTheDocument();
      expect(screen.getByText("Looking forward to it!")).toBeInTheDocument();
      expect(screen.getByText("Test User")).toBeInTheDocument();
      expect(screen.getByText("Jane")).toBeInTheDocument();
    });
  });

  it("shows comment count after loading", async () => {
    setupFetchComments();

    render(<CommentSection eventId="event-1" user={null} />);

    await waitFor(() => {
      expect(screen.getByText("(2)")).toBeInTheDocument();
    });
  });

  it("shows login prompt when user is not authenticated", async () => {
    setupFetchComments([]);

    render(<CommentSection eventId="event-1" user={null} />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /log in/i });
      expect(link).toHaveAttribute("href", "/login");
    });
  });

  it("shows comment form when user is authenticated", async () => {
    setupFetchComments([]);

    render(<CommentSection eventId="event-1" user={testUser} />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Add a comment…")
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /post/i })).toBeInTheDocument();
    });
  });

  it("disables Post button when textarea is empty", async () => {
    setupFetchComments([]);

    render(<CommentSection eventId="event-1" user={testUser} />);

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /post/i });
      expect(btn).toBeDisabled();
    });
  });

  it("enables Post button when textarea has content", async () => {
    setupFetchComments([]);

    render(<CommentSection eventId="event-1" user={testUser} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Add a comment…"), {
      target: { value: "My new comment" },
    });

    const btn = screen.getByRole("button", { name: /post/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows delete button only for own comments", async () => {
    setupFetchComments();

    render(<CommentSection eventId="event-1" user={testUser} />);

    await waitFor(() => {
      // Should have exactly one Delete button (for user-123's comment)
      const deleteButtons = screen.getAllByText("Delete");
      expect(deleteButtons).toHaveLength(1);
    });
  });

  it("renders user avatar initial from full_name", async () => {
    setupFetchComments([]);

    render(<CommentSection eventId="event-1" user={testUser} />);

    await waitFor(() => {
      // The avatar should show "T" from "Test User"
      expect(screen.getByText("T")).toBeInTheDocument();
    });
  });
});
