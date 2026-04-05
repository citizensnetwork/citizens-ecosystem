import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden px-4 py-8 sm:py-10">
      <div className="pointer-events-none absolute -left-20 top-16 h-56 w-56 rounded-full bg-[var(--gold)]/18 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-12 h-64 w-64 rounded-full bg-black/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="fade-rise hidden space-y-4 lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/55">
              Citizens Connect
            </p>
            <h1 className="max-w-md text-4xl font-semibold tracking-tight text-black">
              Welcome back to your faith community.
            </h1>
            <p className="max-w-md text-base text-[var(--foreground-soft)]">
              Log in to browse upcoming services, prayer gatherings, and
              outreach moments near you.
            </p>
          </div>

          <div className="flex justify-center">
            <Suspense
              fallback={
                <div className="surface-card w-full max-w-md rounded-3xl p-7">
                  <div className="skeleton h-7 w-40 rounded-md" />
                  <div className="mt-5 space-y-3">
                    <div className="skeleton h-12 w-full rounded-xl" />
                    <div className="skeleton h-12 w-full rounded-xl" />
                  </div>
                  <div className="skeleton mt-5 h-11 w-full rounded-xl" />
                </div>
              }
            >
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
