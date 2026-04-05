import Link from "next/link";

const FEATURES = [
  {
    icon: "🗺",
    title: "Discover on a Map",
    desc: "Browse events across your city on an interactive map. Find what's happening near you.",
  },
  {
    icon: "📅",
    title: "Calendar View",
    desc: "See the full month at a glance. Plan your schedule around services, outreach, and gatherings.",
  },
  {
    icon: "🙏",
    title: "Faith-First Community",
    desc: "Church services, prayer meetings, worship nights, youth events — all in one place.",
  },
  {
    icon: "✅",
    title: "Easy RSVPs",
    desc: "One tap to RSVP. Organizers can see who's coming and plan accordingly.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center overflow-hidden px-4 text-center">
        <div className="pointer-events-none absolute -left-16 top-16 h-64 w-64 rounded-full bg-[var(--gold)]/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-black/10 blur-3xl" />
        <div className="fade-rise relative max-w-2xl">
          <span className="mb-4 inline-block rounded-full border border-black/10 bg-[var(--gold-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-black/80">
            For the Christian Community
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-black sm:text-5xl">
            Citizens Connect
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[var(--foreground-soft)]">
            Discover church services, community outreach, worship nights, and
            more — all on an interactive map built for your neighbourhood.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/events"
              className="gold-glow rounded-xl bg-[var(--gold)] px-6 py-3 font-semibold text-black transition hover:brightness-105"
            >
              Browse Events
            </Link>
            <Link
              href="/signup"
              className="rounded-xl border border-black/15 bg-white px-6 py-3 font-medium text-black transition hover:bg-black/5"
            >
              Get Started — It&apos;s Free
            </Link>
          </div>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-20">
        <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight text-black">
          Everything you need to stay connected
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="surface-card fade-rise flex flex-col items-start rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-1"
            >
              <span className="text-3xl mb-3">{f.icon}</span>
              <h3 className="mb-1 font-semibold text-black">{f.title}</h3>
              <p className="text-sm text-[var(--foreground-soft)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-black px-4 py-14 text-center text-white">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight">
          Are you a church or ministry organiser?
        </h2>
        <p className="mx-auto mb-6 max-w-md text-white/75">
          Sign up as a Vendor and start publishing events to the community map
          today.
        </p>
        <Link
          href="/signup"
          className="inline-block rounded-xl bg-[var(--gold)] px-6 py-3 font-semibold text-black transition hover:brightness-105"
        >
          Create Your First Event →
        </Link>
      </section>
    </div>
  );
}

