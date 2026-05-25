// Intercepted route — /profile/contributor opens as a welcome side
// drawer when reached via a soft navigation (e.g. a notification tap).
//
// Static route takes precedence over the adjacent [id] catch-all so
// "contributor" is never misread as a profile UUID.
//
// CTAs use plain <a> tags (not next/link) so clicking forces a full-page
// load of the real editor, which bypasses the interceptor entirely.

import SidePanel from "@/components/ui/SidePanel";

export default function ContributorApprovedPanel() {
  return (
    <SidePanel title="Contributor Profile" fallbackHref="/events">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        {/* Icon badge */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-(--gold)/15 text-3xl leading-none">
          ✦
        </div>

        {/* Heading + body */}
        <div className="max-w-xs">
          <h2 className="text-xl font-semibold text-black">
            You&apos;re an approved Contributor!
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-black/60">
            Welcome to the Citizens Connect Contributor community. You can
            now create public events and places — set up your public profile
            so the community can discover who you are.
          </p>
        </div>

        {/* CTAs — plain <a> tags are intentional here: <Link> would trigger
            the @panel interceptor again. A full-page load is the correct
            behaviour to land on the real /profile/contributor editor. */}
        <div className="flex w-full max-w-xs flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/profile/contributor"
            className="inline-flex items-center justify-center rounded-xl bg-(--gold) px-6 py-3 text-sm font-semibold text-black transition hover:brightness-95"
          >
            Edit my Contributor profile →
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/events/new"
            className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-6 py-3 text-sm font-medium text-black transition hover:border-(--gold)"
          >
            Create my first event
          </a>
        </div>
      </div>
    </SidePanel>
  );
}
