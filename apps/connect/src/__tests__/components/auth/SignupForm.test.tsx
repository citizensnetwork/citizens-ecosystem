import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignupForm from "@/components/auth/SignupForm";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSignUp = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      resend: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}));

describe("SignupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all required fields", () => {
    render(<SignupForm />);
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders citizen vs contributor primary role pick", () => {
    render(<SignupForm />);
    expect(screen.getByDisplayValue("citizen")).toBeInTheDocument();
    expect(screen.getByText("Citizen")).toBeInTheDocument();
    expect(screen.getByDisplayValue("contributor")).toBeInTheDocument();
    expect(screen.getByText("Contributor")).toBeInTheDocument();
    // Secondary contributor_kind picker is hidden until contributor is chosen
    expect(screen.queryByDisplayValue("ministry")).not.toBeInTheDocument();
  });

  it("reveals contributor kind sub-picker when contributor is selected", () => {
    render(<SignupForm />);
    fireEvent.click(screen.getByDisplayValue("contributor"));
    expect(screen.getByDisplayValue("ministry")).toBeInTheDocument();
    expect(screen.getByDisplayValue("organization")).toBeInTheDocument();
    expect(screen.getByDisplayValue("business")).toBeInTheDocument();
  });

  it("defaults to citizen role", () => {
    render(<SignupForm />);
    const citizenRadio = screen.getByDisplayValue("citizen") as HTMLInputElement;
    expect(citizenRadio.checked).toBe(true);
  });

  it("renders Sign Up button", () => {
    render(<SignupForm />);
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument();
  });

  it("renders Log In link", () => {
    render(<SignupForm />);
    const link = screen.getByRole("link", { name: /log in/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("calls signUp with form data on submit", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Jane Doe" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "jane@test.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "jane@test.com",
        password: "password123",
        options: {
          // Citizen sign-ups carry no contributor_kind in metadata
          data: { full_name: "Jane Doe", role: "citizen" },
        },
      });
    });
  });

  it("submits with contributor + kind when contributor is selected", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Pastor Bob" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "bob@church.co.za" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "secure123" },
    });
    fireEvent.click(screen.getByDisplayValue("contributor"));
    // Default contributor_kind is ministry (the most common signup path)
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            data: {
              full_name: "Pastor Bob",
              role: "contributor",
              contributor_kind: "ministry",
            },
          },
        })
      );
    });
  });

  // Removed: legacy "submits with ministry role" test — ministry is no longer
  // a top-level role (migration 033).  Equivalent coverage now lives in the
  // contributor + kind test directly above.

  it("redirects to /events when session is returned (no email confirmation)", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
      error: null,
    });

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "t@t.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "pass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/events");
    });
  });

  it("shows verification pending screen when email confirmation required", async () => {
    mockSignUp.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "t@t.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "pass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
      expect(screen.getByText("t@t.com")).toBeInTheDocument();
    });
  });

  it("displays error message on failed signup", async () => {
    mockSignUp.mockResolvedValue({
      data: {},
      error: { message: "User already registered" },
    });

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "t@t.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "pass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(screen.getByText("User already registered")).toBeInTheDocument();
    });
  });

  it("shows loading state during submission", async () => {
    mockSignUp.mockReturnValue(new Promise(() => {}));

    render(<SignupForm />);
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: "Test" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "t@t.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "pass123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(screen.getByText("Creating account...")).toBeInTheDocument();
  });
});
