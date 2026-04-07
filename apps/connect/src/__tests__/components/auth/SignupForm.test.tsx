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
    auth: { signUp: mockSignUp },
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

  it("renders role selection with Community Citizen and Organiser", () => {
    render(<SignupForm />);
    expect(screen.getByDisplayValue("client")).toBeInTheDocument();
    expect(screen.getByText("Community Citizen")).toBeInTheDocument();
    expect(screen.getByDisplayValue("vendor")).toBeInTheDocument();
    expect(screen.getByText("Organiser")).toBeInTheDocument();
  });

  it("defaults to client role", () => {
    render(<SignupForm />);
    const clientRadio = screen.getByDisplayValue("client") as HTMLInputElement;
    expect(clientRadio.checked).toBe(true);
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
          data: { full_name: "Jane Doe", role: "client" },
        },
      });
    });
  });

  it("submits with vendor role when selected", async () => {
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
    fireEvent.click(screen.getByDisplayValue("vendor"));
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: { data: { full_name: "Pastor Bob", role: "vendor" } },
        })
      );
    });
  });

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

  it("redirects to /login?confirmed=false when email confirmation required", async () => {
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
      expect(mockPush).toHaveBeenCalledWith("/login?confirmed=false");
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
