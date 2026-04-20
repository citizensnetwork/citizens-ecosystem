'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { CrownMark } from '@citizens-wear/ui/CrownMark';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

/**
 * Mobile navigation drawer — client component, Radix Dialog (Sheet).
 *
 * Lifted out of `PageShell` so the shell itself can remain a server
 * component. `items` is passed in pre-resolved so this file stays
 * presentation-only.
 */
export interface WearNavItem {
  readonly href: string;
  readonly label: string;
  readonly emphasised?: boolean;
}

export function MobileNav({
  items,
  signInHref,
  isSignedIn,
}: {
  readonly items: readonly WearNavItem[];
  readonly signInHref: string;
  readonly isSignedIn: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-8">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <CrownMark className="h-7 w-9 text-gold" aria-hidden="true" />
            <SheetTitle>
              <span className="cw-wordmark">
                Citizens <span className="cw-wordmark-accent">Wear</span>
              </span>
            </SheetTitle>
          </div>
          <SheetDescription>Connecting the Kingdom.</SheetDescription>
        </SheetHeader>

        <Separator />

        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <SheetClose key={item.href} asChild>
              <Link
                href={item.href}
                className={
                  item.emphasised
                    ? 'rounded-md px-3 py-3 text-base font-medium text-ink hover:bg-gold-muted'
                    : 'rounded-md px-3 py-3 text-base text-ink-soft hover:bg-paper-soft hover:text-ink'
                }
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
        </nav>

        <div className="mt-auto">
          {isSignedIn ? null : (
            <SheetClose asChild>
              <Button asChild variant="primary" size="lg" className="w-full">
                <Link href={signInHref}>Sign in</Link>
              </Button>
            </SheetClose>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
