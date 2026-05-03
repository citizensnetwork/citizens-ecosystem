import Link from 'next/link';
import type { ReactNode } from 'react';
import { CrownMark } from '@citizens-wear/ui/CrownMark';
import { Button } from '@/components/ui/button';
import { MobileNav, type WearNavItem } from '@/components/mobile-nav';
import type { WearSession } from './session';
import { isAdmin } from './session';

/**
 * Shared page chrome.
 *
 * Server component; the mobile nav drawer is lifted to its own client
 * component so the rest of the shell stays server-rendered.
 *
 * Tones:
 *   - `paper` (default) — light, editorial. Used for trust/account/settings.
 *   - `dark`            — image-first social commerce. Used for /feed, /p,
 *                         /compose, /admin/moderation.
 */
export function PageShell({
  session,
  children,
  width = 'narrow',
  tone = 'paper',
}: {
  readonly session: WearSession | null;
  readonly children: ReactNode;
  readonly width?: 'narrow' | 'wide';
  readonly tone?: 'paper' | 'dark';
}) {
  const containerClass =
    width === 'wide' ? 'mx-auto max-w-6xl px-6' : 'mx-auto max-w-3xl px-6';

  const dark = tone === 'dark';
  const wrapperClass = dark
    ? 'flex min-h-screen flex-col bg-ink text-paper'
    : 'flex min-h-screen flex-col bg-paper';
  const headerClass = dark
    ? 'border-b border-ink-soft/40 bg-ink/85 backdrop-blur supports-[backdrop-filter]:bg-ink/70'
    : 'border-b border-border bg-paper/80 backdrop-blur supports-[backdrop-filter]:bg-paper/70';
  const wordmarkClass = dark
    ? 'cw-wordmark text-lg text-paper'
    : 'cw-wordmark text-lg';
  const footerClass = dark
    ? 'mt-16 border-t border-ink-soft/40 py-8 text-paper-soft'
    : 'mt-16 border-t border-border py-8';
  const footerInnerClass = dark
    ? `${containerClass} flex flex-col items-start gap-3 text-xs text-paper-soft md:flex-row md:items-center md:justify-between`
    : `${containerClass} flex flex-col items-start gap-3 text-xs text-ink-soft md:flex-row md:items-center md:justify-between`;

  const navItems: readonly WearNavItem[] = [
    { href: '/', label: 'Home' },
    { href: '/feed', label: 'Feed' },
    { href: '/api/connect/status', label: 'Connect status' },
    ...(session
      ? [
          { href: '/compose', label: 'Compose' },
          {
            href: `/u/${encodeURIComponent(session.user.handle)}`,
            label: `@${session.user.handle}`,
          },
          { href: '/settings', label: 'Settings' },
        ]
      : []),
    ...(isAdmin(session) ? [{ href: '/admin/moderation', label: 'Moderation' }] : []),
  ];

  return (
    <div className={wrapperClass}>
      <header className={headerClass}>
        <div className={`${containerClass} flex h-16 items-center justify-between`}>
          <Link href="/" className="flex items-center gap-3">
            <CrownMark className="h-7 w-9 text-gold" aria-hidden="true" />
            <span className={wordmarkClass}>
              Citizens <span className="cw-wordmark-accent">Wear</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
            <Button asChild variant="ghost" size="sm">
              <Link href="/feed">Feed</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/api/connect/status">Connect status</Link>
            </Button>
            {session ? (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/compose">Compose</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/u/${encodeURIComponent(session.user.handle)}`}>
                    @{session.user.handle}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/settings">Settings</Link>
                </Button>
                {isAdmin(session) ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/admin/moderation">Moderation</Link>
                  </Button>
                ) : null}
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

      <footer className={footerClass}>
        <div className={footerInnerClass}>
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
