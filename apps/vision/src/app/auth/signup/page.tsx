import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Sign Up — Citizens Vision",
};

// Signup and login are functionally identical when using OAuth —
// Google returns the same user id on every visit regardless of whether
// it's their first time or not. Keep the route to avoid breaking old
// links, but funnel everyone through /auth/login.
export default function SignupPage() {
  redirect("/auth/login");
  // (unreachable, kept only so TS/Next infers a valid component)
  return <GoogleAuthButton label="Continue with Google" />;
}
