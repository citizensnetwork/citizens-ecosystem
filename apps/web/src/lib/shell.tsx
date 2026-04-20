import Link from 'next/link';
import type { ReactNode } from 'react';
import { CrownMark } from '@citizens-wear/ui/CrownMark';
import { Button } from '@/components/ui/button';
import { MobileNav, type WearNavItem } from '@/components/mobile-nav';
import type { WearSession } from './session';

/**
 * Shared page chrome.
 *
 * Server component; the mobile nav drawer is lifted to its own client
 * component so the rest of the shell stays server-rendered.
 */
export function PageShell({
  session,
  children,
  width = 'narrow',
}: {
  readonly session: WearSession | null;
  readonly children: ReactNode;
  /**
   * `narrow` (default) — editorial pages, reading layouts.
   * `wide`             — marketing surfaces with card grids and hero art.
   */
  readonly width?: 'narrow' | 'wide';
}) {
  const containerClass =
    width === 'wide' ? 'mx-auto max-w-6xl px-6' : 'mx-auto max-w-3xl px-6';

  const navItems: readonly WearNavItem[] = [
    { href: '/', label: 'Home' },
    { href: '/api/connect/status', label: 'Connect status' },
    ...(session
      ? [
          {
            href: `/u/${encodeURIComponent(session.user.handle)}`,
            label: `@${session.user.handle}`,
          },
          { href: '/settings', label: 'Settings' },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-border bg-paper/80 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
        <div className={`${containerClass} flex h-16 items-center justify-between`}>
          <Link href="/" className="flex items-center gap-3">
            <CrownMark className="h-7 w-9 text-gold" aria-hidden="true" />
            <span className="cw-wordmark text-lg">
              Citizens <span className="cw-wordmark-accent">Wear</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
            <Button asChild variant="ghost" size="sm">
              <Link href="/api/connect/status">Connect status</Link>
            </Button>
            {session ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/u/${encodeURIComponent(session.user.handle)}`}>
                    @{session.user.handle}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/settings">Settings</Link>
                </Button>
              </>
            ) : (
              <Button asChild variant="primary" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            )}
          </nav>

          <MobileNav
            items={navItems}
            signInHref="/sign-in"
            isSignedIn={Boolean(session)}
          />
        </div>
      </header>

      <main className={`${containerClass} flex-1 py-12`}>{children}</main>

      <footer className="mt-16 border-t border-border py-8">
        <div
          className={`${containerClass} flex flex-col items-start gap-3 text-xs text-ink-soft md:flex-row md:items-center md:justify-between`}
        >
          <span>
            © {new Date().getFullYear()} Citizens Network · Citizens Wear extends Citizens
            Connect.
          </span>
          <span>Connecting the Kingdom · Ephesians 2:19–22</span>
        </div>
      </footer>
    </div>
  );
}
