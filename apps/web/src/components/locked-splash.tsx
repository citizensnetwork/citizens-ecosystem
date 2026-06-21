import { CrownMark } from '@citizens-wear/ui/CrownMark';
import { Badge } from '@/components/ui/badge';

/**
 * Pre-launch "coming soon" splash.
 *
 * Stands in place of the full homepage until the launch gate is unlocked.
 * Intentionally one screen, no scroll, no navigation — the point is to
 * communicate restraint and readiness, not to tease.
 */
export function LockedSplash() {
  return (
    <main className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-paper px-6 py-12 text-ink">
      <div className="cw-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CrownMark className="h-7 w-9 text-gold" />
          <span className="cw-wordmark text-xl">
            Citizens <span className="cw-wordmark-accent">Wear</span>
          </span>
        </div>
        <Badge variant="gold">Coming soon</Badge>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center text-center">
        <p className="cw-eyebrow mb-6">A Citizens Network channel</p>
        <h1 className="cw-headline mx-auto max-w-3xl">
          By the Kingdom.
          <br />
          With the Kingdom.
          <br />
          <span className="cw-gold-underline">For the Kingdom.</span>
        </h1>
        <p className="cw-lead mx-auto mt-8">
          Citizens Wear is where Christian clothing brands, citizens, and communities meet. A
          social platform extending{' '}
          <span className="font-medium text-ink">Citizens Connect</span>, built to bring the
          Kingdom to where people live, wear, and gather.
        </p>
        <p className="mt-10 text-sm text-ink-soft">
          We&rsquo;re finishing the foundations. Public doors open shortly.
        </p>
      </section>

      <footer className="relative z-10 flex items-center justify-between text-xs text-ink-soft">
        <span>© {new Date().getFullYear()} Citizens Network</span>
        <span>Connecting the Kingdom · Ephesians 2:19–22</span>
      </footer>
    </main>
  );
}
