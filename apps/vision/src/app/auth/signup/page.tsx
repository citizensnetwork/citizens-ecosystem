import { SignupForm } from "@/components/auth/SignupForm";
import Link from "next/link";

export const metadata = {
  title: "Sign Up — Citizens Vision",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-md px-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-text-primary">Citizens Vision</h1>
          <p className="mt-2 text-sm text-gray-500">
            Create your account
          </p>
        </div>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-gold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
