import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";

export const metadata = {
  title: "Sign In — Citizens Vision",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md px-6">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-text-primary">
            Citizens Vision
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in to continue
          </p>
        </div>
        <GoogleAuthButton label="Continue with Google" />
        <p className="mt-6 text-center text-xs text-text-secondary">
          New here? The same button will create your account automatically.
        </p>
      </div>
    </div>
  );
}
