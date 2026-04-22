// Not-found fallback for the @panel slot — renders inside the side
// drawer when an intercepted detail route calls notFound(). Keeps
// the underlying map/page visible so the user can dismiss and carry
// on instead of seeing a full-screen 404.
import Link from "next/link";
import SidePanel from "@/components/ui/SidePanel";

export default function PanelNotFound() {
  return (
    <SidePanel title="Not found" fallbackHref="/events">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-lg font-semibold text-black">Not found</h2>
        <p className="text-sm text-black/60">
          We couldn&apos;t find what you were looking for. It may have been
          removed or made private.
        </p>
        <Link
          href="/events"
          className="inline-flex items-center justify-center rounded-xl bg-(--gold) px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95"
        >
          Back to events
        </Link>
      </div>
    </SidePanel>
  );
}
