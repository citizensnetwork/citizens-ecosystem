import SignupForm from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <div className="relative min-h-[calc(100dvh-3.5rem)] overflow-hidden px-4 py-8 sm:py-10">
      <div className="relative mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-5xl items-center justify-center">
        <div className="glass-panel w-full max-w-5xl px-8 py-10">
          <div className="grid w-full items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="fade-rise space-y-3 text-center lg:space-y-4 lg:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/55">
                Citizens Connect
              </p>
              <h1 className="mx-auto max-w-md text-2xl font-semibold tracking-tight text-black sm:text-3xl lg:mx-0 lg:text-4xl">
                Find your place in the Kingdom — or help others find theirs.
              </h1>
              <p className="mx-auto max-w-md text-sm text-(--foreground-soft) sm:text-base lg:mx-0">
                Discover faith-based events, connect with community, and grow
                where you fit best. Open to everyone.
              </p>
            </div>

            <div className="flex justify-center">
              <SignupForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
