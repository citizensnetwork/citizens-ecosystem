import { cookies } from 'next/headers';
import Link from 'next/link';
import { ArrowRight, Compass, Shield, Sparkles } from 'lucide-react';
import { getConnectClient } from '@/lib/connect';
import { getSession } from '@/lib/session';
import { evaluateLaunchGate, PREVIEW_COOKIE } from '@/lib/launch-gate';
import { PageShell } from '@/lib/shell';
import { LockedSplash } from '@/components/locked-splash';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

/**
 * Citizens Wear — public landing.
 *
 * Behind the `evaluateLaunchGate` splash until launch. When unlocked,
 * this renders the full marketing homepage:
 *   1. Hero (manifesto + dual CTA)
 *   2. Featured brands (Connect-sourced, shadcn Cards)
 *   3. How it works (three beats)
 *   4. Closing waitlist CTA
 *
 * The gate lets operators land the redesign without opening the doors.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string | string[] }>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const gate = await evaluateLaunchGate(resolvedParams);

  // When arriving via `?preview=<key>`, promote the key to a cookie so the
  // rest of the pre-launch browsing session stays unlocked without the
  // query string sticking around in shared links.
  if (gate.unlocked && gate.reason === 'preview-cookie') {
    const key = process.env.WEAR_PREVIEW_KEY;
    if (key) {
      const cookieStore = await cookies();
      if (cookieStore.get(PREVIEW_COOKIE)?.value !== key) {
        cookieStore.set({
          name: PREVIEW_COOKIE,
          value: key,
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
      }
    }
  }

  if (!gate.unlocked) {
    return <LockedSplash />;
  }

  const session = await getSession();
  const client = getConnectClient();
  const brands = await client.brands.listAll({ limit: 6 });

  return (
    <PageShell session={session} width="wide">
      {/* ── 1. Hero ──────────────────────────────────────────────────── */}
      <section className="relative -mt-4 overflow-hidden rounded-3xl border border-border bg-paper px-6 py-16 md:px-12 md:py-24">
        <div className="cw-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative grid gap-12 md:grid-cols-[1.15fr_1fr] md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="gold">A Citizens Network channel</Badge>
              <Badge variant="outline">Phase 2 · Identity & profiles</Badge>
            </div>
            <h1 className="cw-headline mt-6">
              By the Kingdom.
              <br />
              With the Kingdom.
              <br />
              <span className="cw-gold-underline">For the Kingdom.</span>
            </h1>
            <p className="cw-lead mt-6">
              Citizens Wear is the social platform where Christian clothing brands, citizens,
              and communities meet. It extends{' '}
              <span className="font-medium text-ink">Citizens Connect</span>, bringing the
              Kingdom to where people live, wear, and gather.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" variant="primary">
                <Link href="#brands">
                  Explore brands
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={session ? '/settings' : '/sign-in'}>
                  {session ? 'Your account' : 'Create an account'}
                </Link>
              </Button>
            </div>
          </div>

          {/* Right rail: manifesto card. Pure type + gold rule — no stock imagery. */}
          <aside className="relative">
            <Card className="border-gold/30 bg-paper shadow-none">
              <CardHeader>
                <p className="cw-eyebrow">The Citizens Wear manifesto</p>
                <CardTitle className="text-2xl leading-snug">
                  Clothing as calling. Community as witness.
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm text-ink-soft">
                <p>
                  Every brand here is built by Christians, for the body of Christ — and for
                  anyone discovering the Kingdom. We honour craft, plain speech, and lasting
                  wear.
                </p>
                <Separator className="bg-gold/30" />
                <p className="text-xs uppercase tracking-wide text-gold-deep">
                  Ephesians 2:19–22
                </p>
              </CardContent>
            </Card>
          </aside>
    <PageShell session={session}>
      <section className="my-16">
        <h1 className="font-display text-5xl leading-tight md:text-6xl">
          By the Kingdom.
          <br />
          With the Kingdom.
          <br />
          <span className="text-gold">For the Kingdom.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-ink-soft md:text-lg">
          Citizens Wear is a social platform for Christian clothing brands, citizens, and
          communities. It extends <span className="font-medium text-ink">Citizens Connect</span>,
          bringing the Kingdom to where brands and their followers meet.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/explore"
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Explore Citizens Wear →
          </Link>
          <span className="inline-flex items-center rounded-md border border-border bg-paper-soft px-3 py-1 text-xs uppercase tracking-wide text-ink-soft">
            Phase 5 · Discovery, search, brand catalog
          </span>
          <span className="inline-flex items-center rounded-md bg-gold-muted px-3 py-1 text-xs uppercase tracking-wide text-gold-deep">
            Mock Connect
          </span>
        </div>
      </section>

      {/* ── 2. Featured brands ───────────────────────────────────────── */}
      <section id="brands" className="mt-20 scroll-mt-24">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="cw-eyebrow">Featured brands</p>
            <h2 className="mt-2 font-display text-3xl text-ink md:text-4xl">
              Made for the Kingdom. Worn in the world.
            </h2>
          </div>
          <Button asChild variant="link" size="sm" className="hidden sm:inline-flex">
            <Link href="/api/connect/status">
              Via Citizens Connect
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </header>

        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.items.map((brand) => (
            <li key={brand.id}>
              <Link
                href={{ pathname: '/b/[slug]', query: { slug: brand.slug } }}
                className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                aria-label={`Visit ${brand.name}`}
              >
                <Card className="h-full transition-colors group-hover:border-gold">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-lg">{brand.name}</CardTitle>
                        <CardDescription className="mt-1">@{brand.slug}</CardDescription>
                      </div>
                      {brand.verified ? (
                        <Badge variant="verified" title="Verified brand">
                          <span aria-hidden="true">✓</span>
                          <span>Verified</span>
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  {brand.tagline ? (
                    <CardContent>
                      <p className="text-sm italic text-ink-soft">
                        &ldquo;{brand.tagline}&rdquo;
                      </p>
                    </CardContent>
                  ) : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 3. How it works ──────────────────────────────────────────── */}
      <section className="mt-24">
        <p className="cw-eyebrow text-center">How Citizens Wear works</p>
        <h2 className="mx-auto mt-3 max-w-3xl text-center font-display text-3xl text-ink md:text-4xl">
          One Kingdom. One account. Many brands, many stories.
        </h2>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Compass,
              title: 'Discover',
              body: 'Follow Christian clothing brands, events, and communities surfaced through Citizens Connect.',
            },
            {
              icon: Sparkles,
              title: 'Wear',
              body: 'Support the makers behind the message. Every garment carries a calling, not just a label.',
            },
            {
              icon: Shield,
              title: 'Belong',
              body: 'One Citizens identity across Connect and Wear. Your profile, preferences, and community travel with you.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <Card key={title} className="bg-paper">
              <CardHeader>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-muted text-gold-deep"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="mt-4 text-xl">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-ink-soft">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── 4. Closing CTA ───────────────────────────────────────────── */}
      <section className="mt-24 rounded-3xl border border-border bg-paper-soft px-6 py-14 text-center md:px-12 md:py-20">
        <p className="cw-eyebrow">Ready when you are</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl text-ink md:text-4xl">
          Join the body. Wear the calling.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm text-ink-soft md:text-base">
          Create a Citizens account to follow brands, save pieces for later, and bring your
          community with you across Connect and Wear.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" variant="ink">
            <Link href={session ? '/settings' : '/sign-in'}>
              {session ? 'Manage your account' : 'Sign in'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/api/connect/status">Check Connect status</Link>
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
