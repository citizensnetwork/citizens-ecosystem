import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginForm from "@/components/auth/LoginForm";

// This file tests the confirmation banner variant of LoginForm

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSignIn = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => ({
    get: (key: string) => (key === "confirmed" ? "false" : null),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword: mockSignIn },
  }),
}));

describe("LoginForm with confirmation banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows email confirmation banner when confirmed=false", () => {
    render(<LoginForm />);
    expect(
      screen.getByText(/please check your email to confirm/i)
    ).toBeInTheDocument();
  });
});
