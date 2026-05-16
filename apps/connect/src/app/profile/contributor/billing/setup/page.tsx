// /profile/contributor/billing/setup — "Coming soon" stub per FEAT-06.
// Surfaces the same trial messaging as the dashboard preview and links back
// to the dashboard. Wired-up PayFast flow is deferred until D11 / T5 in
// .github/MASTER_DIRECTION.md are resolved.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Set up billing — Citizens Connect",
};

export default async function ContributorBillingSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/profile/contributor/billing/setup");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, contributor_status")
    .eq("id", user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.role !== "contributor" ||
    profile.contributor_status !== "approved"
  ) {
    redirect("/profile");
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-start justify-center px-4 py-10">
      <div className="glass-panel w-full max-w-xl px-6 py-8 sm:px-8">
        <p className="text-xs font-medium uppercase tracking-wide text-black/55">
          Billing
        </p>
        <h1 className="mt-1 text-2xl font-bold">Coming soon</h1>
        <p className="mt-3 text-sm text-black/70">
          We&apos;re finishing setup with our payments provider so contributor
          billing can run on a secure recurring subscription. Until then your
          counters are still being tallied and you can see your monthly bill
          preview on your dashboard — at no cost during the first 3 months.
        </p>

        <ul className="mt-5 space-y-2 text-sm text-black/70">
          <li>• Per-event rates apply by tier (Individual R30 · Medium R150 · Large R250).</li>
          <li>• Place markers stay free until a flat monthly rate is announced.</li>
          <li>• First 3 months from your contributor approval are free.</li>
        </ul>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/profile/contributor/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/85"
          >
            Back to dashboard
          </Link>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/80 transition hover:bg-black/5"
          >
            My profile
          </Link>
        </div>
      </div>
    </div>
  );
}
