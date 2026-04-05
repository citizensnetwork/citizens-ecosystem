import SignupForm from "@/components/auth/SignupForm";

export default function SignupPage() {
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
              Build community by making faith events easier to find.
            </h1>
            <p className="max-w-md text-base text-[var(--foreground-soft)]">
              Join as a client to attend events, or as a vendor to publish
              gatherings for your local community.
            </p>
          </div>

          <div className="flex justify-center">
            <SignupForm />
          </div>
        </div>
      </div>
    </div>
  );
}
